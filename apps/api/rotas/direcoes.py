# -----------------------------------------------
# TakeOne API — "Criar automaticamente": pede o plano de edição ao LLM local
#
# O editor manda as palavras da faixa principal já no tempo da linha do tempo (depois da limpeza da
# fala) e acompanha o job pela rota /api/jobs; a saída do job é o plano, que o editor aplica.
# As palavras-chave das legendas seguem o mesmo caminho: o editor manda o texto de cada legenda e pinta as
# palavras que voltam.
# -----------------------------------------------
import logging

from fastapi import APIRouter, Depends, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import DirecaoEntrada, JobSaida, PalavrasChaveEntrada, job_para_saida
from core.modelos.job import montar_job

router = APIRouter(prefix="/api/direcoes", tags=["direcoes"])


@router.post("", response_model=JobSaida, status_code=status.HTTP_201_CREATED)
async def pedir_plano(dados: DirecaoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    entrada = {"palavras": [p.model_dump() for p in dados.palavras], "duracao": dados.duracao}
    job = montar_job("direcao", usuario["organizacao_id"], entrada, criado_por=usuario["_id"])
    job["_id"] = (await db.jobs.insert_one(job)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Plano automático pedido: {len(dados.palavras)} palavras.")
    return job_para_saida(job)


@router.post("/palavras-chave", response_model=JobSaida, status_code=status.HTTP_201_CREATED)
async def pedir_palavras_chave(dados: PalavrasChaveEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    entrada = {"legendas": [legenda.model_dump() for legenda in dados.legendas]}
    job = montar_job("palavras_chave", usuario["organizacao_id"], entrada, criado_por=usuario["_id"])
    job["_id"] = (await db.jobs.insert_one(job)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Palavras-chave pedidas: {len(dados.legendas)} legendas.")
    return job_para_saida(job)
