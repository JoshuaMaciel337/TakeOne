# A caixa de cada clipe no quadro: os mesmos casos que a prévia confere em geometria.test.ts
import json
import math
from dataclasses import asdict
from pathlib import Path

import pytest

from core.utils.geometria import Caixa, caixa_do_clipe, caixa_do_texto, caixa_visivel, recorte_na_fonte

DADOS = json.loads((Path(__file__).parent / "casos" / "geometria.json").read_text(encoding="utf-8"))
CASOS = DADOS["casos"]
CASOS_TEXTO = DADOS["casos_texto"]
CASOS_VIRAR = DADOS["casos_virar"]


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_caixa_igual_a_da_previa(caso):
    midia = (caso["midia"]["largura"], caso["midia"]["altura"])
    quadro = (caso["quadro"]["largura"], caso["quadro"]["altura"])
    caixa = asdict(caixa_do_clipe(caso["transformacao"], caso["recorte"], midia, quadro))
    assert caixa == pytest.approx(caso["caixa"], abs=1e-9)


@pytest.mark.parametrize("caso", CASOS_TEXTO, ids=[c["nome"] for c in CASOS_TEXTO])
def test_caixa_do_texto_igual_a_da_previa(caso):
    imagem = (caso["imagem"]["largura"], caso["imagem"]["altura"])
    quadro = (caso["quadro"]["largura"], caso["quadro"]["altura"])
    assert asdict(caixa_do_texto(caso["transformacao"], imagem, quadro)) == pytest.approx(caso["caixa"], abs=1e-9)


@pytest.mark.parametrize("caso", CASOS_VIRAR, ids=[c["nome"] for c in CASOS_VIRAR])
def test_recorte_do_clipe_virado_igual_ao_da_previa(caso):
    assert recorte_na_fonte(caso["recorte"], caso["virar"]) == pytest.approx(caso["fonte"], abs=1e-12)


def _na_midia(caixa, recorte, x, y):
    """O ponto da mídia (em frações do recorte já virado) que aparece no pixel (x, y) do quadro."""
    angulo = math.radians(caixa.rotacao)
    dx, dy = x - caixa.cx, y - caixa.cy
    u = dx * math.cos(angulo) + dy * math.sin(angulo)
    v = -dx * math.sin(angulo) + dy * math.cos(angulo)
    fu, fv = u / caixa.largura + 0.5, v / caixa.altura + 0.5
    return recorte["x"] + fu * recorte["largura"], recorte["y"] + fv * recorte["altura"]


@pytest.mark.parametrize("rotacao", [0, 17, -90, 135])
def test_caixa_visivel_mostra_o_mesmo_no_quadro(rotacao):
    recorte = {"x": 0.1, "y": 0.05, "largura": 0.8, "altura": 0.9}
    caixa = Caixa(cx=700, cy=300, largura=30000, altura=17000, rotacao=rotacao, opacidade=1)
    nova, novo = caixa_visivel(caixa, recorte, (1920, 1080))
    assert nova.largura * nova.altura < 0.05 * caixa.largura * caixa.altura
    for x in range(0, 1921, 240):
        for y in range(0, 1081, 135):
            assert _na_midia(nova, novo, x, y) == pytest.approx(_na_midia(caixa, recorte, x, y), abs=1e-9)
    # O pedaço novo fica dentro do recorte de antes
    assert novo["x"] >= recorte["x"] - 1e-12
    assert novo["x"] + novo["largura"] <= recorte["x"] + recorte["largura"] + 1e-12


def test_caixa_que_cabe_no_quadro_nao_muda():
    caixa = Caixa(cx=960, cy=540, largura=1920, altura=1080, rotacao=0, opacidade=1)
    assert caixa_visivel(caixa, {"x": 0, "y": 0, "largura": 1, "altura": 1}, (1920, 1080)) is None
