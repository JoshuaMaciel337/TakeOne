# -----------------------------------------------
# TakeOne — álbum de fotos (onda 16, docs/decisoes/0006-album-de-fotos.md)
#
# Um álbum junta as fotos de um ensaio para escolher as melhores, editar e entregar. As fotos são mídias da
# biblioteca de sempre (a ingestão, a cópia leve, a capa), com `album_id` quando foram enviadas para o álbum: a
# lista da biblioteca deixa essas de fora, para milhares de fotos de um ensaio não encherem o painel Mídia. O que
# é do álbum (a nota, a cor, a marcação, a pasta de origem) fica em `album_fotos`, uma por foto.
# Funções puras: montam e conferem, sem acessar o banco.
# -----------------------------------------------
from datetime import datetime

from core.config import TZ

# O tipo do ensaio muda, mais tarde, o peso de cada critério na escolha das melhores
GENEROS = {
    "casamento": "Casamento",
    "ensaio": "Ensaio e retrato",
    "familia": "Família e crianças",
    "evento": "Evento e festa",
    "esporte": "Esporte",
    "escola": "Escola e formatura",
    "recem_nascido": "Recém-nascido",
    "produto": "Produto",
    "outro": "Outro",
}
CORES = ("vermelho", "amarelo", "verde", "azul", "roxo")
MARCACOES = ("escolhida", "rejeitada")
NOTA_MAXIMA = 5
# Um casamento grande passa de 5 mil fotos; o teto protege o servidor e a grade do navegador
FOTOS_POR_ALBUM = 20_000
LADO_MAXIMO_DO_NOME = 120
LADO_MAXIMO_DA_PASTA = 200


def montar_album(organizacao_id, criado_por, nome: str, genero: str, momento: datetime | None = None) -> dict:
    if genero not in GENEROS:
        raise ValueError(f"Tipo de ensaio desconhecido: {genero}")
    momento = momento or datetime.now(TZ)
    return {
        "organizacao_id": organizacao_id,
        "criado_por": criado_por,
        "nome": nome.strip()[:LADO_MAXIMO_DO_NOME] or "Álbum",
        "genero": genero,
        "criado_em": momento,
        "atualizado_em": momento,
    }


def pasta_do_caminho(caminho: str) -> str:
    """A pasta de uma foto enviada com a pasta inteira ("Casamento/Cerimônia/IMG_01.jpg" → "Casamento/Cerimônia"),
    sem barras invertidas, pontos de subir nem a barra do começo."""
    partes = [p for p in caminho.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    return "/".join(partes[:-1])[:LADO_MAXIMO_DA_PASTA]


def montar_foto(organizacao_id, album_id, midia_id, pasta: str = "", momento: datetime | None = None) -> dict:
    momento = momento or datetime.now(TZ)
    return {
        "organizacao_id": organizacao_id,
        "album_id": album_id,
        "midia_id": midia_id,
        "pasta": pasta[:LADO_MAXIMO_DA_PASTA],
        "nota": 0,
        "cor": None,
        "marcacao": None,
        "criado_em": momento,
        "atualizado_em": momento,
    }


def mudanca_das_fotos(nota: int | None = None, cor: str | None = None, marcacao: str | None = None,
                      tirar_cor: bool = False, tirar_marcacao: bool = False) -> dict:
    """O $set de uma mudança em várias fotos: só o que veio. Tirar a cor ou a marcação é pedir None de propósito."""
    campos: dict = {}
    if nota is not None:
        if not 0 <= nota <= NOTA_MAXIMA:
            raise ValueError("A nota vai de 0 a 5 estrelas.")
        campos["nota"] = nota
    if tirar_cor:
        campos["cor"] = None
    elif cor is not None:
        if cor not in CORES:
            raise ValueError(f"Cor desconhecida: {cor}")
        campos["cor"] = cor
    if tirar_marcacao:
        campos["marcacao"] = None
    elif marcacao is not None:
        if marcacao not in MARCACOES:
            raise ValueError(f"Marcação desconhecida: {marcacao}")
        campos["marcacao"] = marcacao
    return campos
