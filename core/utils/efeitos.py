# -----------------------------------------------
# TakeOne — efeitos de vídeo do clipe
#
# Espelha apps/web/src/lib/projeto/efeitos.ts: os mesmos números para a prévia (compositor) e o
# render. Um efeito por clipe, com intensidade de 0 a 1.
#   - desfoque: o mesmo desfoque gaussiano das transições (sigma em frações da altura do clipe);
#   - brilho: o clipe desfocado somado a ele mesmo em "tela" (a luz se espalha em volta dos claros);
#   - distorção: lente de olho de peixe (lenscorrection do FFmpeg) com zoom para não sobrar canto vazio;
#   - nitidez: o clipe mais a diferença entre ele e uma cópia pouco desfocada (máscara de nitidez);
#   - VHS, glitch, luz e granulação: veja abaixo.
# -----------------------------------------------
import numpy as np
from PIL import Image

TIPOS = ("desfoque", "brilho", "distorcao", "vhs", "glitch", "luz", "granulacao", "nitidez")
# Com intensidade 1
DESFOQUE_MAXIMO = 0.025
BRILHO_SIGMA = 0.02
DISTORCAO_MAXIMA = 0.5
# Nitidez: o sigma da cópia desfocada (frações da altura do clipe) e quanto da diferença soma, com intensidade 1
NITIDEZ_SIGMA = 0.0025
NITIDEZ_MAXIMA = 1.5


def efeito_do_clipe(clipe: dict) -> dict | None:
    efeito = clipe.get("efeito")
    if not efeito or efeito.get("tipo") not in TIPOS or (efeito.get("intensidade") or 0) <= 0:
        return None
    return efeito


def desfoque_do_efeito(clipe: dict) -> float:
    """Sigma do desfoque do efeito, em frações da altura do clipe (0 sem ele)."""
    efeito = efeito_do_clipe(clipe)
    return DESFOQUE_MAXIMO * efeito["intensidade"] if efeito and efeito["tipo"] == "desfoque" else 0.0


def brilho_do_efeito(clipe: dict) -> float:
    """Quanto da luz desfocada soma ao clipe (0 sem brilho)."""
    efeito = efeito_do_clipe(clipe)
    return efeito["intensidade"] if efeito and efeito["tipo"] == "brilho" else 0.0


def nitidez_do_efeito(clipe: dict) -> float:
    """Quanto da diferença entre o clipe e a cópia desfocada soma a ele (0 sem nitidez)."""
    efeito = efeito_do_clipe(clipe)
    return NITIDEZ_MAXIMA * efeito["intensidade"] if efeito and efeito["tipo"] == "nitidez" else 0.0


def distorcao_do_efeito(clipe: dict) -> float:
    """O k1 da lente (0 sem distorção)."""
    efeito = efeito_do_clipe(clipe)
    return DISTORCAO_MAXIMA * efeito["intensidade"] if efeito and efeito["tipo"] == "distorcao" else 0.0


# -----------------------------------------------
# VHS e glitch: as cores separadas (vermelho para um lado, azul para o outro), as linhas do VHS e,
# no glitch, saltos de alguns quadros. O sorteio é um hash de inteiros: o mesmo no Python e no TS.
# -----------------------------------------------
VHS_DESVIO = 0.004       # frações da largura do clipe
VHS_LINHAS = 0.18        # quanto as linhas escuras escurecem
LINHAS_POR_ALTURA = 270
GLITCH_DESVIO = 0.04
GLITCH_QUADROS = 3       # o glitch muda de 3 em 3 quadros
GLITCH_CHANCE = 0.35     # chance de um bloco ter glitch, com intensidade 1


def hash32(n: int) -> int:
    """Hash de inteiros (lowbias32): espalha os bits de n; o mesmo resultado em qualquer linguagem."""
    x = n & 0xFFFFFFFF
    x ^= x >> 16
    x = (x * 0x7FEB352D) & 0xFFFFFFFF
    x ^= x >> 15
    x = (x * 0x846CA68B) & 0xFFFFFFFF
    x ^= x >> 16
    return x


def sorteio(n: int) -> float:
    """Um número de 0 a 1 sorteado pelo inteiro n."""
    return hash32(n) / 2 ** 32


def desvio_de_cor(clipe: dict, quadro: int) -> float:
    """
    Quanto o vermelho anda para a direita (e o azul para a esquerda), em frações da largura do clipe,
    no quadro `quadro` desde o começo dele.
    """
    efeito = efeito_do_clipe(clipe)
    if not efeito or efeito["tipo"] not in ("vhs", "glitch"):
        return 0.0
    intensidade = efeito["intensidade"]
    if efeito["tipo"] == "vhs":
        return VHS_DESVIO * intensidade
    bloco = quadro // GLITCH_QUADROS
    if sorteio(bloco) >= GLITCH_CHANCE * intensidade:
        return 0.0
    return (sorteio(bloco * 7 + 1) * 2 - 1) * GLITCH_DESVIO * intensidade


