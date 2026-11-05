# -----------------------------------------------
# TakeOne API — saúde e estado do sistema
# -----------------------------------------------
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from api.dependencias import obter_db, usuario_atual
from api.esquemas import SistemaSaida, worker_para_saida
from core.config import MODO_IA, VERSAO
from core.utils.mongo import agora

router = APIRouter(prefix="/api", tags=["sistema"])
WORKER_ONLINE_SEGUNDOS = 60


async def mongo_responde(db) -> bool:
    try:
        await db.command("ping")
        return True
    except Exception as e:
        logging.error(f"MongoDB não respondeu: {e}")
        return False


@router.get("/saude")
async def saude(db=Depends(obter_db)):
    """Pública. Usada pelo Docker e pela página de manutenção."""
    mongo = await mongo_responde(db)
    return {"status": "ok" if mongo else "degradado", "mongo": mongo, "versao": VERSAO,
            "horario": agora().isoformat()}


@router.get("/sistema", response_model=SistemaSaida)
async def sistema(_usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Workers online, para o painel mostrar se a máquina que processa está ligada."""
    limite = agora() - timedelta(seconds=WORKER_ONLINE_SEGUNDOS)
    workers = [worker_para_saida(w) async for w in db.workers.find({"visto_em": {"$gte": limite}})]
    return SistemaSaida(mongo=True, modo_ia=MODO_IA, workers=workers)


class ErroDoSiteEntrada(BaseModel):
    mensagem: str = Field(max_length=2000)
    pagina: str = Field(default="", max_length=300)
    navegador: str = Field(default="", max_length=300)


# Os erros do navegador que chegaram desde que a API subiu (um teto, para quem mandar demais não encher o log)
_erros_registrados = {"total": 0}
TETO_DE_ERROS_DO_SITE = 500


@router.post("/erros-do-site", status_code=204)
async def erro_do_site(dados: ErroDoSiteEntrada, request: Request):
    """
    Pública. O erro de JavaScript que o site viu no navegador de alguém (a página, a mensagem e o navegador), só
    no log da API: é o jeito de ver o que trava num celular que não está aqui.
    """
    _erros_registrados["total"] += 1
    if _erros_registrados["total"] <= TETO_DE_ERROS_DO_SITE:
        ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "")
        logging.warning(f"[erro do site] {dados.pagina} | {dados.mensagem} | {dados.navegador} | {ip}")
