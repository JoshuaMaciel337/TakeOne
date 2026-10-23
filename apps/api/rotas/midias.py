# -----------------------------------------------
# TakeOne API — mídias (a biblioteca de vídeos e áudios enviados)
# -----------------------------------------------
import logging
import secrets

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    BatidasSaida,
    EstabilizacaoEntrada,
    FalaEntrada,
    FluidoEntrada,
    GerarVideoEntrada,
    MidiaAtualizarEntrada,
    MidiaSaida,
    ObjetoEscondidoEntrada,
    QualidadeSaida,
    RastreioEntrada,
    RastreioSaida,
    RostoSaida,
    TomEntrada,
    TranscricaoPedirEntrada,
    TranscricaoSaida,
    batidas_para_saida,
    midia_para_saida,
    qualidade_para_saida,
    rastreio_para_saida,
    rosto_para_saida,
    transcricao_para_saida,
)
from core.modelos.batidas import STATUS_NENHUMA as BATIDAS_NENHUMA
from core.modelos.batidas import STATUS_PRONTO as BATIDAS_PRONTAS
from core.modelos.batidas import montar_batidas
from core.modelos.exportacao import STATUS_PROCESSANDO as STATUS_EXPORTACAO_PROCESSANDO
from core.modelos.geracao import nome_da_midia
from core.modelos.job import STATUS_ERRO as STATUS_JOB_ERRO
from core.modelos.job import STATUS_EXECUTANDO, STATUS_PENDENTE, montar_job
from core.modelos.midia import (
    ARQUIVO_IMAGEM_LIMPA_PROXY,
    ARQUIVO_INVERTIDO_PROXY,
    ARQUIVO_MASCARA,
    ARQUIVO_MASCARA_IMAGEM,
    ARQUIVO_MASCARA_ROSTOS,
    ARQUIVO_VOZ_LIMPA,
    STATUS_PROCESSANDO,
    STATUS_PRONTA,
    arquivo_da_mascara_do_objeto,
    arquivo_do_tom,
    arquivo_publico,
    arquivos_da_estabilizacao,
    arquivos_do_fluido,
    chave_arquivo,
    chave_da_estabilizacao,
    chave_do_fluido,
    chave_do_tom,
    e_imagem,
    montar_midia,
    pasta_da_midia,
)
from core.modelos.qualidade import STATUS_NENHUMA as QUALIDADE_NENHUMA
from core.modelos.qualidade import STATUS_PRONTO as QUALIDADE_PRONTA
from core.modelos.qualidade import montar_qualidade
from core.modelos.rastreio import conferir_pedido, montar_rastreio
from core.modelos.rosto import STATUS_PROCESSANDO as ROSTO_PROCESSANDO
from core.modelos.rosto import STATUS_PRONTO as ROSTO_PRONTO
from core.modelos.rosto import montar_rosto
from core.modelos.transcricao import STATUS_PROCESSANDO as TRANSCRICAO_PROCESSANDO
from core.modelos.transcricao import STATUS_PRONTA as TRANSCRICAO_PRONTA
from core.modelos.transcricao import montar_transcricao
from core.utils import storage
from core.utils.mongo import agora

router = APIRouter(prefix="/api/midias", tags=["midias"])

