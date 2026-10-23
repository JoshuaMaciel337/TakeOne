# LUTs importadas: a leitura do .cube, a interpolação tetraédrica e a entrada na LUT 3D dos ajustes.
# Os casos de tests/casos/lut.json saem daqui e o TypeScript (lib/projeto/lutImportada.ts) confere os mesmos.
import json
from pathlib import Path

import numpy as np
import pytest

from core.utils.cor import AJUSTES_NEUTROS, gerar_cube, nome_da_lut
from core.utils.lut import ErroLut, LutImportada, aplicar_lut, de_bytes, ler_cube, ler_lut, para_bytes

CASOS = Path(__file__).parent / "casos" / "lut.json"


def _cube(tamanho: int, funcao, cabecalho: str = "") -> str:
    linhas = [cabecalho, f"LUT_3D_SIZE {tamanho}"]
    passo = tamanho - 1
    for b in range(tamanho):
        for g in range(tamanho):
            for r in range(tamanho):
                linhas.append(" ".join(f"{v:.6f}" for v in funcao(r / passo, g / passo, b / passo)))
    return "\n".join(linhas) + "\n"


def lut_dos_casos() -> LutImportada:
    """Uma LUT de 5 pontos, torta o bastante para a interpolação importar (sorteio com semente fixa)."""
    gerador = np.random.default_rng(7)
    passo = np.linspace(0, 1, 5)
    b, g, r = np.meshgrid(passo, passo, passo, indexing="ij")
    base = np.stack([r, g, b], axis=-1).reshape(-1, 3)
    dados = np.clip(base ** 0.8 + gerador.normal(0, 0.06, base.shape), -0.1, 1.1).astype(np.float32)
    return LutImportada(5, dados, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))


def test_le_o_cube_com_titulo_comentarios_e_dominio():
    texto = _cube(3, lambda r, g, b: (1 - r, g, b), '# feito à mão\nTITLE "Inverter o vermelho"\nDOMAIN_MIN 0 0 0\n'
                                                   'DOMAIN_MAX 1 1 1')
    lut = ler_cube(texto)
    assert (lut.tamanho, lut.titulo, lut.dados.shape) == (3, "Inverter o vermelho", (27, 3))
    assert ler_lut(lut, (0.25, 0.5, 0.75)) == pytest.approx((0.75, 0.5, 0.75))
    copia = de_bytes(para_bytes(lut), 3)
    assert np.array_equal(copia.dados, lut.dados)


@pytest.mark.parametrize(("texto", "trecho"), [
    ("LUT_1D_SIZE 4\n0 0 0\n", "1D"),
    ("0 0 0\n", "LUT_3D_SIZE"),
    ("LUT_3D_SIZE 2\n0 0 0\n1 1 1\n", "8 linhas"),
    ("LUT_3D_SIZE 99\n", "de 2 a 65"),
    ("LUT_3D_SIZE 2\n" + "0 0 x\n" * 8, "não é número"),
])
def test_recusa_o_que_nao_e_uma_lut_3d(texto, trecho):
    with pytest.raises(ErroLut, match=trecho):
        ler_cube(texto)


def test_dominio_maior_le_a_entrada_na_escala_dele():
    lut = ler_cube(_cube(2, lambda r, g, b: (r, g, b), "DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2"))
    # 1,0 no meio do domínio de 0 a 2: a metade da tabela
    assert ler_lut(lut, (1.0, 0.5, 0.0)) == pytest.approx((0.5, 0.25, 0.0))


def test_intensidade_mistura_com_o_original_e_a_lut_vai_antes_dos_ajustes():
    inverter = ler_cube(_cube(2, lambda r, g, b: (1 - r, 1 - g, 1 - b)))
    assert aplicar_lut((0.2, 0.4, 0.6), inverter, 0.5) == pytest.approx((0.5, 0.5, 0.5))
    ajustes = {**AJUSTES_NEUTROS, "lut": {"id": "a" * 24, "intensidade": 1, "dados": inverter}}
    linhas = gerar_cube(ajustes, pontos=2).splitlines()
    assert linhas[2] == "1.000000 1.000000 1.000000" and linhas[-1] == "0.000000 0.000000 0.000000"
    outra = {**ajustes, "lut": {**ajustes["lut"], "intensidade": 0.5}}
    assert nome_da_lut(ajustes) != nome_da_lut(outra) != nome_da_lut(dict(AJUSTES_NEUTROS))


def test_casos_compartilhados_com_a_previa():
    # Os dados vão arredondados para o arquivo, e a conta usa os mesmos float32 que o TypeScript lê
    dados = [round(float(v), 6) for v in lut_dos_casos().dados.reshape(-1)]
    lut = LutImportada(5, np.asarray(dados, dtype=np.float32).reshape(-1, 3))
    pontos = [(0, 0, 0), (1, 1, 1), (0.1, 0.7, 0.3), (0.9, 0.2, 0.55), (0.5, 0.5, 0.5), (0.33, 0.66, 0.99),
              (0.71, 0.71, 0.2), (0.05, 0.95, 0.6)]
    casos = {"tamanho": 5, "dados": dados,
             "pontos": [{"entrada": list(p), "saida": [round(v, 9) for v in ler_lut(lut, p)],
                         "metade": [round(v, 9) for v in aplicar_lut(p, lut, 0.5)]} for p in pontos]}
    if not CASOS.exists():
        CASOS.write_text(json.dumps(casos, indent=1) + "\n", encoding="utf-8")
    guardados = json.loads(CASOS.read_text(encoding="utf-8"))
    lut = LutImportada(5, np.asarray(guardados["dados"], dtype=np.float32).reshape(-1, 3))
    for caso in guardados["pontos"]:
        assert ler_lut(lut, tuple(caso["entrada"])) == pytest.approx(caso["saida"], abs=1e-6)
        assert aplicar_lut(tuple(caso["entrada"]), lut, 0.5) == pytest.approx(caso["metade"], abs=1e-6)
