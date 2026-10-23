# -----------------------------------------------
# TakeOne — chaves de acesso (para o servidor MCP e outros programas da própria pessoa)
#
# A chave é mostrada uma vez, ao ser criada; o banco guarda só o hash dela (como o link do celular). Quem manda
# `Authorization: Bearer <chave>` age como a pessoa que criou a chave, no espaço dela. Funções puras.
# -----------------------------------------------
import hashlib
import secrets
from datetime import datetime

from core.config import TZ

PREFIXO = "to_"
CHAVES_MAXIMAS = 20


def hash_da_chave(chave: str) -> str:
    return hashlib.sha256(chave.encode()).hexdigest()


def gerar_chave() -> str:
    return PREFIXO + secrets.token_urlsafe(32)


def montar_chave(organizacao_id, usuario_id, nome: str, momento: datetime | None = None) -> tuple[str, dict]:
    """(a chave, que só a pessoa vê, e o documento, que guarda o hash e o começo dela para reconhecer na lista)."""
    chave = gerar_chave()
    momento = momento or datetime.now(TZ)
    return chave, {"organizacao_id": organizacao_id, "usuario_id": usuario_id, "nome": nome,
                   "hash": hash_da_chave(chave), "inicio": chave[:7], "criado_em": momento, "usado_em": None}
