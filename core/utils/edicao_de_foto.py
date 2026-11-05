# -----------------------------------------------
# TakeOne — a edição das fotos do álbum (onda 16.5, docs/decisoes/0006-album-de-fotos.md)
#
# Cada foto do álbum guarda uma edição (album_fotos.edicao): a cor da aba Cor (os ajustes, o filtro, a cor por matiz,
# as curvas e a LUT importada), o igualar a cor a outra foto, o giro de endireitar e o recorte. A capa e a cópia
# leve editadas são desenhadas aqui, pelo worker; a exportação (16.10) usa a mesma conta na resolução cheia.
#   - a cor vira a mesma LUT 3D de 33 pontos do render (core/utils/cor.py, gerar_cube), lida pela mesma leitura
#     tetraédrica do lut3d do FFmpeg, aqui em numpy sobre a imagem inteira; a vinheta, pela mesma conta do shader;
#   - igualar é o Reinhard de lib/projeto/igualarCor.ts (a média e o desvio de Y, Cb e Cr da foto passam a ser os da
#     referência), antes da cor da própria foto;
#   - o giro amplia a foto até não sobrar canto vazio, e o recorte (em frações dela já girada) vem depois.
# -----------------------------------------------
import math

import numpy as np

from core.utils import cor_vetorial
from core.utils.cor import PONTOS_LUT, ajustes_efetivos, cor_neutra, curvas_neutras, hsl_neutro
from core.utils.lut import LutImportada

GIRO_MAXIMO = 45.0
# As proporções do recorte automático (largura sobre altura); "original" não corta
PROPORCOES = {"1:1": 1.0, "4:5": 0.8, "5:4": 1.25, "2:3": 2 / 3, "3:2": 1.5, "9:16": 9 / 16, "16:9": 16 / 9}
KR, KB = 0.2126, 0.0722
GANHO_DA_LUZ = (0.5, 2.0)
GANHO_DA_COR = (0.25, 3.0)


# -----------------------------------------------
# A cor
# -----------------------------------------------
def _ajustes(cor: dict | None, luts: dict[str, LutImportada]) -> dict | None:
    """O que entra na LUT 3D da foto (como _ajustes_da_lut do render), ou None quando a cor é a original."""
    if not cor:
        return None
    ajustes = ajustes_efetivos(cor)
    curvas, hsl, importada = cor.get("curvas"), cor.get("hsl"), cor.get("lut")
    if importada and (importada.get("intensidade", 1) <= 0 or importada.get("id") not in luts):
        importada = None
    if cor_neutra({**ajustes, "vinheta": 0}) and curvas_neutras(curvas) and hsl_neutro(hsl) and not importada:
        return None
    return {**ajustes, "curvas": None if curvas_neutras(curvas) else curvas, "hsl": None if hsl_neutro(hsl) else hsl,
            "lut": {"id": importada["id"], "intensidade": importada.get("intensidade", 1),
                    "dados": luts[importada["id"]]} if importada else None}


def grade_da_cor(ajustes: dict, pontos: int = PONTOS_LUT) -> np.ndarray:
    """A LUT 3D dos ajustes, [azul][verde][vermelho][canal]: a conta de gerar_cube (core/utils/cor.py), em numpy."""
    return cor_vetorial.grade_da_cor(ajustes, pontos)


_GRADES: dict[str, np.ndarray] = {}


def grade_guardada(ajustes: dict) -> np.ndarray:
    """A grade dos ajustes, guardada pelo nome da LUT (as fotos de um lote costumam ter a mesma cor)."""
    from core.utils.cor import nome_da_lut

    chave = nome_da_lut(ajustes)
    if chave not in _GRADES:
        if len(_GRADES) >= 32:
            _GRADES.pop(next(iter(_GRADES)))
        _GRADES[chave] = grade_da_cor(ajustes)
    return _GRADES[chave]


