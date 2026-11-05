# O retoque de retrato (onda 16.8): cada controle mexe só na região dele e na direção certa
import numpy as np
import pytest

from core.utils import retoque

cv2 = pytest.importorskip("cv2")


def _pele(h=200, w=200, semente=1) -> np.ndarray:
    """Uma "pele" lisa com textura fina (poros), em float de 0 a 1."""
    r = np.random.default_rng(semente)
    base = np.ones((h, w, 3), np.float32) * np.float32([0.78, 0.6, 0.5])
    return np.clip(base + r.normal(0, 0.02, (h, w, 1)).astype(np.float32), 0, 1)


def _regiao(h=200, w=200, x0=40, x1=160) -> np.ndarray:
    m = np.zeros((h, w), np.float32)
    m[x0:x1, x0:x1] = 1
    return m


def test_filtro_guiado_preserva_bordas():
    guia = np.zeros((40, 40), np.float32)
    guia[:, 20:] = 1
    ruidosa = guia + np.random.default_rng(0).normal(0, 0.05, guia.shape).astype(np.float32)
    saida = retoque.filtro_guiado(guia, ruidosa, 3, 1e-4)
    assert saida[:, :18].std() < ruidosa[:, :18].std() / 2 and saida[:, 22:].mean() > 0.9 and saida[:, :18].mean() < 0.1


def test_suavizar_so_na_regiao_e_guarda_um_pouco_de_textura():
    pele = _pele()
    regiao = _regiao()
    lisa = retoque.suavizar(pele, regiao, 1.0, 4)
    dentro, fora = (slice(60, 140), slice(60, 140)), (slice(0, 30), slice(0, 30))
    antes, depois = pele[dentro][..., 0].std(), lisa[dentro][..., 0].std()
    assert antes * 0.1 < depois < antes * 0.75
    assert np.array_equal(lisa[fora], pele[fora])


def test_manchas_some_e_o_resto_fica():
    pele = _pele()
    cv2.circle(pele, (100, 100), 3, (0.45, 0.3, 0.25), -1)
    regiao = _regiao()
    limpa = retoque.manchas(pele, regiao, 0.8, largura_do_rosto=300)
    assert limpa[100, 100, 0] > 0.7
    assert np.abs(limpa[50:80, 50:80] - pele[50:80, 50:80]).max() < 0.02


def test_olheiras_dentes_brilho_e_uniformizar():
    pele = _pele()
    regiao = _regiao()
    # Olheiras: a faixa escura sobe até a luz da pele
    escura = pele.copy()
    escura[110:130, 60:140] *= 0.7
    faixa = np.zeros((200, 200), np.float32)
    faixa[110:130, 60:140] = 1
    clara = retoque.olheiras(escura, faixa, regiao * (1 - faixa), 1.0)
    assert clara[120, 100].mean() > escura[120, 100].mean() + 0.08
    # Dentes: amarelos ficam menos amarelos (b do Lab) e mais claros
    amarelo = np.ones((60, 60, 3), np.float32) * np.float32([0.85, 0.8, 0.55])
    boca = np.ones((60, 60), np.float32)
    brancos = retoque.dentes(amarelo, boca, 1.0)
    lab_antes, lab_depois = (cv2.cvtColor(x, cv2.COLOR_RGB2LAB)[30, 30] for x in (amarelo, brancos))
    assert lab_depois[2] < lab_antes[2] - 15 and lab_depois[0] >= lab_antes[0]
    # Brilho: o ponto estourado da pele volta para perto da pele em volta
    oleosa = pele.copy()
    cv2.circle(oleosa, (100, 100), 8, (0.97, 0.9, 0.85), -1)
    fosca = retoque.brilho(oleosa, regiao, 1.0, largura_do_rosto=200)
    assert fosca[100, 100].mean() < oleosa[100, 100].mean() - 0.05
    # Uniformizar: uma mancha vermelha grande na pele chega mais perto da cor do resto
    vermelha = pele.copy()
    vermelha[70:100, 70:100] = np.float32([0.85, 0.45, 0.42])
    uniforme = retoque.uniformizar(vermelha, regiao, 1.0, largura_do_rosto=200)
    a = [cv2.cvtColor(x, cv2.COLOR_RGB2LAB)[85, 85, 1] for x in (vermelha, uniforme)]
    assert a[1] < a[0] - 5


def test_regioes_do_rosto_pelos_pontos():
    # Um rosto de mentira: os 478 pontos num círculo, com os olhos, a boca e as íris nos lugares
    pontos = np.zeros((478, 2), np.float32)
    centro, raio = np.float32([200, 200]), 120
    for k, i in enumerate(retoque.CONTORNO):
        angulo = 2 * np.pi * k / len(retoque.CONTORNO) - np.pi / 2
        pontos[i] = centro + raio * np.float32([np.cos(angulo), np.sin(angulo)])
    for indices, cx in ((retoque.OLHO_DIR, 150), (retoque.OLHO_ESQ, 250)):
        for k, i in enumerate(indices):
            angulo = 2 * np.pi * k / len(indices)
            pontos[i] = [cx + 22 * np.cos(angulo), 170 + 8 * np.sin(angulo)]
    for indices, cx in ((retoque.SOBRANCELHA_DIR, 150), (retoque.SOBRANCELHA_ESQ, 250)):
        for k, i in enumerate(indices):
            pontos[i] = [cx - 25 + 50 * k / (len(indices) - 1), 140 + (3 if k % 2 else 0)]
    for indices, ry in ((retoque.LABIOS, 14), (retoque.BOCA_POR_DENTRO, 6)):
        for k, i in enumerate(indices):
            angulo = 2 * np.pi * k / len(indices)
            pontos[i] = [200 + 35 * np.cos(angulo), 260 + ry * np.sin(angulo)]
    for iris, cx in ((retoque.IRIS_DIR, 150), (retoque.IRIS_ESQ, 250)):
        pontos[iris[0]] = [cx, 170]
        for k, i in enumerate(iris[1:]):
            pontos[i] = [cx + 6 * np.cos(k * np.pi / 2), 170 + 6 * np.sin(k * np.pi / 2)]
    for i, p in ((129, (175, 220)), (61, (165, 260)), (358, (225, 220)), (291, (235, 260))):
        pontos[i] = p
    regioes = retoque.regioes_do_rosto((400, 400), pontos)
    pele, olhos, iris, boca = regioes["pele"], regioes["olhos"], regioes["iris"], regioes["boca"]
    # A bochecha é pele; o olho, a boca e a íris não
    assert pele[220, 120] > 0.9 and pele[170, 150] < 0.1 and pele[260, 200] < 0.1
    assert olhos[170, 135] > 0.9 and iris[170, 150] > 0.9 and olhos[170, 150] < 0.1
    assert boca[260, 200] > 0.9 and regioes["olheiras"][185, 150] > 0.2 and regioes["rugas"][100, 200] > 0.3


def test_pincel_e_retocar_sem_nada():
    incluir, excluir = retoque.aplicar_pincel((100, 100), [{"modo": "incluir", "raio": 0.05, "pontos": [[0.2, 0.2],
                                                                                                         [0.8, 0.2]]},
                                                           {"modo": "excluir", "raio": 0.05, "pontos": [[0.5, 0.8]]}])
    assert incluir[20, 50] > 0.9 and incluir[80, 50] == 0 and excluir[80, 50] > 0.9
    foto = (np.random.default_rng(1).random((50, 50, 3)) * 255).astype(np.uint8)
    assert retoque.retocar_com_regioes(foto, {}, [], None, None) is foto
