# -----------------------------------------------
# TakeOne API — o Clipar (ADR 0004): pedir os cortes de um vídeo longo e ler o resultado
#
# A clipagem guarda as opções da página e, quando o job "clipagem" (worker de GPU) termina, os cortes. Sem a
# transcrição da mídia, o job pede uma e espera por ela; o andamento que a página mostra é o da etapa da vez. Com
# o .srt da pessoa, a fala vem dele (guardada na clipagem) e não há transcrição.
# -----------------------------------------------
import logging
import zipfile
from collections.abc import Iterator
from pathlib import Path

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    AvaliacaoDoCorteEntrada,
    CapaDoCorteEntrada,
    ClipagemEntrada,
    ClipagemSaida,
    ModeloDoCorteEntrada,
    PalavraSaida,
    ProjetoDoCorteEntrada,
    SaidaDosCortesEntrada,
    clipagem_para_saida,
)
from api.rotas.exportacoes import para_saida as exportacoes_para_saida
from api.rotas.intercambio import BLOCO_DO_ZIP, _disposicao, _preparar, _Saida, nome_de_arquivo
from core.modelos.clipagem import (
    DURACAO_MINIMA,
    ESTRATEGIAS,
    STATUS_PROCESSANDO,
    faixa_das_opcoes,
    montar_clipagem,
    palavras_das_legendas,
    palavras_do_trecho,
    ritmo_do_corte,
)
from core.modelos.clipagem import STATUS_PRONTA as CLIPAGEM_PRONTA
from core.modelos.cortes import MAXIMO_DE_CORTES_NA_LISTA, continuacao, copia_do_corte
from core.modelos.exportacao import chave_exportacao
from core.modelos.job import RECURSO_GPU, STATUS_ERRO, STATUS_EXECUTANDO, STATUS_PENDENTE, montar_job
from core.modelos.midia import STATUS_PRONTA
from core.modelos.midia import chave_arquivo as chave_da_midia
from core.modelos.saida_dos_cortes import cortes_ocupados, montar_pedido
from core.modelos.transcricao import STATUS_PRONTA as TRANSCRICAO_PRONTA
from core.utils import storage
from core.utils.intercambio import montar_xmeml
from core.utils.legendas import escrever_srt, escrever_vtt, legendas_das_faixas
from core.utils.mongo import agora

router = APIRouter(prefix="/api/clipagens", tags=["clipagens"])


async def _buscar(db, clipagem_id: str, usuario: dict, com_palavras: bool = False) -> dict:
    try:
        oid = ObjectId(clipagem_id)
    except InvalidId:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Clipagem não encontrada.") from None
    # As palavras do .srt (até alguns MB) só são lidas pela rota da fala
    doc = await db.clipagens.find_one({"_id": oid, "organizacao_id": usuario["organizacao_id"]},
                                      None if com_palavras else {"palavras": 0})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Clipagem não encontrada.")
    return doc


async def _andamento(db, doc: dict) -> dict | None:
    """O que a página mostra enquanto processa: a transcrição, quando é ela que está andando, ou a busca."""
    if doc["status"] != STATUS_PROCESSANDO:
        return None
    # Com o .srt da pessoa, não há transcrição a esperar
    transcricao = None
    if doc.get("fala") != "legendas":
        transcricao = await db.transcricoes.find_one({"midia_id": doc["midia_id"]}, {"status": 1, "job_id": 1})
    if transcricao and transcricao["status"] != TRANSCRICAO_PRONTA and transcricao.get("job_id"):
        job = await db.jobs.find_one({"_id": transcricao["job_id"]}, {"status": 1, "progresso": 1, "mensagem": 1})
        if job and job["status"] in (STATUS_PENDENTE, STATUS_EXECUTANDO):
            na_fila = job["status"] == STATUS_PENDENTE
            return {"etapa": "transcricao", "progresso": job.get("progresso", 0),
                    "mensagem": "Transcrição na fila" if na_fila else "Transcrevendo a fala"}
    job = await db.jobs.find_one({"_id": doc.get("job_id")}, {"status": 1, "progresso": 1, "mensagem": 1}) \
        if doc.get("job_id") else None
    if job is None:
        return {"etapa": "cortes", "progresso": 0, "mensagem": "Na fila"}
    if job["status"] == STATUS_PENDENTE:
        return {"etapa": "cortes", "progresso": 0, "mensagem": job.get("mensagem") or "Na fila"}
    return {"etapa": "cortes", "progresso": job.get("progresso", 0),
            "mensagem": job.get("mensagem") or "Procurando os cortes"}


