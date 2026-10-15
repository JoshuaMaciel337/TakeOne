# -----------------------------------------------
# TakeOne — som dos clipes: formato dos fades
#
# Espelha apps/web/src/lib/projeto/som.ts. Os formatos são as curvas do `afade` do FFmpeg, com a
# mesma fórmula do af_afade.c, para a prévia (ganho do Web Audio a cada quadro) tocar igual ao
# render. Os casos de tests/casos/fades.json conferem as três pontas: a fórmula aqui, o FFmpeg e o TS.
# -----------------------------------------------
import math

from core.utils.keyframes import valor_no_tempo
from core.utils.tempo import TICKS_POR_SEGUNDO

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


# -----------------------------------------------
# Abaixar na fala (apps/web/src/lib/projeto/abaixar.ts): a curva de volume gravada no clipe
# -----------------------------------------------
# A curva muda o volume a cada 10 ms; a prévia muda o ganho a cada quadro da tela (16 ms)
PASSO_DA_CURVA = 0.01


def comandos_de_volume(pontos: list[dict], duracao: float, alvo: str) -> str:
    """
    O roteiro do asendcmd com o fator da curva (pontos em ticks desde o começo do clipe) a cada
    PASSO_DA_CURVA, só quando ele muda. Tempos em segundos desde o começo do clipe.
    """
    linhas, anterior = [], None
    for n in range(int(duracao / PASSO_DA_CURVA) + 1):
        local = n * PASSO_DA_CURVA
        valor = max(0.0, valor_no_tempo(pontos, local * TICKS_POR_SEGUNDO))
        if anterior is None or abs(valor - anterior) > 1e-4:
            linhas.append(f"{local:.2f} {alvo} volume {valor:.6f};")
            anterior = valor
    return "\n".join(linhas) + "\n"
