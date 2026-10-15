# -----------------------------------------------
# TakeOne — efeitos de vídeo do clipe
#
# Espelha apps/web/src/lib/projeto/efeitos.ts: os mesmos números para a prévia (compositor) e o
# render. Um efeito por clipe, com intensidade de 0 a 1.
#   - desfoque: o mesmo desfoque gaussiano das transições (sigma em frações da altura do clipe);
#   - brilho: o clipe desfocado somado a ele mesmo em "tela" (a luz se espalha em volta dos claros);
#   - distorção: lente de olho de peixe (lenscorrection do FFmpeg) com zoom para não sobrar canto vazio;
#   - VHS e glitch: veja abaixo.
# -----------------------------------------------
TIPOS = ("desfoque", "brilho", "distorcao", "vhs", "glitch")
# Com intensidade 1
DESFOQUE_MAXIMO = 0.025
BRILHO_SIGMA = 0.02
DISTORCAO_MAXIMA = 0.5


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
