# -----------------------------------------------
# TakeOne API — efeitos sonoros desenhados aqui (o Clipar, ADR 0004, 14.12d)
#
# A lista, o som de cada um para ouvir no painel (desenhado na hora e guardado na memória) e o pedido, que grava o
# WAV como o original de uma mídia e põe a ingestão na fila, como um envio. O mesmo efeito no mesmo espaço devolve a
# mídia que já existe, para a biblioteca não encher de cópias.
# -----------------------------------------------
import logging
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Response, status
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import MidiaSaida
from api.rotas.midias import para_saida
from core.modelos.job import montar_job
from core.modelos.midia import (
    PRIORIDADE_INGESTAO,
    STATUS_ERRO,
    STATUS_PROCESSANDO,
    chave_arquivo,
    montar_midia,
)
from core.utils import storage
from core.utils.efeitos_sonoros import EFEITOS, chave_do_efeito, lista_de_efeitos, wav
from core.utils.mongo import agora

router = APIRouter(prefix="/api/efeitos-sonoros", tags=["efeitos-sonoros"])


@lru_cache(maxsize=len(EFEITOS))
def _som(efeito: str) -> bytes:
    return wav(efeito)


def _conferir(efeito: str):
    if efeito not in EFEITOS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Efeito sonoro não encontrado.")


@router.get("")
async def lista(_usuario=Depends(usuario_atual)):
    return lista_de_efeitos()


@router.get("/{efeito}.wav")
async def ouvir(efeito: str, _usuario=Depends(usuario_atual)):
    _conferir(efeito)
    dados = await run_in_threadpool(_som, efeito)
    return Response(dados, media_type="audio/wav", headers={"Cache-Control": "private, max-age=86400"})


@router.post("/{efeito}", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def pedir(efeito: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A mídia do efeito: a que o espaço já tem, ou uma nova, com a ingestão na fila."""
    _conferir(efeito)
    chave = chave_do_efeito(efeito)
    existente = await db.midias.find_one({"organizacao_id": usuario["organizacao_id"], "efeito_sonoro.chave": chave,
                                          "status": {"$ne": STATUS_ERRO}})
    if existente:
        return (await para_saida(db, [existente]))[0]
    nome = f"Efeito · {EFEITOS[efeito][0]}"
    dados = await run_in_threadpool(_som, efeito)
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], f"{efeito}.wav", len(dados), "audio/wav")
    midia.update({"nome": nome, "nome_original": nome, "status": STATUS_PROCESSANDO, "bytes_recebidos": len(dados),
                  "efeito_sonoro": {"id": efeito, "chave": chave}})
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    original = storage.caminho_local(chave_arquivo(usuario["organizacao_id"], midia_id, midia["original"]))
    original.parent.mkdir(parents=True, exist_ok=True)
    await run_in_threadpool(original.write_bytes, dados)
    job = montar_job("ingestao", usuario["organizacao_id"], {"midia_id": str(midia_id)},
                     prioridade=PRIORIDADE_INGESTAO, criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    momento = agora()
    await db.midias.update_one({"_id": midia_id}, {"$set": {"job_ingestao_id": job_id, "enviado_em": momento,
                                                            "atualizado_em": momento}})
    logging.info(f"[{usuario['organizacao_id']}] Efeito sonoro pedido: {efeito}")
    return (await para_saida(db, [{**midia, "_id": midia_id, "job_ingestao_id": job_id}]))[0]
