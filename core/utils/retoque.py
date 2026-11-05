# -----------------------------------------------
# TakeOne — o retoque de retrato das fotos do álbum (onda 16.8, docs/decisoes/0006-album-de-fotos.md, decisão 5)
#
# O mapa do rosto e do corpo sai do que o worker já tem: os 478 pontos do Face Landmarker dão a pele do rosto (o
# contorno menos olhos, sobrancelhas e boca), os olhos, as íris, a boca por dentro (os dentes) e a faixa embaixo dos
# olhos (as olheiras); a pele do corpo (pescoço, braços) é a cor dessa mesma pele dentro da pessoa recortada pelo
# MODNet; a roupa é o resto da pessoa abaixo do queixo. Cada controle (de 0 a 100) é uma conta sobre essas regiões:
#   pele        separação de frequências pelo filtro guiado: a base suaviza, a textura fica em parte
#   manchas     pontos escuros pequenos na pele (diferença de gaussianas) refeitos pelo inpaint
#   sardas      os pontos mais fracos e menores, clareados até a pele em volta
#   rugas       a média frequência atenuada na testa, em volta dos olhos e do nariz à boca
#   olheiras    a luz e a cor embaixo dos olhos levadas às da bochecha
#   olhos       o branco do olho mais claro e menos vermelho, a íris com mais contraste
#   dentes      menos amarelo e mais luz nos dentes
#   brilho      o brilho de pele oleosa puxado para a luz de volta
#   uniformizar a cor da pele (sem a luz) puxada para a mediana dela
#   contornar   o contraste de grande escala no rosto (o "dodge and burn")
#   pescoço     a suavização da pele no corpo
#   roupa       a roupa alisada pelo filtro guiado (amassados)
# Puro numpy/OpenCV; as regiões podem vir prontas (os testes) ou do mapa (mapa_da_foto).
# -----------------------------------------------
import math

import numpy as np

CONTROLES = ("pele", "manchas", "sardas", "rugas", "olheiras", "olhos", "dentes", "brilho", "uniformizar",
             "contornar", "pescoco", "roupa")

# Os pontos do Face Landmarker (a malha de 468 pontos do MediaPipe, mais as íris)
CONTORNO = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
            149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
OLHO_ESQ = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
OLHO_DIR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
PALPEBRA_DE_BAIXO_ESQ = [263, 249, 390, 373, 374, 380, 381, 382, 362]
PALPEBRA_DE_BAIXO_DIR = [33, 7, 163, 144, 145, 153, 154, 155, 133]
SOBRANCELHA_ESQ = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336]
SOBRANCELHA_DIR = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107]
LABIOS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
BOCA_POR_DENTRO = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
IRIS_DIR, IRIS_ESQ = (468, 469, 470, 471, 472), (473, 474, 475, 476, 477)
QUEIXO = 152


def _poligono(forma, pontos: np.ndarray, indices: list[int]) -> np.ndarray:
    import cv2

    mascara = np.zeros(forma, np.uint8)
    cv2.fillPoly(mascara, [np.round(pontos[indices]).astype(np.int32)], 255)
    return mascara.astype(np.float32) / 255


def _suave(mascara: np.ndarray, sigma: float) -> np.ndarray:
    import cv2

    if sigma <= 0:
        return mascara
    return cv2.GaussianBlur(mascara, (0, 0), sigma)


