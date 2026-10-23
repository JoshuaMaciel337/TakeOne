# -----------------------------------------------
# TakeOne — fotos com IA, na CPU: ampliar (Real-ESRGAN geral x4v3), expandir até outra proporção (LaMa) e a
# foto em 3D (a profundidade do Depth Anything V2 Small move as partes da foto em velocidades diferentes)
#
# Os três modelos são ONNX de licença aberta (BSD-3 e Apache-2.0) e rodam pelo onnxruntime no worker de CPU:
# - o Real-ESRGAN tem a entrada fixa de 128 × 128 e sai 4 vezes maior; a foto vai em blocos com uma sobra de
#   contexto em volta, e só o meio de cada bloco volta (as emendas não aparecem);
# - o LaMa (o mesmo do "apagar objeto") inventa a parte nova numa versão de 512 × 512 da foto expandida; essa
#   parte é ampliada pelo Real-ESRGAN e colada em volta da foto, que fica com a resolução dela;
# - o Depth Anything dá a disparidade (maior é mais perto) num tamanho múltiplo de 14, levada a 0..1 pelos
#   percentis. A câmera da foto em 3D é uma conta de mapa inverso (cv2.remap): cada pixel da saída busca na
#   foto o ponto que, movido pela profundidade dele, cai ali (três passos de ponto fixo).
# Sem os modelos (CI e modo simulado), as contas trocam o modelo por uma interpolação, um espelho borrado e um
# degradê de profundidade: o fluxo é o mesmo.
# -----------------------------------------------
import math
from collections.abc import Callable

import numpy as np
from PIL import Image, ImageFilter

from core.utils.objeto import LADO_DO_LAMA

# Ampliar
LADO_MAXIMO = 4096
BLOCO_DO_ESRGAN = 128
SOBRA_DO_ESRGAN = 12
FATORES = (2, 4)
# Expandir: a parte nova pode ter no máximo o dobro da foto
AREA_NOVA_MAXIMA = 2.0
EMENDA = 0.015          # a faixa da foto que se mistura com a parte nova, em frações do lado menor
# Profundidade
LADO_DA_PROFUNDIDADE = 518
MEDIA_IMAGENET = np.array([0.485, 0.456, 0.406], dtype=np.float32)
DESVIO_IMAGENET = np.array([0.229, 0.224, 0.225], dtype=np.float32)
# Foto em 3D
MOVIMENTOS = ("aproximar", "afastar", "lado", "circular")
LADO_MAXIMO_3D = 1920
FPS_3D = 30
ZOOM_DO_FUNDO = 0.06     # aproximar: o fundo cresce isto
ZOOM_DA_FRENTE = 0.16    # e a frente cresce isto a mais
PARALAXE = 0.035         # lado e circular: quanto a frente anda (fração da largura) em relação ao fundo
PASSOS_DO_MAPA = 3


def _rgb(imagem: Image.Image) -> np.ndarray:
    return np.asarray(imagem.convert("RGB"), dtype=np.float32) / 255


def _imagem(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(np.round(rgb * 255), 0, 255).astype(np.uint8), "RGB")


def tem_transparencia(imagem: Image.Image) -> bool:
    return imagem.mode in ("RGBA", "LA", "PA") and imagem.getchannel("A").getextrema()[0] < 255


