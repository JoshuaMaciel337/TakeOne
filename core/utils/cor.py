# -----------------------------------------------
# TakeOne — ajustes de cor no render
#
# Espelha apps/web/src/lib/projeto/cor.ts (a mesma conta, conferida pelos casos de
# tests/casos/cor.json). O FFmpeg recebe a conta como uma LUT 3D (.cube) no filtro lut3d, e a
# vinheta como uma imagem cinza multiplicada ao clipe (blend multiply): cada pixel vezes (1 - a),
# como o shader da prévia. Multiplicar, e não sobrepor preto, mantém transparente o fundo dos textos.
# -----------------------------------------------
import hashlib
import math

import numpy as np
from PIL import Image

AJUSTES_NEUTROS = {"temperatura": 0, "tom": 0, "exposicao": 0, "contraste": 0, "realces": 0, "sombras": 0,
                   "saturacao": 0, "vinheta": 0, "matiz_escuros": 0, "forca_escuros": 0, "matiz_medios": 0,
                   "forca_medios": 0, "matiz_claros": 0, "forca_claros": 0}
LIMITES = {"temperatura": (-1, 1), "tom": (-1, 1), "exposicao": (-2, 2), "contraste": (-1, 1), "realces": (-1, 1),
           "sombras": (-1, 1), "saturacao": (-1, 1), "vinheta": (0, 1), "matiz_escuros": (0, 360),
           "forca_escuros": (0, 1), "matiz_medios": (0, 360), "forca_medios": (0, 1), "matiz_claros": (0, 360),
           "forca_claros": (0, 1)}
# Rodas de cor: (matiz, força) de escuros, meios-tons e claros. O matiz sozinho não muda nada.
RODAS = (("matiz_escuros", "forca_escuros"), ("matiz_medios", "forca_medios"), ("matiz_claros", "forca_claros"))
MATIZES = {matiz for matiz, _ in RODAS}
FILTROS = {
    "quente": {"temperatura": 0.45, "saturacao": 0.1},
    "frio": {"temperatura": -0.45, "tom": -0.05},
    "vivido": {"saturacao": 0.35, "contraste": 0.15},
    "suave": {"contraste": -0.25, "sombras": 0.25, "saturacao": -0.1},
    "pb": {"saturacao": -1, "contraste": 0.1},
    "noite": {"temperatura": -0.35, "exposicao": -0.4, "contraste": 0.15, "vinheta": 0.4},
    "antigo": {"temperatura": 0.3, "saturacao": -0.35, "contraste": -0.15, "sombras": 0.2, "vinheta": 0.3},
    "drama": {"contraste": 0.35, "saturacao": -0.15, "sombras": -0.2, "realces": -0.2, "vinheta": 0.25},
    "cinema": {"contraste": 0.15, "matiz_escuros": 195, "forca_escuros": 0.5, "matiz_claros": 30, "forca_claros": 0.35,
               "saturacao": -0.05},
}
FORCA_TEMPERATURA = 0.15
FORCA_TOM = 0.1
FORCA_REALCES_SOMBRAS = 0.25
FORCA_RODAS = 0.3
LUMA = (0.2126, 0.7152, 0.0722)
PONTOS_LUT = 33


def _limitar(valor: float, minimo: float = 0.0, maximo: float = 1.0) -> float:
    return min(maximo, max(minimo, valor))


def ajustes_efetivos(cor: dict | None) -> dict:
    """Os ajustes do clipe mais os do filtro vezes a intensidade, dentro dos limites."""
    if not cor:
        return dict(AJUSTES_NEUTROS)
    filtro = FILTROS.get(cor.get("filtro") or "", {})
    intensidade = cor.get("intensidade", 1)
    efetivos = {}
    for chave in AJUSTES_NEUTROS:
        # O matiz do filtro substitui o do clipe (somar ângulos não faz sentido); a força soma
        if chave in MATIZES and chave in filtro:
            valor = filtro[chave]
        else:
            valor = (cor.get(chave) or 0) + filtro.get(chave, 0) * intensidade
        efetivos[chave] = _limitar(valor, *LIMITES[chave])
    return efetivos


def cor_neutra(ajustes: dict) -> bool:
    return all(chave in MATIZES or abs(ajustes[chave]) < 1e-9 for chave in AJUSTES_NEUTROS)