def regioes_do_rosto(forma: tuple[int, int], pontos: np.ndarray) -> dict[str, np.ndarray]:
    """As regiões de um rosto (máscaras de 0 a 1 do tamanho da foto) pelos 478 pontos dele, em pixels da foto."""
    largura_do_rosto = float(np.ptp(pontos[CONTORNO, 0])) or 1.0
    borda = max(1.0, largura_do_rosto * 0.012)
    rosto = _poligono(forma, pontos, CONTORNO)
    olhos = np.maximum(_poligono(forma, pontos, OLHO_ESQ), _poligono(forma, pontos, OLHO_DIR))
    sobrancelhas = np.maximum(_poligono(forma, pontos, SOBRANCELHA_ESQ), _poligono(forma, pontos, SOBRANCELHA_DIR))
    labios = _poligono(forma, pontos, LABIOS)
    import cv2

    # Os olhos e as sobrancelhas tiram um pouco mais em volta (os cílios e os pelos não são pele)
    nucleo = np.ones((3, 3), np.uint8)
    tirar = cv2.dilate(np.maximum(olhos, sobrancelhas), nucleo, iterations=max(1, round(borda * 1.5)))
    pele = np.clip(rosto - tirar - labios, 0, 1)
    iris = np.zeros(forma, np.float32)
    for indices in (IRIS_DIR, IRIS_ESQ):
        centro = pontos[indices[0]]
        raio = float(np.mean(np.linalg.norm(pontos[list(indices[1:])] - centro, axis=1)))
        cv2.circle(iris, (round(centro[0]), round(centro[1])), max(1, round(raio)), 1.0, -1)
    # As olheiras: a faixa entre a pálpebra de baixo e ela descida 0,45 da altura do olho
    olheiras = np.zeros(forma, np.float32)
    for baixo, olho in ((PALPEBRA_DE_BAIXO_ESQ, OLHO_ESQ), (PALPEBRA_DE_BAIXO_DIR, OLHO_DIR)):
        altura = float(np.ptp(pontos[olho, 1])) or 1.0
        linha = pontos[baixo] + [0, altura * 0.25]
        faixa = np.concatenate([linha, (pontos[baixo] + [0, altura * 1.3])[::-1]])
        cv2.fillPoly(olheiras, [np.round(faixa).astype(np.int32)], 1.0)
    # As rugas: a testa (acima das sobrancelhas), os cantos de fora dos olhos e do nariz à boca
    rugas = np.zeros(forma, np.float32)
    topo_das_sobrancelhas = float(np.min(pontos[SOBRANCELHA_ESQ + SOBRANCELHA_DIR, 1]))
    testa = rosto.copy()
    testa[int(max(0, topo_das_sobrancelhas)):, :] = 0
    rugas = np.maximum(rugas, testa)
    for canto, outro in ((263, 362), (33, 133)):
        direcao = pontos[canto] - pontos[outro]
        centro = pontos[canto] + direcao * 0.35
        cv2.ellipse(rugas, (round(centro[0]), round(centro[1])), (max(1, round(largura_do_rosto * 0.07)),
                    max(1, round(largura_do_rosto * 0.09))), 0, 0, 360, 1.0, -1)
    for lado in ((129, 61), (358, 291)):
        cv2.line(rugas, tuple(np.round(pontos[lado[0]]).astype(int)), tuple(np.round(pontos[lado[1]]).astype(int)),
                 1.0, max(1, round(largura_do_rosto * 0.05)))
    boca = _poligono(forma, pontos, BOCA_POR_DENTRO)
    return {"pele": _suave(pele, borda), "rosto": rosto, "olhos": np.clip(olhos - iris, 0, 1), "iris": iris * olhos,
            "boca": boca, "olheiras": _suave(olheiras * rosto, borda * 2), "rugas": _suave(rugas * pele, borda * 3),
            "largura": np.float32(largura_do_rosto), "queixo": np.float32(pontos[QUEIXO, 1])}


def pele_pela_cor(lab: np.ndarray, pele_do_rosto: np.ndarray, pessoa: np.ndarray, distancia: float = 3.0) -> np.ndarray:
    """A pele do corpo: os pixels da pessoa com a cor (a, b do Lab) perto da pele do rosto, pela distância de
    Mahalanobis à média dela."""
    escolhidos = pele_do_rosto > 0.7
    if escolhidos.sum() < 50:
        return np.zeros(pessoa.shape, np.float32)
    # A referência é a metade mais clara da região: o cabelo que cai no contorno do rosto é escuro e fica de fora
    luz = lab[..., 0][escolhidos]
    escolhidos = escolhidos & (lab[..., 0] >= np.median(luz))
    ab = lab[..., 1:3].reshape(-1, 2).astype(np.float32)
    amostra = lab[..., 1:3][escolhidos].astype(np.float32)
    media = amostra.mean(0)
    cov = np.cov(amostra.T) + np.eye(2) * 4
    inversa = np.linalg.inv(cov)
    d = ab - media
    m = np.sqrt(np.einsum("ij,jk,ik->i", d, inversa, d)).reshape(pessoa.shape)
    return (np.clip((distancia + 1 - m), 0, 1) * pessoa).astype(np.float32)


# -----------------------------------------------
# As contas
# -----------------------------------------------
def filtro_guiado(guia: np.ndarray, entrada: np.ndarray, raio: int, eps: float) -> np.ndarray:
    """O filtro guiado de He, Sun e Tang (a guia em cinza), pelas médias em caixa."""
    import cv2

    def media(x):
        return cv2.boxFilter(x, -1, (2 * raio + 1, 2 * raio + 1), borderType=cv2.BORDER_REFLECT)

    mi, mp = media(guia), media(entrada)
    var = media(guia * guia) - mi * mi
    cov = media(guia * entrada) - mi * mp
    a = cov / (var + eps)
    b = mp - a * mi
    return media(a) * guia + media(b)


