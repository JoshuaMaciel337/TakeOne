# -----------------------------------------------
# TakeOne — cantos arredondados e borda do clipe
#
# Espelha o shader do compositor da prévia (apps/web/src/lib/previa/compositor.ts, cobertura): a distância
# de cada centro de pixel até o retângulo arredondado, com 1 pixel de borda suave. O clipe fica com o alfa
# multiplicado pela parte de dentro, e a borda (o anel entre a parte de fora e a de dentro) vai por cima
# na cor dela. O raio e a espessura são frações do lado menor do clipe, então valem em qualquer resolução.
#
# A máscara de forma (retângulo ou elipse, com suavidade e invertida ou não) entra na mesma imagem: a parte de
# dentro e o anel são multiplicados por ela. O centro e o tamanho são frações do clipe; a suavidade, do lado menor.
# -----------------------------------------------
import numpy as np
from PIL import Image

RAIO_MAXIMO = 0.5
BORDA_MAXIMA = 0.25


def _cobertura(px: np.ndarray, py: np.ndarray, meia_l: float, meia_a: float, raio: float) -> np.ndarray:
    """Quanto de cada pixel (centro em px, py, a partir do meio) cai dentro do retângulo arredondado."""
    if meia_l <= 0 or meia_a <= 0:
        return np.zeros(np.broadcast(px, py).shape)
    raio = min(raio, meia_l, meia_a)
    qx = np.abs(px) - (meia_l - raio)
    qy = np.abs(py) - (meia_a - raio)
    fora = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
    dentro = np.minimum(np.maximum(qx, qy), 0)
    return np.clip(0.5 - (fora + dentro - raio), 0, 1)


def cobertura_da_mascara(largura: int, altura: int, mascara: dict | None) -> np.ndarray | float:
    """
    Quanto de cada pixel a máscara de forma deixa aparecer (1 sem máscara). A distância até a borda da forma, em
    pixels, vira a cobertura pela suavidade (com 1 pixel de borda suave quando ela é zero), como o shader.
    """
    if not mascara or mascara.get("forma") not in ("retangulo", "elipse"):
        return 1.0
    px = (np.arange(largura) + 0.5)[None, :] - mascara["x"] * largura
    py = (np.arange(altura) + 0.5)[:, None] - mascara["y"] * altura
    meia_l = max(mascara["largura"] * largura / 2, 1e-6)
    meia_a = max(mascara["altura"] * altura / 2, 1e-6)
    if mascara["forma"] == "retangulo":
        qx, qy = np.abs(px) - meia_l, np.abs(py) - meia_a
        distancia = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0)
    else:
        distancia = (np.hypot(px / meia_l, py / meia_a) - 1) * min(meia_l, meia_a)
    suave = max(mascara.get("suavidade", 0) * min(largura, altura), 1.0)
    cobertura = np.clip(0.5 - distancia / suave, 0, 1)
    return 1 - cobertura if mascara.get("inverter") else cobertura


def coberturas(largura: int, altura: int, cantos: dict) -> tuple[np.ndarray, np.ndarray]:
    """(dentro, anel), de 0 a 1, no tamanho do clipe em pixels, já com a máscara de forma (cantos["mascara"])."""
    lado = min(largura, altura)
    raio = min(cantos.get("raio", 0), RAIO_MAXIMO) * lado
    borda = min(cantos.get("borda", 0), BORDA_MAXIMA) * lado
    px = (np.arange(largura) + 0.5 - largura / 2)[None, :]
    py = (np.arange(altura) + 0.5 - altura / 2)[:, None]
    fora = _cobertura(px, py, largura / 2, altura / 2, raio)
    dentro = _cobertura(px, py, largura / 2 - borda, altura / 2 - borda, max(raio - borda, 0))
    mascara = cobertura_da_mascara(largura, altura, cantos.get("mascara"))
    return dentro * mascara, np.clip(fora - dentro, 0, 1) * mascara


def desenhar_cantos(largura: int, altura: int, cantos: dict) -> tuple[Image.Image, Image.Image | None]:
    """A máscara cinza da parte de dentro e, com borda, o anel RGBA na cor dela (None sem borda)."""
    dentro, anel = coberturas(largura, altura, cantos)
    mascara = Image.fromarray(np.round(255 * dentro).astype(np.uint8), mode="L")
    if not cantos.get("borda"):
        return mascara, None
    cor = cantos.get("cor", "#ffffff").lstrip("#")
    rgba = np.zeros((altura, largura, 4), dtype=np.uint8)
    rgba[..., :3] = [int(cor[i:i + 2], 16) for i in (0, 2, 4)]
    rgba[..., 3] = np.round(255 * anel).astype(np.uint8)
    return mascara, Image.fromarray(rgba, mode="RGBA")


def tem_mascara(clipe: dict) -> bool:
    return (clipe.get("mascara") or {}).get("forma") in ("retangulo", "elipse")


def tem_cantos(clipe: dict) -> bool:
    """Cantos, borda ou máscara de forma: as três saem da mesma imagem."""
    cantos = clipe.get("cantos") or {}
    return cantos.get("raio", 0) > 0 or cantos.get("borda", 0) > 0 or tem_mascara(clipe)
