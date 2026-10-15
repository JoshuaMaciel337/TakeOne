# -----------------------------------------------
# TakeOne — efeitos de vídeo do clipe
#
# Espelha apps/web/src/lib/projeto/efeitos.ts: os mesmos números para a prévia (compositor) e o
# render. Um efeito por clipe, com intensidade de 0 a 1.
#   - desfoque: o mesmo desfoque gaussiano das transições (sigma em frações da altura do clipe);
#   - brilho: o clipe desfocado somado a ele mesmo em "tela" (a luz se espalha em volta dos claros);
#   - distorção: lente de olho de peixe (lenscorrection do FFmpeg) com zoom para não sobrar canto vazio.
# -----------------------------------------------
TIPOS = ("desfoque", "brilho", "distorcao")
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
