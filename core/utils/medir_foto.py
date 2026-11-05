# -----------------------------------------------
# TakeOne — as medidas de cada foto do álbum (onda 16.2, docs/decisoes/0006-album-de-fotos.md)
#
# Cada foto é medida uma vez, na cópia leve reduzida a 1024 px, e as medidas ficam guardadas (fotos_medidas): a
# escolha das melhores (16.3) é uma conta sobre elas, então mudar o rigor ou a quantidade não roda modelo nenhum.
#   - foco: a variância do laplaciano na foto inteira e no melhor dos 16 blocos (o assunto nítido num fundo
#     desfocado é foto boa);
#   - exposição: a mediana da luz e quanto da foto está estourado ou afogado;
#   - rostos: o YuNet (MIT) acha cada um; os 478 pontos e as expressões do MediaPipe Face Landmarker (Apache-2.0,
#     os modelos TFLite lidos pelo próprio OpenCV, sem o pacote do MediaPipe) dão os olhos abertos ou fechados, o
#     sorriso, para onde a pessoa olha e o giro da cabeça; o foco do rosto é o laplaciano no recorte dele;
#   - a pessoa: o vetor de 128 números de cada rosto (SFace, Apache-2.0), guardado à parte, para juntar as fotos
#     da mesma pessoa;
#   - o vetor da foto: o DINOv2 small (Apache-2.0, ONNX pelo onnxruntime), para achar as parecidas. Sem o modelo
#     (o CI sem ele), um histograma de cor do mesmo tamanho faz o papel, mais grosseiro.
# -----------------------------------------------
import numpy as np

from core.config import (
    MODELO_EXPRESSOES,
    MODELO_PESSOA,
    MODELO_PONTOS_DO_ROSTO,
    MODELO_ROSTO,
    MODELO_VETOR_DA_FOTO,
)

VERSAO_DAS_MEDIDAS = 2
LADO_DA_ANALISE = 1024
DIMENSOES_DO_VETOR = 384
DIMENSOES_DA_PESSOA = 128
ROSTOS_MAXIMOS = 12
CONFIANCA_DO_ROSTO = 0.6
# Os 146 pontos que o modelo das expressões recebe (kLandmarksSubsetIdxs em face_blendshapes_graph.cc do MediaPipe)
SUBCONJUNTO_DAS_EXPRESSOES = [
    0, 1, 4, 5, 6, 7, 8, 10, 13, 14, 17, 21, 33, 37, 39, 40, 46, 52, 53, 54, 55, 58, 61, 63, 65, 66, 67, 70, 78, 80,
    81, 82, 84, 87, 88, 91, 93, 95, 103, 105, 107, 109, 127, 132, 133, 136, 144, 145, 146, 148, 149, 150, 152, 153,
    154, 155, 157, 158, 159, 160, 161, 162, 163, 168, 172, 173, 176, 178, 181, 185, 191, 195, 197, 234, 246, 249, 251,
    263, 267, 269, 270, 276, 282, 283, 284, 285, 288, 291, 293, 295, 296, 297, 300, 308, 310, 311, 312, 314, 317, 318,
    321, 323, 324, 332, 334, 336, 338, 356, 361, 362, 365, 373, 374, 375, 377, 378, 379, 380, 381, 382, 384, 385, 386,
    387, 388, 389, 390, 397, 398, 400, 402, 405, 409, 415, 454, 466, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477]
# As expressões que o álbum usa, pelo número na saída do modelo (kBlendshapeNames)
PISCAR_ESQ, PISCAR_DIR = 9, 10
OLHAR = {"baixo": (11, 12), "dentro": (13, 14), "fora": (15, 16), "cima": (17, 18)}
SORRISO_ESQ, SORRISO_DIR = 44, 45
# A média e o desvio da ImageNet, que o DINOv2 espera
_MEDIA = np.array([0.485, 0.456, 0.406], np.float32)
_DESVIO = np.array([0.229, 0.224, 0.225], np.float32)


