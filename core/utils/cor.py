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
                   "forca_medios": 0, "matiz_claros": 0, "forca_claros": 0, "vibracao": 0, "brancos": 0, "pretos": 0,
                   "niveis_preto": 0, "niveis_branco": 0, "niveis_gama": 0, "nevoa": 0}
LIMITES = {"temperatura": (-1, 1), "tom": (-1, 1), "exposicao": (-2, 2), "contraste": (-1, 1), "realces": (-1, 1),
           "sombras": (-1, 1), "saturacao": (-1, 1), "vinheta": (0, 1), "matiz_escuros": (0, 360),
           "forca_escuros": (0, 1), "matiz_medios": (0, 360), "forca_medios": (0, 1), "matiz_claros": (0, 360),
           "forca_claros": (0, 1), "vibracao": (-1, 1), "brancos": (-1, 1), "pretos": (-1, 1),
           # Níveis: o preto e o branco de entrada (o branco conta de 1 para baixo) e a gama em potência de 2
           "niveis_preto": (0, 0.45), "niveis_branco": (0, 0.45), "niveis_gama": (-1, 1),
           # Névoa: de -1 (põe névoa) a 1 (tira)
           "nevoa": (-1, 1)}
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
# Brancos e pretos: como realces e sombras, mas só nas pontas (a quarta potência da luminância)
FORCA_BRANCOS_PRETOS = 0.25
# Névoa: tirar puxa o preto (até 12%) e satura (até 25%); pôr mistura com um cinza claro (até 35%)
NEVOA_PRETO = 0.12
NEVOA_SATURACAO = 0.25
NEVOA_MISTURA = 0.35
NEVOA_CINZA = 0.82
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


def somar_ajustes(ajustes: dict, mais: dict) -> dict:
    """Os ajustes com outros somados (os de um efeito), dentro dos limites."""
    return {chave: _limitar(valor + mais.get(chave, 0), *LIMITES[chave]) for chave, valor in ajustes.items()}


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
    # Níveis, antes de tudo e na tela: o preto e o branco de entrada viram 0 e 1, e a gama curva o meio
    preto = a.get("niveis_preto", 0)
    branco = 1 - a.get("niveis_branco", 0)
    expoente = 1 / 2 ** a.get("niveis_gama", 0)
    rgb = tuple(_limitar((v - preto) / (branco - preto)) ** expoente for v in rgb)
    # Névoa, logo depois: tirar abre o preto (a névoa clareia os escuros); pôr mistura com o cinza claro dela
    nevoa = a.get("nevoa", 0)
    if nevoa > 0:
        k = NEVOA_PRETO * nevoa
        rgb = tuple(_limitar((v - k) / (1 - k)) for v in rgb)
    elif nevoa < 0:
        m = NEVOA_MISTURA * -nevoa
        rgb = tuple(v * (1 - m) + NEVOA_CINZA * m for v in rgb)

    ganho = 2 ** a["exposicao"]
    r = _tela(_linear(rgb[0]) * ganho * (1 + FORCA_TEMPERATURA * a["temperatura"]))
    g = _tela(_linear(rgb[1]) * ganho * (1 - FORCA_TOM * a["tom"]))
    b = _tela(_linear(rgb[2]) * ganho * (1 - FORCA_TEMPERATURA * a["temperatura"]))

    fator = 1 + a["contraste"]
    c = [_limitar((v - 0.5) * fator + 0.5) for v in (r, g, b)]

    y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    soma = FORCA_REALCES_SOMBRAS * (a["realces"] * y * y + a["sombras"] * (1 - y) * (1 - y))
    soma += FORCA_BRANCOS_PRETOS * (a.get("brancos", 0) * y ** 4 + a.get("pretos", 0) * (1 - y) ** 4)
    c = [_limitar(v + soma) for v in c]

    # Rodas de cor: escuros, meios-tons e claros, pesados pela luminância (os pesos somam 1)
    yr = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    pesos = ((1 - yr) * (1 - yr), 2 * yr * (1 - yr), yr * yr)
    rodas = [[v * a[forca] * FORCA_RODAS for v in vetor_da_roda(a[matiz])] for matiz, forca in RODAS]
    c = [_limitar(c[k] + sum(peso * roda[k] for peso, roda in zip(pesos, rodas, strict=True))) for k in range(3)]

    # Saturação e vibração: a vibração pesa mais nas cores apagadas (pela distância entre o maior e o menor canal)
    y2 = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    croma = max(c) - min(c)
    fator = 1 + a["saturacao"] + a.get("vibracao", 0) * (1 - croma) + NEVOA_SATURACAO * max(a.get("nevoa", 0), 0)
    c = [_limitar(y2 + (v - y2) * fator) for v in c]
    return c[0], c[1], c[2]


