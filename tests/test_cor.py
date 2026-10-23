# Ajustes de cor do render: a referência dos casos, a LUT para o FFmpeg e a imagem da vinheta
import json
from pathlib import Path

import pytest

from core.utils.cor import (
    AJUSTES_NEUTROS,
    ajustes_efetivos,
    aplicar_cor,
    aplicar_curvas,
    curvas_neutras,
    desenhar_vinheta,
    escurecimento_da_vinheta,
    gerar_cube,
    nome_da_lut,
    valor_da_curva,
)

DADOS = json.loads((Path(__file__).parent / "casos" / "cor.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("caso", DADOS["casos"], ids=[c["nome"] for c in DADOS["casos"]])
def test_casos_compartilhados_com_a_previa(caso):
    saida = aplicar_cor(tuple(caso["entrada"]), {**AJUSTES_NEUTROS, **caso["ajustes"]})
    assert saida == pytest.approx(caso["saida"], abs=1e-6)


def test_conferido_a_mao():
    assert aplicar_cor((0.2, 0.4, 0.6), AJUSTES_NEUTROS) == pytest.approx((0.2, 0.4, 0.6), abs=1e-12)
    cinza = 0.2126 * 0.2 + 0.7152 * 0.4 + 0.0722 * 0.6
    assert aplicar_cor((0.2, 0.4, 0.6), {**AJUSTES_NEUTROS, "saturacao": -1}) == pytest.approx((cinza,) * 3)
    assert aplicar_cor((0.2, 0.4, 0.6), {**AJUSTES_NEUTROS, "contraste": 0.5}) == pytest.approx((0.05, 0.35, 0.65))
    drama_dobrado = {**AJUSTES_NEUTROS, "contraste": 0.9, "filtro": "drama", "intensidade": 2}
    assert ajustes_efetivos(drama_dobrado)["contraste"] == 1, "passa do limite e para nele"


def test_lut_no_formato_cube():
    ajustes = {**AJUSTES_NEUTROS, "temperatura": 0.5}
    linhas = gerar_cube(ajustes, pontos=5).strip().split("\n")
    assert linhas[1] == "LUT_3D_SIZE 5"
    assert len(linhas) == 2 + 5 ** 3
    # A segunda entrada é r = 1/4 com g = b = 0 (o vermelho varia mais rápido)
    assert [float(v) for v in linhas[3].split()] == pytest.approx(aplicar_cor((0.25, 0, 0), ajustes), abs=1e-6)
    assert nome_da_lut(ajustes) == nome_da_lut({**ajustes, "vinheta": 0.9}), "a vinheta não entra na LUT"
    assert nome_da_lut(ajustes) != nome_da_lut(AJUSTES_NEUTROS)


CURVAS = json.loads((Path(__file__).parent / "casos" / "curvas.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("caso", CURVAS["casos"], ids=[c["nome"] for c in CURVAS["casos"]])
def test_curva_igual_a_da_previa(caso):
    assert [valor_da_curva(caso["pontos"], x) for x in caso["x"]] == pytest.approx(caso["y"], abs=1e-12)


def test_curva_passa_pelos_pontos_sem_passar_deles():
    pontos = [[0, 0], [0.4, 0.05], [0.45, 0.9], [1, 1]]
    assert [valor_da_curva(pontos, x) for x, _ in pontos] == pytest.approx([y for _, y in pontos])
    valores = [valor_da_curva(pontos, i / 200) for i in range(201)]
    assert all(b >= a for a, b in zip(valores, valores[1:], strict=False)), "monótona: sem voltar"


def test_curvas_entram_na_lut_depois_dos_ajustes():
    composta = CURVAS["composta"]
    assert list(aplicar_curvas(tuple(composta["rgb"]), composta["curvas"])) == pytest.approx(composta["esperado"])
    ajustes = {**AJUSTES_NEUTROS, "saturacao": 0.3, "curvas": composta["curvas"]}
    linhas = gerar_cube(ajustes, pontos=5).strip().split("\n")
    esperado = aplicar_curvas(aplicar_cor((0.25, 0, 0), ajustes), composta["curvas"])
    assert [float(v) for v in linhas[3].split()] == pytest.approx(esperado, abs=1e-6)
    assert nome_da_lut(ajustes) != nome_da_lut({**ajustes, "curvas": None})
    assert curvas_neutras({"rgb": [[0, 0], [1, 1]]}) and curvas_neutras(None)


def test_imagem_da_vinheta_tem_o_cinza_da_conta():
    imagem = desenhar_vinheta(200, 100, 0.8)
    assert imagem.size == (200, 100)
    assert imagem.getpixel((100, 50)) == (255, 255, 255, 255), "no meio, multiplicar não muda nada"
    cinza = round(255 * (1 - escurecimento_da_vinheta(0.5 / 200, 0.5 / 100, 0.8)))
    assert imagem.getpixel((0, 0)) == (cinza, cinza, cinza, 255)


def test_niveis_brancos_pretos_vibracao_e_cor_por_matiz():
    from core.utils.cor import aplicar_hsl

    cinza = (0.5, 0.5, 0.5)
    # Níveis: o preto de entrada vira 0 e o branco vira 1
    assert aplicar_cor((0.1, 0.1, 0.1), {**AJUSTES_NEUTROS, "niveis_preto": 0.1})[0] == pytest.approx(0, abs=1e-9)
    assert aplicar_cor((0.8, 0.8, 0.8), {**AJUSTES_NEUTROS, "niveis_branco": 0.2})[0] == pytest.approx(1, abs=1e-9)
    # Gama acima de 0 clareia o meio sem mexer nas pontas
    assert aplicar_cor(cinza, {**AJUSTES_NEUTROS, "niveis_gama": 1})[0] > 0.6
    assert aplicar_cor((1, 1, 1), {**AJUSTES_NEUTROS, "niveis_gama": 1})[0] == pytest.approx(1)
    # Brancos mexem no claro e quase nada no escuro; pretos, o contrário
    assert aplicar_cor((0.9, 0.9, 0.9), {**AJUSTES_NEUTROS, "brancos": -1})[0] < 0.8
    assert aplicar_cor((0.1, 0.1, 0.1), {**AJUSTES_NEUTROS, "brancos": -1})[0] == pytest.approx(0.1, abs=1e-3)
    # Vibração: mais forte na cor apagada que na saturada
    apagada, viva = (0.5, 0.45, 0.4), (0.9, 0.2, 0.1)
    vib = {**AJUSTES_NEUTROS, "vibracao": 1}
    ganho = lambda c: (max(aplicar_cor(c, vib)) - min(aplicar_cor(c, vib))) / (max(c) - min(c))  # noqa: E731
    assert ganho(apagada) > ganho(viva)
    # Cor por matiz: o vermelho gira para o laranja, o cinza fica
    assert aplicar_hsl(cinza, {"vermelho": {"matiz": 1, "saturacao": 1, "luminancia": 1}}) == pytest.approx(cinza)
    girado = aplicar_hsl((0.9, 0.1, 0.1), {"vermelho": {"matiz": 1, "saturacao": 0, "luminancia": 0}})
    assert girado[1] > 0.3, "ganhou verde: virou laranja"


def test_cor_por_matiz_entra_na_lut_e_no_nome():
    hsl = {"azul": {"matiz": 0, "saturacao": -1, "luminancia": 0}}
    com = {**AJUSTES_NEUTROS, "hsl": hsl}
    assert nome_da_lut(com) != nome_da_lut(AJUSTES_NEUTROS)
    linhas = gerar_cube(com, pontos=3).strip().split("\n")
    # O azul puro (r = g = 0, b = 1) perde a saturação: vira cinza
    azul = [float(v) for v in linhas[2 + 18].split()]
    assert azul[0] == pytest.approx(azul[1], abs=1e-6) and azul[1] == pytest.approx(azul[2], abs=1e-6)