class Modelos:
    """Os modelos abertos uma vez por processo; o que falta (o CI sem os pesos) fica None e a medida segue sem ele."""

    def __init__(self, rosto=MODELO_ROSTO, pontos=MODELO_PONTOS_DO_ROSTO, expressoes=MODELO_EXPRESSOES,
                 vetor=MODELO_VETOR_DA_FOTO, pessoa=MODELO_PESSOA):
        import cv2

        self.rosto = str(rosto) if rosto.is_file() else None
        self.pessoa = cv2.FaceRecognizerSF.create(str(pessoa), "") if pessoa.is_file() else None
        self.pontos = cv2.dnn.readNet(str(pontos)) if pontos.is_file() else None
        self.expressoes = cv2.dnn.readNet(str(expressoes)) if expressoes.is_file() else None
        self.vetor = None
        if vetor.is_file():
            import onnxruntime

            opcoes = onnxruntime.SessionOptions()
            opcoes.intra_op_num_threads = 8
            self.vetor = onnxruntime.InferenceSession(str(vetor), opcoes, providers=["CPUExecutionProvider"])


def reduzida(imagem, lado: int = LADO_DA_ANALISE):
    """A foto (BGR) com o lado maior em `lado`, sem aumentar."""
    import cv2

    h, w = imagem.shape[:2]
    escala = lado / max(h, w)
    if escala >= 1:
        return imagem
    return cv2.resize(imagem, (max(1, round(w * escala)), max(1, round(h * escala))), interpolation=cv2.INTER_AREA)


