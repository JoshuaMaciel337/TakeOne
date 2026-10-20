# Keyframes: os mesmos casos que a prévia confere em keyframes.test.ts, e as expressões do FFmpeg
import json
import math
from pathlib import Path

import pytest

from core.utils.animacao import transformacao_animada
from core.utils.keyframes import (
    comandos_de_opacidade,
    expressao,
    expressao_da_propriedade,
    transformacao_de_base,
    valor_com_expressao,
    valor_no_tempo,
)
from core.utils.tempo import TICKS_POR_SEGUNDO

DADOS = json.loads((Path(__file__).parent / "casos" / "keyframes.json").read_text(encoding="utf-8"))
S = TICKS_POR_SEGUNDO


def em_ticks(pontos: list[dict]) -> list[dict]:
    return [{**ponto, "t": round(ponto["t"] * S)} for ponto in pontos]


def avaliar(texto: str, t: float) -> float:
    """Avalia a expressão do FFmpeg com as funções que ela usa."""
    ambiente = {"se": lambda c, a, b: a if c else b, "lt": lambda a, b: a < b, "gt": lambda a, b: a > b,
                "mod": lambda a, b: a - b * math.floor(a / b), "sin": math.sin, "max": max, "PI": math.pi, "t": t}
    return eval(texto.replace("if(", "se("), {"__builtins__": {}}, ambiente)  # noqa: S307 - expressão montada aqui


@pytest.mark.parametrize("caso", DADOS["valores"], ids=[c["nome"] for c in DADOS["valores"]])
def test_valor_igual_ao_da_previa(caso):
    assert valor_no_tempo(caso["pontos"], caso["t"]) == pytest.approx(caso["valor"], abs=1e-9)


@pytest.mark.parametrize("caso", DADOS["valores"], ids=[c["nome"] for c in DADOS["valores"]])
def test_ffmpeg_faz_a_mesma_conta(caso):
    # O clipe começa em 1,5 s no vídeo final: a expressão usa o tempo do vídeo final
    texto = expressao(em_ticks(caso["pontos"]), 1.5)
    assert avaliar(texto, 1.5 + caso["t"]) == pytest.approx(caso["valor"], abs=1e-6)


@pytest.mark.parametrize("caso", DADOS["transformacoes"], ids=[c["nome"] for c in DADOS["transformacoes"]])
def test_transformacao_com_animacao_igual_a_da_previa(caso):
    assert transformacao_animada(caso["clipe"], caso["t"]) == pytest.approx(caso["esperado"], abs=1e-9)


def test_base_do_render_usa_a_maior_escala_e_tira_o_giro_animado():
    escala = em_ticks([{"t": 0, "valor": 0.5, "curva": "linear"}, {"t": 1, "valor": 1.4, "curva": "linear"}])
    giro = em_ticks([{"t": 0, "valor": 0, "curva": "linear"}, {"t": 1, "valor": 90, "curva": "linear"}])
    clipe = {"inicio": 0, "transformacao": {"x": 0, "y": 0, "escala": 1, "rotacao": 15, "opacidade": 0.5},
             "keyframes": {"escala": escala, "rotacao": giro}}
    base = transformacao_de_base(clipe)
    assert (base["escala"], base["rotacao"], base["opacidade"]) == (1.4, 0, 0.5)


def test_comandos_de_opacidade_por_quadro_so_quando_muda():
    pontos = em_ticks([{"t": 0, "valor": 0, "curva": "linear"}, {"t": 0.1, "valor": 1, "curva": "linear"}])
    clipe = {"transformacao": {"opacidade": 1}, "keyframes": {"opacidade": pontos}}
    roteiro = comandos_de_opacidade(clipe, 2.0, (2.0, 3.0), 30, "colorchannelmixer@op1").strip().split("\n")
    # 0, 1/3, 2/3 e 1 nos quatro primeiros quadros; depois fica em 1 e não repete
    assert roteiro[0] == "0 colorchannelmixer@op1 aa 0;"
    assert roteiro[3] == "0.1 colorchannelmixer@op1 aa 1;"
    assert len(roteiro) == 4


def _em_ticks_da_expressao(expressao: dict) -> dict:
    tremor = expressao.get("tremer")
    if not tremor:
        return expressao
    em_ticks_ = {"periodo": tremor["periodo"] * S, "deslocamento": tremor["deslocamento"] * S}
    return {**expressao, "tremer": {**tremor, **em_ticks_}}


@pytest.mark.parametrize("caso", DADOS["expressoes"], ids=[c["nome"] for c in DADOS["expressoes"]])
def test_expressao_igual_a_da_previa(caso):
    valor = valor_com_expressao(caso["pontos"], caso["fixo"], caso["expressao"], caso["propriedade"], caso["t"])
    assert valor == pytest.approx(caso["valor"], abs=1e-9)


@pytest.mark.parametrize("caso", [c for c in DADOS["expressoes"] if c["propriedade"] != "opacidade"],
                         ids=[c["nome"] for c in DADOS["expressoes"] if c["propriedade"] != "opacidade"])
def test_ffmpeg_faz_a_mesma_conta_da_expressao(caso):
    # O clipe começa em 1,5 s no vídeo final; os pontos, o período e o deslocamento vão para ticks
    propriedade = caso["propriedade"]
    clipe = {"transformacao": {propriedade: caso["fixo"]},
             "keyframes": {propriedade: em_ticks(caso["pontos"])} if caso["pontos"] else None,
             "expressoes": {propriedade: _em_ticks_da_expressao(caso["expressao"])}}
    texto = expressao_da_propriedade(clipe, propriedade, 1.5)
    assert avaliar(texto, 1.5 + caso["t"]) == pytest.approx(caso["valor"], abs=1e-6)


def test_opacidade_tremendo_vai_pelo_roteiro_entre_0_e_1():
    clipe = {"transformacao": {"opacidade": 0.95},
             "expressoes": {"opacidade": {"tremer": {"periodo": S, "amplitude": 0.5, "deslocamento": 0}}}}
    roteiro = comandos_de_opacidade(clipe, 0.0, (0.0, 1.0), 30, "colorchannelmixer@op1").strip().split("\n")
    valores = [float(linha.split()[-1].rstrip(";")) for linha in roteiro]
    assert len(valores) > 10 and min(valores) >= 0 and max(valores) == 1


def test_base_do_render_cabe_o_tremido_da_escala():
    clipe = {"inicio": 0, "transformacao": {"x": 0, "y": 0, "escala": 0.8, "rotacao": 10, "opacidade": 1},
             "expressoes": {"escala": {"tremer": {"periodo": S, "amplitude": 0.1, "deslocamento": 0}},
                            "rotacao": {"tremer": {"periodo": S, "amplitude": 5, "deslocamento": 0}}}}
    base = transformacao_de_base(clipe)
    assert base["escala"] == pytest.approx(0.9) and base["rotacao"] == 0
