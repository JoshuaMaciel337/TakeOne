# Fotos com IA: os blocos do ampliar emendam sem sobra, a expansão guarda a foto no meio, a profundidade vai a
# 0..1 e o mapa da foto em 3D é a conta da câmera (as sessões dos modelos são trocadas por contas conhecidas)
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from core.utils.foto_ia import (
    AREA_NOVA_MAXIMA,
    LADO_MAXIMO,
    ZOOM_DA_FRENTE,
    ZOOM_DO_FUNDO,
    ampliar,
    ampliar_x4,
    conferir_expansao,
    expandir,
    mapa_3d,
    preparar_3d,
    profundidade,
    quadro_3d,
    tamanho_ampliado,
    tamanho_expandido,
    zoom_de_base,
)

cv2 = pytest.importorskip("cv2")


class SessaoFalsa:
    """Uma sessão do onnxruntime com uma conta no lugar do modelo; guarda os tamanhos que recebeu."""

    def __init__(self, conta, nome="image"):
        self.conta, self.nome, self.recebidos = conta, nome, []

    def get_inputs(self):
        return [SimpleNamespace(name=self.nome)]

    def run(self, _saidas, entradas):
        valor = next(iter(entradas.values()))
        self.recebidos.append(valor.shape)
        return [self.conta(valor)]


def foto_sorteada(largura, altura, semente=1):
    return np.random.default_rng(semente).random((altura, largura, 3), dtype=np.float32)


def test_ampliar_em_blocos_emenda_igual_a_imagem_inteira():
    # O "modelo" repete cada pixel 4 vezes: o resultado tem de ser a imagem inteira repetida, sem emenda
    vizinho = SessaoFalsa(lambda x: x.repeat(4, axis=2).repeat(4, axis=3))
    rgb = foto_sorteada(250, 133)
    saida = ampliar_x4(rgb, vizinho)
    assert saida.shape == (532, 1000, 3)
    assert np.array_equal(saida, rgb.repeat(4, axis=0).repeat(4, axis=1))
    assert all(forma == (1, 3, 128, 128) for forma in vizinho.recebidos), "o modelo só aceita 128 × 128"


def test_ampliar_respeita_o_lado_maximo_e_guarda_a_transparencia():
    assert tamanho_ampliado(1000, 500, 2) == (2000, 1000)
    assert tamanho_ampliado(1500, 500, 4) == (LADO_MAXIMO, round(500 * LADO_MAXIMO / 1500))
    logo = Image.new("RGBA", (40, 20), (255, 0, 0, 0))
    logo.paste((255, 0, 0, 255), (10, 5, 30, 15))
    maior = ampliar(logo, 2)
    assert maior.size == (80, 40) and maior.mode == "RGBA"
    assert maior.getpixel((0, 0))[3] == 0 and maior.getpixel((40, 20))[3] == 255


def test_expandir_poe_a_foto_no_meio_da_proporcao_pedida():
    assert tamanho_expandido(1600, 900, 9 / 16) == (1600, 2844)
    assert tamanho_expandido(900, 1600, 1.0) == (1600, 1600)
    assert conferir_expansao(1600, 900, 16 / 9) == "A foto já está nessa proporção."
    assert "dobro" in conferir_expansao(1600, 900, 9 / 16), f"9:16 de uma foto deitada passa de {AREA_NOVA_MAXIMA}×"
    assert conferir_expansao(1600, 900, 1.0) is None
    rgb = (foto_sorteada(160, 90) * 255).astype(np.uint8)
    # O "LaMa" pinta tudo de cinza e devolve no formato dele (0 a 255)
    lama = SessaoFalsa(lambda x: np.full((1, 3, 512, 512), 128, dtype=np.float32))
    saida = np.asarray(expandir(Image.fromarray(rgb), 1.0, lama))
    assert saida.shape == (160, 160, 3)
    topo = (160 - 90) // 2
    # A foto continua igual longe da emenda, e a parte nova é a do modelo
    assert np.array_equal(saida[topo + 10:topo + 80, 10:150], rgb[10:80, 10:150])
    assert np.abs(saida[:topo - 4].astype(int) - 128).max() <= 1
    assert lama.recebidos == [(1, 3, 512, 512)]


def test_profundidade_vai_de_zero_a_um_no_tamanho_da_foto():
    foto = Image.new("RGB", (300, 200))
    simulada = profundidade(foto)
    assert simulada.shape == (200, 300) and simulada[0].max() == 0 and simulada[-1].min() == 1
    # O modelo devolve a disparidade num tamanho múltiplo de 14; a esquerda mais perto
    rampa = SessaoFalsa(lambda x: np.repeat(np.linspace(9, 1, x.shape[3], dtype=np.float32)[None, None], x.shape[2],
                                            axis=1), nome="pixel_values")
    medida = profundidade(foto, rampa)
    assert rampa.recebidos[0][2] % 14 == 0 and rampa.recebidos[0][3] % 14 == 0
    assert rampa.recebidos[0][3] == 518, "o lado maior vai a 518"
    assert medida.shape == (200, 300) and medida[:, 0].min() == 1 and medida[:, -1].max() == 0


def test_mapa_da_foto_em_3d_e_a_conta_da_camera():
    altura, largura = 60, 80
    plana = np.full((altura, largura), 0.5, dtype=np.float32)
    xs, ys = np.meshgrid(np.arange(largura, dtype=np.float32), np.arange(altura, dtype=np.float32))
    cx, cy = (largura - 1) / 2, (altura - 1) / 2
    # No começo do aproximar, a foto como está
    qx, qy = mapa_3d(plana, "aproximar", 0.0, 0.5)
    assert np.allclose(qx, xs) and np.allclose(qy, ys)
    # No fim, numa foto plana, um zoom só: o fundo mais metade da frente
    escala = 1 + ZOOM_DO_FUNDO + ZOOM_DA_FRENTE * 0.5
    qx, qy = mapa_3d(plana, "aproximar", 1.0, 0.5)
    assert np.allclose(qx, cx + (xs - cx) / escala, atol=1e-4) and np.allclose(qy, cy + (ys - cy) / escala, atol=1e-4)
    # Para o lado, o que está no plano do foco não anda: só o zoom que esconde a borda
    qx, _ = mapa_3d(plana, "lado", 0.3, 0.5)
    assert np.allclose(qx, cx + (xs - cx) / zoom_de_base("lado"), atol=1e-4)
    # O que está mais perto que o foco anda mais que o fundo, e para lados opostos
    degrau = np.where(xs < largura / 2, 0.0, 1.0).astype(np.float32)
    qx, _ = mapa_3d(degrau, "lado", 0.0, 0.5)
    base = cx + (xs - cx) / zoom_de_base("lado")
    assert (qx[:, 5] - base[:, 5]).mean() > 0 > (qx[:, -5] - base[:, -5]).mean()


def test_quadro_da_foto_em_3d_tem_o_tamanho_par_e_nao_mostra_borda():
    foto = Image.fromarray((foto_sorteada(401, 301) * 255).astype(np.uint8))
    imagem, disp, foco = preparar_3d(foto, profundidade(foto))
    assert imagem.shape == (300, 400, 3) and disp.shape == (300, 400)
    for movimento in ("aproximar", "afastar", "lado", "circular"):
        for p in (0.0, 0.5, 1.0):
            qx, qy = mapa_3d(disp, movimento, p, foco)
            assert qx.min() >= -0.5 and qx.max() <= 399.5 and qy.min() >= -0.5 and qy.max() <= 299.5, (movimento, p)
        assert quadro_3d(imagem, disp, foco, movimento, 0.5).shape == (300, 400, 3)
