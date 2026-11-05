# -----------------------------------------------
# TakeOne — o "Melhorar" em Python (onda 16.7): a conta de apps/web/src/lib/projeto/melhorar.ts, para o estilo
# pessoal treinar e prever no worker. Os casos de tests/casos/melhorar.json saem daqui e o TS confere.
# -----------------------------------------------
import math

import numpy as np

PARTE_DO_BRANCO = 0.6
PARTE_DA_LUZ = 0.7
MEDIANA_ALVO = 0.47
LIMITE_DO_BRANCO = 0.5
LIMITE_DA_EXPOSICAO = 1
SATURACAO_DO_NEUTRO = 0.5
PARTE_MINIMA_DE_NEUTROS = 0.1
TOLERANCIA_DA_EXPOSICAO = 0.5
FORCA_TEMPERATURA = 0.15
FORCA_TOM = 0.1
LUMA = (0.2126, 0.7152, 0.0722)


def _linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _arredondar(valor: float) -> float:
    # Math.round do JavaScript (meio para cima), não o arredondamento bancário do Python
    return math.floor(valor * 100 + 0.5) / 100


def _limitar(valor: float, limite: float) -> float:
    return max(-limite, min(limite, valor))


def _percentil(ordenados: np.ndarray, p: float) -> float:
    i = min(len(ordenados) - 1, max(0, math.floor(p * (len(ordenados) - 1) + 0.5)))
    return float(ordenados[i])


def ajustes_automaticos(rgba: np.ndarray) -> dict:
    """Os ajustes sugeridos para uma amostra RGBA (uint8, ... × 4), como ajustesAutomaticos do editor."""
    pixels = np.asarray(rgba, dtype=np.float64).reshape(-1, 4)
    pixels = pixels[pixels[:, 3] >= 128, :3] / 255
    neutro = {"exposicao": 0, "contraste": 0, "realces": 0, "sombras": 0, "temperatura": 0, "tom": 0, "saturacao": 0}
    if len(pixels) < 16:
        return neutro
    r, g, b = pixels[:, 0], pixels[:, 1], pixels[:, 2]
    y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b
    maior, menor = pixels.max(1), pixels.min(1)
    croma = maior - menor
    neutros = (y > 0.1) & (y < 0.9) & (croma / np.where(maior > 0, maior, 1) < SATURACAO_DO_NEUTRO) & (maior > 0)
    ordenados = np.sort(y)
    mediana = _percentil(ordenados, 0.5)
    baixo = _percentil(ordenados, 0.02)
    alto = _percentil(ordenados, 0.98)

    desvio = math.log2(_linear(MEDIANA_ALVO) / _linear(mediana)) if mediana > 0.01 else 0
    ate_o_branco = max(0, math.log2(_linear(0.98) / _linear(alto))) if alto > 0.01 else LIMITE_DA_EXPOSICAO
    exposicao = 0 if abs(desvio) < TOLERANCIA_DA_EXPOSICAO else min(
        _limitar(PARTE_DA_LUZ * desvio, LIMITE_DA_EXPOSICAO), ate_o_branco)
    faixa = alto - baixo
    contraste = min(0.3, 0.5 * (0.85 / faixa - 1)) if 0.05 < faixa < 0.8 else 0
    realces = -0.25 if _percentil(ordenados, 0.97) > 0.985 else 0
    sombras = 0.2 if baixo < 0.03 and mediana < 0.35 else 0

    temperatura = tom = 0.0
    meios = int(neutros.sum())
    if meios >= 16 and meios >= PARTE_MINIMA_DE_NEUTROS * len(pixels):
        lin = np.vectorize(_linear)
        mr, mg, mb = (float(lin(c[neutros]).sum()) / meios for c in (r, g, b))
        temperatura = _limitar(PARTE_DO_BRANCO * ((mb - mr) / (FORCA_TEMPERATURA * (mb + mr))), LIMITE_DO_BRANCO)
        tom = _limitar(PARTE_DO_BRANCO * ((1 - (mr + mb) / 2 / mg) / FORCA_TOM), LIMITE_DO_BRANCO)
    media_do_croma = float(croma.sum()) / len(pixels)
    saturacao = 0.15 if media_do_croma < 0.12 else 0.08 if media_do_croma < 0.25 else 0
    return {"exposicao": _arredondar(exposicao), "contraste": _arredondar(contraste), "realces": realces,
            "sombras": sombras, "temperatura": _arredondar(temperatura), "tom": _arredondar(tom),
            "saturacao": saturacao}


def amostra(imagem_rgb: np.ndarray, lado: int = 160) -> np.ndarray:
    """A imagem reduzida a `lado` no lado maior (pela área), em RGBA, como a amostra do navegador."""
    import cv2

    h, w = imagem_rgb.shape[:2]
    escala = lado / max(h, w)
    pequena = cv2.resize(imagem_rgb, (max(1, round(w * escala)), max(1, round(h * escala))),
                         interpolation=cv2.INTER_AREA)
    alfa = np.full(pequena.shape[:2] + (1,), 255, np.uint8)
    return np.concatenate([pequena, alfa], axis=2)