# -----------------------------------------------
# Cor por matiz: oito faixas, cada uma com o giro do matiz, a saturação e a luminância (de -1 a 1)
# -----------------------------------------------
FAIXAS_DE_MATIZ = (("vermelho", 0), ("laranja", 30), ("amarelo", 60), ("verde", 120), ("ciano", 180), ("azul", 240),
                   ("roxo", 270), ("magenta", 300))
GIRO_MAXIMO = 30       # graus, com o matiz da faixa em 1
FORCA_LUMINANCIA = 0.3


def hsl_neutro(hsl: dict | None) -> bool:
    return not hsl or all(abs(v) < 1e-9 for faixa in hsl.values() for v in faixa.values())


def _pesos_das_faixas(matiz: float) -> list[tuple[str, float]]:
    """As duas faixas vizinhas do matiz (em graus) e o peso de cada uma, que somam 1."""
    h = matiz % 360
    for i, (nome, centro) in enumerate(FAIXAS_DE_MATIZ):
        proximo_nome, proximo = FAIXAS_DE_MATIZ[(i + 1) % len(FAIXAS_DE_MATIZ)]
        if i == len(FAIXAS_DE_MATIZ) - 1:
            proximo += 360
        if centro <= h < proximo:
            t = (h - centro) / (proximo - centro)
            return [(nome, 1 - t), (proximo_nome, t)]
    return [(FAIXAS_DE_MATIZ[0][0], 1.0)]


def _para_hsl(r: float, g: float, b: float) -> tuple[float, float, float]:
    maior, menor = max(r, g, b), min(r, g, b)
    luz = (maior + menor) / 2
    d = maior - menor
    if d < 1e-12:
        return 0.0, 0.0, luz
    s = d / (1 - abs(2 * luz - 1))
    if maior == r:
        h = 60 * (((g - b) / d) % 6)
    elif maior == g:
        h = 60 * ((b - r) / d + 2)
    else:
        h = 60 * ((r - g) / d + 4)
    return h, s, luz


def _de_hsl(h: float, s: float, luz: float) -> tuple[float, float, float]:
    c = (1 - abs(2 * luz - 1)) * s
    hh = (h % 360) / 60
    x = c * (1 - abs(hh % 2 - 1))
    setor = int(hh) % 6
    r, g, b = ((c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x))[setor]
    m = luz - c / 2
    return r + m, g + m, b + m


def aplicar_hsl(rgb: tuple[float, float, float], hsl: dict | None) -> tuple[float, float, float]:
    """
    Cor por matiz, depois dos ajustes: cada pixel pega a mistura das duas faixas vizinhas do matiz dele. O giro e a
    saturação não mexem no cinza (que não tem matiz); a luminância pesa pelo croma, para o cinza também ficar.
    """
    if hsl_neutro(hsl):
        return rgb
    h, s, luz = _para_hsl(*rgb)
    croma = max(rgb) - min(rgb)
    giro = saturacao = luminancia = 0.0
    for nome, peso in _pesos_das_faixas(h):
        faixa = hsl.get(nome) or {}
        giro += peso * faixa.get("matiz", 0)
        saturacao += peso * faixa.get("saturacao", 0)
        luminancia += peso * faixa.get("luminancia", 0)
    s = _limitar(s * (1 + saturacao))
    luz = _limitar(luz + FORCA_LUMINANCIA * luminancia * croma)
    r, g, b = _de_hsl(h + GIRO_MAXIMO * giro, s, luz)
    return _limitar(r), _limitar(g), _limitar(b)


def gerar_cube(ajustes: dict, pontos: int = PONTOS_LUT) -> str:
    """
    LUT 3D no formato .cube (o vermelho varia mais rápido, como o formato pede). A cor por matiz
    (ajustes["hsl"]) e as curvas (ajustes["curvas"]), se houver, entram depois dos ajustes, nesta ordem.
    """
    linhas = ["# TakeOne: ajustes de cor", f"LUT_3D_SIZE {pontos}"]
    passo = pontos - 1
    for b in range(pontos):
        for g in range(pontos):
            for r in range(pontos):
                cor = aplicar_hsl(aplicar_cor((r / passo, g / passo, b / passo), ajustes), ajustes.get("hsl"))
                saida = aplicar_curvas(cor, ajustes.get("curvas"))
                linhas.append(" ".join(f"{v:.6f}" for v in saida))
    return "\n".join(linhas) + "\n"


