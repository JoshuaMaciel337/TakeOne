# -----------------------------------------------
# TakeOne — a galeria do cliente (onda 16.10, docs/decisoes/0006-album-de-fotos.md)
#
# O fotógrafo manda um link com as fotos escolhidas do álbum; o cliente abre sem conta, marca as favoritas, deixa um
# comentário numa foto e envia a seleção. Como o link de aprovação (core/modelos/aprovacao.py): o token é aleatório,
# o banco guarda só o hash, ele vale 15 dias e mostra só aquelas fotos; gerar outro desliga o anterior. A galeria
# fica no álbum (`albuns.galeria`) e o que o cliente marca fica em cada foto (`album_fotos.cliente`), para a grade
# filtrar as favoritas dele. Funções puras.
# -----------------------------------------------
import secrets
from datetime import datetime, timedelta

from core.config import TZ
from core.modelos.aprovacao import hash_do_token

DIAS_VALIDADE = 15
FOTOS_MAXIMAS = 2000
ABERTA = "aberta"
ENVIADA = "enviada"
LETRAS_DO_COMENTARIO = 500
LETRAS_DO_NOME = 60


def _uma_linha(texto: str, limite: int) -> str:
    return " ".join((texto or "").split())[:limite]


def montar_galeria(midia_ids: list, pedida_por, para: str = "", mensagem: str = "",
                   momento: datetime | None = None) -> tuple[str, dict]:
    """(token para o link, registro que fica no álbum)."""
    if not midia_ids:
        raise ValueError("Escolha as fotos da galeria.")
    if len(midia_ids) > FOTOS_MAXIMAS:
        raise ValueError(f"A galeria vai até {FOTOS_MAXIMAS} fotos.")
    momento = momento or datetime.now(TZ)
    token = secrets.token_urlsafe(32)
    return token, {
        "token_hash": hash_do_token(token),
        "status": ABERTA,
        "fotos": list(dict.fromkeys(midia_ids)),
        "para": _uma_linha(para, LETRAS_DO_NOME),
        "mensagem": (mensagem or "").strip()[:LETRAS_DO_COMENTARIO],
        "pedida_por": pedida_por,
        "pedida_em": momento,
        "expira_em": momento + timedelta(days=DIAS_VALIDADE),
        "nome": None,
        "comentario": None,
        "enviada_em": None,
    }


def vencida(galeria: dict, momento: datetime | None = None) -> bool:
    """Só a galeria ainda aberta vence; a seleção enviada continua valendo para quem a mandou."""
    return galeria["status"] == ABERTA and (momento or datetime.now(TZ)) >= galeria["expira_em"]


def marcacao_do_cliente(favorita: bool | None, comentario: str | None, atual: dict | None,
                        momento: datetime | None = None) -> dict:
    """O que o cliente marcou numa foto: só o que veio muda."""
    marcacao = dict(atual or {"favorita": False, "comentario": ""})
    if favorita is not None:
        marcacao["favorita"] = bool(favorita)
    if comentario is not None:
        marcacao["comentario"] = comentario.strip()[:LETRAS_DO_COMENTARIO]
    marcacao["em"] = momento or datetime.now(TZ)
    return marcacao


def enviar(galeria: dict, nome: str, comentario: str = "", momento: datetime | None = None) -> dict:
    nome = _uma_linha(nome, LETRAS_DO_NOME)
    if not nome:
        raise ValueError("Diga o seu nome.")
    return {**galeria, "status": ENVIADA, "nome": nome, "comentario": (comentario or "").strip()[:LETRAS_DO_COMENTARIO],
            "enviada_em": momento or datetime.now(TZ)}