def _misturar(original: np.ndarray, novo: np.ndarray, peso: np.ndarray) -> np.ndarray:
    return (original + (novo - original) * peso[..., None]).astype(np.float32)


def suavizar(rgb: np.ndarray, regiao: np.ndarray, forca: float, raio: int) -> np.ndarray:
    """Separação de frequências: a base (filtro guiado) suaviza e a textura volta em parte (os poros ficam)."""
    if forca <= 0 or regiao.max() <= 0:
        return rgb
    import cv2

    cinza = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    base = np.stack([filtro_guiado(cinza, rgb[..., k], raio, 0.0025) for k in range(3)], axis=-1)
    textura_fina = rgb - cv2.GaussianBlur(rgb, (0, 0), max(0.8, raio / 6))
    novo = base + textura_fina * (1 - 0.7 * forca)
    return np.clip(_misturar(rgb, novo, regiao * forca), 0, 1)


def manchas(rgb: np.ndarray, pele: np.ndarray, forca: float, largura_do_rosto: float,
            fracas: bool = False) -> np.ndarray:
    """Os pontos escuros pequenos da pele: refeitos pelo inpaint (manchas) ou clareados até a pele em volta (sardas)."""
    if forca <= 0 or pele.max() <= 0:
        return rgb
    import cv2

    luz = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 0] / 100.0
    s = max(0.6, largura_do_rosto / (260 if fracas else 160))
    diferenca = cv2.GaussianBlur(luz, (0, 0), s * 3) - cv2.GaussianBlur(luz, (0, 0), s)
    # Mais forte, mais pontos: o limiar do escuro cai com a força
    limiar = (0.035 if fracas else 0.06) * (1.4 - forca)
    pontos = ((diferenca > limiar) & (pele > 0.5)).astype(np.uint8)
    # Só os pequenos: o que passa do tamanho de uma mancha (uma sobrancelha, a sombra do nariz) fica
    quantos, rotulos, estatisticas, _ = cv2.connectedComponentsWithStats(pontos, 8)
    maximo = math.pi * (s * (3 if fracas else 5)) ** 2
    pequenos = np.isin(rotulos, [i for i in range(1, quantos) if estatisticas[i, cv2.CC_STAT_AREA] <= maximo])
    if not pequenos.any():
        return rgb
    mascara = cv2.dilate(pequenos.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=max(1, round(s)))
    oito = np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8)
    if fracas:
        em_volta = cv2.GaussianBlur(rgb, (0, 0), s * 4)
        novo = rgb + (em_volta - rgb) * (diferenca[..., None] > 0) * forca
        return np.clip(_misturar(rgb, novo, _suave(mascara.astype(np.float32), s)), 0, 1)
    refeito = cv2.inpaint(oito, mascara, max(3, round(s * 3)), cv2.INPAINT_TELEA).astype(np.float32) / 255
    return np.clip(_misturar(rgb, refeito, _suave(mascara.astype(np.float32), s * 0.7) * min(1.0, forca * 1.5)), 0, 1)


def rugas(rgb: np.ndarray, regiao: np.ndarray, forca: float, largura_do_rosto: float) -> np.ndarray:
    """A média frequência (as linhas finas) atenuada na região das rugas."""
    if forca <= 0 or regiao.max() <= 0:
        return rgb
    import cv2

    s = max(0.8, largura_do_rosto / 220)
    banda = cv2.GaussianBlur(rgb, (0, 0), s) - cv2.GaussianBlur(rgb, (0, 0), s * 4)
    # Só o que escurece (as linhas); o que clareia é forma e brilho
    escuro = np.minimum(banda, 0)
    return np.clip(rgb - escuro * (regiao * forca * 0.85)[..., None], 0, 1)


