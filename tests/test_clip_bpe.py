# O tokenizador do CLIP (core/utils/clip_bpe.py) dá os números da biblioteca oficial (tests/casos/clip_bpe.json)
import json
from pathlib import Path

import pytest

from core.config import MODELO_DISTRACOES
from core.utils.clip_bpe import TokenizadorClip

TOKENIZADOR = MODELO_DISTRACOES.parent / "tokenizer.json"


@pytest.mark.skipif(not TOKENIZADOR.is_file(), reason="o tokenizador do OWL-ViT não está instalado")
def test_mesmos_numeros_da_biblioteca_oficial():
    tokenizador = TokenizadorClip(TOKENIZADOR)
    for caso in json.loads((Path(__file__).parent / "casos" / "clip_bpe.json").read_text(encoding="utf-8")):
        assert [49406, *tokenizador.ids(caso["texto"]), 49407] == caso["ids"], caso["texto"]
    ids, mascara = tokenizador.lote(["trash can!", "exit sign"])
    assert ids[0][:4] == [49406, 9798, 753, 49407] and len(ids[0]) == 16 and mascara[1][:5] == [1, 1, 1, 1, 0]
