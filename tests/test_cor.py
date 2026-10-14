# Ajustes de cor do render: a referência dos casos, a LUT para o FFmpeg e a imagem da vinheta
import json
from pathlib import Path

import pytest

from core.utils.cor import (
    AJUSTES_NEUTROS,
    ajustes_efetivos,
    aplicar_cor,
    desenhar_vinheta,
    escurecimento_da_vinheta,
    gerar_cube,
    nome_da_lut,
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


def test_imagem_da_vinheta_tem_o_cinza_da_conta():
    imagem = desenhar_vinheta(200, 100, 0.8)
    assert imagem.size == (200, 100)
    assert imagem.getpixel((100, 50)) == (255, 255, 255, 255), "no meio, multiplicar não muda nada"
    cinza = round(255 * (1 - escurecimento_da_vinheta(0.5 / 200, 0.5 / 100, 0.8)))
    assert imagem.getpixel((0, 0)) == (cinza, cinza, cinza, 255)