def olheiras(rgb: np.ndarray, regiao: np.ndarray, pele: np.ndarray, forca: float) -> np.ndarray:
    """A luz e a cor embaixo dos olhos levadas às da pele em volta (a mediana da pele do rosto)."""
    if forca <= 0 or regiao.max() <= 0 or pele.max() <= 0:
        return rgb
    import cv2

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    referencia = np.median(lab[pele > 0.7], axis=0) if (pele > 0.7).any() else lab.reshape(-1, 3).mean(0)
    novo = lab.copy()
    novo[..., 0] = np.maximum(lab[..., 0], lab[..., 0] + (referencia[0] - lab[..., 0]) * 0.8)
    novo[..., 1:] = lab[..., 1:] + (referencia[1:] - lab[..., 1:]) * 0.6
    return np.clip(_misturar(rgb, cv2.cvtColor(novo, cv2.COLOR_LAB2RGB), regiao * forca), 0, 1)


def olhos(rgb: np.ndarray, branco: np.ndarray, iris: np.ndarray, forca: float) -> np.ndarray:
    """O branco do olho mais claro e menos vermelho; a íris com mais contraste."""
    if forca <= 0:
        return rgb
    import cv2

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    claro = lab.copy()
    claro[..., 0] = np.minimum(100, lab[..., 0] + 10)
    claro[..., 1] = lab[..., 1] * 0.5
    saida = _misturar(rgb, cv2.cvtColor(claro, cv2.COLOR_LAB2RGB), _suave(branco, 1) * forca * 0.8)
    nitida = saida + (saida - cv2.GaussianBlur(saida, (0, 0), 2)) * 1.2
    return np.clip(_misturar(saida, nitida, _suave(iris, 1) * forca), 0, 1)


def dentes(rgb: np.ndarray, boca: np.ndarray, forca: float) -> np.ndarray:
    """Menos amarelo e mais luz nos dentes: dentro da boca, o que é claro e pouco colorido."""
    if forca <= 0 or boca.max() <= 0:
        return rgb
    import cv2

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    croma = np.hypot(lab[..., 1], lab[..., 2])
    # Dente amarelado tem croma de 20 a 35; o vermelho da gengiva e da língua passa disso
    claros = np.clip((lab[..., 0] - 45) / 20, 0, 1) * np.clip((50 - croma) / 12, 0, 1)
    novo = lab.copy()
    novo[..., 2] = lab[..., 2] - np.maximum(lab[..., 2], 0) * 0.8
    novo[..., 1] = lab[..., 1] * 0.7
    novo[..., 0] = np.minimum(100, lab[..., 0] + 6)
    return np.clip(_misturar(rgb, cv2.cvtColor(novo, cv2.COLOR_LAB2RGB), _suave(boca * claros, 1) * forca), 0, 1)


def brilho(rgb: np.ndarray, pele: np.ndarray, forca: float, largura_do_rosto: float) -> np.ndarray:
    """O brilho de pele oleosa (o que passa muito da luz em volta) puxado para a luz de volta."""
    if forca <= 0 or pele.max() <= 0:
        return rgb
    import cv2

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    em_volta = cv2.GaussianBlur(lab[..., 0], (0, 0), max(2.0, largura_do_rosto / 25))
    excesso = np.clip(lab[..., 0] - em_volta - 4, 0, None)
    novo = lab.copy()
    novo[..., 0] = lab[..., 0] - excesso * 0.85
    return np.clip(_misturar(rgb, cv2.cvtColor(novo, cv2.COLOR_LAB2RGB), pele * forca), 0, 1)


def uniformizar(rgb: np.ndarray, pele: np.ndarray, forca: float, largura_do_rosto: float) -> np.ndarray:
    """A cor da pele (a e b do Lab, em grande escala) puxada para a mediana dela; a luz fica."""
    if forca <= 0 or not (pele > 0.7).any():
        return rgb
    import cv2

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    mediana = np.median(lab[pele > 0.7][:, 1:], axis=0)
    grande = cv2.GaussianBlur(lab[..., 1:], (0, 0), max(2.0, largura_do_rosto / 30))
    novo = lab.copy()
    # O deslocamento tem teto: tingir de vez o que a máscara pegar por engano é pior que uniformizar de menos
    novo[..., 1:] = lab[..., 1:] + np.clip((mediana - grande) * 0.8, -8, 8)
    return np.clip(_misturar(rgb, cv2.cvtColor(novo, cv2.COLOR_LAB2RGB), pele * forca), 0, 1)


