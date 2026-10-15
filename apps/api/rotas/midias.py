# -----------------------------------------------
# TakeOne API — mídias (a biblioteca de vídeos e áudios enviados)
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    MidiaAtualizarEntrada,
    MidiaSaida,
    TranscricaoPedirEntrada,
    TranscricaoSaida,
    midia_para_saida,
    transcricao_para_saida,
)
from core.modelos.job import STATUS_ERRO as STATUS_JOB_ERRO
from core.modelos.job import STATUS_EXECUTANDO, STATUS_PENDENTE, montar_job
from core.modelos.midia import (
    ARQUIVO_VOZ_LIMPA,
    ARQUIVOS_PUBLICOS,
    STATUS_PROCESSANDO,
    STATUS_PRONTA,
    chave_arquivo,
    pasta_da_midia,
)
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
async def listar_midias(limite: int = Query(default=30, ge=1, le=100),
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    cursor = db.midias.find({"organizacao_id": usuario["organizacao_id"]}).sort("criado_em", -1).limit(limite)
    return await para_saida(db, [m async for m in cursor])


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
    momento = agora()
    # Jobs que ainda iam mexer nesta mídia param aqui
    await db.jobs.update_many(
        {"entrada.midia_id": str(midia["_id"]), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}},
        {"$set": {"status": STATUS_JOB_ERRO, "erro": "A mídia foi excluída.", "mensagem": "Cancelado",
                  "lease_ate": None, "concluido_em": momento, "atualizado_em": momento}},
    )
    await db.midias.delete_one({"_id": midia["_id"]})
    await db.transcricoes.delete_one({"midia_id": midia["_id"]})
    await run_in_threadpool(storage.remover_pasta, pasta_da_midia(midia["organizacao_id"], midia["_id"]))
    logging.info(f"[{midia['organizacao_id']}] Mídia excluída: {midia['nome']}")


@router.get("/{midia_id}/arquivos/{nome}")
async def baixar_arquivo(midia_id: str, nome: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Serve a cópia leve, a capa, as miniaturas e a forma de onda. Aceita Range para o player."""
    midia = await buscar_midia(db, midia_id, usuario)
    if nome not in ARQUIVOS_PUBLICOS or nome not in midia.get("arquivos", []):
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
