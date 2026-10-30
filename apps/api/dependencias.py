# -----------------------------------------------
# TakeOne API — dependências das rotas
# -----------------------------------------------
from datetime import datetime, timedelta

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, Request, status

from api.seguranca import ler_token
from core.config import COOKIE_NOME, TZ
from core.modelos.chave import PREFIXO, hash_da_chave


def obter_db(request: Request):
    return request.app.state.db


async def _usuario_da_chave(db, chave: str) -> dict:
    """O dono de uma chave de acesso (Authorization: Bearer), marcado como vindo da chave."""
    doc = await db.chaves_de_acesso.find_one({"hash": hash_da_chave(chave)})
    if doc is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chave de acesso inválida ou apagada.")
    agora = datetime.now(TZ)
    # A temporária vencida (o índice TTL do Mongo a apaga em até um minuto)
    if doc.get("expira_em") and doc["expira_em"] <= agora:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chave de acesso vencida.")
    usuario = await db.usuarios.find_one({"_id": doc["usuario_id"]})
    if not usuario or not usuario.get("ativo", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chave de acesso inválida.")
    # O último uso, no máximo uma vez por minuto (cada pedido gravaria no banco)
    if not doc.get("usado_em") or agora - doc["usado_em"] > timedelta(minutes=1):
        await db.chaves_de_acesso.update_one({"_id": doc["_id"]}, {"$set": {"usado_em": agora}})
    return {**usuario, "_pela_chave": True}


async def usuario_atual(request: Request, db=Depends(obter_db)) -> dict:
    """Usuário dono do cookie de sessão, ou da chave de acesso no Authorization. Responde 401 sem nenhum dos dois."""
    autorizacao = request.headers.get("authorization") or ""
    if autorizacao.lower().startswith("bearer ") and autorizacao[7:].strip().startswith(PREFIXO):
        return await _usuario_da_chave(db, autorizacao[7:].strip())
    token = request.cookies.get(COOKIE_NOME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Faça login para continuar.")
    dados = ler_token(token)
    if dados is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sua sessão expirou. Entre de novo.")
    try:
        usuario_id = ObjectId(dados["sub"])
    except (InvalidId, TypeError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida. Entre de novo.") from e

    usuario = await db.usuarios.find_one({"_id": usuario_id})
    if not usuario or not usuario.get("ativo", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida. Entre de novo.")
    return usuario
