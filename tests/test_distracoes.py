# As distrações das fotos do álbum (onda 16.9): as contas em volta do detector
import numpy as np
import pytest

from core.utils.distracoes import entrada_da_imagem, longe_da_pessoa, nms, pessoa_protegida

cv2 = pytest.importorskip("cv2")


def test_nms_e_entrada():
    caixas = [{"caixa": [0, 0, 0.5, 0.5], "nota": 0.3}, {"caixa": [0.05, 0, 0.5, 0.5], "nota": 0.6},
              {"caixa": [0.6, 0.6, 0.9, 0.9], "nota": 0.2}]
    assert [c["nota"] for c in nms(caixas)] == [0.6, 0.2]
    pixels, escala = entrada_da_imagem(np.zeros((400, 800, 3), np.uint8))
    assert pixels.shape == (1, 3, 768, 768) and escala == pytest.approx(768 / 800)


def test_pessoa_protegida_e_caixas_longe_dela():
    pessoa = np.zeros((100, 100), np.float32)
    pessoa[20:90, 10:40] = 1   # o corpo, com o rosto em cima
    pessoa[10:25, 70:85] = 1   # uma lixeira que o MODNet também recortou
    protegida = pessoa_protegida(pessoa, [[15, 20, 20, 15]])
    assert protegida[50, 20] == 1 and protegida[15, 75] == 0
    # Sem rosto, só o que é grande como um corpo
    assert pessoa_protegida(pessoa, [])[15, 75] == 0 and pessoa_protegida(pessoa, [])[50, 20] == 1
    caixas = [{"caixa": [0.7, 0.1, 0.85, 0.25]}, {"caixa": [0.1, 0.3, 0.4, 0.6]}, {"caixa": [0, 0, 1, 0.5]}]
    # A da lixeira fica; a que cobre a pessoa e a grande demais saem
    assert longe_da_pessoa(caixas, protegida) == [caixas[0]]
