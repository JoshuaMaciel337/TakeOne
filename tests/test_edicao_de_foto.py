# A edição das fotos do álbum (onda 16.5): a mesma cor do render, igualar, girar, recortar e endireitar sozinho
import numpy as np
import pytest

from core.utils.cor import ajustes_efetivos, gerar_cube
from core.utils.edicao_de_foto import (
    editar,
    endireitar_automatico,
    estatisticas,
    girar,
    grade_da_cor,
    igualar,
    ler_grade,
    recorte_automatico,
    zoom_do_giro,
)
from core.utils.lut import LutImportada, ler_lut

cv2 = pytest.importorskip("cv2")


def _foto(semente: int = 3, h: int = 120, w: int = 180) -> np.ndarray:
    r = np.random.default_rng(semente)
    base = cv2.resize(r.integers(0, 255, (6, 9, 3), dtype=np.uint8), (w, h), interpolation=cv2.INTER_CUBIC)
    return base


def test_a_grade_e_a_do_render_e_a_leitura_e_a_do_lut3d():
    cor = {"exposicao": 0.4, "contraste": 0.3, "saturacao": -0.2, "filtro": "quente", "intensidade": 0.8,
           "curvas": {"rgb": [[0, 0], [0.5, 0.6], [1, 1]]}}
    ajustes = {**ajustes_efetivos(cor), "curvas": cor["curvas"], "hsl": None, "lut": None}
    grade = grade_da_cor(ajustes, pontos=9)
    cube = gerar_cube(ajustes, pontos=9)
    linhas = [list(map(float, linha.split())) for linha in cube.splitlines()[2:]]
    assert np.allclose(grade.reshape(-1, 3), np.asarray(linhas), atol=1e-5)
    # A leitura em numpy é a de ler_lut (a do lut3d do FFmpeg) em cada pixel
    lut = LutImportada(9, grade.reshape(-1, 3), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))
    pixels = np.random.default_rng(1).random((50, 3)).astype(np.float32)
    lidos = ler_grade(pixels[None], grade)[0]
    esperados = np.asarray([ler_lut(lut, tuple(map(float, p))) for p in pixels])
    assert np.abs(lidos - esperados).max() < 1e-5


def test_editar_sem_nada_e_com_cor():
    foto = _foto()
    assert editar(foto, None) is foto
    assert np.array_equal(editar(foto, {"cor": {"exposicao": 0}}), foto)
    clara = editar(foto, {"cor": {"exposicao": 0.8}})
    assert clara.shape == foto.shape and clara.mean() > foto.mean() + 15
    # A vinheta escurece os cantos e quase não mexe no meio
    com_vinheta = editar(np.full((100, 100, 3), 200, np.uint8), {"cor": {"vinheta": 1}})
    assert com_vinheta[0, 0, 0] < 60 and com_vinheta[50, 50, 0] >= 199


def test_igualar_leva_a_media_e_o_desvio_da_referencia():
    foto = _foto(1).astype(np.float32) / 255
    referencia = np.clip(_foto(9).astype(np.float32) / 255 * 0.6 + np.float32([0.3, 0.1, 0.0]), 0, 1)
    alvo, ref = estatisticas(foto), estatisticas(referencia)
    depois = estatisticas(igualar(foto, alvo, ref))
    assert np.allclose(depois["media"], ref["media"], atol=0.02)
    assert abs(depois["desvio"][0] - ref["desvio"][0]) < 0.02


def test_girar_cobre_o_quadro_e_recortar():
    assert zoom_do_giro(300, 200, 0) == 1
    assert zoom_do_giro(300, 200, 10) > 1.2
    foto = np.full((200, 300, 3), 255, np.uint8)
    girada = girar(foto, 7)
    # Sem canto vazio: a borda refletida também é branca, e nada escuro entra
    assert girada.shape == foto.shape and girada.min() > 250
    cortada = editar(foto, {"recorte": {"x": 0.25, "y": 0, "largura": 0.5, "altura": 1}})
    assert cortada.shape == (200, 150, 3)


def test_recorte_automatico_pelos_rostos():
    # Foto deitada, quadrado: sem rostos no meio; com um rosto à esquerda, o recorte vai até a borda esquerda
    assert recorte_automatico(3000, 2000, "1:1", []) == {"x": 0.16667, "y": 0.0, "largura": 0.66667, "altura": 1.0}
    rosto = {"caixa": [0.05, 0.2, 0.1, 0.15]}
    assert recorte_automatico(3000, 2000, "1:1", [rosto])["x"] == 0.0
    # Em pé (4:5) numa deitada: a altura inteira
    assert recorte_automatico(3000, 2000, "4:5", [])["altura"] == 1.0
    assert recorte_automatico(3000, 2000, "original", []) is None
    # Numa foto em pé, 16:9: o rosto no alto puxa o recorte para cima
    alto = recorte_automatico(2000, 3000, "16:9", [{"caixa": [0.4, 0.1, 0.2, 0.12]}])
    assert alto["y"] < 0.1


def test_endireitar_sozinho():
    foto = np.full((600, 900, 3), 40, np.uint8)
    # Um horizonte e retas paralelas inclinadas 4° (descendo para a direita)
    inclinacao = np.tan(np.radians(4))
    for y0 in (150, 250, 350, 450):
        cv2.line(foto, (0, y0), (899, int(y0 + 899 * inclinacao)), (230, 230, 230), 3)
    giro = endireitar_automatico(foto)
    assert abs(giro + 4) < 0.5
    # Girada pelo que ela pediu, a foto fica reta
    assert abs(endireitar_automatico(girar(foto, giro))) < 0.5
    # Sem retas, nada
    assert endireitar_automatico(_foto()) == 0.0
