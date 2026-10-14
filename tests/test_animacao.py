# Animações: os mesmos casos que a prévia confere em animacao.test.ts, e as expressões do FFmpeg
import json
import math
from pathlib import Path

import pytest

from core.utils.animacao import filtros_de_animacao, transformacao_animada

CASOS = json.loads((Path(__file__).parent / "casos" / "animacao.json").read_text(encoding="utf-8"))["casos"]


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_transformacao_igual_a_da_previa(caso):
    assert transformacao_animada(caso["clipe"], caso["t"]) == pytest.approx(caso["esperado"], abs=1e-9)


def avaliar(expressao: str, t: float) -> float:
    """Avalia uma expressão do FFmpeg que só usa clip, pow e a variável t."""
    ambiente = {"clip": lambda v, a, b: min(max(v, a), b), "pow": math.pow, "t": t}
    return eval(expressao, {"__builtins__": {}}, ambiente)  # noqa: S307 - expressão montada aqui


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_expressoes_do_ffmpeg_dao_o_mesmo_movimento(caso):
    clipe = caso["clipe"]
    filtros = filtros_de_animacao(clipe, clipe["inicio"], clipe["inicio"] + clipe["duracao"])
    base = clipe["transformacao"]
    esperado = caso["esperado"]
    assert base["x"] + avaliar(filtros["dx"], caso["t"]) == pytest.approx(esperado["x"], abs=1e-9)
    assert base["y"] + avaliar(filtros["dy"], caso["t"]) == pytest.approx(esperado["y"], abs=1e-9)
    zoom = avaliar(filtros["escala"], caso["t"]) if filtros["escala"] else 1
    assert base["escala"] * zoom == pytest.approx(esperado["escala"], abs=1e-9)


def test_fades_lineares_nos_instantes_certos():
    clipe = {"inicio": 1, "duracao": 4, "transformacao": {}, "animacao": {
        "entrada": {"tipo": "aparecer", "duracao": 0.5}, "saida": {"tipo": "zoom", "duracao": 1}}}
    filtros = filtros_de_animacao(clipe, 1, 5)
    assert filtros["fades"] == ["fade=t=in:st=1:d=0.5:alpha=1", "fade=t=out:st=4:d=1:alpha=1"]
    assert filtros_de_animacao({"inicio": 0, "duracao": 1, "transformacao": {}}, 0, 1)["fades"] == []