def ler_grade(imagem: np.ndarray, grade: np.ndarray) -> np.ndarray:
    """A imagem (float, 0 a 1, H×W×3) pela LUT 3D, na leitura tetraédrica do lut3d (a de core/utils/lut.ler_lut).
    Cada um dos seis tetraedros é calculado só nos pixels que caem nele."""
    n = grade.shape[0]
    forma = imagem.shape
    s = np.clip(imagem.reshape(-1, 3), 0, 1) * (n - 1)
    p = np.minimum(s.astype(np.int32), n - 2)
    d = (s - p).astype(np.float32)
    plana = grade.reshape(-1, 3)
    base = (p[:, 2] * n + p[:, 1]) * n + p[:, 0]
    passo = {"r": 1, "g": n, "b": n * n}
    dr, dg, db = d[:, 0], d[:, 1], d[:, 2]
    rg, gb, rb, bg, br = dr > dg, dg > db, dr > db, db > dg, db > dr
    # Cada caso: os pixels dele, os dois cantos do meio (pelos eixos que andam) e os pesos (o maior, o do meio, o menor)
    casos = [
        (rg & gb, ("r", "rg"), (dr, dg, db)),
        (rg & ~gb & rb, ("r", "rb"), (dr, db, dg)),
        (rg & ~gb & ~rb, ("b", "rb"), (db, dr, dg)),
        (~rg & bg, ("b", "gb"), (db, dg, dr)),
        (~rg & ~bg & br, ("g", "gb"), (dg, db, dr)),
        (~rg & ~bg & ~br, ("g", "rg"), (dg, dr, db)),
    ]
    saida = np.empty((s.shape[0], 3), np.float32)
    canto111 = passo["r"] + passo["g"] + passo["b"]
    for mascara, (primeiro, segundo), (maior, meio, menor) in casos:
        i = np.nonzero(mascara)[0]
        if not i.size:
            continue
        b0 = base[i]
        um = passo[primeiro]
        dois = sum(passo[eixo] for eixo in segundo)
        a, m, z = maior[i, None], meio[i, None], menor[i, None]
        saida[i] = ((1 - a) * plana[b0] + (a - m) * plana[b0 + um] + (m - z) * plana[b0 + dois]
                    + z * plana[b0 + canto111])
    return saida.reshape(forma)


def vinheta(altura: int, largura: int, forca: float) -> np.ndarray:
    """O fator que multiplica cada pixel (H×W×1), a conta de core/utils/cor.escurecimento_da_vinheta."""
    v, u = np.mgrid[0:altura, 0:largura].astype(np.float32)
    u, v = (u + 0.5) / largura, (v + 0.5) / altura
    distancia = np.hypot((u - 0.5) * 2, (v - 0.5) * 2) / math.sqrt(2)
    t = np.clip((distancia - 0.3) / 0.7, 0, 1)
    return (1 - forca * t * t * (3 - 2 * t))[..., None]


# -----------------------------------------------
# Igualar a cor (lib/projeto/igualarCor.ts)
# -----------------------------------------------
def para_ycc(rgb: np.ndarray) -> np.ndarray:
    y = KR * rgb[..., 0] + (1 - KR - KB) * rgb[..., 1] + KB * rgb[..., 2]
    return np.stack([y, (rgb[..., 2] - y) / (2 * (1 - KB)), (rgb[..., 0] - y) / (2 * (1 - KR))], axis=-1)


def de_ycc(ycc: np.ndarray) -> np.ndarray:
    y, cb, cr = ycc[..., 0], ycc[..., 1], ycc[..., 2]
    r = y + 2 * (1 - KR) * cr
    b = y + 2 * (1 - KB) * cb
    g = (y - KR * r - KB * b) / (1 - KR - KB)
    return np.stack([r, g, b], axis=-1)


def estatisticas(rgb: np.ndarray) -> dict:
    """A média e o desvio de Y, Cb e Cr (como estatisticasDaCor)."""
    ycc = para_ycc(rgb.reshape(-1, 3).astype(np.float64))
    return {"media": [float(v) for v in ycc.mean(0)], "desvio": [float(v) for v in ycc.std(0)]}