def _linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _tela(c: float) -> float:
    v = _limitar(c)
    return v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


def vetor_da_roda(matiz: float) -> tuple[float, float, float]:
    """A direção de uma roda: a cor pura do matiz menos a luminância dela (não clareia nem escurece)."""
    h = (matiz % 360) / 60
    pura = (_limitar(abs(h - 3) - 1), _limitar(2 - abs(h - 2)), _limitar(2 - abs(h - 4)))
    y = sum(peso * v for peso, v in zip(LUMA, pura, strict=True))
    return pura[0] - y, pura[1] - y, pura[2] - y


def aplicar_cor(rgb: tuple[float, float, float], a: dict) -> tuple[float, float, float]:
    """Cor de um pixel (valores de 0 a 1), sem a vinheta."""
    ganho = 2 ** a["exposicao"]
    r = _tela(_linear(rgb[0]) * ganho * (1 + FORCA_TEMPERATURA * a["temperatura"]))
    g = _tela(_linear(rgb[1]) * ganho * (1 - FORCA_TOM * a["tom"]))
    b = _tela(_linear(rgb[2]) * ganho * (1 - FORCA_TEMPERATURA * a["temperatura"]))

    fator = 1 + a["contraste"]
    c = [_limitar((v - 0.5) * fator + 0.5) for v in (r, g, b)]

    y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    soma = FORCA_REALCES_SOMBRAS * (a["realces"] * y * y + a["sombras"] * (1 - y) * (1 - y))
    c = [_limitar(v + soma) for v in c]

    # Rodas de cor: escuros, meios-tons e claros, pesados pela luminância (os pesos somam 1)
    yr = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    pesos = ((1 - yr) * (1 - yr), 2 * yr * (1 - yr), yr * yr)
    rodas = [[v * a[forca] * FORCA_RODAS for v in vetor_da_roda(a[matiz])] for matiz, forca in RODAS]
    c = [_limitar(c[k] + sum(peso * roda[k] for peso, roda in zip(pesos, rodas, strict=True))) for k in range(3)]

    y2 = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    fator = 1 + a["saturacao"]
    c = [_limitar(y2 + (v - y2) * fator) for v in c]
    return c[0], c[1], c[2]


def gerar_cube(ajustes: dict, pontos: int = PONTOS_LUT) -> str:
    """LUT 3D no formato .cube (o vermelho varia mais rápido, como o formato pede)."""
    linhas = ["# TakeOne: ajustes de cor", f"LUT_3D_SIZE {pontos}"]
    passo = pontos - 1
    for b in range(pontos):
        for g in range(pontos):
            for r in range(pontos):
                saida = aplicar_cor((r / passo, g / passo, b / passo), ajustes)
                linhas.append(" ".join(f"{v:.6f}" for v in saida))
    return "\n".join(linhas) + "\n"


def nome_da_lut(ajustes: dict) -> str:
    """Nome de arquivo estável para os ajustes (clipes com a mesma cor usam a mesma LUT)."""
    chave = ",".join(f"{ajustes[nome]:.6f}" for nome in sorted(AJUSTES_NEUTROS) if nome != "vinheta")
    return f"cor_{hashlib.sha1(chave.encode()).hexdigest()[:12]}.cube"


def _suave(borda0: float, borda1: float, x: float) -> float:
    t = _limitar((x - borda0) / (borda1 - borda0))
    return t * t * (3 - 2 * t)


def escurecimento_da_vinheta(u: float, v: float, vinheta: float) -> float:
    distancia = math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / math.sqrt(2)
    return vinheta * _suave(0.3, 1, distancia)


def desenhar_vinheta(largura: int, altura: int, vinheta: float) -> Image.Image:
    """Cinza (1 - escurecimento), opaco, do tamanho do clipe no quadro (medido no centro de cada pixel)."""
    u = (np.arange(largura) + 0.5) / largura
    v = (np.arange(altura) + 0.5) / altura
    distancia = np.hypot((u[None, :] - 0.5) * 2, (v[:, None] - 0.5) * 2) / math.sqrt(2)
    t = np.clip((distancia - 0.3) / 0.7, 0, 1)
    cinza = np.round(255 * (1 - vinheta * t * t * (3 - 2 * t))).astype(np.uint8)
    rgba = np.full((altura, largura, 4), 255, dtype=np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = cinza
    return Image.fromarray(rgba, mode="RGBA")
