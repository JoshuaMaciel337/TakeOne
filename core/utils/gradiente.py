# -----------------------------------------------
# TakeOne — degradê de preenchimento (textos e formas)
#
# Espelha apps/web/src/lib/projeto/gradiente.ts (a amostra do painel), conferido pelos casos de
# tests/casos/gradiente.json. O degradê tem de 2 a 5 cores igualmente espaçadas, é linear (no ângulo dado,
# de 0° para a direita e 90° para baixo) ou radial (do centro da caixa para as bordas), e o ponto médio
# empurra o meio do caminho para um lado. As cores se misturam em sRGB, como a amostra. Um pontilhado
# ordenado fixo (Bayer 4 × 4) desfaz as faixas que o H.264 marcaria num degradê suave.
# -----------------------------------------------
import math

import numpy as np
from PIL import Image

DEGRADE_PADRAO = {"tipo": "linear", "cores": ["#ff624a", "#ff3478"], "angulo": 0.0, "meio": 0.5}
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float64)


def _rgb(cor: str) -> tuple[int, int, int]:
    cor = cor.lstrip("#")
    return int(cor[0:2], 16), int(cor[2:4], 16), int(cor[4:6], 16)


def com_meio(u: np.ndarray | float, meio: float) -> np.ndarray | float:
    """O ponto médio: `meio` vai para 0,5 e cada lado estica em linha reta."""
    meio = min(0.95, max(0.05, meio))
    return np.where(np.asarray(u) < meio, 0.5 * np.asarray(u) / meio, 0.5 + 0.5 * (np.asarray(u) - meio) / (1 - meio))


def cor_no_degrade(degrade: dict, t: np.ndarray | float) -> np.ndarray:
    """A cor (0 a 255, em ponto flutuante) em `t` (0 a 1) do caminho, já com o ponto médio."""
    cores = np.array([_rgb(cor) for cor in degrade["cores"]], dtype=np.float64)
    v = np.clip(com_meio(np.clip(t, 0, 1), degrade.get("meio", 0.5)), 0, 1) * (len(cores) - 1)
    i = np.minimum(np.floor(v).astype(int), len(cores) - 2)
    f = (v - i)[..., None]
    return cores[i] * (1 - f) + cores[i + 1] * f


def t_do_degrade(degrade: dict, largura: int, altura: int, caixa: tuple[float, float, float, float]) -> np.ndarray:
    """O `t` (0 a 1) de cada pixel da imagem, pela caixa (x0, y0, x1, y1) que o degradê cobre."""
    x0, y0, x1, y1 = caixa
    xs = np.arange(largura, dtype=np.float64) + 0.5
    ys = np.arange(altura, dtype=np.float64) + 0.5
    x, y = np.meshgrid(xs, ys)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    meia_l, meia_a = max((x1 - x0) / 2, 1e-6), max((y1 - y0) / 2, 1e-6)
    if degrade.get("tipo") == "radial":
        return np.clip(np.hypot((x - cx) / meia_l, (y - cy) / meia_a), 0, 1)
    angulo = math.radians(degrade.get("angulo", 0))
    dx, dy = math.cos(angulo), math.sin(angulo)
    # A projeção na direção do ângulo, de canto a canto da caixa
    alcance = abs(dx) * meia_l + abs(dy) * meia_a
    return np.clip(((x - cx) * dx + (y - cy) * dy) / (2 * alcance) + 0.5, 0, 1)


def imagem_do_degrade(degrade: dict, largura: int, altura: int,
                      caixa: tuple[float, float, float, float]) -> Image.Image:
    """A imagem RGB do degradê, do tamanho dado, com o pontilhado que evita as faixas."""
    cores = cor_no_degrade(degrade, t_do_degrade(degrade, largura, altura, caixa))
    limiar = (BAYER[np.arange(altura)[:, None] % 4, np.arange(largura)[None, :] % 4] + 0.5) / 16
    valores = np.clip(np.floor(cores + limiar[..., None]), 0, 255).astype(np.uint8)
    return Image.fromarray(valores, "RGB")
