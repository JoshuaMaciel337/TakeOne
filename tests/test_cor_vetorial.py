# A conta da cor em numpy (core/utils/cor_vetorial.py) é a mesma de core/utils/cor.py, ponto a ponto
import numpy as np
import pytest

from core.utils import cor, cor_vetorial
from core.utils.lut import LutImportada, aplicar_lut


def _ajustes_sorteados(semente: int) -> dict:
    r = np.random.default_rng(semente)
    a = {chave: float(r.uniform(*cor.LIMITES[chave])) for chave in cor.AJUSTES_NEUTROS}
    a["niveis_preto"], a["niveis_branco"] = float(r.uniform(0, 0.2)), float(r.uniform(0, 0.2))
    return a


@pytest.mark.parametrize("semente", range(6))
def test_aplicar_cor_igual(semente):
    a = _ajustes_sorteados(semente)
    if semente % 2:
        a["nevoa"] = -abs(a["nevoa"])
    rgb = np.random.default_rng(100 + semente).random((400, 3))
    esperado = np.array([cor.aplicar_cor(tuple(p), a) for p in rgb])
    assert np.abs(cor_vetorial.aplicar_cor(rgb, a) - esperado).max() < 1e-9


def test_hsl_e_curvas_iguais():
    r = np.random.default_rng(7)
    hsl = {nome: {"matiz": float(r.uniform(-1, 1)), "saturacao": float(r.uniform(-1, 1)),
                  "luminancia": float(r.uniform(-1, 1))} for nome, _ in cor.FAIXAS_DE_MATIZ[::2]}
    rgb = r.random((600, 3))
    # Cinzas e cores puras também (os casos de borda do matiz)
    rgb[:6] = [[0.5, 0.5, 0.5], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0.2, 0.2, 0.9]]
    esperado = np.array([cor.aplicar_hsl(tuple(p), hsl) for p in rgb])
    assert np.abs(cor_vetorial.aplicar_hsl(rgb, hsl) - esperado).max() < 1e-9
    curvas = {"rgb": [[0, 0.05], [0.3, 0.2], [0.7, 0.85], [1, 0.95]], "g": [[0, 0], [0.5, 0.6], [1, 1]]}
    esperado = np.array([cor.aplicar_curvas(tuple(p), curvas) for p in rgb])
    assert np.abs(cor_vetorial.aplicar_curvas(rgb, curvas) - esperado).max() < 1e-9


def test_lut_importada_e_a_grade_inteira_iguais():
    r = np.random.default_rng(3)
    lut = LutImportada(5, r.random((125, 3)).astype(np.float32), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))
    rgb = r.random((300, 3))
    esperado = np.array([aplicar_lut(tuple(p), lut, 0.7) for p in rgb])
    assert np.abs(cor_vetorial.aplicar_lut(rgb, lut, 0.7) - esperado).max() < 1e-6
    ajustes = {**cor.ajustes_efetivos({"filtro": "cinema", "exposicao": 0.3}),
               "curvas": {"rgb": [[0, 0], [0.5, 0.6], [1, 1]]}, "hsl": {"azul": {"matiz": 0.5}},
               "lut": {"id": "x", "intensidade": 0.5, "dados": lut}}
    linhas = [list(map(float, linha.split())) for linha in cor.gerar_cube(ajustes, pontos=7).splitlines()[2:]]
    assert np.abs(cor_vetorial.grade_da_cor(ajustes, pontos=7).reshape(-1, 3) - np.array(linhas)).max() < 2e-6
