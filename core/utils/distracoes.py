# -----------------------------------------------
# TakeOne — achar e apagar as distrações das fotos do álbum (onda 16.9, docs/decisoes/0006-album-de-fotos.md)
#
# O OWL-ViT base (Apache-2.0, a exportação ONNX quantizada do Xenova) acha caixas pelo texto, com o vocabulário
# livre (as consultas prontas ou as que a pessoa escreve); o tokenizador do CLIP é o de core/utils/clip_bpe.py.
# Cada caixa que não cobre a pessoa (a máscara do MODNet) vira uma máscara pelo MobileSAM, com a caixa como pedido,
# e o LaMa refaz o que estava atrás (core/utils/objeto.apagar), uma de cada vez.
# -----------------------------------------------
import numpy as np

LADO_DO_OWL = 768
MEDIA_CLIP = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
DESVIO_CLIP = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)
# O que costuma estragar uma foto e o detector acha bem pelo nome (em inglês, a língua do modelo)
CONSULTAS_PRONTAS = {
    "lixeira": "trash can", "placa de saída": "exit sign", "extintor": "fire extinguisher",
    "tomada": "power outlet", "fios": "electrical cables", "garrafa": "plastic bottle", "copo": "disposable cup",
    "cone": "traffic cone", "sacola": "plastic bag", "poste": "utility pole", "ar-condicionado": "air conditioner",
    "carro": "parked car", "placa": "street sign", "microfone": "microphone stand",
}
LIMIAR = 0.12
# Uma caixa que cobre mais que isto da pessoa é parte dela (ou está na frente dela) e fica
TOQUE_MAXIMO_NA_PESSOA = 0.15
AREA_MAXIMA = 0.15


def entrada_da_imagem(rgb8: np.ndarray) -> tuple[np.ndarray, float]:
    """A foto num quadrado de 768 (completada embaixo e à direita, como o processador do OWL-ViT), normalizada."""
    import cv2

    h, w = rgb8.shape[:2]
    escala = LADO_DO_OWL / max(h, w)
    pequena = cv2.resize(rgb8, (round(w * escala), round(h * escala)), interpolation=cv2.INTER_AREA)
    quadrado = np.full((LADO_DO_OWL, LADO_DO_OWL, 3), 128, np.uint8)
    quadrado[:pequena.shape[0], :pequena.shape[1]] = pequena
    x = (quadrado.astype(np.float32) / 255 - MEDIA_CLIP) / DESVIO_CLIP
    return x.transpose(2, 0, 1)[None], escala


def nms(caixas: list[dict], limiar: float = 0.4) -> list[dict]:
    """As caixas mais seguras, sem as que se sobrepõem a uma melhor."""
    def iou(a, b):
        x0, y0 = max(a[0], b[0]), max(a[1], b[1])
        x1, y1 = min(a[2], b[2]), min(a[3], b[3])
        dentro = max(0.0, x1 - x0) * max(0.0, y1 - y0)
        return dentro / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - dentro + 1e-9)

    escolhidas: list[dict] = []
    for caixa in sorted(caixas, key=lambda c: -c["nota"]):
        if all(iou(caixa["caixa"], outra["caixa"]) < limiar for outra in escolhidas):
            escolhidas.append(caixa)
    return escolhidas


def detectar(rgb8: np.ndarray, consultas: list[str], sessao, tokenizador, limiar: float = LIMIAR) -> list[dict]:
    """As caixas (x0, y0, x1, y1 em frações da foto) achadas para as consultas, com a nota e a consulta."""
    h, w = rgb8.shape[:2]
    pixels, escala = entrada_da_imagem(rgb8)
    # O OWL-ViT foi treinado com legendas: "a photo of a …" dá notas bem maiores que o nome solto (0,31 contra 0,05)
    frases = [c if c.lower().startswith(("a ", "an ", "the ")) else f"a photo of a {c}" for c in consultas]
    ids, mascara = tokenizador.lote(frases)
    nomes = {i.name for i in sessao.get_inputs()}
    entradas = {"pixel_values": pixels, "input_ids": np.array(ids, np.int64)}
    if "attention_mask" in nomes:
        entradas["attention_mask"] = np.array(mascara, np.int64)
    saidas = dict(zip([o.name for o in sessao.get_outputs()], sessao.run(None, entradas), strict=True))
    logits = saidas["logits"][0]
    caixas = saidas["pred_boxes"][0]
    notas = 1 / (1 + np.exp(-logits))
    achadas = []
    for i in range(notas.shape[0]):
        k = int(notas[i].argmax())
        if notas[i, k] < limiar:
            continue
        cx, cy, bw, bh = caixas[i]
        # As caixas são em frações do quadrado de 768; a foto ocupa o canto de cima à esquerda dele
        lado_na_foto = LADO_DO_OWL / escala
        x0, x1 = (cx - bw / 2) * lado_na_foto / w, (cx + bw / 2) * lado_na_foto / w
        y0, y1 = (cy - bh / 2) * lado_na_foto / h, (cy + bh / 2) * lado_na_foto / h
        caixa = [float(np.clip(v, 0, 1)) for v in (x0, y0, x1, y1)]
        if caixa[2] - caixa[0] < 0.005 or caixa[3] - caixa[1] < 0.005:
            continue
        achadas.append({"caixa": caixa, "nota": round(float(notas[i, k]), 3), "consulta": consultas[k]})
    return nms(achadas)


def longe_da_pessoa(caixas: list[dict], pessoa: np.ndarray | None) -> list[dict]:
    """As caixas que não cobrem a pessoa nem são grandes demais (a parede inteira não é uma distração)."""
    saida = []
    for c in caixas:
        x0, y0, x1, y1 = c["caixa"]
        if (x1 - x0) * (y1 - y0) > AREA_MAXIMA:
            continue
        if pessoa is not None:
            h, w = pessoa.shape
            linhas = slice(int(y0 * h), max(int(y0 * h) + 1, int(y1 * h)))
            pedaco = pessoa[linhas, int(x0 * w):max(int(x0 * w) + 1, int(x1 * w))]
            if pedaco.size and float((pedaco > 0.5).mean()) > TOQUE_MAXIMO_NA_PESSOA:
                continue
        saida.append(c)
    return saida


def pessoa_protegida(pessoa: np.ndarray, rostos: list[list[float]], area_de_um_corpo: float = 0.12) -> np.ndarray:
    """Só as partes da máscara do MODNet que são gente: as que tocam um rosto (caixas x, y, largura, altura em
    pixels) ou, sem rosto na foto, as grandes como um corpo. O MODNet recorta o que está na frente, e uma lixeira
    perto da câmera saía como pessoa (81% da caixa dela)."""
    import cv2

    binaria = (pessoa > 0.5).astype(np.uint8)
    quantos, rotulos, estatisticas, _ = cv2.connectedComponentsWithStats(binaria, 8)
    h, w = pessoa.shape
    manter = set()
    for x, y, bw, bh in rostos:
        pedaco = rotulos[max(0, int(y)):int(y + bh), max(0, int(x)):int(x + bw)]
        manter |= {int(v) for v in np.unique(pedaco) if v}
    if not rostos:
        manter = {i for i in range(1, quantos) if estatisticas[i, cv2.CC_STAT_AREA] >= area_de_um_corpo * h * w}
    return pessoa * np.isin(rotulos, list(manter))

