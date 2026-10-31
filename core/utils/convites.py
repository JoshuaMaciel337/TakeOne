# -----------------------------------------------
# TakeOne — convites para o cadastro (quando o site está aberto na internet)
# -----------------------------------------------
# O código aparece uma vez; o banco guarda o hash, como as chaves de acesso. Um convite vale para um número de
# contas (usos) até uma data. Gastar é atômico: duas pessoas com o último uso não entram as duas.
import hashlib
import secrets
from datetime import timedelta

from core.utils.mongo import agora

# Sem 0/O, 1/I/L: o código pode ser ditado ou copiado de um print
ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TAMANHO = 10


def gerar_codigo() -> str:
    letras = "".join(secrets.choice(ALFABETO) for _ in range(TAMANHO))
    return f"{letras[:5]}-{letras[5:]}"


def normalizar(codigo: str) -> str:
    """Aceita o código com ou sem o traço, com espaços e em minúsculas."""
    limpo = "".join(c for c in (codigo or "").upper() if c.isalnum())
    return f"{limpo[:5]}-{limpo[5:]}" if len(limpo) == TAMANHO else limpo


def hash_do_codigo(codigo: str) -> str:
    return hashlib.sha256(normalizar(codigo).encode()).hexdigest()


def novo_convite(nota: str, usos: int, dias: int) -> tuple[str, dict]:
    """Devolve o código (para mostrar uma vez) e o documento para a coleção convites."""
    codigo = gerar_codigo()
    momento = agora()
    return codigo, {
        "hash": hash_do_codigo(codigo),
        "inicio": codigo[:3],
        "nota": nota,
        "usos_max": usos,
        "usos": 0,
        "contas": [],
        "criado_em": momento,
        "expira_em": momento + timedelta(days=dias),
        "revogado": False,
    }


def filtro_valido(codigo: str) -> dict:
    """O filtro do convite que ainda pode ser usado agora."""
    return {
        "hash": hash_do_codigo(codigo),
        "revogado": False,
        "expira_em": {"$gt": agora()},
        "$expr": {"$lt": ["$usos", "$usos_max"]},
    }
