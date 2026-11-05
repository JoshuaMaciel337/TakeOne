# -----------------------------------------------
# TakeOne — a troca do fundo das fotos do álbum, em lote (onda 16.9, docs/decisoes/0006-album-de-fotos.md)
#
# A pessoa (a máscara do MODNet, de 0 a 1) fica; o resto vira uma cor lisa, um degradê da cor, a própria foto
# desfocada ou outra foto (cobrindo o quadro). A sombra é a silhueta da pessoa desfocada e deslocada na direção
# pedida, escurecendo só o fundo novo, como a sombra de quem está um pouco à frente de uma parede. Puro numpy/OpenCV.
# -----------------------------------------------
import math

import numpy as np


def _cor(hexa: str) -> np.ndarray:
    hexa = hexa.lstrip("#")
    return np.array([int(hexa[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def cobrir(imagem: np.ndarray, largura: int, altura: int) -> np.ndarray:
    """A imagem cortada no meio e redimensionada até cobrir largura × altura."""
    import cv2

    h, w = imagem.shape[:2]
    escala = max(largura / w, altura / h)
    nova = cv2.resize(imagem, (max(largura, round(w * escala)), max(altura, round(h * escala))),
                      interpolation=cv2.INTER_AREA if escala < 1 else cv2.INTER_CUBIC)
    y, x = (nova.shape[0] - altura) // 2, (nova.shape[1] - largura) // 2
    return nova[y:y + altura, x:x + largura]


def fundo_novo(rgb: np.ndarray, fundo: dict, imagem_do_fundo: np.ndarray | None = None) -> np.ndarray:
    """O fundo (float, 0 a 1, do tamanho da foto): cor, degradê, desfoque da própria foto ou outra foto."""
    import cv2

    h, w = rgb.shape[:2]
    tipo = fundo.get("tipo", "cor")
    if tipo == "desfoque":
        sigma = max(1.0, float(fundo.get("desfoque", 0.5)) * min(h, w) * 0.04)
        return cv2.GaussianBlur(rgb, (0, 0), sigma)
    if tipo == "imagem" and imagem_do_fundo is not None:
        return cobrir(imagem_do_fundo.astype(np.float32) / 255, w, h)
    cor = _cor(fundo.get("cor") or "#f2f2f2")
    if tipo == "degrade":
        # Do centro, um pouco mais claro, para as bordas, um pouco mais escuras (o fundo de estúdio)
        v, u = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.hypot((u / w - 0.5) * 2, (v / h - 0.45) * 2) / math.sqrt(2)
        return np.clip(cor * (1.12 - 0.35 * d[..., None]), 0, 1)
    return np.broadcast_to(cor, (h, w, 3)).copy()


def sombra(pessoa: np.ndarray, opcoes: dict) -> np.ndarray:
    """Quanto a sombra escurece cada ponto (0 a 1): a silhueta desfocada e deslocada, vezes a opacidade."""
    import cv2

    h, w = pessoa.shape
    lado = min(h, w)
    distancia = float(opcoes.get("distancia", 0.03)) * lado
    angulo = math.radians(float(opcoes.get("direcao", 135)))
    dx, dy = distancia * math.cos(angulo), distancia * math.sin(angulo)
    m = np.float32([[1, 0, dx], [0, 1, dy]])
    deslocada = cv2.warpAffine(pessoa, m, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    desfoque = max(0.5, float(opcoes.get("desfoque", 0.04)) * lado)
    return np.clip(cv2.GaussianBlur(deslocada, (0, 0), desfoque) * float(opcoes.get("opacidade", 0.4)), 0, 1)


def trocar_fundo(rgb8: np.ndarray, pessoa: np.ndarray, fundo: dict, imagem_do_fundo: np.ndarray | None = None
                 ) -> np.ndarray:
    """A foto (RGB, uint8) com o fundo trocado e, se pedida, a sombra da pessoa nele."""
    import cv2

    rgb = rgb8.astype(np.float32) / 255
    alfa = np.clip(pessoa.astype(np.float32), 0, 1)
    if alfa.shape != rgb.shape[:2]:
        alfa = cv2.resize(alfa, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)
    novo = fundo_novo(rgb, fundo, imagem_do_fundo)
    if fundo.get("sombra") and fundo.get("tipo") != "desfoque":
        novo = novo * (1 - sombra(alfa, fundo["sombra"]))[..., None]
    saida = rgb * alfa[..., None] + novo * (1 - alfa[..., None])
    return np.clip(saida * 255 + 0.5, 0, 255).astype(np.uint8)
