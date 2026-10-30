# -----------------------------------------------
# TakeOne API — "Criar automaticamente": pede o plano de edição ao LLM local
#
# O editor manda as palavras da faixa principal já no tempo da linha do tempo (depois da limpeza da
# fala) e acompanha o job pela rota /api/jobs; a saída do job é o plano, que o editor aplica.
# As palavras-chave das legendas seguem o mesmo caminho: o editor manda o texto de cada legenda e pinta as
# palavras que voltam (e o emoji automático, o nome de cada emoji). O pedido de edição em palavras ("Peça uma
# edição") também: o plano volta na saída do job.
# -----------------------------------------------
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    DirecaoEntrada,
    GanchoEntrada,
    JobSaida,
    PalavrasChaveEntrada,
    PedidoEdicaoEntrada,
    job_para_saida,
)
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


@router.post("/emojis", response_model=JobSaida, status_code=status.HTTP_201_CREATED)
async def pedir_emojis(dados: PalavrasChaveEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O emoji automático das legendas (14.8): o mesmo pedido das palavras-chave, e a saída é o nome de cada emoji."""
    entrada = {"legendas": [legenda.model_dump() for legenda in dados.legendas]}
    job = montar_job("emojis", usuario["organizacao_id"], entrada, criado_por=usuario["_id"])
    job["_id"] = (await db.jobs.insert_one(job)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Emojis pedidos: {len(dados.legendas)} legendas.")
    return job_para_saida(job)


@router.post("/gancho", response_model=JobSaida, status_code=status.HTTP_201_CREATED)
async def pedir_gancho(dados: GanchoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A frase do gancho narrado do corte (14.8). Na frente da fila: a pessoa espera olhando."""
    if not dados.titulo.strip() and not dados.texto.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "O vídeo precisa de um título ou de legendas.")
    job = montar_job("gancho", usuario["organizacao_id"], dados.model_dump(), criado_por=usuario["_id"], prioridade=1)
    job["_id"] = (await db.jobs.insert_one(job)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Gancho pedido: {len(dados.texto)} letras.")
    return job_para_saida(job)


@router.post("/pedido", response_model=JobSaida, status_code=status.HTTP_201_CREATED)
async def pedir_edicao(dados: PedidoEdicaoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    entrada = {"pedido": dados.pedido.strip(), "frases": [frase.model_dump() for frase in dados.frases],
               "estado": dados.estado.model_dump() if dados.estado else None}
    job = montar_job("pedido_edicao", usuario["organizacao_id"], entrada, criado_por=usuario["_id"], prioridade=1)
    job["_id"] = (await db.jobs.insert_one(job)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Pedido de edição: {len(dados.frases)} frases.")
    return job_para_saida(job)