def linhas_do_efeito(clipe: dict) -> float:
    """Quanto as linhas escuras do VHS escurecem (0 sem linhas)."""
    efeito = efeito_do_clipe(clipe)
    return VHS_LINHAS * efeito["intensidade"] if efeito and efeito["tipo"] == "vhs" else 0.0


def ajustes_do_efeito(clipe: dict) -> dict:
    """O que o efeito soma aos ajustes de cor (o VHS desbota, perde contraste e esquenta)."""
    efeito = efeito_do_clipe(clipe)
    if not efeito or efeito["tipo"] != "vhs":
        return {}
    i = efeito["intensidade"]
    return {"saturacao": -0.35 * i, "contraste": -0.12 * i, "temperatura": 0.12 * i}


# -----------------------------------------------
# Luz e granulação (só em clipes de mídia: com transparência, a mistura não fecharia)
#   - luz: uma faixa de luz quente que atravessa o clipe da esquerda para a direita a cada 4 s,
#     somada em "tela". No render, uma tira 3 vezes mais larga que o clipe, recortada por quadro;
#   - granulação: um grão cinza por célula (540 linhas de células na altura do clipe), sorteado numa
#     imagem fixa de 2048 × 1080 células e recortado num lugar sorteado a cada quadro (grainmerge).
# -----------------------------------------------
LUZ_PERIODO = 4.0
LUZ_LARGURA = 0.25
LUZ_COR = (1.0, 0.55, 0.2)
LUZ_FORCA = 0.8
GRAO_LINHAS = 540
GRAO_FORCA = 0.25
GRAO_TEXTURA = (2048, 1080)
SO_EM_MIDIA = ("luz", "granulacao")


def posicao_da_luz(segundos_no_clipe: float) -> float:
    """O centro da faixa de luz, em frações da largura do clipe (de -0,3 a 1,3)."""
    return -0.3 + 1.6 * ((segundos_no_clipe / LUZ_PERIODO) % 1)


def luz_do_efeito(clipe: dict) -> float:
    efeito = efeito_do_clipe(clipe)
    if not efeito or efeito["tipo"] != "luz" or clipe.get("texto"):
        return 0.0
    return LUZ_FORCA * efeito["intensidade"]


def tira_de_luz(largura: int, altura: int, forca: float):
    """A luz em função da distância ao centro da faixa, numa tira 3 vezes mais larga que o clipe."""
    s = (np.arange(3 * largura) + 0.5) / largura - 1.5
    luz = forca * np.exp(-(s * s) / (2 * LUZ_LARGURA * LUZ_LARGURA))
    rgba = np.zeros((altura, 3 * largura, 4), dtype=np.uint8)
    for canal, cor in enumerate(LUZ_COR):
        rgba[..., canal] = np.round(255 * luz * cor).astype(np.uint8)[None, :]
    # Alfa zero: a "tela" no alfa não muda o do clipe
    return Image.fromarray(rgba, mode="RGBA")


def grao_do_efeito(clipe: dict) -> float:
    efeito = efeito_do_clipe(clipe)
    if not efeito or efeito["tipo"] != "granulacao" or clipe.get("texto"):
        return 0.0
    return GRAO_FORCA * efeito["intensidade"]


def colunas_do_grao(largura: float, altura: float) -> int:
    """Quantas células de grão na largura do clipe (as linhas são sempre GRAO_LINHAS)."""
    return max(1, min(round(GRAO_LINHAS * largura / altura), GRAO_TEXTURA[0] // 2))


def deslocamento_do_grao(quadro: int, colunas: int) -> tuple[int, int]:
    """Onde o recorte do grão começa na imagem fixa, sorteado pelo quadro."""
    return (hash32(quadro * 2 + 1) % (GRAO_TEXTURA[0] - colunas),
            hash32(quadro * 2 + 2) % (GRAO_TEXTURA[1] - GRAO_LINHAS))


def valores_do_grao():
    """O sorteio de cada célula da imagem fixa (0 a 1), linha por linha: sorteio(linha × 2048 + coluna)."""
    x = np.arange(GRAO_TEXTURA[0] * GRAO_TEXTURA[1], dtype=np.uint32)
    x ^= x >> 16
    x *= np.uint32(0x7FEB352D)
    x ^= x >> 15
    x *= np.uint32(0x846CA68B)
    x ^= x >> 16
    return (x.astype(np.float64) / 2 ** 32).reshape(GRAO_TEXTURA[1], GRAO_TEXTURA[0])


def imagem_do_grao(forca: float):
    """A imagem fixa do grão em cinza: 128 é sem grão (o grainmerge soma o que passa de 128)."""
    cinza = np.clip(np.round(128 + (valores_do_grao() - 0.5) * forca * 255), 0, 255).astype(np.uint8)
    return Image.fromarray(cinza, mode="L")
