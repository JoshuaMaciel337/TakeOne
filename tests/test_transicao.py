# Transições: os mesmos casos que a prévia confere em transicao.test.ts, e as expressões do FFmpeg
import json
import math
from pathlib import Path

import pytest

from core.utils.transicao import filtros_de_transicao, janelas_da_principal, transformacao_na_transicao

DADOS = json.loads((Path(__file__).parent / "casos" / "transicao.json").read_text(encoding="utf-8"))
CASOS = DADOS["casos"]


def efeito_do(caso):
    return {"tipo": caso["tipo"], "papel": caso["papel"], "inicio": caso["inicio"], "duracao": caso["duracao"]}


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_transformacao_igual_a_da_previa(caso):
    resultado = transformacao_na_transicao(DADOS["base"], [efeito_do(caso)], caso["t"])
    assert resultado == pytest.approx(caso["esperado"], abs=1e-9)


def avaliar(expressao: str, t: float) -> float:
    ambiente = {"clip": lambda v, a, b: min(max(v, a), b), "pow": math.pow, "t": t}
    return eval(expressao, {"__builtins__": {}}, ambiente)  # noqa: S307 - expressão montada aqui


def opacidade_dos_fades(fades: list[str], t: float) -> float:
    """O que o filtro fade com alfa faz: rampa linear de st a st + d."""
    opacidade = 1.0
    for fade in fades:
        partes = dict(item.split("=") for item in fade.removeprefix("fade=").split(":"))
        inicio, duracao = float(partes["st"]), float(partes["d"])
        p = min(1.0, max(0.0, (t - inicio) / duracao))
        opacidade *= p if partes["t"] == "in" else 1 - p
    return opacidade


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_ffmpeg_faz_a_mesma_conta(caso):
    filtros = filtros_de_transicao([efeito_do(caso)])
    esperado = caso["esperado"]
    assert avaliar(filtros["dx"], caso["t"]) == pytest.approx(esperado["x"], abs=1e-9)
    zoom = avaliar(filtros["escala"], caso["t"]) if filtros["escala"] else 1
    assert zoom == pytest.approx(esperado["escala"], abs=1e-9)
    assert opacidade_dos_fades(filtros["fades"], caso["t"]) == pytest.approx(esperado["opacidade"], abs=1e-9)


def test_janelas_estendem_os_dois_clipes():
    clipes = [{"id": "a", "inicio": 0, "duracao": 4, "transicao": {"tipo": "fusao", "duracao": 1}},
              {"id": "b", "inicio": 4, "duracao": 3}]
    janelas = janelas_da_principal(clipes)
    assert (janelas["a"]["inicio"], janelas["a"]["fim"]) == (0, 4.5)
    assert (janelas["b"]["inicio"], janelas["b"]["fim"]) == (3.5, 7)
    assert janelas["b"]["efeitos"] == [{"tipo": "fusao", "papel": "entra", "inicio": 3.5, "duracao": 1}]