def foco(cinza) -> dict:
    """A variância do laplaciano na foto inteira e a do melhor dos blocos de uma grade 4 × 4."""
    import cv2

    lap = cv2.Laplacian(cinza.astype(np.float32), cv2.CV_32F, ksize=3)
    h, w = lap.shape
    blocos = [float(lap[i * h // 4:(i + 1) * h // 4, j * w // 4:(j + 1) * w // 4].var())
              for i in range(4) for j in range(4)]
    return {"geral": round(float(lap.var()), 2), "melhor_bloco": round(max(blocos), 2)}


def exposicao(cinza) -> dict:
    """A mediana da luz (0 a 1) e a fração estourada (≥ 250) e afogada (≤ 5)."""
    n = cinza.size
    return {"mediana": round(float(np.median(cinza)) / 255, 4), "estourado": round(float((cinza >= 250).sum()) / n, 4),
            "afogado": round(float((cinza <= 5).sum()) / n, 4)}


def _recorte_do_rosto(imagem, achado):
    """O quadrado de 256 px em volta do rosto (1,5 vez o lado maior da caixa), girado para os olhos do YuNet ficarem
    na horizontal (o modelo dos pontos espera o rosto em pé: com a cabeça inclinada, um olho aberto saía fechado),
    e a matriz que leva os pontos do recorte de volta à foto."""
    import cv2

    x, y, w, h = (float(v) for v in achado[:4])
    cx, cy, lado = x + w / 2, y + h / 2, max(w, h) * 1.5
    # O olho direito da pessoa (à esquerda na foto) e o esquerdo
    angulo = float(np.degrees(np.arctan2(achado[7] - achado[5], achado[6] - achado[4]))) if len(achado) >= 8 else 0.0
    m = cv2.getRotationMatrix2D((cx, cy), angulo, 256 / lado)
    m[:, 2] += (128 - cx, 128 - cy)
    corte = cv2.warpAffine(imagem, m, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return corte, cv2.invertAffineTransform(m)


def pontos_do_rosto(imagem, achado, modelos: Modelos) -> tuple[np.ndarray, np.ndarray]:
    """Os 478 pontos de um rosto: no recorte em pé (256 × 256) e na foto, em pixels."""
    import cv2

    corte, volta = _recorte_do_rosto(imagem, achado)
    modelos.pontos.setInput(cv2.dnn.blobFromImage(corte, 1 / 255.0, (256, 256), swapRB=True))
    saidas = modelos.pontos.forward(modelos.pontos.getUnconnectedOutLayersNames())
    no_corte = [s for s in saidas if s.size == 478 * 3][0].reshape(478, 3)[:, :2]
    return no_corte, no_corte @ volta[:, :2].T + volta[:, 2]


def achar_rostos(imagem, modelos: Modelos) -> list:
    """Os rostos do YuNet (as linhas de 15 números), do maior para o menor, sem os pequenos demais."""
    import cv2

    if modelos.rosto is None:
        return []
    h, w = imagem.shape[:2]
    detector = cv2.FaceDetectorYN.create(modelos.rosto, "", (w, h), CONFIANCA_DO_ROSTO)
    _, achados = detector.detect(imagem)
    if achados is None:
        return []
    return [a for a in sorted(achados, key=lambda a: -a[2] * a[3])[:ROSTOS_MAXIMOS] if a[2] >= 12 and a[3] >= 12]


def _expressoes(imagem, achado, modelos: Modelos) -> dict:
    """Os olhos, o sorriso, o olhar e o giro da cabeça de um rosto, pelos pontos e pelas expressões."""
    # As expressões usam os pontos do rosto em pé (como no recorte); o giro da cabeça, os da foto
    no_corte, pontos = pontos_do_rosto(imagem, achado, modelos)
    medidas: dict = {}
    # O giro da cabeça pelos pontos: a ponta do nariz entre as maçãs do rosto (de lado) e entre os olhos e a boca
    nariz, esq, dir_ = pontos[1], pontos[234], pontos[454]
    largura = float(np.linalg.norm(dir_ - esq)) or 1.0
    medidas["guinada"] = round(float(np.dot(nariz - (esq + dir_) / 2, (dir_ - esq) / largura)) / (largura / 2), 3)
    olhos, boca = (pontos[33] + pontos[263]) / 2, (pontos[13] + pontos[14]) / 2
    medidas["arfagem"] = round(float((nariz[1] - olhos[1]) / max(1.0, boca[1] - olhos[1]) - 0.55), 3)
    if modelos.expressoes is not None:
        modelos.expressoes.setInput(no_corte[SUBCONJUNTO_DAS_EXPRESSOES].astype(np.float32)[None])
        e = modelos.expressoes.forward().ravel()
        medidas["olho_esq"] = round(1 - float(e[PISCAR_ESQ]), 3)
        medidas["olho_dir"] = round(1 - float(e[PISCAR_DIR]), 3)
        medidas["sorriso"] = round(float(e[SORRISO_ESQ] + e[SORRISO_DIR]) / 2, 3)
        desvio = max(float(e[a] + e[b]) / 2 for a, b in OLHAR.values())
        medidas["olhando"] = round(1 - desvio, 3)
    return medidas


def rostos(imagem, modelos: Modelos) -> tuple[list[dict], np.ndarray]:
    """Os rostos da foto, do maior para o menor: a caixa (em frações da foto), a confiança, o foco e as expressões;
    e o vetor da pessoa de cada um (uma linha por rosto, zeros sem o SFace)."""
    import cv2

    vazio = np.zeros((0, DIMENSOES_DA_PESSOA), np.float32)
    if modelos.rosto is None:
        return [], vazio
    h, w = imagem.shape[:2]
    detector = cv2.FaceDetectorYN.create(modelos.rosto, "", (w, h), CONFIANCA_DO_ROSTO)
    _, achados = detector.detect(imagem)
    if achados is None:
        return [], vazio
    cinza = cv2.cvtColor(imagem, cv2.COLOR_BGR2GRAY)
    saida, pessoas = [], []
    for achado in sorted(achados, key=lambda a: -a[2] * a[3])[:ROSTOS_MAXIMOS]:
        x, y, fw, fh = (float(v) for v in achado[:4])
        if fw < 12 or fh < 12:
            continue
        x0, y0 = max(0, int(x)), max(0, int(y))
        recorte = cinza[y0:int(y + fh), x0:int(x + fw)]
        if recorte.size == 0:
            continue
        # O foco do rosto no mesmo tamanho para todos (o laplaciano cresce com a resolução)
        recorte = cv2.resize(recorte, (128, 128), interpolation=cv2.INTER_AREA)
        rosto = {"caixa": [round(x / w, 4), round(y / h, 4), round(fw / w, 4), round(fh / h, 4)],
                 "confianca": round(float(achado[-1]), 3),
                 "foco": round(float(cv2.Laplacian(recorte.astype(np.float32), cv2.CV_32F, ksize=3).var()), 2)}
        if modelos.pontos is not None:
            rosto.update(_expressoes(imagem, achado, modelos))
        saida.append(rosto)
        pessoas.append(pessoa(imagem, achado, modelos))
    return saida, (np.stack(pessoas) if pessoas else vazio)


def pessoa(imagem, achado, modelos: Modelos) -> np.ndarray:
    """O vetor de um rosto (128 números, de comprimento 1), alinhado pelos olhos, o nariz e a boca do YuNet."""
    if modelos.pessoa is None:
        return np.zeros(DIMENSOES_DA_PESSOA, np.float32)
    v = modelos.pessoa.feature(modelos.pessoa.alignCrop(imagem, achado)).ravel().astype(np.float32)
    return v / (np.linalg.norm(v) or 1.0)


def vetor(imagem, modelos: Modelos) -> np.ndarray:
    """O vetor da foto (384 números, de comprimento 1), para comparar fotos pelo cosseno."""
    import cv2

    if modelos.vetor is None:
        # Sem o DINOv2: um histograma de cor em HSV (8 × 8 × 6), grosseiro, mas do mesmo tamanho
        hsv = cv2.cvtColor(imagem, cv2.COLOR_BGR2HSV)
        v = cv2.calcHist([hsv], [0, 1, 2], None, [8, 8, 6], [0, 180, 0, 256, 0, 256]).ravel().astype(np.float32)
        v = np.sqrt(v)
    else:
        rgb = cv2.cvtColor(imagem, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        escala = 256 / min(h, w)
        rgb = cv2.resize(rgb, (max(224, round(w * escala)), max(224, round(h * escala))), interpolation=cv2.INTER_AREA)
        h, w = rgb.shape[:2]
        y, x = (h - 224) // 2, (w - 224) // 2
        entrada = ((rgb[y:y + 224, x:x + 224].astype(np.float32) / 255 - _MEDIA) / _DESVIO).transpose(2, 0, 1)[None]
        nome = modelos.vetor.get_inputs()[0].name
        saidas = modelos.vetor.run(None, {nome: entrada})
        # O CLS do último estado (o primeiro token), que o pooler do DINOv2 devolve normalizado
        v = (saidas[1] if len(saidas) > 1 else saidas[0][:, 0]).ravel().astype(np.float32)
    return (v / (np.linalg.norm(v) or 1.0)).astype(np.float32)


def medir(imagem, modelos: Modelos) -> tuple[dict, np.ndarray, np.ndarray]:
    """As medidas da foto (BGR), o vetor dela e o vetor da pessoa de cada rosto (na ordem de medidas["rostos"])."""
    import cv2

    imagem = reduzida(imagem)
    cinza = cv2.cvtColor(imagem, cv2.COLOR_BGR2GRAY)
    achados, pessoas = rostos(imagem, modelos)
    medidas = {"versao": VERSAO_DAS_MEDIDAS, "foco": foco(cinza), "exposicao": exposicao(cinza), "rostos": achados,
               "com_vetor_do_modelo": modelos.vetor is not None, "com_pessoas": modelos.pessoa is not None}
    return medidas, vetor(imagem, modelos), pessoas