async def _com_as_exportacoes(db, doc: dict) -> dict:
    """Cada corte exportado leva o estado da exportação dele (o andamento do render), numa consulta só."""
    ids = [ObjectId(saida["exportacao_id"]) for corte in doc.get("cortes") or []
           if (saida := corte.get("saida") or {}).get("exportacao_id") and ObjectId.is_valid(saida["exportacao_id"])]
    if not ids:
        return doc
    cursor = db.exportacoes.find({"_id": {"$in": ids}, "organizacao_id": doc["organizacao_id"]}, {"projeto": 0})
    exportacoes = {item.id: item.model_dump(include={"id", "status", "arquivos", "erro", "processamento"})
                   for item in await exportacoes_para_saida(db, [e async for e in cursor])}
    cortes = []
    for corte in doc["cortes"]:
        saida = corte.get("saida")
        if saida and saida.get("exportacao_id"):
            # A exportação apagada em Exportados: o corte volta a não ter vídeo
            saida = {**saida, "exportacao": exportacoes.get(saida["exportacao_id"])}
        cortes.append({**corte, "saida": saida} if saida else corte)
    return {**doc, "cortes": cortes}


async def _completa(db, doc: dict) -> ClipagemSaida:
    """A clipagem inteira, com o andamento das exportações dos cortes (as rotas que mudam um corte)."""
    return clipagem_para_saida(await _com_as_exportacoes(db, doc), None)


@router.get("/estrategias")
async def listar_estrategias(usuario=Depends(usuario_atual)):
    """As estratégias prontas: o id, o nome, a faixa que sugerem e o que pedem ao modelo."""
    return [{"id": chave, "nome": nome, "faixa": faixa, "descricao": descricao}
            for chave, (nome, faixa, descricao) in ESTRATEGIAS.items()]