def nome_da_lut(ajustes: dict) -> str:
    """Nome de arquivo estável para os ajustes (clipes com a mesma cor usam a mesma LUT)."""
    chave = ",".join(f"{ajustes[nome]:.6f}" for nome in sorted(AJUSTES_NEUTROS) if nome != "vinheta")
    if ajustes.get("curvas"):
        chave += repr(sorted(ajustes["curvas"].items()))
    if not hsl_neutro(ajustes.get("hsl")):
        chave += repr(sorted((nome, sorted(faixa.items())) for nome, faixa in ajustes["hsl"].items()))
    return f"cor_{hashlib.sha1(chave.encode()).hexdigest()[:12]}.cube"


def _suave(borda0: float, borda1: float, x: float) -> float:
    t = _limitar((x - borda0) / (borda1 - borda0))
    return t * t * (3 - 2 * t)


def escurecimento_da_vinheta(u: float, v: float, vinheta: float) -> float:
    distancia = math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / math.sqrt(2)
    return vinheta * _suave(0.3, 1, distancia)


def desenhar_vinheta(largura: int, altura: int, vinheta: float, linhas: float = 0, faixas: int = 270) -> Image.Image:
    """
    Cinza (1 - escurecimento), opaco, do tamanho do clipe no quadro (medido no centro de cada pixel).
    linhas: as linhas do VHS, que escurecem uma faixa sim, outra não (`faixas` na altura do clipe).
    """
    u = (np.arange(largura) + 0.5) / largura
    v = (np.arange(altura) + 0.5) / altura
    distancia = np.hypot((u[None, :] - 0.5) * 2, (v[:, None] - 0.5) * 2) / math.sqrt(2)
    t = np.clip((distancia - 0.3) / 0.7, 0, 1)
    fator = 1 - vinheta * t * t * (3 - 2 * t)
    if linhas > 0:
        impar = (np.floor(v * faixas) % 2 == 1)[:, None]
        fator = fator * np.where(impar, 1 - linhas, 1.0)
    cinza = np.round(255 * fator).astype(np.uint8)
    rgba = np.full((altura, largura, 4), 255, dtype=np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = cinza
    return Image.fromarray(rgba, mode="RGBA")


# -----------------------------------------------
# Curvas: RGB (as três juntas) e uma por canal, aplicadas depois dos ajustes
# -----------------------------------------------
CANAIS_DA_CURVA = ("rgb", "r", "g", "b")
CURVA_NEUTRA = [[0.0, 0.0], [1.0, 1.0]]


def _tangentes(xs: list[float], ys: list[float]) -> list[float]:
    """Fritsch–Carlson: tangentes que mantêm a curva sem passar dos pontos (monótona entre eles)."""
    n = len(xs)
    d = [(ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]) for k in range(n - 1)]
    m = [d[0]] + [(d[k - 1] + d[k]) / 2 if d[k - 1] * d[k] > 0 else 0.0 for k in range(1, n - 1)] + [d[-1]]
    for k in range(n - 1):
        if d[k] == 0:
            m[k] = m[k + 1] = 0.0
            continue
        a, b = m[k] / d[k], m[k + 1] / d[k]
        s = a * a + b * b
        if s > 9:
            t = 3 / math.sqrt(s)
            m[k], m[k + 1] = t * a * d[k], t * b * d[k]
    return m


def valor_da_curva(pontos: list[list[float]], x: float) -> float:
    """A curva no ponto x (0 a 1): cúbica monótona pelos pontos, reta fora deles, de 0 a 1."""
    xs, ys = [p[0] for p in pontos], [p[1] for p in pontos]
    if x <= xs[0]:
        return _limitar(ys[0])
    if x >= xs[-1]:
        return _limitar(ys[-1])
    m = _tangentes(xs, ys)
    k = max(i for i in range(len(xs) - 1) if xs[i] <= x)
    h = xs[k + 1] - xs[k]
    t = (x - xs[k]) / h
    t2, t3 = t * t, t * t * t
    valor = ((2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1]
             + (t3 - t2) * h * m[k + 1])
    return _limitar(valor)


def curvas_neutras(curvas: dict | None) -> bool:
    return not curvas or all(curvas.get(canal, CURVA_NEUTRA) == CURVA_NEUTRA for canal in CANAIS_DA_CURVA)


def aplicar_curvas(rgb: tuple[float, float, float], curvas: dict | None) -> tuple[float, float, float]:
    """A curva RGB nos três canais, depois a de cada canal."""
    if curvas_neutras(curvas):
        return rgb
    geral = curvas.get("rgb", CURVA_NEUTRA)
    return tuple(valor_da_curva(curvas.get(canal, CURVA_NEUTRA), valor_da_curva(geral, v))
                 for canal, v in zip(("r", "g", "b"), rgb, strict=True))