def contornar(rgb: np.ndarray, rosto: np.ndarray, forca: float, largura_do_rosto: float) -> np.ndarray:
    """O contraste de grande escala no rosto: o que é claro clareia e o que é escuro escurece, de leve."""
    if forca <= 0 or rosto.max() <= 0:
        return rgb
    import cv2

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    luz = lab[..., 0]
    forma = cv2.GaussianBlur(luz, (0, 0), max(2.0, largura_do_rosto / 12))
    media = float(forma[rosto > 0.5].mean()) if (rosto > 0.5).any() else 50.0
    novo = lab.copy()
    novo[..., 0] = np.clip(luz + (forma - media) * 0.35, 0, 100)
    return np.clip(_misturar(rgb, cv2.cvtColor(novo, cv2.COLOR_LAB2RGB), _suave(rosto, largura_do_rosto / 20) * forca),
                   0, 1)


def retocar_com_regioes(rgb8: np.ndarray, valores: dict, rostos: list[dict], corpo: np.ndarray | None,
                        roupa: np.ndarray | None) -> np.ndarray:
    """A foto (RGB, uint8) retocada pelas regiões de cada rosto (regioes_do_rosto), a pele do corpo e a roupa."""
    rgb = rgb8.astype(np.float32) / 255
    forca = {c: max(0.0, min(1.0, float(valores.get(c) or 0) / 100)) for c in CONTROLES}
    corpo = corpo.astype(np.float32) if corpo is not None else None
    roupa = roupa.astype(np.float32) if roupa is not None else None
    # O contorno pelos pontos pega o cabelo que cai na testa: a pele fica só onde a cor é a da pele do rosto
    if rostos:
        import cv2

        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
        for r in rostos:
            parecida = pele_pela_cor(lab, r["pele"], np.ones(rgb.shape[:2], np.float32), 2.5)
            # O cabelo escuro de reflexo castanho passa pela cor; pela luz não (mais escuro que a pele mais escura)
            certos = lab[..., 0][r["pele"] > 0.7]
            if certos.size:
                # Mais escuro que 40% da luz mediana da pele não é pele (a sombra funda do rosto quase nunca chega)
                piso = 0.4 * float(np.median(certos))
                parecida = parecida * np.clip((lab[..., 0] - piso) / 6 + 1, 0, 1)
            r["pele"] = r["pele"] * parecida
            r["rugas"] = r["rugas"] * np.clip(r["pele"] * 2, 0, 1)
    if not any(forca.values()):
        return rgb8
    pele_toda = np.max([r["pele"] for r in rostos], axis=0) if rostos else np.zeros(rgb.shape[:2], np.float32)
    largura = float(max((r["largura"] for r in rostos), default=max(rgb.shape) / 6))
    raio = max(2, round(largura / 45))
    if corpo is not None and forca["pescoco"] > 0:
        rgb = suavizar(rgb, corpo, forca["pescoco"], raio)
    if roupa is not None and forca["roupa"] > 0:
        rgb = suavizar(rgb, roupa, forca["roupa"], raio * 2)
    for r in rostos:
        w = float(r["largura"])
        rgb = manchas(rgb, r["pele"], forca["manchas"], w)
        rgb = manchas(rgb, r["pele"], forca["sardas"], w, fracas=True)
        rgb = rugas(rgb, r["rugas"], forca["rugas"], w)
        rgb = suavizar(rgb, r["pele"], forca["pele"], max(2, round(w / 45)))
        rgb = olheiras(rgb, r["olheiras"], r["pele"], forca["olheiras"])
        rgb = olhos(rgb, r["olhos"], r["iris"], forca["olhos"])
        rgb = dentes(rgb, r["boca"], forca["dentes"])
        rgb = brilho(rgb, r["pele"], forca["brilho"], w)
        rgb = contornar(rgb, r["rosto"], forca["contornar"], w)
    rgb = uniformizar(rgb, pele_toda, forca["uniformizar"], largura)
    return np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8)


