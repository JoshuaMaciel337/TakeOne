# -----------------------------------------------
# TakeOne — som dos clipes: formato dos fades
#
# Espelha apps/web/src/lib/projeto/som.ts. Os formatos são as curvas do `afade` do FFmpeg, com a
# mesma fórmula do af_afade.c, para a prévia (ganho do Web Audio a cada quadro) tocar igual ao
# render. Os casos de tests/casos/fades.json conferem as três pontas: a fórmula aqui, o FFmpeg e o TS.
# -----------------------------------------------
import math

# Nome no projeto → curva do afade
CURVAS_DO_FADE = {"linear": "tri", "suave": "qsin", "s": "hsin", "exponencial": "exp"}
CURVA_PADRAO = "linear"


def ganho_do_fade(curva: str, p: float) -> float:
    """O ganho (0 a 1) quando o fade já andou `p` (0 a 1) do caminho, como o afade calcula."""
    p = min(1.0, max(0.0, p))
    if curva == "suave":
        return math.sin(p * math.pi / 2)
    if curva == "s":
        return (1 - math.cos(p * math.pi)) / 2
    if curva == "exponencial":
        # -100 dB no começo, como o afade: exp(ln(10⁻⁵) · (1 − p))
        return math.exp(-11.512925464970227 * (1 - p))
    return p
