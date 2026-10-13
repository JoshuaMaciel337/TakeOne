# -----------------------------------------------
# TakeOne — exportação (o vídeo final de um projeto)
#
# Ao pedir a exportação, o projeto é copiado para dentro dela: o render usa essa cópia, então
# continuar editando enquanto o vídeo é gerado não muda o que sai. Funções puras, sem banco.
#
# O link para o celular (QR code) segue o do HolyCut: um token aleatório que vale 24 horas e só
# baixa aquele vídeo. O banco guarda só o hash do token.
# -----------------------------------------------
import hashlib
import re
import secrets
import unicodedata
from datetime import datetime, timedelta

from core.config import TZ

STATUS_PROCESSANDO = "processando"
STATUS_PRONTA = "pronta"
STATUS_ERRO = "erro"
PRIORIDADE_RENDER = 3   # depois da ingestão (5), que deixa a mídia pronta para editar

ARQUIVO_VIDEO = "video.mp4"
ARQUIVOS_PUBLICOS = {ARQUIVO_VIDEO}

# Nome → lado menor do vídeo, em pixels
RESOLUCOES = {"720p": 720, "1080p": 1080, "4k": 2160}
RESOLUCAO_PADRAO = "1080p"

HORAS_LINK_CELULAR = 24


def pasta_da_exportacao(organizacao_id, exportacao_id) -> str:
    return f"org_{organizacao_id}/exportacoes/{exportacao_id}"


def chave_exportacao(organizacao_id, exportacao_id, nome: str) -> str:
    return f"{pasta_da_exportacao(organizacao_id, exportacao_id)}/{nome}"


def _par(valor: float) -> int:
    """O H.264 com yuv420p exige largura e altura pares."""
    return max(2, int(round(valor / 2)) * 2)


def tamanho_de_saida(proporcao: str, resolucao: str) -> tuple[int, int]:
    """(largura, altura) do vídeo: a resolução é o lado menor. '9:16' em 1080p → (1080, 1920)."""
    lado_menor = RESOLUCOES[resolucao]
    largura_prop, altura_prop = (int(parte) for parte in proporcao.split(":"))
    if largura_prop >= altura_prop:
        return _par(lado_menor * largura_prop / altura_prop), lado_menor
    return lado_menor, _par(lado_menor * altura_prop / largura_prop)


def montar_exportacao(organizacao_id, usuario_id, projeto: dict, resolucao: str,
                      momento: datetime | None = None) -> dict:
    momento = momento or datetime.now(TZ)
    largura, altura = tamanho_de_saida(projeto["proporcao"], resolucao)
    return {
        "organizacao_id": organizacao_id,
        "criado_por": usuario_id,
        "projeto_id": projeto["_id"],
        "nome": projeto["nome"],
        "resolucao": resolucao,
        "largura": largura,
        "altura": altura,
        "status": STATUS_PROCESSANDO,
        "projeto": {campo: projeto[campo] for campo in ("proporcao", "taxa", "fundo", "faixas", "duracao", "versao")},
        "job_id": None,
        "arquivos": [],
        "tamanho": None,
        "erro": None,
        "link_celular": None,
        "criado_em": momento,
        "atualizado_em": momento,
        "concluido_em": None,
    }


def nome_de_arquivo(nome: str, extensao: str = ".mp4") -> str:
    """'Reels · Lançamento!' → 'reels-lancamento.mp4'."""
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")[:60].strip("-")
    return f"{base or 'takeone'}{extensao}"


def hash_do_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def montar_link_celular(momento: datetime | None = None) -> tuple[str, dict]:
    """(token que vai no QR code, registro que fica na exportação). Gerar outro invalida o anterior."""
    momento = momento or datetime.now(TZ)
    token = secrets.token_urlsafe(32)
    return token, {"token_hash": hash_do_token(token), "criado_em": momento,
                   "expira_em": momento + timedelta(hours=HORAS_LINK_CELULAR)}


def link_vencido(link: dict | None, momento: datetime | None = None) -> bool:
    """O cliente do Mongo devolve as datas com fuso (tz_aware), então a comparação é direta."""
    return not link or (momento or datetime.now(TZ)) >= link["expira_em"]
