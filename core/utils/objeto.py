# -----------------------------------------------
# TakeOne — objetos numa foto: a seleção com um clique (MobileSAM) e o que se faz com ela (apagar com o
# LaMa ou recortar com o fundo transparente)
#
# O MobileSAM (MIT) tem duas partes em ONNX: o codificador, que roda uma vez por foto (uns 1,2 s na CPU) e cujo
# resultado fica guardado, e o decodificador, que transforma os cliques numa máscara (uns 0,1 s). O LaMa (Apache-2.0,
# entrada fixa de 512 × 512) apaga o que a máscara cobre: ele trabalha num recorte quadrado em volta da máscara,
# para o pedaço refeito não perder a resolução da foto, e só a parte mascarada (com a borda suavizada) volta.
# -----------------------------------------------
import numpy as np
from PIL import Image, ImageFilter

LADO_DO_SAM = 1024
LADO_DO_LAMA = 512
# Folga em volta da máscara no recorte do LaMa: ele precisa de contexto para inventar o que fica atrás
FOLGA_DO_LAMA = 0.6
DILATAR_PX = 6
SUAVIZAR_PX = 3


def imagem_para_o_sam(imagem: Image.Image) -> tuple[np.ndarray, float]:
    """A foto com o lado maior em 1024 (HWC, float de 0 a 255), como o codificador pede, e a escala usada."""
    rgb = imagem.convert("RGB")
    escala = LADO_DO_SAM / max(rgb.size)
    reduzida = rgb.resize((max(1, round(rgb.width * escala)), max(1, round(rgb.height * escala))),
                          Image.Resampling.BILINEAR)
    return np.asarray(reduzida, dtype=np.float32), escala


def mascara_dos_pontos(decodificador, embedding: np.ndarray, pontos: list[list[float]], largura: int,
                       altura: int) -> np.ndarray:
    """
    A máscara (bool, altura × largura) dos cliques. pontos: [x, y, incluir] com x e y em frações da foto; o
    ponto de preenchimento (0, 0, -1) vai no fim, como o SAM pede quando não há caixa.
    """
    escala = LADO_DO_SAM / max(largura, altura)
    coordenadas = [[x * largura * escala, y * altura * escala] for x, y, _ in pontos] + [[0.0, 0.0]]
    rotulos = [1.0 if incluir else 0.0 for _, _, incluir in pontos] + [-1.0]
    mascaras, _, _ = decodificador.run(None, {
        "image_embeddings": embedding,
        "point_coords": np.array([coordenadas], dtype=np.float32),
        "point_labels": np.array([rotulos], dtype=np.float32),
        "mask_input": np.zeros((1, 1, 256, 256), dtype=np.float32),
        "has_mask_input": np.zeros(1, dtype=np.float32),
        "orig_im_size": np.array([altura, largura], dtype=np.float32),
    })
    return mascaras[0, 0] > 0


def mascara_simulada(pontos: list[list[float]], largura: int, altura: int) -> np.ndarray:
    """Sem o modelo (CI e modo simulado): um círculo em volta de cada ponto de incluir, menos os de excluir."""
    yy, xx = np.mgrid[0:altura, 0:largura]
    raio = 0.12 * min(largura, altura)
    mascara = np.zeros((altura, largura), dtype=bool)
    for x, y, incluir in pontos:
        circulo = (xx - x * largura) ** 2 + (yy - y * altura) ** 2 <= raio ** 2
        mascara = mascara | circulo if incluir else mascara & ~circulo
    return mascara


def _borda_suave(mascara: np.ndarray, dilatar: int, suavizar: int) -> np.ndarray:
    """A máscara um pouco maior e com a borda suave (0 a 1), para a emenda não aparecer."""
    imagem = Image.fromarray((mascara * 255).astype(np.uint8), "L")
    if dilatar:
        imagem = imagem.filter(ImageFilter.MaxFilter(2 * dilatar + 1))
    if suavizar:
        imagem = imagem.filter(ImageFilter.GaussianBlur(suavizar))
    return np.asarray(imagem, dtype=np.float32) / 255


