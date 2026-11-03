# -----------------------------------------------
# TakeOne — aprovação de uma exportação (do HolyCut, sem a parte da igreja)
#
# Quem edita manda um link e o cliente assiste e responde pelo celular, sem conta. O link leva um
# token aleatório; o banco guarda só o hash dele. Ele vale 7 dias e só mostra aquela exportação.
# A aprovação fica dentro da exportação: um pedido de cada vez, e pedir de novo invalida o link
# anterior. Enquanto o pedido espera resposta, o cliente pode deixar anotações presas a um instante
# do vídeo ("aqui o texto está errado"); o editor as leva para a linha do tempo como marcadores.
# Funções puras: montam e calculam, sem acessar o banco.
# -----------------------------------------------
import hashlib
import secrets
from datetime import datetime, timedelta

from core.config import TZ

DIAS_VALIDADE = 7
PENDENTE = "pendente"
APROVADO = "aprovado"
AJUSTES = "ajustes"          # pediu ajustes, com um comentário ou com anotações
DECISOES = (APROVADO, AJUSTES)
ANOTACOES_MAXIMAS = 50
LETRAS_DO_TEXTO = 500
LETRAS_DO_NOME = 60


def hash_do_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _uma_linha(texto: str, limite: int) -> str:
    return " ".join(texto.split())[:limite]


def montar_aprovacao(pedido_por, para: str = "", momento: datetime | None = None) -> tuple[str, dict]:
    """(token para o link, registro que fica na exportação)."""
    momento = momento or datetime.now(TZ)
    token = secrets.token_urlsafe(32)
    return token, {
        "status": PENDENTE,
        "token_hash": hash_do_token(token),
        "para": _uma_linha(para, LETRAS_DO_NOME),
        "pedido_por": pedido_por,
        "pedido_em": momento,
        "expira_em": momento + timedelta(days=DIAS_VALIDADE),
        "anotacoes": [],
        "respondido_por": None,
        "comentario": None,
        "respondido_em": None,
    }


def expirada(aprovacao: dict, momento: datetime | None = None) -> bool:
    """Só um pedido ainda sem resposta expira. Uma resposta dada continua valendo."""
    return aprovacao["status"] == PENDENTE and (momento or datetime.now(TZ)) >= aprovacao["expira_em"]


def montar_anotacao(tempo: float, texto: str, nome: str, duracao: float | None,
                    momento: datetime | None = None) -> dict:
    """Uma anotação no instante `tempo` (segundos do vídeo exportado). Sem duração conhecida, o instante só não
    pode ser negativo."""
    texto = texto.strip()[:LETRAS_DO_TEXTO]
    if not texto:
        raise ValueError("Escreva a anotação.")
    nome = _uma_linha(nome, LETRAS_DO_NOME)
    if not nome:
        raise ValueError("Diga o seu nome.")
    if tempo < 0 or (duracao is not None and tempo > duracao + 0.05):
        raise ValueError("O instante fica fora do vídeo.")
    if duracao is not None:
        tempo = min(tempo, duracao)
    return {"id": secrets.token_hex(6), "tempo": round(tempo, 3), "texto": texto, "nome": nome,
            "criado_em": momento or datetime.now(TZ)}


def responder(aprovacao: dict, decisao: str, nome: str, comentario: str = "", momento: datetime | None = None) -> dict:
    if decisao not in DECISOES:
        raise ValueError("Decisão desconhecida.")
    comentario = comentario.strip()[:LETRAS_DO_TEXTO]
    nome = _uma_linha(nome, LETRAS_DO_NOME)
    if not nome:
        raise ValueError("Diga o seu nome.")
    if decisao == AJUSTES and not comentario and not aprovacao.get("anotacoes"):
        raise ValueError("Escreva o que precisa mudar no vídeo, ou deixe anotações nos instantes.")
    return {**aprovacao, "status": decisao, "respondido_por": nome,
            "comentario": comentario or None, "respondido_em": momento or datetime.now(TZ)}
