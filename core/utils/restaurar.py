# -----------------------------------------------
# TakeOne — restaurar foto (OpenCV, só no worker de CPU)
# Os riscos e as manchas de uma foto velha são traços finos muito mais claros ou mais escuros que a volta: o top-hat
# branco e o preto (abrir e fechar com um disco pequeno) acham o que some com eles, e o que passa do limiar vira a
# máscara que o inpaint de Telea refaz pela volta (traço fino, sem precisar de modelo). Depois, o ruído sai pelo
# Non-local Means e o contraste volta pelo CLAHE na luz. A força escala os três passos.
# -----------------------------------------------
import numpy as np
from PIL import Image

# Riscos com mais que 2% da foto não são riscos (uma textura, uma foto clara): a máscara fica vazia
FRACAO_MAXIMA_DOS_RISCOS = 0.02


def mascara_dos_riscos(cinza: np.ndarray, forca: float) -> np.ndarray:
    """Os traços finos claros e escuros (0 ou 255), engordados 1 px."""
    import cv2

    lado = max(3, round(min(cinza.shape) / 300) * 2 + 1)
    disco = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (lado, lado))
    claros = cv2.morphologyEx(cinza, cv2.MORPH_TOPHAT, disco)
    escuros = cv2.morphologyEx(cinza, cv2.MORPH_BLACKHAT, disco)
    limiar = 60 - 30 * forca
    mascara = ((claros > limiar) | (escuros > limiar)).astype(np.uint8) * 255
    if mascara.mean() / 255 > FRACAO_MAXIMA_DOS_RISCOS:
        return np.zeros_like(mascara)
    return cv2.dilate(mascara, np.ones((3, 3), np.uint8))


def restaurar(foto: Image.Image, forca: float = 0.6) -> Image.Image:
    import cv2

    rgba = np.asarray(foto.convert("RGBA"))
    bgr = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
    cinza = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mascara = mascara_dos_riscos(cinza, forca)
    if mascara.any():
        bgr = cv2.inpaint(bgr, mascara, 3, cv2.INPAINT_TELEA)
    h = 3 + 9 * forca
    bgr = cv2.fastNlMeansDenoisingColored(bgr, None, h, h, 7, 21)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=1.2 + 1.8 * forca, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    rgb = cv2.cvtColor(cv2.cvtColor(lab, cv2.COLOR_LAB2BGR), cv2.COLOR_BGR2RGB)
    resultado = Image.fromarray(rgb, "RGB")
    resultado.putalpha(Image.fromarray(rgba[:, :, 3], "L"))
    return resultado