def caixa_do_lama(mascara: np.ndarray) -> tuple[int, int, int, int] | None:
    """O recorte quadrado (x0, y0, x1, y1) em volta da máscara, com folga, dentro da foto; None sem máscara."""
    linhas, colunas = np.nonzero(mascara)
    if not len(linhas):
        return None
    altura, largura = mascara.shape
    y0, y1, x0, x1 = linhas.min(), linhas.max() + 1, colunas.min(), colunas.max() + 1
    lado = int(max(y1 - y0, x1 - x0) * (1 + 2 * FOLGA_DO_LAMA)) + 32
    lado = min(max(lado, LADO_DO_LAMA // 2), max(largura, altura))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    lx, ly = min(lado, largura), min(lado, altura)
    ex = int(round(min(max(cx - lx / 2, 0), largura - lx)))
    ey = int(round(min(max(cy - ly / 2, 0), altura - ly)))
    return ex, ey, ex + lx, ey + ly


def apagar(imagem: Image.Image, mascara: np.ndarray, sessao=None) -> Image.Image:
    """
    A foto sem o que a máscara cobre. Com a sessão do LaMa, o recorte em volta da máscara vai a 512 × 512, volta ao
    tamanho dele e só a parte mascarada é colada. Sem o modelo, o buraco fica com a cor média de volta dele.
    """
    rgb = np.asarray(imagem.convert("RGB"), dtype=np.float32)
    caixa = caixa_do_lama(mascara)
    if caixa is None:
        return imagem.convert("RGB")
    x0, y0, x1, y1 = caixa
    pedaco = rgb[y0:y1, x0:x1]
    buraco = _borda_suave(mascara[y0:y1, x0:x1], DILATAR_PX, 0) > 0.5
    if sessao is not None:
        entrada = np.asarray(Image.fromarray(pedaco.astype(np.uint8)).resize((LADO_DO_LAMA, LADO_DO_LAMA),
                                                                             Image.Resampling.BICUBIC),
                             dtype=np.float32) / 255
        mascara_lama = np.asarray(Image.fromarray((buraco * 255).astype(np.uint8)).resize(
            (LADO_DO_LAMA, LADO_DO_LAMA), Image.Resampling.NEAREST), dtype=np.float32) / 255
        saida = sessao.run(None, {"image": entrada.transpose(2, 0, 1)[None],
                                  "mask": (mascara_lama > 0.5).astype(np.float32)[None, None]})[0][0]
        refeito = np.clip(saida.transpose(1, 2, 0), 0, 255).astype(np.uint8)
        refeito = np.asarray(Image.fromarray(refeito).resize((x1 - x0, y1 - y0), Image.Resampling.BICUBIC),
                             dtype=np.float32)
    else:
        # O buraco com a cor média de volta dele, borrado para emendar
        em_volta = pedaco[~buraco].mean(axis=0) if (~buraco).any() else pedaco.mean(axis=(0, 1))
        cheio = np.where(buraco[..., None], em_volta, pedaco)
        borrado = Image.fromarray(np.clip(cheio, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(max(4, (x1 - x0) // 16)))
        refeito = np.asarray(borrado, dtype=np.float32)
    peso = _borda_suave(buraco, 0, SUAVIZAR_PX)[..., None]
    resultado = rgb.copy()
    resultado[y0:y1, x0:x1] = pedaco * (1 - peso) + refeito * peso
    return Image.fromarray(np.clip(np.round(resultado), 0, 255).astype(np.uint8), "RGB")


def recortar(imagem: Image.Image, mascara: np.ndarray) -> Image.Image | None:
    """
    O objeto com o fundo transparente, no tamanho da foto (assim a camada nova cai em cima da original, no mesmo
    lugar); None sem máscara.
    """
    if not mascara.any():
        return None
    rgba = imagem.convert("RGBA")
    alfa = np.asarray(rgba.getchannel("A"), dtype=np.float32) / 255 * _borda_suave(mascara, 0, 1)
    rgba.putalpha(Image.fromarray(np.round(alfa * 255).astype(np.uint8), "L"))
    return rgba