# -----------------------------------------------
# Ampliar
# -----------------------------------------------
def ampliar_x4(rgb: np.ndarray, sessao, andamento: Callable[[float], None] | None = None) -> np.ndarray:
    """
    A imagem (altura × largura × 3, de 0 a 1) 4 vezes maior pelo modelo, em blocos de 128 com sobra em volta.
    andamento recebe a fração feita a cada linha de blocos.
    """
    altura, largura = rgb.shape[:2]
    passo = BLOCO_DO_ESRGAN - 2 * SOBRA_DO_ESRGAN
    linhas, colunas = math.ceil(altura / passo), math.ceil(largura / passo)
    # A sobra em volta e o que falta para o último bloco caber vêm do espelho da própria imagem
    fundo = SOBRA_DO_ESRGAN + linhas * passo + SOBRA_DO_ESRGAN - (SOBRA_DO_ESRGAN + altura)
    direita = SOBRA_DO_ESRGAN + colunas * passo + SOBRA_DO_ESRGAN - (SOBRA_DO_ESRGAN + largura)
    estendida = np.pad(rgb, ((SOBRA_DO_ESRGAN, fundo), (SOBRA_DO_ESRGAN, direita), (0, 0)), mode="symmetric")
    saida = np.zeros((linhas * passo * 4, colunas * passo * 4, 3), dtype=np.float32)
    nome = sessao.get_inputs()[0].name
    miolo = slice(4 * SOBRA_DO_ESRGAN, 4 * (SOBRA_DO_ESRGAN + passo))
    for i in range(linhas):
        for j in range(colunas):
            bloco = estendida[i * passo:i * passo + BLOCO_DO_ESRGAN, j * passo:j * passo + BLOCO_DO_ESRGAN]
            maior = sessao.run(None, {nome: bloco.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
            saida[i * passo * 4:(i + 1) * passo * 4, j * passo * 4:(j + 1) * passo * 4] = \
                maior.transpose(1, 2, 0)[miolo, miolo]
        if andamento:
            andamento((i + 1) / linhas)
    return np.clip(saida[:altura * 4, :largura * 4], 0, 1)


def tamanho_ampliado(largura: int, altura: int, fator: int) -> tuple[int, int]:
    """O tamanho da foto ampliada: `fator` vezes, sem passar de LADO_MAXIMO no lado maior."""
    escala = min(float(fator), LADO_MAXIMO / max(largura, altura))
    return max(1, round(largura * escala)), max(1, round(altura * escala))


def ampliar(imagem: Image.Image, fator: int, sessao=None,
            andamento: Callable[[float], None] | None = None) -> Image.Image:
    """A foto ampliada (2 ou 4 vezes, até LADO_MAXIMO). A transparência cresce pelo Lanczos."""
    alvo = tamanho_ampliado(imagem.width, imagem.height, fator)
    if sessao is not None:
        maior = _imagem(ampliar_x4(_rgb(imagem), sessao, andamento))
        resultado = maior if maior.size == alvo else maior.resize(alvo, Image.Resampling.LANCZOS)
    else:
        resultado = imagem.convert("RGB").resize(alvo, Image.Resampling.LANCZOS)
    if tem_transparencia(imagem):
        resultado = resultado.convert("RGBA")
        resultado.putalpha(imagem.getchannel("A").resize(alvo, Image.Resampling.LANCZOS))
    return resultado


# -----------------------------------------------
# Expandir
# -----------------------------------------------
def tamanho_expandido(largura: int, altura: int, proporcao: float) -> tuple[int, int]:
    """A tela da foto expandida até a proporção (largura / altura), com a foto inteira dentro."""
    if largura / altura < proporcao:
        return max(largura, round(altura * proporcao)), altura
    return largura, max(altura, round(largura / proporcao))


def conferir_expansao(largura: int, altura: int, proporcao: float) -> str | None:
    """Por que a expansão não dá (já está na proporção, ou a parte nova seria grande demais), ou None."""
    nova_l, nova_a = tamanho_expandido(largura, altura, proporcao)
    acrescimo = nova_l * nova_a / (largura * altura) - 1
    if acrescimo < 0.01:
        return "A foto já está nessa proporção."
    if acrescimo > AREA_NOVA_MAXIMA:
        return "A parte nova seria maior que o dobro da foto. Escolha uma proporção mais perto da dela."
    return None


def expandir(imagem: Image.Image, proporcao: float, sessao_lama=None, sessao_ampliar=None) -> Image.Image:
    """A foto no meio de uma tela da proporção pedida, com o que falta inventado em volta."""
    rgb = _rgb(imagem)
    altura, largura = rgb.shape[:2]
    nova_l, nova_a = tamanho_expandido(largura, altura, proporcao)
    x0, y0 = (nova_l - largura) // 2, (nova_a - altura) // 2
    tela = np.pad(rgb, ((y0, nova_a - altura - y0), (x0, nova_l - largura - x0), (0, 0)), mode="edge")
    nova = np.ones((nova_a, nova_l), dtype=bool)
    nova[y0:y0 + altura, x0:x0 + largura] = False
    if sessao_lama is not None:
        # A tela inteira cabe em 512 × 512 (o resto do quadrado também é buraco, e sai)
        escala = LADO_DO_LAMA / max(nova_l, nova_a)
        menor_l, menor_a = max(1, round(nova_l * escala)), max(1, round(nova_a * escala))
        quadrado = np.zeros((LADO_DO_LAMA, LADO_DO_LAMA, 3), dtype=np.float32)
        quadrado[:menor_a, :menor_l] = np.asarray(_imagem(tela).resize((menor_l, menor_a), Image.Resampling.BICUBIC),
                                                  dtype=np.float32) / 255
        buraco = np.ones((LADO_DO_LAMA, LADO_DO_LAMA), dtype=np.float32)
        reduzida = np.asarray(Image.fromarray(nova.astype(np.uint8) * 255).resize((menor_l, menor_a),
                                                                                    Image.Resampling.BILINEAR))
        buraco[:menor_a, :menor_l] = (reduzida > 0).astype(np.float32)
        saida = sessao_lama.run(None, {"image": quadrado.transpose(2, 0, 1)[None],
                                       "mask": buraco[None, None]})[0][0]
        inventada = np.clip(saida.transpose(1, 2, 0)[:menor_a, :menor_l] / 255, 0, 1)
        if sessao_ampliar is not None:
            inventada = ampliar_x4(inventada, sessao_ampliar)
        cheia = np.asarray(_imagem(inventada).resize((nova_l, nova_a), Image.Resampling.BICUBIC),
                           dtype=np.float32) / 255
    else:
        # Sem o modelo: as bordas da foto esticadas e borradas
        raio = max(4, min(nova_l, nova_a) // 24)
        cheia = np.asarray(_imagem(tela).filter(ImageFilter.GaussianBlur(raio)), dtype=np.float32) / 255
    # A emenda: a foto vai sumindo numa faixa estreita da borda dela, só onde há parte nova do lado
    faixa = max(2, round(EMENDA * min(largura, altura)))
    peso = np.zeros((nova_a, nova_l), dtype=np.float32)
    peso[nova] = 1
    borrado = np.asarray(Image.fromarray((peso * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(faixa / 2)),
                         dtype=np.float32) / 255
    peso = np.maximum(peso, np.clip(borrado * 2, 0, 1))
    resultado = tela * (1 - peso[..., None]) + cheia * peso[..., None]
    return _imagem(resultado)


# -----------------------------------------------
# Profundidade
# -----------------------------------------------
def _multiplo_de_14(valor: float) -> int:
    return max(14, int(round(valor / 14)) * 14)


def profundidade(imagem: Image.Image, sessao=None) -> np.ndarray:
    """A disparidade (0 longe, 1 perto) no tamanho da foto, levada a 0..1 pelos percentis 2 e 98."""
    largura, altura = imagem.size
    if sessao is None:
        # Simulado: o chão perto, embaixo, e o céu longe, em cima
        bruta = np.repeat(np.linspace(0, 1, altura, dtype=np.float32)[:, None], largura, axis=1)
    else:
        escala = LADO_DA_PROFUNDIDADE / max(largura, altura)
        entrada_l, entrada_a = _multiplo_de_14(largura * escala), _multiplo_de_14(altura * escala)
        rgb = np.asarray(imagem.convert("RGB").resize((entrada_l, entrada_a), Image.Resampling.BICUBIC),
                         dtype=np.float32) / 255
        normal = ((rgb - MEDIA_IMAGENET) / DESVIO_IMAGENET).transpose(2, 0, 1)[None].astype(np.float32)
        saida = sessao.run(None, {sessao.get_inputs()[0].name: normal})[0][0]
        bruta = np.asarray(Image.fromarray(saida.astype(np.float32), "F").resize((largura, altura),
                                                                                  Image.Resampling.BILINEAR))
    baixo, alto = np.percentile(bruta, 2), np.percentile(bruta, 98)
    return np.clip((bruta - baixo) / max(alto - baixo, 1e-6), 0, 1).astype(np.float32)


# -----------------------------------------------
# Foto em 3D
# -----------------------------------------------
def suave(p: float) -> float:
    """O andamento da câmera: começa e termina devagar."""
    p = min(1.0, max(0.0, p))
    return p * p * (3 - 2 * p)


def zoom_de_base(movimento: str) -> float:
    """O zoom fixo que esconde a borda da foto quando as partes andam para os lados."""
    return 1 + 2.2 * PARALAXE if movimento in ("lado", "circular") else 1.0


def deslocamento(movimento: str, p: float, disparidade: np.ndarray, foco: float, largura: int,
                 altura: int) -> tuple[np.ndarray | float, np.ndarray | float, np.ndarray | float]:
    """(escala, dx, dy) de cada ponto da foto no andamento p (0 a 1), pela disparidade dele."""
    if movimento in ("aproximar", "afastar"):
        e = suave(p) if movimento == "aproximar" else 1 - suave(p)
        return 1 + e * (ZOOM_DO_FUNDO + ZOOM_DA_FRENTE * disparidade), 0.0, 0.0
    relevo = disparidade - foco
    if movimento == "lado":
        u = math.cos(math.pi * suave(p))     # de 1 a -1: a câmera passa de um lado para o outro
        return zoom_de_base(movimento), PARALAXE * largura * u * relevo, 0.0
    angulo = 2 * math.pi * p
    raio = PARALAXE * largura
    return zoom_de_base(movimento), raio * math.cos(angulo) * relevo, raio * 0.6 * math.sin(angulo) * relevo


def mapa_3d(disparidade: np.ndarray, movimento: str, p: float, foco: float) -> tuple[np.ndarray, np.ndarray]:
    """
    O mapa inverso (onde ler na foto) do quadro no andamento p: o ponto q da foto vai para c + (q - c)·escala + d,
    e cada pixel da saída procura o q que cai nele, com a disparidade do q achado no passo anterior.
    """
    import cv2

    altura, largura = disparidade.shape
    cx, cy = (largura - 1) / 2, (altura - 1) / 2
    xs, ys = np.meshgrid(np.arange(largura, dtype=np.float32), np.arange(altura, dtype=np.float32))
    qx, qy = xs.copy(), ys.copy()
    for _ in range(PASSOS_DO_MAPA):
        d = cv2.remap(disparidade, qx, qy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        escala, dx, dy = deslocamento(movimento, p, d, foco, largura, altura)
        qx = (cx + (xs - dx - cx) / escala).astype(np.float32)
        qy = (cy + (ys - dy - cy) / escala).astype(np.float32)
    return qx, qy


def preparar_3d(imagem: Image.Image, disparidade: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """(foto em BGR uint8, disparidade suavizada, plano do foco) no tamanho do vídeo (lado maior até 1920, par)."""
    import cv2

    escala = min(1.0, LADO_MAXIMO_3D / max(imagem.size))
    largura = max(2, int(imagem.width * escala) // 2 * 2)
    altura = max(2, int(imagem.height * escala) // 2 * 2)
    foto = np.asarray(imagem.convert("RGB").resize((largura, altura), Image.Resampling.LANCZOS))[:, :, ::-1].copy()
    disp = cv2.resize(disparidade, (largura, altura), interpolation=cv2.INTER_LINEAR)
    # A borda da frente borrada, para a foto esticar em vez de rasgar onde a profundidade salta
    sigma = max(1.0, 0.006 * max(largura, altura))
    disp = cv2.GaussianBlur(disp, (0, 0), sigma)
    return foto, disp.astype(np.float32), float(np.median(disp))


def quadro_3d(foto: np.ndarray, disparidade: np.ndarray, foco: float, movimento: str, p: float) -> np.ndarray:
    """O quadro (BGR) da foto em 3D no andamento p."""
    import cv2

    qx, qy = mapa_3d(disparidade, movimento, p, foco)
    return cv2.remap(foto, qx, qy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