TIPOS_ARQUIVO = {
    ".mp4": "video/mp4",
    ".m4a": "audio/mp4",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
# Os arquivos de uma mídia não mudam depois de gerados
CACHE_ARQUIVOS = "private, max-age=86400"


# -----------------------------------------------
# FUNÇÕES AUXILIARES
# -----------------------------------------------
async def buscar_midia(db, midia_id: str, usuario: dict) -> dict:
    try:
        filtro = {"_id": ObjectId(midia_id), "organizacao_id": usuario["organizacao_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mídia não encontrada.") from e
    midia = await db.midias.find_one(filtro)
    if midia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mídia não encontrada.")
    return midia


async def jobs_de_ingestao(db, midias: list[dict]) -> dict:
    """Jobs de ingestão das mídias em processamento, numa consulta só."""
    ids = [m["job_ingestao_id"] for m in midias if m["status"] == STATUS_PROCESSANDO and m.get("job_ingestao_id")]
    if not ids:
        return {}
    cursor = db.jobs.find({"_id": {"$in": ids}}, {"status": 1, "progresso": 1, "mensagem": 1, "erro": 1})
    return {job["_id"]: job async for job in cursor}


async def para_saida(db, midias: list[dict]) -> list[MidiaSaida]:
    jobs = await jobs_de_ingestao(db, midias)
    return [midia_para_saida(m, jobs.get(m.get("job_ingestao_id"))) for m in midias]


# -----------------------------------------------
# ROTAS
# -----------------------------------------------
@router.get("", response_model=list[MidiaSaida])
async def listar_midias(limite: int = Query(default=30, ge=1, le=200),
                        antes: str | None = Query(default=None, description="id da última mídia da página anterior"),
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """As mídias do espaço, das mais novas para as mais antigas, em páginas: a seguinte começa depois de `antes`
    (o id da última da página). O editor busca todas, porque um projeto pode usar uma mídia antiga."""
    filtro: dict = {"organizacao_id": usuario["organizacao_id"]}
    if antes:
        try:
            filtro["_id"] = {"$lt": ObjectId(antes)}
        except InvalidId as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Página inválida.") from erro
    cursor = db.midias.find(filtro).sort("_id", -1).limit(limite)
    return await para_saida(db, [m async for m in cursor])


@router.post("/gerar-video", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def gerar_video(dados: GerarVideoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila um clipe gerado com o Wan 2.2. A mídia já entra na biblioteca, processando; o vídeo
    vira o original dela quando ficar pronto e passa pela ingestão como um envio comum. Com `imagem_id`, a
    imagem da biblioteca é o primeiro quadro."""
    if dados.imagem_id:
        imagem = await buscar_midia(db, dados.imagem_id, usuario)
        if not e_imagem(imagem):
            raise HTTPException(status.HTTP_409_CONFLICT, "Escolha uma imagem da biblioteca para começar o vídeo.")
        if imagem["status"] != STATUS_PRONTA:
            raise HTTPException(status.HTTP_409_CONFLICT, "A imagem ainda está sendo preparada.")
    # O nome vem do texto pedido e não passa por montar_midia, que o lê como caminho: uma barra cortava o nome,
    # ou deixava a mídia sem extensão e a rota dava 500
    nome = nome_da_midia(dados.descricao)
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "gerado.mp4", 0, "video/mp4")
    midia["nome"] = midia["nome_original"] = nome
    midia["status"] = STATUS_PROCESSANDO
    midia["gerada"] = {"descricao": dados.descricao, "formato": dados.formato, "duracao": dados.duracao,
                       "imagem_id": dados.imagem_id}
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    job = montar_job("geracao_video", usuario["organizacao_id"],
                     {"midia_id": str(midia_id), **midia["gerada"], "semente": secrets.randbelow(2**31)},
                     criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    # O progresso da geração aparece como o da ingestão; ao terminar, o worker troca pelo job da ingestão
    await db.midias.update_one({"_id": midia_id}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Vídeo com IA pedido: {midia['nome']}")
    return (await para_saida(db, [{**midia, "_id": midia_id, "job_ingestao_id": job_id}]))[0]


@router.post("/fala", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def gerar_fala(dados: FalaEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila o texto em fala (Kokoro, worker de CPU). A mídia já entra na biblioteca, processando; o
    áudio vira o original dela quando ficar pronto e passa pela ingestão como um envio comum."""
    # "Fala · Olá! Hoje tem novidade no…": o começo do texto, cortado numa palavra inteira
    texto = " ".join(dados.texto.split())
    trecho = texto if len(texto) <= 40 else texto[:40].rsplit(" ", 1)[0] + "…"
    nome = f"Fala · {trecho.rstrip('.,;: ')}"
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "fala.m4a", 0, "audio/mp4")
    midia["nome"] = midia["nome_original"] = nome
    midia["status"] = STATUS_PROCESSANDO
    midia["fala"] = {"texto": dados.texto, "voz": dados.voz, "velocidade": dados.velocidade}
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    job = montar_job("fala", usuario["organizacao_id"], {"midia_id": str(midia_id), **midia["fala"]},
                     criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    # O progresso da fala aparece como o da ingestão; ao terminar, o worker troca pelo job da ingestão
    await db.midias.update_one({"_id": midia_id}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Texto em fala pedido: {len(dados.texto)} letras, voz {dados.voz}")
    return (await para_saida(db, [{**midia, "_id": midia_id, "job_ingestao_id": job_id}]))[0]


@router.get("/{midia_id}", response_model=MidiaSaida)
async def ver_midia(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    return (await para_saida(db, [midia]))[0]


@router.patch("/{midia_id}", response_model=MidiaSaida)
async def atualizar_midia(midia_id: str, dados: MidiaAtualizarEntrada,
                          usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    if dados.nome is None:
        return (await para_saida(db, [midia]))[0]
    await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"nome": dados.nome, "atualizado_em": agora()}})
    return (await para_saida(db, [{**midia, "nome": dados.nome}]))[0]


@router.delete("/{midia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_midia(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    em_projetos = await db.projetos.count_documents(
        {"organizacao_id": usuario["organizacao_id"], "midias_usadas": str(midia["_id"])})
    if em_projetos:
        quantos = "1 projeto" if em_projetos == 1 else f"{em_projetos} projetos"
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Esta mídia está em {quantos}. Tire os clipes dela da linha do tempo antes de excluir.")
    em_modelos = await db.modelos.count_documents(
        {"organizacao_id": usuario["organizacao_id"], "midias_usadas": str(midia["_id"])})
    if em_modelos:
        quantos = "1 modelo" if em_modelos == 1 else f"{em_modelos} modelos"
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Esta mídia está em {quantos} do espaço. Exclua o modelo antes de excluir a mídia.")
    # A exportação guarda uma cópia do projeto: tirada da linha do tempo, a mídia ainda é usada pelo vídeo
    # que está sendo gerado, e excluí-la derrubava a exportação
    exportando = await db.exportacoes.count_documents({
        "organizacao_id": usuario["organizacao_id"], "status": STATUS_EXPORTACAO_PROCESSANDO,
        "projeto.faixas.clipes.midia_id": str(midia["_id"])}, limit=1)
    if exportando:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Um vídeo que usa esta mídia ainda está sendo exportado. Espere terminar para excluir.")
    momento = agora()
    # Jobs que ainda iam mexer nesta mídia param aqui
    await db.jobs.update_many(
        {"entrada.midia_id": str(midia["_id"]), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}},
        {"$set": {"status": STATUS_JOB_ERRO, "erro": "A mídia foi excluída.", "mensagem": "Cancelado",
                  "lease_ate": None, "concluido_em": momento, "atualizado_em": momento}},
    )
    await db.midias.delete_one({"_id": midia["_id"]})
    await db.transcricoes.delete_one({"midia_id": midia["_id"]})
    await db.rostos.delete_one({"midia_id": midia["_id"]})
    await db.rastreios.delete_many({"midia_id": midia["_id"]})
    await db.qualidades.delete_one({"midia_id": midia["_id"]})
    # O logo do kit de marca que sai da biblioteca sai do kit também
    await db.organizacoes.update_one({"_id": midia["organizacao_id"], "marca.logo_midia_id": midia["_id"]},
                                     {"$set": {"marca.logo_midia_id": None}})
    await db.batidas.delete_one({"midia_id": midia["_id"]})
    await run_in_threadpool(storage.remover_pasta, pasta_da_midia(midia["organizacao_id"], midia["_id"]))
    logging.info(f"[{midia['organizacao_id']}] Mídia excluída: {midia['nome']}")


@router.get("/{midia_id}/arquivos/{nome}")
async def baixar_arquivo(midia_id: str, nome: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Serve a cópia leve, a capa, as miniaturas e a forma de onda. Aceita Range para o player."""
    midia = await buscar_midia(db, midia_id, usuario)
    if not arquivo_publico(nome) or nome not in midia.get("arquivos", []):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], nome))
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    return FileResponse(caminho, media_type=TIPOS_ARQUIVO.get(caminho.suffix, "application/octet-stream"),
                        headers={"Cache-Control": CACHE_ARQUIVOS})


@router.get("/{midia_id}/original")
async def baixar_original(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O arquivo como foi enviado, com o nome de origem."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA or not midia.get("original"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], midia["original"]))
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    return FileResponse(caminho, media_type="application/octet-stream", filename=midia["nome_original"],
                        content_disposition_type="attachment")


async def _job_da_transcricao(db, doc: dict) -> dict | None:
    if doc["status"] != TRANSCRICAO_PROCESSANDO or not doc.get("job_id"):
        return None
    return await db.jobs.find_one({"_id": doc["job_id"]}, {"status": 1, "progresso": 1, "mensagem": 1, "erro": 1})


@router.post("/{midia_id}/transcricao", response_model=TranscricaoSaida)
async def pedir_transcricao(midia_id: str, dados: TranscricaoPedirEntrada,
                            usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """
    Põe a fala da mídia na fila do worker de GPU. Se ela já foi transcrita no idioma pedido (ou em
    qualquer um, com "auto"), devolve a pronta; se já está na fila, devolve o andamento.
    """
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("audio"):
        raise HTTPException(status.HTTP_409_CONFLICT, f'"{midia["nome"]}" não tem áudio para transcrever.')
    atual = await db.transcricoes.find_one({"midia_id": midia["_id"]})
    if atual:
        job = await _job_da_transcricao(db, atual)
        andando = job is not None and job["status"] in (STATUS_PENDENTE, STATUS_EXECUTANDO)
        pronta = atual["status"] == TRANSCRICAO_PRONTA and dados.idioma in ("auto", atual["idioma"])
        if andando or pronta:
            return transcricao_para_saida(atual, job)
    documento = montar_transcricao(usuario["organizacao_id"], midia["_id"], dados.idioma)
    job = montar_job("transcricao", usuario["organizacao_id"], {"midia_id": str(midia["_id"]), "idioma": dados.idioma},
                     criado_por=usuario["_id"])
    documento["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.transcricoes.replace_one({"midia_id": midia["_id"]}, documento, upsert=True)
    logging.info(f"[{usuario['organizacao_id']}] Transcrição pedida: {midia['nome']} ({dados.idioma})")
    return transcricao_para_saida(documento, {**job, "_id": documento["job_id"]})


@router.get("/{midia_id}/transcricao", response_model=TranscricaoSaida)
async def ver_transcricao(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    doc = await db.transcricoes.find_one({"midia_id": midia["_id"]})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esta mídia ainda não foi transcrita.")
    return transcricao_para_saida(doc, await _job_da_transcricao(db, doc))


@router.post("/{midia_id}/voz-limpa", response_model=MidiaSaida)
async def pedir_voz_limpa(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe a limpeza da voz na fila do worker de CPU. Se já está pronta ou andando, só devolve a mídia."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("audio"):
        raise HTTPException(status.HTTP_409_CONFLICT, f'"{midia["nome"]}" não tem áudio para limpar.')
    atual = midia.get("voz_limpa") or {}
    pronta = atual.get("status") == "pronta" and ARQUIVO_VOZ_LIMPA in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronta or andando):
        job = montar_job("limpeza_voz", usuario["organizacao_id"], {"midia_id": str(midia["_id"])},
                         criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"voz_limpa": atual, "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Limpeza da voz pedida: {midia['nome']}")
    return (await para_saida(db, [{**midia, "voz_limpa": atual}]))[0]


@router.post("/{midia_id}/limpeza-imagem", response_model=MidiaSaida)
async def pedir_limpeza_imagem(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila a imagem sem ruído. Se já está pronta ou andando, só devolve a mídia."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Tirar o ruído é só para vídeos ("{midia["nome"]}" não é).')
    atual = midia.get("imagem_limpa") or {}
    pronta = atual.get("status") == "pronta" and ARQUIVO_IMAGEM_LIMPA_PROXY in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronta or andando):
        job = montar_job("limpeza_imagem", usuario["organizacao_id"], {"midia_id": str(midia["_id"])},
                         criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"imagem_limpa": atual, "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Limpeza da imagem pedida: {midia['nome']}")
    return (await para_saida(db, [{**midia, "imagem_limpa": atual}]))[0]


@router.post("/{midia_id}/recorte-fundo", response_model=MidiaSaida)
async def pedir_recorte_fundo(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila a máscara da pessoa (MODNet). Se já está pronta ou andando, só devolve a mídia."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video"):
        raise HTTPException(status.HTTP_409_CONFLICT, f'O fundo só sai de vídeos e imagens ("{midia["nome"]}" não é).')
    atual = midia.get("recorte_fundo") or {}
    # A imagem parada ganha um PNG; o vídeo, um vídeo da máscara
    arquivo = ARQUIVO_MASCARA_IMAGEM if e_imagem(midia) else ARQUIVO_MASCARA
    pronto = atual.get("status") == "pronta" and arquivo in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronto or andando):
        job = montar_job("recorte_fundo", usuario["organizacao_id"], {"midia_id": str(midia["_id"])},
                         criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"recorte_fundo": atual, "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Recorte do fundo pedido: {midia['nome']}")
    return (await para_saida(db, [{**midia, "recorte_fundo": atual}]))[0]


@router.post("/{midia_id}/esconder-rostos", response_model=MidiaSaida)
async def pedir_esconder_rostos(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila a máscara dos rostos (YuNet em todo quadro). Se já está pronta ou andando, só devolve a mídia."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Esconder os rostos vale em vídeos ("{midia["nome"]}" não é).')
    atual = midia.get("esconder_rostos") or {}
    pronto = atual.get("status") == "pronta" and ARQUIVO_MASCARA_ROSTOS in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronto or andando):
        job = montar_job("esconder_rostos", usuario["organizacao_id"], {"midia_id": str(midia["_id"])},
                         criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"esconder_rostos": atual,
                                                                     "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Rostos pedidos: {midia['nome']}")
    return (await para_saida(db, [{**midia, "esconder_rostos": atual}]))[0]


@router.post("/{midia_id}/objetos-escondidos", response_model=MidiaSaida)
async def pedir_objeto_escondido(midia_id: str, dados: ObjetoEscondidoEntrada, usuario=Depends(usuario_atual),
                                 db=Depends(obter_db)):
    """Põe na fila a máscara de um objeto já seguido (o rastreio pronto). Se já está pronta ou andando, só devolve."""
    midia = await buscar_midia(db, midia_id, usuario)
    rastreio = await db.rastreios.find_one({"_id": ObjectId(dados.rastreio_id), "midia_id": midia["_id"],
                                            "organizacao_id": usuario["organizacao_id"]})
    if rastreio is None or rastreio.get("status") != "pronto":
        raise HTTPException(status.HTTP_409_CONFLICT, "O objeto ainda não foi seguido.")
    atual = (midia.get("objetos_escondidos") or {}).get(dados.rastreio_id) or {}
    arquivo = arquivo_da_mascara_do_objeto(dados.rastreio_id)
    pronto = atual.get("status") == "pronta" and arquivo in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronto or andando):
        job = montar_job("esconder_objeto", usuario["organizacao_id"],
                         {"midia_id": str(midia["_id"]), "rastreio_id": dados.rastreio_id}, criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]}, {"$set": {f"objetos_escondidos.{dados.rastreio_id}": atual,
                                                                     "atualizado_em": agora()}})
    objetos = {**(midia.get("objetos_escondidos") or {}), dados.rastreio_id: atual}
    return (await para_saida(db, [{**midia, "objetos_escondidos": objetos}]))[0]


@router.post("/{midia_id}/fluido", response_model=MidiaSaida)
async def pedir_fluido(midia_id: str, dados: FluidoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """
    Põe na fila a câmera lenta suave de um trecho (segundos da mídia, já alinhados aos quadros pelo editor). Se
    já está pronta ou andando, só devolve a mídia.
    """
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia) or midia.get("animacao") or not midia["video"].get("fps"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Só vídeos gravados têm câmera lenta suave.")
    if dados.ate > float(midia.get("duracao") or 0) + 0.05:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "O trecho passa do fim do vídeo.")
    chave = chave_do_fluido(dados.de, dados.ate)
    atual = (midia.get("fluidos") or {}).get(chave) or {}
    pronta = atual.get("status") == "pronta" and arquivos_do_fluido(dados.de, dados.ate)[1] in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronta or andando):
        job = montar_job("fluido", usuario["organizacao_id"],
                         {"midia_id": str(midia["_id"]), "de": dados.de, "ate": dados.ate}, criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id, "de": dados.de, "ate": dados.ate}
        await db.midias.update_one({"_id": midia["_id"]},
                                   {"$set": {f"fluidos.{chave}": atual, "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Câmera lenta suave pedida: {midia['nome']} ({chave})")
    fluidos = {**(midia.get("fluidos") or {}), chave: atual}
    return (await para_saida(db, [{**midia, "fluidos": fluidos}]))[0]


@router.post("/{midia_id}/inversao", response_model=MidiaSaida)
async def pedir_inversao(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila o vídeo ao contrário. Se já está pronto ou andando, só devolve a mídia."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Só vídeos tocam ao contrário ("{midia["nome"]}" não é).')
    atual = midia.get("invertido") or {}
    pronta = atual.get("status") == "pronta" and ARQUIVO_INVERTIDO_PROXY in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronta or andando):
        job = montar_job("inversao", usuario["organizacao_id"], {"midia_id": str(midia["_id"])},
                         criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"invertido": atual, "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Vídeo ao contrário pedido: {midia['nome']}")
    return (await para_saida(db, [{**midia, "invertido": atual}]))[0]


@router.post("/{midia_id}/estabilizacao", response_model=MidiaSaida)
async def pedir_estabilizacao(midia_id: str, dados: EstabilizacaoEntrada, usuario=Depends(usuario_atual),
                              db=Depends(obter_db)):
    """Põe na fila a imagem estável (sobre a sem ruído, com limpa=true). Se já está pronta ou andando, só
    devolve a mídia."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia) or midia.get("animacao"):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f'Só vídeos gravados podem ser estabilizados ("{midia["nome"]}" não é).')
    if dados.limpa and ARQUIVO_IMAGEM_LIMPA_PROXY not in midia.get("arquivos", []):
        raise HTTPException(status.HTTP_409_CONFLICT, "A imagem sem ruído ainda não está pronta.")
    chave = chave_da_estabilizacao(dados.limpa)
    atual = (midia.get("estabilizacoes") or {}).get(chave) or {}
    pronta = atual.get("status") == "pronta" and arquivos_da_estabilizacao(dados.limpa)[1] in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronta or andando):
        job = montar_job("estabilizacao", usuario["organizacao_id"],
                         {"midia_id": str(midia["_id"]), "limpa": dados.limpa}, criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]},
                                   {"$set": {f"estabilizacoes.{chave}": atual, "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Estabilização pedida: {midia['nome']}")
    estabilizacoes = {**(midia.get("estabilizacoes") or {}), chave: atual}
    return (await para_saida(db, [{**midia, "estabilizacoes": estabilizacoes}]))[0]


@router.post("/{midia_id}/tom", response_model=MidiaSaida)
async def pedir_tom(midia_id: str, dados: TomEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """
    Põe na fila a voz no tom pedido (sobre a voz limpa, com limpa=true). Se já está pronta ou andando,
    só devolve a mídia.
    """
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("audio"):
        raise HTTPException(status.HTTP_409_CONFLICT, f'"{midia["nome"]}" não tem áudio.')
    if dados.semitons == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Escolha um tom diferente do original.")
    if dados.limpa and ARQUIVO_VOZ_LIMPA not in midia.get("arquivos", []):
        raise HTTPException(status.HTTP_409_CONFLICT, "A voz limpa ainda não está pronta.")
    chave = chave_do_tom(dados.semitons, dados.limpa)
    atual = (midia.get("tons") or {}).get(chave) or {}
    arquivo = arquivo_do_tom(dados.semitons, dados.limpa)
    pronto = atual.get("status") == "pronta" and arquivo in midia.get("arquivos", [])
    andando = atual.get("status") == "processando" and await db.jobs.find_one(
        {"_id": atual.get("job_id"), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}, {"_id": 1})
    if not (pronto or andando):
        job = montar_job("tom", usuario["organizacao_id"],
                         {"midia_id": str(midia["_id"]), "semitons": dados.semitons, "limpa": dados.limpa},
                         criado_por=usuario["_id"])
        job_id = (await db.jobs.insert_one(job)).inserted_id
        atual = {"status": "processando", "erro": None, "job_id": job_id}
        await db.midias.update_one({"_id": midia["_id"]}, {"$set": {f"tons.{chave}": atual, "atualizado_em": agora()}})
        logging.info(f"[{usuario['organizacao_id']}] Tom {dados.semitons:+d} pedido: {midia['nome']}")
    tons = {**(midia.get("tons") or {}), chave: atual}
    return (await para_saida(db, [{**midia, "tons": tons}]))[0]


async def _job_da_analise(db, doc: dict) -> dict | None:
    """O job de uma análise por mídia (rosto, batidas) enquanto ela anda."""
    if doc["status"] != ROSTO_PROCESSANDO or not doc.get("job_id"):
        return None
    return await db.jobs.find_one({"_id": doc["job_id"]}, {"status": 1, "progresso": 1, "mensagem": 1, "erro": 1})


@router.post("/{midia_id}/rosto", response_model=RostoSaida)
async def pedir_rosto(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe a busca do rosto na fila do worker de CPU. Se já está pronta ou andando, só devolve."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Seguir o rosto é só para vídeos ("{midia["nome"]}" não é).')
    atual = await db.rostos.find_one({"midia_id": midia["_id"]})
    if atual:
        job = await _job_da_analise(db, atual)
        andando = job is not None and job["status"] in (STATUS_PENDENTE, STATUS_EXECUTANDO)
        if andando or atual["status"] == ROSTO_PRONTO:
            return rosto_para_saida(atual, job)
    documento = montar_rosto(usuario["organizacao_id"], midia["_id"])
    job = montar_job("rosto", usuario["organizacao_id"], {"midia_id": str(midia["_id"])}, criado_por=usuario["_id"])
    documento["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.rostos.replace_one({"midia_id": midia["_id"]}, documento, upsert=True)
    logging.info(f"[{usuario['organizacao_id']}] Busca do rosto pedida: {midia['nome']}")
    return rosto_para_saida(documento, {**job, "_id": documento["job_id"]})


@router.get("/{midia_id}/rosto", response_model=RostoSaida)
async def ver_rosto(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    doc = await db.rostos.find_one({"midia_id": midia["_id"]})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "O rosto desta mídia ainda não foi procurado.")
    return rosto_para_saida(doc, await _job_da_analise(db, doc))


@router.post("/{midia_id}/rastreios", response_model=RastreioSaida, status_code=status.HTTP_201_CREATED)
async def pedir_rastreio(midia_id: str, dados: RastreioEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila o caminho do objeto marcado num quadro. Cada pedido é um rastreio novo."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Só dá para seguir objetos em vídeos ("{midia["nome"]}" não é).')
    # Só as cópias leves de vídeo que a prévia pode mostrar
    if (not dados.arquivo.endswith(".mp4") or not arquivo_publico(dados.arquivo) or dados.arquivo == ARQUIVO_MASCARA
            or dados.arquivo not in midia.get("arquivos", [])):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Este arquivo não serve para seguir o objeto.")
    caixa = dados.caixa.model_dump()
    problema = conferir_pedido(dados.t, caixa, dados.de, dados.ate, float(midia.get("duracao") or 0))
    if problema:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, problema)
    documento = montar_rastreio(usuario["organizacao_id"], midia["_id"], dados.arquivo, dados.t, caixa, dados.de,
                                dados.ate)
    documento["_id"] = ObjectId()
    job = montar_job("rastreio", usuario["organizacao_id"],
                     {"midia_id": str(midia["_id"]), "rastreio_id": str(documento["_id"])}, criado_por=usuario["_id"])
    documento["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.rastreios.insert_one(documento)
    logging.info(f"[{usuario['organizacao_id']}] Seguir objeto pedido: {midia['nome']}")
    return rastreio_para_saida(documento, {**job, "_id": documento["job_id"]})


@router.get("/{midia_id}/rastreios/{rastreio_id}", response_model=RastreioSaida)
async def ver_rastreio(midia_id: str, rastreio_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    try:
        filtro = {"_id": ObjectId(rastreio_id), "midia_id": midia["_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.") from e
    doc = await db.rastreios.find_one(filtro)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    return rastreio_para_saida(doc, await _job_da_analise(db, doc))


@router.post("/{midia_id}/batidas", response_model=BatidasSaida)
async def pedir_batidas(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe a busca das batidas na fila do worker de CPU. Se já está pronta ou andando, só devolve."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("audio"):
        raise HTTPException(status.HTTP_409_CONFLICT, f'"{midia["nome"]}" não tem som para achar as batidas.')
    atual = await db.batidas.find_one({"midia_id": midia["_id"]})
    if atual:
        job = await _job_da_analise(db, atual)
        andando = job is not None and job["status"] in (STATUS_PENDENTE, STATUS_EXECUTANDO)
        if andando or atual["status"] == BATIDAS_PRONTAS:
            return batidas_para_saida(atual, job)
    documento = montar_batidas(usuario["organizacao_id"], midia["_id"])
    job = montar_job("batidas", usuario["organizacao_id"], {"midia_id": str(midia["_id"])}, criado_por=usuario["_id"])
    documento["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.batidas.replace_one({"midia_id": midia["_id"]}, documento, upsert=True)
    logging.info(f"[{usuario['organizacao_id']}] Batidas pedidas: {midia['nome']}")
    return batidas_para_saida(documento, {**job, "_id": documento["job_id"]})


@router.post("/{midia_id}/qualidade", response_model=QualidadeSaida)
async def pedir_qualidade(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe a avaliação dos trechos na fila do worker de CPU. Se já está pronta ou andando, só devolve."""
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A mídia ainda está sendo preparada.")
    if not midia.get("video") or e_imagem(midia):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Só vídeos têm trechos para avaliar ("{midia["nome"]}" não é).')
    atual = await db.qualidades.find_one({"midia_id": midia["_id"]})
    if atual:
        job = await _job_da_analise(db, atual)
        andando = job is not None and job["status"] in (STATUS_PENDENTE, STATUS_EXECUTANDO)
        if andando or atual["status"] == QUALIDADE_PRONTA:
            return qualidade_para_saida(atual, job)
    documento = montar_qualidade(usuario["organizacao_id"], midia["_id"])
    job = montar_job("qualidade", usuario["organizacao_id"], {"midia_id": str(midia["_id"])}, criado_por=usuario["_id"])
    documento["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.qualidades.replace_one({"midia_id": midia["_id"]}, documento, upsert=True)
    logging.info(f"[{usuario['organizacao_id']}] Avaliação dos trechos pedida: {midia['nome']}")
    return qualidade_para_saida(documento, {**job, "_id": documento["job_id"]})


@router.get("/{midia_id}/qualidade", response_model=QualidadeSaida)
async def ver_qualidade(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    doc = await db.qualidades.find_one({"midia_id": midia["_id"]})
    if doc is None:
        return QualidadeSaida(midia_id=str(midia["_id"]), status=QUALIDADE_NENHUMA)
    return qualidade_para_saida(doc, await _job_da_analise(db, doc))


@router.get("/{midia_id}/batidas", response_model=BatidasSaida)
async def ver_batidas(midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    midia = await buscar_midia(db, midia_id, usuario)
    doc = await db.batidas.find_one({"midia_id": midia["_id"]})
    # A linha do tempo pergunta por toda música aberta: "nenhuma" em vez de 404, para não sujar o console
    if doc is None:
        return BatidasSaida(midia_id=str(midia["_id"]), status=BATIDAS_NENHUMA)
    return batidas_para_saida(doc, await _job_da_analise(db, doc))