def aplicar_pincel(forma: tuple[int, int], tracos: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """O que o pincel incluiu e excluiu (máscaras de 0 a 1): cada traço tem o modo, o raio (em fração do lado menor)
    e os pontos (em frações da foto)."""
    import cv2

    h, w = forma
    incluir = np.zeros(forma, np.float32)
    excluir = np.zeros(forma, np.float32)
    for traco in tracos or []:
        alvo = incluir if traco.get("modo") == "incluir" else excluir
        raio = max(1, round(float(traco.get("raio", 0.02)) * min(h, w)))
        pontos = [(round(x * w), round(y * h)) for x, y in traco.get("pontos", [])]
        for a, b in zip(pontos, pontos[1:] or pontos, strict=False):
            cv2.line(alvo, a, b, 1.0, raio * 2)
        for p in pontos[:1]:
            cv2.circle(alvo, p, raio, 1.0, -1)
    return _suave(incluir, 2), _suave(excluir, 2)


# -----------------------------------------------
# O mapa da foto inteira (com os modelos do worker)
# -----------------------------------------------
LADO_DO_MODNET = 512


def pessoa_pelo_modnet(rgb8: np.ndarray, sessao) -> np.ndarray:
    """A pessoa da foto (de 0 a 1), pelo MODNet, como o recorte do fundo das fotos."""
    import cv2

    h, w = rgb8.shape[:2]
    menor = min(h, w)
    lm = max(32, round(w * LADO_DO_MODNET / menor / 32) * 32)
    am = max(32, round(h * LADO_DO_MODNET / menor / 32) * 32)
    quadro = cv2.resize(rgb8, (lm, am), interpolation=cv2.INTER_AREA).astype(np.float32)
    alfa = sessao.run(None, {sessao.get_inputs()[0].name: ((quadro - 127.5) / 127.5).transpose(2, 0, 1)[None]})[0][0, 0]
    return cv2.resize(alfa, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)


def _iou(a: list[float], b: list[float]) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    dentro = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    return dentro / (a[2] * a[3] + b[2] * b[3] - dentro + 1e-9)


def retocar(rgb8: np.ndarray, retoque: dict, modelos, sessao_modnet=None, rostos_medidos: list[dict] | None = None,
            pessoas_por_rosto: list | None = None) -> np.ndarray:
    """A foto (RGB, uint8) com o retoque: os rostos achados (só os das pessoas pedidas, se houver), a pele do corpo e a
    roupa pelo MODNet, e o pincel de incluir e excluir."""
    import cv2

    from core.utils.medir_foto import achar_rostos, pontos_do_rosto

    valores = {c: float(retoque.get(c) or 0) for c in CONTROLES}
    if not any(valores.values()) or modelos.pontos is None:
        return rgb8
    h, w = rgb8.shape[:2]
    bgr = cv2.cvtColor(rgb8, cv2.COLOR_RGB2BGR)
    escolhidas = set(retoque.get("pessoas") or [])
    rostos = []
    for achado in achar_rostos(bgr, modelos):
        if escolhidas:
            caixa = [achado[0] / w, achado[1] / h, achado[2] / w, achado[3] / h]
            casamentos = [(_iou(caixa, r["caixa"]), i) for i, r in enumerate(rostos_medidos or [])]
            iou, indice = max(casamentos, default=(0.0, -1))
            pessoa = (pessoas_por_rosto or [])[indice] if 0 <= indice < len(pessoas_por_rosto or []) else None
            if iou < 0.3 or pessoa not in escolhidas:
                continue
        _, pontos = pontos_do_rosto(bgr, achado, modelos)
        rostos.append(regioes_do_rosto((h, w), pontos))
    incluir, excluir = aplicar_pincel((h, w), retoque.get("pincel") or [])
    corpo = roupa = None
    if (valores["pescoco"] or valores["roupa"]) and sessao_modnet is not None and rostos:
        pessoa = pessoa_pelo_modnet(rgb8, sessao_modnet)
        lab = cv2.cvtColor(rgb8.astype(np.float32) / 255, cv2.COLOR_RGB2LAB)
        pele_do_rosto = np.max([r["pele"] for r in rostos], axis=0)
        rosto_todo = np.max([r["rosto"] for r in rostos], axis=0)
        corpo = np.clip(pele_pela_cor(lab, pele_do_rosto, pessoa) - rosto_todo, 0, 1)
        abaixo = np.zeros((h, w), np.float32)
        abaixo[int(min(h - 1, max(r["queixo"] for r in rostos))):, :] = 1
        roupa = np.clip(pessoa - corpo, 0, 1) * abaixo * (pessoa > 0.5)
    # O pincel: o incluído vira pele (do corpo) e o excluído sai de todas as regiões
    if incluir.max() > 0:
        corpo = np.maximum(corpo if corpo is not None else 0, incluir)
        if not valores["pescoco"]:
            valores["pescoco"] = valores["pele"]
    if excluir.max() > 0:
        manter = 1 - excluir
        for r in rostos:
            for chave in ("pele", "rosto", "olhos", "iris", "boca", "olheiras", "rugas"):
                r[chave] = r[chave] * manter
        corpo = corpo * manter if corpo is not None else None
        roupa = roupa * manter if roupa is not None else None
    return retocar_com_regioes(rgb8, valores, rostos, corpo, roupa)
