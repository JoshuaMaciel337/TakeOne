# -----------------------------------------------
# TakeOne — a conta da cor em numpy, para a LUT 3D inteira de uma vez (onda 16.5)
#
# As mesmas contas de core/utils/cor.py (aplicar_cor, aplicar_hsl, aplicar_curvas) e de core/utils/lut.py
# (aplicar_lut), sobre um vetor de cores em vez de uma cor por vez: a LUT de 33 pontos de uma foto sai em
# milissegundos em vez de segundos (o álbum desenha centenas de fotos, cada uma com a sua cor). As de um pixel
# continuam a referência: tests/test_cor_vetorial.py confere as duas em cores e ajustes sorteados.
# -----------------------------------------------
import numpy as np

from core.utils.cor import (
    CURVA_NEUTRA,
    FAIXAS_DE_MATIZ,
    FORCA_BRANCOS_PRETOS,
    FORCA_LUMINANCIA,
    FORCA_REALCES_SOMBRAS,
    FORCA_RODAS,
    FORCA_TEMPERATURA,
    FORCA_TOM,
    GIRO_MAXIMO,
    NEVOA_CINZA,
    NEVOA_MISTURA,
    NEVOA_PRETO,
    NEVOA_SATURACAO,
    PONTOS_LUT,
    RODAS,
    _tangentes,
    curvas_neutras,
    hsl_neutro,
    vetor_da_roda,
)
from core.utils.lut import LutImportada

LUMA = np.array([0.2126, 0.7152, 0.0722])


def _linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0.04045) + 0.055) / 1.055) ** 2.4)


def _tela(c: np.ndarray) -> np.ndarray:
    v = np.clip(c, 0, 1)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.maximum(v, 0.0031308) ** (1 / 2.4) - 0.055)


def aplicar_cor(rgb: np.ndarray, a: dict) -> np.ndarray:
    """core/utils/cor.aplicar_cor para N cores (N×3, de 0 a 1)."""
    preto = a.get("niveis_preto", 0)
    branco = 1 - a.get("niveis_branco", 0)
    expoente = 1 / 2 ** a.get("niveis_gama", 0)
    rgb = np.clip((rgb - preto) / (branco - preto), 0, 1) ** expoente
    nevoa = a.get("nevoa", 0)
    if nevoa > 0:
        k = NEVOA_PRETO * nevoa
        rgb = np.clip((rgb - k) / (1 - k), 0, 1)
    elif nevoa < 0:
        m = NEVOA_MISTURA * -nevoa
        rgb = rgb * (1 - m) + NEVOA_CINZA * m

    ganho = 2 ** a["exposicao"]
    fatores = np.array([1 + FORCA_TEMPERATURA * a["temperatura"], 1 - FORCA_TOM * a["tom"],
                        1 - FORCA_TEMPERATURA * a["temperatura"]])
    c = _tela(_linear(rgb) * ganho * fatores)
    c = np.clip((c - 0.5) * (1 + a["contraste"]) + 0.5, 0, 1)

    y = (c @ LUMA)[:, None]
    soma = FORCA_REALCES_SOMBRAS * (a["realces"] * y * y + a["sombras"] * (1 - y) * (1 - y))
    soma = soma + FORCA_BRANCOS_PRETOS * (a.get("brancos", 0) * y ** 4 + a.get("pretos", 0) * (1 - y) ** 4)
    c = np.clip(c + soma, 0, 1)

    yr = (c @ LUMA)[:, None]
    pesos = ((1 - yr) * (1 - yr), 2 * yr * (1 - yr), yr * yr)
    deslocamento = sum(peso * (np.array(vetor_da_roda(a[matiz])) * a[forca] * FORCA_RODAS)
                       for peso, (matiz, forca) in zip(pesos, RODAS, strict=True))
    c = np.clip(c + deslocamento, 0, 1)

    y2 = (c @ LUMA)[:, None]
    croma = (c.max(1) - c.min(1))[:, None]
    fator = 1 + a["saturacao"] + a.get("vibracao", 0) * (1 - croma) + NEVOA_SATURACAO * max(a.get("nevoa", 0), 0)
    return np.clip(y2 + (c - y2) * fator, 0, 1)


def _para_hsl(rgb: np.ndarray):
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    maior, menor = rgb.max(1), rgb.min(1)
    luz = (maior + menor) / 2
    d = maior - menor
    cinza = d < 1e-12
    dd = np.where(cinza, 1, d)
    s = np.where(cinza, 0.0, d / np.where(cinza, 1, 1 - np.abs(2 * luz - 1)))
    h = np.where(maior == r, 60 * np.mod((g - b) / dd, 6),
                 np.where(maior == g, 60 * ((b - r) / dd + 2), 60 * ((r - g) / dd + 4)))
    return np.where(cinza, 0.0, h), s, luz


def _de_hsl(h: np.ndarray, s: np.ndarray, luz: np.ndarray) -> np.ndarray:
    c = (1 - np.abs(2 * luz - 1)) * s
    hh = np.mod(h, 360) / 60
    x = c * (1 - np.abs(np.mod(hh, 2) - 1))
    setor = np.floor(hh).astype(int) % 6
    zero = np.zeros_like(c)
    r = np.choose(setor, [c, x, zero, zero, x, c])
    g = np.choose(setor, [x, c, c, x, zero, zero])
    b = np.choose(setor, [zero, zero, x, c, c, x])
    m = luz - c / 2
    return np.stack([r + m, g + m, b + m], axis=1)


_CENTROS = np.array([centro for _, centro in FAIXAS_DE_MATIZ] + [360.0])


