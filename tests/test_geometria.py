# A caixa de cada clipe no quadro: os mesmos casos que a prévia confere em geometria.test.ts
import json
from dataclasses import asdict
from pathlib import Path

import pytest

from core.utils.geometria import caixa_do_clipe

CASOS = json.loads((Path(__file__).parent / "casos" / "geometria.json").read_text(encoding="utf-8"))["casos"]


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_caixa_igual_a_da_previa(caso):
    midia = (caso["midia"]["largura"], caso["midia"]["altura"])
    quadro = (caso["quadro"]["largura"], caso["quadro"]["altura"])
    caixa = asdict(caixa_do_clipe(caso["transformacao"], caso["recorte"], midia, quadro))
    assert caixa == pytest.approx(caso["caixa"], abs=1e-9)
