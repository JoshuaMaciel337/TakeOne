# -----------------------------------------------
# TakeOne API — o banco de imagens e vídeos da Pixabay (o Clipar, ADR 0004, 14.12f)
#
# A busca (com a resposta guardada 24 h, como as regras da API pedem) e o importar: o pedido traz só o tipo e o id,
# a API lê o item na Pixabay (também pelo cache), cria a mídia processando e põe o download na fila do worker de CPU,
# que baixa só dos endereços da Pixabay e põe a ingestão na fila. O mesmo item no mesmo espaço volta a mesma mídia.
# -----------------------------------------------
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import MidiaSaida
from api.rotas.midias import para_saida
from core.modelos.job import montar_job
from core.modelos.midia import PRIORIDADE_INGESTAO, STATUS_ERRO, STATUS_PROCESSANDO, montar_midia
from core.utils import pixabay
from core.utils.mongo import agora

router = APIRouter(prefix="/api/pixabay", tags=["pixabay"])


class ImportarEntrada(BaseModel):
    tipo: Literal["imagem", "video"]
    id: int = Field(gt=0)


async def _resposta(db, tipo: str, params: dict) -> dict:
    """A resposta da Pixabay, do cache (24 h) ou pedida agora e guardada."""
    chave = pixabay.chave_do_cache(tipo, params)
    guardada = await db.pixabay_cache.find_one({"chave": chave})
    if guardada:
        return guardada["resposta"]
    try:
        resposta = await run_in_threadpool(pixabay.pedir, tipo, params)
    except pixabay.ErroPixabay as erro:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(erro)) from erro
    try:
        await db.pixabay_cache.insert_one({"chave": chave, "resposta": resposta, "criado_em": agora()})
    except DuplicateKeyError:
        pass
    return resposta


@router.get("/estado")
async def estado(_usuario=Depends(usuario_atual)):
    return {"ligada": pixabay.ligada(), "fonte": pixabay.FONTE}


@router.get("/buscar")
async def buscar(tipo: Literal["imagem", "video"], q: str = Query(default="", max_length=100),
                 pagina: int = Query(default=1, ge=1, le=20), orientacao: str = Query(default="", max_length=12),
                 _usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Uma página de resultados, já no formato do editor, com a fonte."""
    resposta = await _resposta(db, tipo, pixabay.parametros(tipo, q, pagina, orientacao))
    itens = [r for r in (pixabay.resumir(tipo, item) for item in resposta.get("hits") or []) if r]
    return {"itens": itens, "total": int(resposta.get("totalHits") or 0), "fonte": pixabay.FONTE}


@router.post("/importar", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def importar(dados: ImportarEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    existente = await db.midias.find_one({"organizacao_id": usuario["organizacao_id"], "pixabay.id": dados.id,
                                          "pixabay.tipo": dados.tipo, "status": {"$ne": STATUS_ERRO}})
    if existente:
        return (await para_saida(db, [existente]))[0]
    resposta = await _resposta(db, dados.tipo, pixabay.parametros(dados.tipo, item_id=dados.id))
    item = next((pixabay.resumir(dados.tipo, h) for h in resposta.get("hits") or [] if h.get("id") == dados.id), None)
    if not item or not pixabay.endereco_permitido(item["arquivo"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esse item não está mais na Pixabay.")
    extensao = pixabay.extensao_do_arquivo(item["arquivo"], dados.tipo)
    assunto = ", ".join(t.strip() for t in item["tags"].split(",")[:3] if t.strip()) or str(dados.id)
    nome = f"Pixabay · {assunto}"[:110]
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], f"pixabay{extensao}", 0,
                         "video/mp4" if dados.tipo == "video" else "image/jpeg")
    midia.update({"nome": nome, "nome_original": nome, "status": STATUS_PROCESSANDO,
                  "pixabay": {"id": dados.id, "tipo": dados.tipo, "usuario": item["usuario"],
                              "pagina": item["pagina"]}})
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    job = montar_job("pixabay", usuario["organizacao_id"],
                     {"midia_id": str(midia_id), "tipo": dados.tipo, "url": item["arquivo"]},
                     prioridade=PRIORIDADE_INGESTAO, criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    await db.midias.update_one({"_id": midia_id}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Pixabay: importando {dados.tipo} {dados.id}")
    return (await para_saida(db, [{**midia, "_id": midia_id, "job_ingestao_id": job_id}]))[0]
