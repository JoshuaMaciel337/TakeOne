# -----------------------------------------------
# TakeOne — onde a imagem de cada clipe fica no quadro
#
# Espelha apps/web/src/lib/projeto/geometria.ts: a prévia no navegador e o render fazem a mesma
# conta, conferida pelos mesmos casos em tests/casos/geometria.json.
#
# A mídia recortada entra inteira no quadro, do maior tamanho que cabe e centralizada. Depois a
# transformação aumenta ou diminui a partir do centro, gira e desloca.
# -----------------------------------------------
from dataclasses import dataclass


@dataclass(frozen=True)
class Caixa:
    """Retângulo girado em volta do próprio centro, em pixels do quadro."""
    cx: float
    cy: float
    largura: float
    altura: float
    rotacao: float   # graus, sentido horário
    opacidade: float


def caixa_do_clipe(transformacao: dict, recorte: dict, midia: tuple[float, float],
                   quadro: tuple[float, float]) -> Caixa:
    """midia e quadro: (largura, altura) em pixels."""
    largura = midia[0] * recorte["largura"]
    altura = midia[1] * recorte["altura"]
    encaixe = min(quadro[0] / largura, quadro[1] / altura) * transformacao["escala"]
    return Caixa(
        cx=quadro[0] / 2 + transformacao["x"] * quadro[0],
        cy=quadro[1] / 2 + transformacao["y"] * quadro[1],
        largura=largura * encaixe,
        altura=altura * encaixe,
        rotacao=transformacao["rotacao"],
        opacidade=transformacao["opacidade"],
    )
