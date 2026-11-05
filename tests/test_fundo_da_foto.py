# A troca do fundo das fotos do álbum (onda 16.9): a pessoa fica, o fundo muda e a sombra cai no fundo novo
import numpy as np
import pytest

from core.utils.fundo_da_foto import cobrir, sombra, trocar_fundo

cv2 = pytest.importorskip("cv2")


def _foto():
    rgb = np.full((200, 300, 3), (40, 120, 40), np.uint8)
    pessoa = np.zeros((200, 300), np.float32)
    cv2.ellipse(pessoa, (150, 120), (40, 80), 0, 0, 360, 1.0, -1)
    rgb[pessoa > 0.5] = (200, 150, 120)
    return rgb, pessoa


def test_cor_e_pessoa():
    rgb, pessoa = _foto()
    saida = trocar_fundo(rgb, pessoa, {"tipo": "cor", "cor": "#ffffff"})
    assert saida[10, 10].tolist() == [255, 255, 255] and saida[120, 150].tolist() == [200, 150, 120]


def test_sombra_escurece_so_o_fundo_na_direcao():
    rgb, pessoa = _foto()
    com = trocar_fundo(rgb, pessoa, {"tipo": "cor", "cor": "#ffffff",
                                     "sombra": {"opacidade": 0.6, "desfoque": 0.01, "distancia": 0.1, "direcao": 0}})
    # A sombra vai para a direita (0°): à direita da pessoa escurece, à esquerda não
    assert com[120, 205].mean() < 200 and com[120, 95].mean() > 250
    assert com[120, 150].tolist() == [200, 150, 120]
    assert sombra(pessoa, {"opacidade": 0}).max() == 0


def test_desfoque_degrade_e_imagem():
    rgb, pessoa = _foto()
    desfocada = trocar_fundo(rgb, pessoa, {"tipo": "desfoque", "desfoque": 1})
    assert desfocada[120, 150].tolist() == [200, 150, 120]
    degrade = trocar_fundo(rgb, pessoa, {"tipo": "degrade", "cor": "#808080"})
    assert degrade[90, 150 - 70].mean() > degrade[2, 2].mean()
    outra = np.zeros((50, 400, 3), np.uint8)
    outra[:, 200:] = 255
    assert cobrir(outra, 300, 200).shape == (200, 300, 3)
    com_imagem = trocar_fundo(rgb, pessoa, {"tipo": "imagem"}, outra)
    assert com_imagem[10, 10].mean() < 10 and com_imagem[10, 290].mean() > 245