@router.get("/fila")
async def fila_da_placa(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Quantos pedidos estão na frente na placa de vídeo (de qualquer espaço: a placa é uma só), para a página de
    opções dizer que a clipagem vai esperar. Só a contagem; nada dos pedidos dos outros."""
    filtro = {"recurso": RECURSO_GPU, "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}
    return {"na_frente": await db.jobs.count_documents(filtro)}


@router.post("", response_model=ClipagemSaida, status_code=status.HTTP_201_CREATED)
async def pedir_clipagem(dados: ClipagemEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    try:
        midia_id = ObjectId(dados.midia_id)
    except InvalidId:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vídeo não encontrado.") from None
    midia = await db.midias.find_one({"_id": midia_id, "organizacao_id": usuario["organizacao_id"]})
    if midia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vídeo não encontrado.")
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "O vídeo ainda está sendo preparado.")
    if midia.get("imagem") or not midia.get("audio"):
        raise HTTPException(status.HTTP_409_CONFLICT, "O Clipar procura os cortes pela fala: escolha um vídeo com som.")
    if float(midia.get("duracao") or 0) < DURACAO_MINIMA:
        raise HTTPException(status.HTTP_409_CONFLICT, "O vídeo tem menos de 1 minuto: ele já é um corte.")
    opcoes = dados.opcoes.model_dump()
    if opcoes["fim"] is not None and opcoes["fim"] > float(midia["duracao"]) + 1:
        opcoes["fim"] = float(midia["duracao"])
    if opcoes["fim"] is not None and opcoes["fim"] - (opcoes["inicio"] or 0) < DURACAO_MINIMA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "O trecho a analisar precisa ter pelo menos 1 minuto.")
    palavras = None
    if dados.legendas is not None:
        palavras = palavras_das_legendas([legenda.model_dump() for legenda in dados.legendas])
        palavras = palavras_do_trecho(palavras, opcoes["inicio"], opcoes["fim"])
        if len(palavras) < 20:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "O .srt quase não tem fala no trecho escolhido.")
    documento = montar_clipagem(usuario["organizacao_id"], usuario["_id"], midia, opcoes, palavras)
    documento["_id"] = (await db.clipagens.insert_one(documento)).inserted_id
    entrada = {"clipagem_id": str(documento["_id"]), "midia_id": str(midia_id)}
    job = montar_job("clipagem", usuario["organizacao_id"], entrada,
                     criado_por=usuario["_id"])
    documento["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.clipagens.update_one({"_id": documento["_id"]}, {"$set": {"job_id": documento["job_id"]}})
    logging.info(f"[{usuario['organizacao_id']}] Clipagem pedida: {midia['nome']} ({opcoes['estrategia']}, "
                 f"{opcoes['faixa']})")
    return clipagem_para_saida(documento, await _andamento(db, documento))


@router.get("", response_model=list[ClipagemSaida])
async def listar_clipagens(midia_id: str | None = Query(default=None),
                           projeto_id: str | None = Query(default=None, pattern=r"^[0-9a-f]{24}$"),
                           usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """As clipagens do espaço; com projeto_id, só a que tem um corte montado nesse projeto (o editor do corte)."""
    filtro = {"organizacao_id": usuario["organizacao_id"]}
    if projeto_id:
        filtro["cortes.projeto_id"] = projeto_id
    if midia_id:
        try:
            filtro["midia_id"] = ObjectId(midia_id)
        except InvalidId:
            return []
    docs = await db.clipagens.find(filtro, {"palavras": 0}).sort("criado_em", -1).to_list(200)
    # Pelo projeto, a clipagem vem inteira (o editor lê o corte)
    return [clipagem_para_saida(doc, await _andamento(db, doc), resumida=not projeto_id) for doc in docs]


@router.get("/{clipagem_id}", response_model=ClipagemSaida)
async def ver_clipagem(clipagem_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    doc = await _buscar(db, clipagem_id, usuario)
    return clipagem_para_saida(await _com_as_exportacoes(db, doc), await _andamento(db, doc))


@router.post("/{clipagem_id}/saidas", response_model=ClipagemSaida, status_code=status.HTTP_202_ACCEPTED)
async def pedir_saida(clipagem_id: str, dados: SaidaDosCortesEntrada, usuario=Depends(usuario_atual),
                      db=Depends(obter_db)):
    """Exportar vários cortes de uma vez (14.9): o worker da montagem monta os que ainda não têm projeto, sem a
    página aberta, e põe cada vídeo na fila do render. Os mesmos cortes não entram duas vezes."""
    doc = await _buscar(db, clipagem_id, usuario)
    if doc["status"] != CLIPAGEM_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Os cortes ainda estão sendo procurados.")
    ids = list(dict.fromkeys(dados.cortes))
    for corte_id in ids:
        _corte(doc, corte_id)
    if ocupados := cortes_ocupados(doc.get("cortes") or [], ids):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já está na fila." if len(ocupados) == 1
                            else f"{len(ocupados)} desses cortes já estão na fila.")
    job, saida = montar_pedido(usuario["organizacao_id"], usuario["_id"], doc["_id"], ids, dados.exportar,
                               dados.resolucao)
    job["_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.clipagens.update_one(
        {"_id": doc["_id"]},
        {"$set": {"cortes.$[c].saida": {**saida, "job_id": str(job["_id"])}, "atualizado_em": agora()}},
        array_filters=[{"c.id": {"$in": ids}}],
    )
    logging.info(f"[{usuario['organizacao_id']}] Saída de {len(ids)} cortes pedida ({doc['nome']}, "
                 f"{dados.resolucao})")
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


@router.get("/{clipagem_id}/fala", response_model=list[PalavraSaida])
async def fala_da_clipagem(clipagem_id: str, de: float = Query(default=0, ge=0),
                           ate: float | None = Query(default=None), usuario=Depends(usuario_atual),
                           db=Depends(obter_db)):
    """As palavras da fala entre de e ate (segundos da mídia): do .srt da pessoa ou da transcrição. A montagem de
    cada corte (as legendas e a limpeza das pausas) parte delas."""
    doc = await _buscar(db, clipagem_id, usuario, com_palavras=True)
    return palavras_do_trecho(await _palavras(db, doc), de, ate)


async def _palavras(db, doc: dict) -> list[dict]:
    """A fala da clipagem: o .srt da pessoa (guardado nela) ou a transcrição da mídia."""
    if doc.get("palavras"):
        return doc["palavras"]
    transcricao = await db.transcricoes.find_one({"midia_id": doc["midia_id"]}, {"palavras": 1, "status": 1})
    if transcricao is None or transcricao["status"] != TRANSCRICAO_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A fala deste vídeo ainda não foi transcrita.")
    return transcricao.get("palavras") or []


def _corte(doc: dict, corte_id: str) -> tuple[int, dict]:
    for i, corte in enumerate(doc.get("cortes") or []):
        if corte.get("id") == corte_id:
            return i, corte
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Corte não encontrado.")


async def _por_depois(db, doc: dict, posicao: int, novo: dict) -> None:
    """Põe o corte novo logo depois de outro, com o limite da lista."""
    if doc["status"] != CLIPAGEM_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Os cortes ainda estão sendo procurados.")
    if len(doc.get("cortes") or []) >= MAXIMO_DE_CORTES_NA_LISTA:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A lista já tem {MAXIMO_DE_CORTES_NA_LISTA} cortes.")
    await db.clipagens.update_one({"_id": doc["_id"]},
                                  {"$push": {"cortes": {"$each": [novo], "$position": posicao + 1}},
                                   "$set": {"atualizado_em": agora()}})


@router.post("/{clipagem_id}/cortes/{corte_id}/copia", response_model=ClipagemSaida, status_code=201)
async def duplicar_corte(clipagem_id: str, corte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A cópia do corte, logo depois dele, para montar o mesmo trecho com outra edição."""
    doc = await _buscar(db, clipagem_id, usuario)
    posicao, corte = _corte(doc, corte_id)
    await _por_depois(db, doc, posicao, copia_do_corte(corte, doc["cortes"]))
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


@router.post("/{clipagem_id}/cortes/{corte_id}/continuacao", response_model=ClipagemSaida, status_code=201)
async def parte_seguinte(clipagem_id: str, corte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A parte 2: o corte que continua a ideia, das frases logo depois do fim deste, na faixa pedida."""
    doc = await _buscar(db, clipagem_id, usuario, com_palavras=True)
    posicao, corte = _corte(doc, corte_id)
    palavras = await _palavras(db, doc)
    parte = continuacao(corte, palavras, faixa_das_opcoes(doc.get("opcoes") or {}), doc["cortes"])
    if parte is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A fala do vídeo acaba logo depois deste corte.")
    parte["medidas"] = {"ritmo": ritmo_do_corte(parte, palavras)}
    await _por_depois(db, doc, posicao, parte)
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


@router.put("/{clipagem_id}/cortes/{corte_id}/modelo", response_model=ClipagemSaida)
async def mudar_modelo_do_corte(clipagem_id: str, corte_id: str, dados: ModeloDoCorteEntrada,
                                usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O modelo de corte só deste corte (vale mais que o da clipagem), ou None para voltar ao da clipagem. O projeto
    já montado não muda aqui: a página monta de novo."""
    doc = await _buscar(db, clipagem_id, usuario)
    _corte(doc, corte_id)
    modelo = dados.modelo_corte.model_dump() if dados.modelo_corte else None
    await db.clipagens.update_one({"_id": doc["_id"], "cortes.id": corte_id},
                                  {"$set": {"cortes.$.modelo_corte": modelo, "atualizado_em": agora()}})
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


@router.put("/{clipagem_id}/cortes/{corte_id}/capa", response_model=ClipagemSaida)
async def mudar_capa(clipagem_id: str, corte_id: str, dados: CapaDoCorteEntrada,
                     usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A capa do corte (14.8): um quadro exportado em PNG ou uma imagem da biblioteca, do espaço; None tira."""
    doc = await _buscar(db, clipagem_id, usuario)
    _corte(doc, corte_id)
    capa = dados.capa.model_dump() if dados.capa else None
    if capa and capa["tipo"] == "quadro":
        try:
            filtro = {"_id": ObjectId(capa["exportacao_id"]), "organizacao_id": usuario["organizacao_id"],
                      "formato": "png"}
        except InvalidId:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Quadro não encontrado.") from None
        if await db.exportacoes.count_documents(filtro) == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Quadro não encontrado.")
    elif capa:
        try:
            midia = await db.midias.find_one({"_id": ObjectId(capa["midia_id"]),
                                              "organizacao_id": usuario["organizacao_id"]})
        except InvalidId:
            midia = None
        if not midia or not midia.get("imagem"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Imagem não encontrada.")
    await db.clipagens.update_one({"_id": doc["_id"], "cortes.id": corte_id},
                                  {"$set": {"cortes.$.capa": capa, "atualizado_em": agora()}})
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


LEIA_ME_DO_PACOTE = """Os cortes do TakeOne

Cada corte tem o vídeo (.mp4), as legendas em .srt (a maioria das redes e dos programas) e em .vtt (navegadores e
alguns players), a capa, quando ela foi escolhida, e o XML de intercâmbio, para continuar a edição noutro programa.

O XML aponta para o vídeo original numa pasta midias/ ao lado dele: para abrir, ponha o vídeo original lá (ou, no
outro programa, ligue a mídia ao arquivo original).
"""


def _pacote_em_pedacos(arquivos: list[tuple[str, bytes | Path]]) -> Iterator[bytes]:
    """O ZIP sem compressão (os vídeos já vêm comprimidos), mandado enquanto é montado, como o do intercâmbio."""
    saida = _Saida()
    with zipfile.ZipFile(saida, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as pacote:
        for nome, conteudo in arquivos:
            if isinstance(conteudo, bytes):
                pacote.writestr(nome, conteudo)
            else:
                with open(conteudo, "rb") as origem, pacote.open(nome, "w", force_zip64=True) as destino:
                    while bloco := origem.read(BLOCO_DO_ZIP):
                        destino.write(bloco)
                        yield from saida.tirar()
            yield from saida.tirar()
    yield from saida.tirar()


async def _arquivos_do_corte(db, usuario: dict, numero: int, corte: dict) -> list[tuple[str, bytes | Path]] | None:
    """O vídeo pronto, as legendas, o XML e a capa de um corte; None quando ele ainda não tem o vídeo."""
    organizacao_id = usuario["organizacao_id"]
    exportacao_id = (corte.get("saida") or {}).get("exportacao_id")
    if not exportacao_id or not ObjectId.is_valid(exportacao_id):
        return None
    exportacao = await db.exportacoes.find_one({"_id": ObjectId(exportacao_id), "organizacao_id": organizacao_id},
                                               {"status": 1, "arquivos": 1, "projeto_id": 1})
    video = next((nome for nome in (exportacao or {}).get("arquivos") or [] if nome.endswith(".mp4")), None)
    if not exportacao or exportacao.get("status") != "pronta" or not video:
        return None
    caminho = storage.caminho_local(chave_exportacao(organizacao_id, exportacao["_id"], video))
    if not caminho.is_file():
        return None
    base = f"{numero:02d} {nome_de_arquivo(corte.get('titulo') or 'Corte')}"
    arquivos: list[tuple[str, bytes | Path]] = [(f"{base}.mp4", caminho)]
    # As legendas e o XML saem do projeto como está agora (as legendas que a pessoa ajustou no editor)
    projeto_id = str(exportacao["projeto_id"])
    try:
        projeto, midias, _ = await _preparar(db, projeto_id, usuario)
    except HTTPException:
        projeto = None
    if projeto:
        legendas = legendas_das_faixas(projeto["faixas"])
        if legendas:
            arquivos += [(f"{base}.srt", escrever_srt(legendas).encode()),
                         (f"{base}.vtt", escrever_vtt(legendas).encode())]
        arquivos.append((f"{base}.xml", montar_xmeml(projeto, midias).encode()))
    capa = corte.get("capa") or {}
    if capa.get("tipo") == "quadro" and ObjectId.is_valid(capa.get("exportacao_id") or ""):
        caminho_da_capa = storage.caminho_local(chave_exportacao(organizacao_id, ObjectId(capa["exportacao_id"]),
                                                                 "quadro.png"))
    elif capa.get("tipo") == "imagem" and ObjectId.is_valid(capa.get("midia_id") or ""):
        caminho_da_capa = storage.caminho_local(chave_da_midia(organizacao_id, ObjectId(capa["midia_id"]),
                                                               "imagem.png"))
    else:
        caminho_da_capa = None
    if caminho_da_capa and caminho_da_capa.is_file():
        arquivos.append((f"{base} - capa.png", caminho_da_capa))
    return arquivos


@router.get("/{clipagem_id}/pacote")
async def baixar_pacote(clipagem_id: str, cortes: str = Query(min_length=1, max_length=2000),
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Os cortes escolhidos com o vídeo pronto num ZIP (14.9): o vídeo, as legendas em .srt e .vtt, o XML de
    intercâmbio e a capa de cada um, numerados na ordem pedida."""
    doc = await _buscar(db, clipagem_id, usuario)
    ids = list(dict.fromkeys(item for item in cortes.split(",") if item))[:MAXIMO_DE_CORTES_NA_LISTA]
    arquivos: list[tuple[str, bytes | Path]] = [("LEIA-ME.txt", LEIA_ME_DO_PACOTE.encode())]
    numero = 0
    for corte_id in ids:
        _, corte = _corte(doc, corte_id)
        do_corte = await _arquivos_do_corte(db, usuario, numero + 1, corte)
        if do_corte:
            numero += 1
            arquivos += do_corte
    if not numero:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nenhum desses cortes tem o vídeo pronto. Exporte antes.")
    return StreamingResponse(_pacote_em_pedacos(arquivos), media_type="application/zip",
                             headers={"Content-Disposition": _disposicao(f"{doc['nome']} cortes", ".zip")})


@router.delete("/{clipagem_id}/cortes/{corte_id}", response_model=ClipagemSaida)
async def apagar_corte(clipagem_id: str, corte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Tira o corte da lista. O projeto em que ele foi montado continua nos projetos."""
    doc = await _buscar(db, clipagem_id, usuario)
    _corte(doc, corte_id)
    await db.clipagens.update_one({"_id": doc["_id"]},
                                  {"$pull": {"cortes": {"id": corte_id}}, "$set": {"atualizado_em": agora()}})
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


@router.put("/{clipagem_id}/cortes/{corte_id}/avaliacao", response_model=ClipagemSaida)
async def avaliar_corte(clipagem_id: str, corte_id: str, dados: AvaliacaoDoCorteEntrada,
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Gostei, não gostei, ou nenhum (null). Guardado no corte, para o gosto do espaço entrar nas próximas."""
    doc = await _buscar(db, clipagem_id, usuario)
    if not any(corte.get("id") == corte_id for corte in doc.get("cortes") or []):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corte não encontrado.")
    await db.clipagens.update_one({"_id": doc["_id"], "cortes.id": corte_id},
                                  {"$set": {"cortes.$.avaliacao": dados.avaliacao, "atualizado_em": agora()}})
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


@router.put("/{clipagem_id}/cortes/{corte_id}/projeto", response_model=ClipagemSaida)
async def ligar_projeto(clipagem_id: str, corte_id: str, dados: ProjetoDoCorteEntrada,
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Liga o corte ao projeto em que ele foi montado (ou solta, com null). O projeto precisa ser do espaço."""
    doc = await _buscar(db, clipagem_id, usuario)
    if not any(corte.get("id") == corte_id for corte in doc.get("cortes") or []):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corte não encontrado.")
    projeto_id = None
    if dados.projeto_id:
        try:
            projeto_id = ObjectId(dados.projeto_id)
        except InvalidId:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado.") from None
        if await db.projetos.count_documents({"_id": projeto_id, "organizacao_id": usuario["organizacao_id"]}) == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado.")
    await db.clipagens.update_one({"_id": doc["_id"], "cortes.id": corte_id},
                                  {"$set": {"cortes.$.projeto_id": str(projeto_id) if projeto_id else None,
                                            "atualizado_em": agora()}})
    return await _completa(db, await _buscar(db, clipagem_id, usuario))


@router.delete("/{clipagem_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_clipagem(clipagem_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    doc = await _buscar(db, clipagem_id, usuario)
    momento = agora()
    # O job que ainda ia procurar os cortes para aqui (a transcrição continua: ela serve à mídia)
    await db.jobs.update_many(
        {"entrada.clipagem_id": str(doc["_id"]), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}},
        {"$set": {"status": STATUS_ERRO, "erro": "A clipagem foi excluída.", "mensagem": "Cancelado",
                  "lease_ate": None, "concluido_em": momento, "atualizado_em": momento}},
    )
    await db.clipagens.delete_one({"_id": doc["_id"]})