def aplicar_hsl(rgb: np.ndarray, hsl: dict | None) -> np.ndarray:
    """core/utils/cor.aplicar_hsl para N cores."""
    if hsl_neutro(hsl):
        return rgb
    h, s, luz = _para_hsl(rgb)
    croma = rgb.max(1) - rgb.min(1)
    hm = np.mod(h, 360)
    i = np.clip(np.searchsorted(_CENTROS, hm, side="right") - 1, 0, len(FAIXAS_DE_MATIZ) - 1)
    t = (hm - _CENTROS[i]) / (_CENTROS[i + 1] - _CENTROS[i])
    valores = {campo: np.array([(hsl.get(nome) or {}).get(campo, 0) for nome, _ in FAIXAS_DE_MATIZ], float)
               for campo in ("matiz", "saturacao", "luminancia")}
    proximo = (i + 1) % len(FAIXAS_DE_MATIZ)
    mistura = {campo: v[i] * (1 - t) + v[proximo] * t for campo, v in valores.items()}
    s = np.clip(s * (1 + mistura["saturacao"]), 0, 1)
    luz = np.clip(luz + FORCA_LUMINANCIA * mistura["luminancia"] * croma, 0, 1)
    return np.clip(_de_hsl(h + GIRO_MAXIMO * mistura["matiz"], s, luz), 0, 1)


def valor_da_curva(pontos: list[list[float]], x: np.ndarray) -> np.ndarray:
    """core/utils/cor.valor_da_curva para N valores."""
    xs, ys = np.array([p[0] for p in pontos], float), np.array([p[1] for p in pontos], float)
    m = np.array(_tangentes(list(xs), list(ys)))
    k = np.clip(np.searchsorted(xs, x, side="right") - 1, 0, len(xs) - 2)
    h = xs[k + 1] - xs[k]
    t = (x - xs[k]) / h
    t2, t3 = t * t, t * t * t
    valor = ((2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1]
             + (t3 - t2) * h * m[k + 1])
    valor = np.where(x <= xs[0], ys[0], np.where(x >= xs[-1], ys[-1], valor))
    return np.clip(valor, 0, 1)


def aplicar_curvas(rgb: np.ndarray, curvas: dict | None) -> np.ndarray:
    if curvas_neutras(curvas):
        return rgb
    geral = curvas.get("rgb", CURVA_NEUTRA)
    return np.stack([valor_da_curva(curvas.get(canal, CURVA_NEUTRA), valor_da_curva(geral, rgb[:, k]))
                     for k, canal in enumerate(("r", "g", "b"))], axis=1)


def ler_lut(lut: LutImportada, rgb: np.ndarray) -> np.ndarray:
    """core/utils/lut.ler_lut (a leitura tetraédrica do lut3d) para N cores."""
    n = lut.tamanho
    minimo, maximo = np.array(lut.minimo), np.array(lut.maximo)
    s = np.clip((rgb - minimo) / (maximo - minimo), 0, 1) * (n - 1)
    p = np.minimum(s.astype(int), n - 2)
    d = s - p
    dados = np.asarray(lut.dados, float).reshape(n, n, n, 3)
    x0, y0, z0 = p[:, 0], p[:, 1], p[:, 2]
    dr, dg, db = d[:, 0:1], d[:, 1:2], d[:, 2:3]

    def c(dx, dy, dz):
        return dados[z0 + dz, y0 + dy, x0 + dx]

    c000, c111 = c(0, 0, 0), c(1, 1, 1)
    rg, gb, rb = dr > dg, dg > db, dr > db
    bg, br = db > dg, db > dr
    saida = np.where(rg & gb, (1 - dr) * c000 + (dr - dg) * c(1, 0, 0) + (dg - db) * c(1, 1, 0) + db * c111,
            np.where(rg & rb, (1 - dr) * c000 + (dr - db) * c(1, 0, 0) + (db - dg) * c(1, 0, 1) + dg * c111,
            np.where(rg, (1 - db) * c000 + (db - dr) * c(0, 0, 1) + (dr - dg) * c(1, 0, 1) + dg * c111,
            np.where(bg, (1 - db) * c000 + (db - dg) * c(0, 0, 1) + (dg - dr) * c(0, 1, 1) + dr * c111,
            np.where(br, (1 - dg) * c000 + (dg - db) * c(0, 1, 0) + (db - dr) * c(0, 1, 1) + dr * c111,
                     (1 - dg) * c000 + (dg - dr) * c(0, 1, 0) + (dr - db) * c(1, 1, 0) + db * c111)))))
    return saida


def aplicar_lut(rgb: np.ndarray, lut: LutImportada, intensidade: float) -> np.ndarray:
    return np.clip(rgb + (ler_lut(lut, rgb) - rgb) * intensidade, 0, 1)


def grade_da_cor(ajustes: dict, pontos: int = PONTOS_LUT) -> np.ndarray:
    """A LUT 3D dos ajustes, [azul][verde][vermelho][canal], como gerar_cube (core/utils/cor.py) ponto a ponto."""
    eixo = np.arange(pontos) / (pontos - 1)
    b, g, r = np.meshgrid(eixo, eixo, eixo, indexing="ij")
    rgb = np.stack([r.ravel(), g.ravel(), b.ravel()], axis=1)
    importada = ajustes.get("lut")
    if importada:
        rgb = aplicar_lut(rgb, importada["dados"], importada["intensidade"])
    rgb = aplicar_curvas(aplicar_hsl(aplicar_cor(rgb, ajustes), ajustes.get("hsl")), ajustes.get("curvas"))
    return rgb.reshape(pontos, pontos, pontos, 3).astype(np.float32)
