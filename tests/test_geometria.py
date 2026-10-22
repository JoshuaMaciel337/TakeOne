# A caixa de cada clipe no quadro: os mesmos casos que a prévia confere em geometria.test.ts
import json
from dataclasses import asdict
from pathlib import Path

import pytest

from core.utils.geometria import caixa_do_clipe, caixa_do_texto, recorte_na_fonte

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