def igualar(rgb: np.ndarray, alvo: dict, referencia: dict) -> np.ndarray:
    """A foto com a média e o desvio de Y, Cb e Cr da referência (como igualarPixel)."""
    ycc = para_ycc(rgb)
    for k in range(3):
        minimo, maximo = GANHO_DA_LUZ if k == 0 else GANHO_DA_COR
        d = alvo["desvio"][k]
        ganho = min(max(referencia["desvio"][k] / d, minimo), maximo) if d > 1e-4 else 1.0
        ycc[..., k] = (ycc[..., k] - alvo["media"][k]) * ganho + referencia["media"][k]
    return np.clip(de_ycc(ycc), 0, 1)


# -----------------------------------------------
# O giro e o recorte
# -----------------------------------------------
def zoom_do_giro(largura: float, altura: float, graus: float) -> float:
    """Quanto a foto girada precisa crescer para cobrir o quadro dela sem canto vazio."""
    t = math.radians(abs(graus))
    return math.cos(t) + math.sin(t) * max(largura / altura, altura / largura)


def girar(imagem: np.ndarray, graus: float) -> np.ndarray:
    """A foto girada em volta do meio, ampliada até cobrir o quadro (do mesmo tamanho)."""
    if abs(graus) < 1e-3:
        return imagem
    import cv2

    h, w = imagem.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), -graus, zoom_do_giro(w, h, graus))
    return cv2.warpAffine(imagem, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def ponto_girado(x: float, y: float, largura: float, altura: float, graus: float) -> tuple[float, float]:
    """Onde um ponto da foto (em frações) vai parar depois do giro com o zoom (em frações)."""
    t = math.radians(graus)
    z = zoom_do_giro(largura, altura, graus)
    dx, dy = (x - 0.5) * largura, (y - 0.5) * altura
    # O sentido horário na tela (y para baixo), como o cv2 com o ângulo negativo
    rx, ry = (dx * math.cos(t) - dy * math.sin(t)) * z, (dx * math.sin(t) + dy * math.cos(t)) * z
    return 0.5 + rx / largura, 0.5 + ry / altura


def recortar(imagem: np.ndarray, recorte: dict | None) -> np.ndarray:
    if not recorte:
        return imagem
    h, w = imagem.shape[:2]
    x0, y0 = round(recorte["x"] * w), round(recorte["y"] * h)
    x1, y1 = round((recorte["x"] + recorte["largura"]) * w), round((recorte["y"] + recorte["altura"]) * h)
    x0, y0 = min(max(0, x0), w - 1), min(max(0, y0), h - 1)
    return imagem[y0:max(y0 + 1, min(h, y1)), x0:max(x0 + 1, min(w, x1))]


def recorte_automatico(largura: int, altura: int, proporcao: str, rostos: list[dict], giro: float = 0) -> dict | None:
    """O maior recorte da proporção dentro da foto, com os rostos (se houver) no meio na largura e os olhos perto de
    um terço da altura; sem rostos, no meio. Em frações da foto já girada."""
    alvo = PROPORCOES.get(proporcao)
    if alvo is None:
        return None
    atual = largura / altura
    rw, rh = (alvo / atual, 1.0) if alvo < atual else (1.0, atual / alvo)
    cx, cy = 0.5, 0.5
    if rostos:
        pontos = []
        for r in rostos:
            x, y, w, h = r["caixa"]
            for px, py in ((x, y), (x + w, y + h)):
                pontos.append(ponto_girado(px, py, largura, altura, giro))
        xs, ys = [p[0] for p in pontos], [p[1] for p in pontos]
        cx = (min(xs) + max(xs)) / 2
        # Os olhos ficam a uns 40% da caixa do rosto, de cima; eles vão para um terço da altura do recorte
        olhos = min(ys) + (max(ys) - min(ys)) * 0.4
        cy = olhos + rh / 6
    x = min(max(0.0, cx - rw / 2), 1 - rw)
    y = min(max(0.0, cy - rh / 2), 1 - rh)
    return {"x": round(x, 5), "y": round(y, 5), "largura": round(rw, 5), "altura": round(rh, 5)}


def endireitar_automatico(imagem: np.ndarray) -> float:
    """
    O giro (em graus, no sentido horário) que deixa o horizonte e as verticais retos, pelas retas da foto. Conta o
    pico dos desvios das retas quase deitadas e quase em pé (pesadas pelo comprimento) e só gira quando pelo menos
    40% delas concordam: as retas de perspectiva se espalham e não formam pico. Nada acima de 6° (mais que isso
    costuma ser de propósito) e nada quando faltam retas. Medido em 18 fotos reais: nenhuma reta ganhou giro falso.
    """
    import cv2

    cinza = cv2.cvtColor(imagem, cv2.COLOR_RGB2GRAY) if imagem.ndim == 3 else imagem
    h, w = cinza.shape
    escala = 1024 / max(h, w)
    if escala < 1:
        cinza = cv2.resize(cinza, (round(w * escala), round(h * escala)), interpolation=cv2.INTER_AREA)
    bordas = cv2.Canny(cv2.GaussianBlur(cinza, (5, 5), 0), 60, 160)
    lado = max(cinza.shape)
    retas = cv2.HoughLinesP(bordas, 1, np.pi / 720, threshold=50, minLineLength=lado * 0.06, maxLineGap=6)
    if retas is None:
        return 0.0
    desvios, pesos = [], []
    for x1, y1, x2, y2 in retas[:, 0]:
        angulo = math.degrees(math.atan2(y2 - y1, x2 - x1))
        comprimento = math.hypot(x2 - x1, y2 - y1)
        for referencia in (0, 180, -180, 90, -90):
            if abs(angulo - referencia) <= 12:
                desvios.append(angulo - referencia)
                # As verticais pesam menos: a câmera inclinada para cima as faz convergir
                pesos.append(comprimento * (1.0 if abs(referencia) != 90 else 0.6))
                break
    desvios, pesos = np.asarray(desvios), np.asarray(pesos)
    if pesos.sum() < lado * 0.3:
        return 0.0
    bordas_do_histograma = np.arange(-12, 12.001, 0.1)
    histograma, _ = np.histogram(desvios, bins=bordas_do_histograma, weights=pesos)
    nucleo = np.exp(-0.5 * (np.arange(-15, 16) * 0.1 / 0.4) ** 2)
    histograma = np.convolve(histograma, nucleo / nucleo.sum(), mode="same")
    i = int(np.argmax(histograma))
    pico = (bordas_do_histograma[i] + bordas_do_histograma[i + 1]) / 2
    perto = np.abs(desvios - pico) <= 0.6
    if pesos[perto].sum() / pesos.sum() < 0.4:
        return 0.0
    # A reta inclinada no sentido horário na tela (y para baixo) tem ângulo positivo; girar ao contrário a endireita
    giro = -float((desvios[perto] * pesos[perto]).sum() / pesos[perto].sum())
    return 0.0 if abs(giro) < 0.3 or abs(giro) > 6 else round(giro, 2)


# -----------------------------------------------
# A foto editada
# -----------------------------------------------
def editar(imagem: np.ndarray, edicao: dict | None, luts: dict[str, LutImportada] | None = None) -> np.ndarray:
    """A foto (RGB, uint8) com a edição: igualar e a cor, o giro, o recorte e a vinheta (no quadro final)."""
    if not edicao:
        return imagem
    luts = luts or {}
    saida = imagem
    cor = edicao.get("cor")
    ajustes = _ajustes(cor, luts)
    igual = edicao.get("igualar")
    if ajustes or igual:
        rgb = imagem.astype(np.float32) / 255
        if igual:
            rgb = igualar(rgb, igual["alvo"], igual["referencia"]).astype(np.float32)
        if ajustes:
            rgb = ler_grade(rgb, grade_guardada(ajustes))
        saida = np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8)
    saida = recortar(girar(saida, float(edicao.get("giro") or 0)), edicao.get("recorte"))
    forca = ajustes_efetivos(cor)["vinheta"] if cor else 0
    if forca > 0:
        saida = np.clip(saida.astype(np.float32) * vinheta(saida.shape[0], saida.shape[1], forca) + 0.5, 0, 255)
        saida = saida.astype(np.uint8)
    return saida
