# -----------------------------------------------
# TakeOne — membros de um espaço (colaboração)
#
# Cada conta nasce com o próprio espaço, de que é a dona (usuarios.organizacao_id e papel "dono").
# O dono chama outras pessoas por um link: quem já tem conta entra no espaço como membro (coleção
# `membros`) sem perder o seu, e troca de espaço no menu. O espaço da sessão vai no token ("org");
# a API confere a cada pedido se a pessoa ainda é membro. O link não abre o cadastro: quem não tem
# conta precisa do convite do TakeOne. Funções puras, sem banco.
# -----------------------------------------------
import hashlib
import secrets
from datetime import datetime, timedelta

from core.config import TZ

PAPEL_DONO = "dono"
PAPEL_MEMBRO = "membro"
DIAS_DO_CONVITE = 7
MEMBROS_MAXIMOS = 20


def hash_do_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def montar_convite_do_espaco(criado_por, momento: datetime | None = None) -> tuple[str, dict]:
    """(token que vai no link, registro que fica no espaço). Um link por espaço: gerar outro desliga o anterior."""
    momento = momento or datetime.now(TZ)
    token = secrets.token_urlsafe(32)
    return token, {"token_hash": hash_do_token(token), "criado_por": criado_por, "criado_em": momento,
                   "expira_em": momento + timedelta(days=DIAS_DO_CONVITE)}


def convite_vencido(convite: dict | None, momento: datetime | None = None) -> bool:
    return not convite or (momento or datetime.now(TZ)) >= convite["expira_em"]


def montar_membro(organizacao_id, usuario_id, convidado_por, momento: datetime | None = None) -> dict:
    return {"organizacao_id": organizacao_id, "usuario_id": usuario_id, "papel": PAPEL_MEMBRO,
            "convidado_por": convidado_por, "criado_em": momento or datetime.now(TZ)}
