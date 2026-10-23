# Transições: os mesmos casos que a prévia confere em transicao.test.ts, e as expressões do FFmpeg
import json
import math
from pathlib import Path

import pytest

from core.utils.transicao import (
    campo_da_transicao,
    desfoque_na_transicao,
    expressao_da_mistura,
    fator_da_mistura,
    filtro_de_cortina,
    filtros_de_transicao,
    janelas_da_principal,
    janelas_do_som,
    limiar_da_transicao,
    revelado_na_transicao,
    transformacao_na_transicao,
)

DADOS = json.loads((Path(__file__).parent / "casos" / "transicao.json").read_text(encoding="utf-8"))
CASOS = DADOS["casos"]
CORTINAS = [c for c in CASOS if "revelado" in c]


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
    janelas = janelas_da_principal(clipes, 0.25)
    assert (janelas["a"]["inicio"], janelas["a"]["fim"]) == (0, 4.5)
    assert (janelas["b"]["inicio"], janelas["b"]["fim"]) == (3.5, 7)
    assert janelas["b"]["efeitos"] == [{"tipo": "fusao", "papel": "entra", "inicio": 3.5, "duracao": 1}]


DESFOQUES = [c for c in CASOS if "desfoque" in c]


@pytest.mark.parametrize("caso", DESFOQUES, ids=[c["nome"] for c in DESFOQUES])
def test_desfoque_igual_ao_da_previa(caso):
    assert desfoque_na_transicao([efeito_do(caso)], caso["t"]) == pytest.approx(caso["desfoque"], abs=1e-12)


@pytest.mark.parametrize("caso", CORTINAS, ids=[c["nome"] for c in CORTINAS])
def test_cortina_revela_o_mesmo_que_a_previa(caso):
    assert revelado_na_transicao([efeito_do(caso)], caso["t"]) == pytest.approx(caso["revelado"], abs=1e-9)


def alfa_do_geq(filtro: str | None, x: float, y: float, t: float, deslocamento: float) -> float:
    """O alfa que o geq dá ao pixel no centro (x, y), em frações de um clipe de 1000 × 1000."""
    if filtro is None:
        return 1.0
    expressao = filtro.split(":a='")[1].split("'")[0]
    ambiente = {"X": x * 1000 - 0.5, "Y": y * 1000 - 0.5, "W": 1000, "H": 1000, "T": t - deslocamento,
                "lte": lambda a, b: float(a <= b), "gte": lambda a, b: float(a >= b),
                "clip": lambda v, a, b: min(max(v, a), b), "pow": math.pow, "alpha": lambda _x, _y: 1.0}
    return eval(expressao, {"__builtins__": {}}, ambiente)  # noqa: S307 - expressão montada aqui


@pytest.mark.parametrize("caso", CORTINAS, ids=[c["nome"] for c in CORTINAS])
def test_geq_da_cortina_faz_a_mesma_conta(caso):
    deslocamento = 1.5   # o geq vê o tempo do clipe, antes do setpts que o leva para o lugar
    filtro = filtro_de_cortina([efeito_do(caso)], deslocamento)
    r = caso["revelado"]
    for x, y in [(0.01, 0.5), (0.99, 0.5), (0.5, 0.01), (0.5, 0.99), (0.5, 0.5)]:
        dentro = r["x0"] <= x <= r["x1"] and r["y0"] <= y <= r["y1"]
        assert alfa_do_geq(filtro, x, y, caso["t"], deslocamento) == float(dentro), (x, y)
    if filtro:
        # Só fica ligado até o fim da janela: depois, o clipe aparece inteiro sem pagar o geq
        assert filtro.endswith(f":enable='lt(t,{caso['inicio'] + caso['duracao'] - deslocamento:g})'")


def test_janela_com_numero_impar_de_quadros_comeca_num_quadro():
    # 15 quadros (0,5 s a 30 fps): 7 antes do corte e 8 depois, como em transicao.ts
    clipes = [{"id": "a", "inicio": 0, "duracao": 60, "transicao": {"tipo": "fusao", "duracao": 15}},
              {"id": "b", "inicio": 60, "duracao": 60}]
    janelas = janelas_da_principal(clipes, 1)
    assert (janelas["b"]["inicio"], janelas["a"]["fim"]) == (53, 68)
    assert janelas["a"]["efeitos"][0]["duracao"] == 15


# -----------------------------------------------
# Mistura do som: os mesmos números de transicao.test.ts
# -----------------------------------------------
def test_mistura_do_som_so_nas_transicoes_marcadas_e_em_potencia_constante():
    mistura = {"tipo": "fusao", "duracao": 20, "misturar_som": True}
    clipes = [{"id": "a", "inicio": 0, "duracao": 60, "transicao": mistura},
              {"id": "b", "inicio": 60, "duracao": 60, "transicao": {"tipo": "fusao", "duracao": 20}},
              {"id": "c", "inicio": 120, "duracao": 60}]
    janelas = janelas_do_som(clipes, 1)
    limites = (janelas["a"]["fim"], janelas["b"]["inicio"], janelas["b"]["fim"], janelas["c"]["inicio"])
    assert limites == (70, 50, 120, 120), "a segunda transição não mistura: o som fica no corte"
    sai, entra = janelas["a"]["efeitos"], janelas["b"]["efeitos"]
    assert fator_da_mistura(sai, 50) == 1 and fator_da_mistura(sai, 70) == pytest.approx(0, abs=1e-12)
    assert fator_da_mistura(entra, 50) == 0 and fator_da_mistura(entra, 70) == 1
    for t in (55, 60, 63.3):
        assert fator_da_mistura(sai, t) ** 2 + fator_da_mistura(entra, t) ** 2 == pytest.approx(1)
    assert fator_da_mistura(entra, 60) == pytest.approx(math.sqrt(0.5))
    assert expressao_da_mistura([], 0) == "1"


@pytest.mark.skipif(not __import__("shutil").which("ffmpeg"), reason="FFmpeg não instalado")
def test_expressao_da_mistura_no_volume_do_ffmpeg():
    import subprocess
    from array import array

    from core.config import FFMPEG

    efeitos = [{"papel": "entra", "inicio": 1.0, "duracao": 0.5}, {"papel": "sai", "inicio": 2.0, "duracao": 1.0}]
    comeco = 0.75
    volume = f"asetnsamples=n=480:p=0,volume='{expressao_da_mistura(efeitos, comeco)}':eval=frame"
    saida = subprocess.run([FFMPEG, "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc=1:s=48000:d=3",
                            "-af", volume, "-f", "f32le", "-"], capture_output=True, check=True, timeout=60).stdout
    amostras = array("f", saida)
    for local in (0.1, 0.3, 0.5, 0.8, 1.4, 1.9, 2.2):
        # O ganho muda a cada bloco de 10 ms: no máximo um passo da curva
        esperado = fator_da_mistura(efeitos, comeco + local)
        assert amostras[round(local * 48000) + 240] == pytest.approx(esperado, abs=0.035), local


# -----------------------------------------------
# Transições de máscara: o campo, e o geq do render contra a conta
# -----------------------------------------------
MASCARAS = DADOS["mascaras"]


@pytest.mark.parametrize("caso", MASCARAS["tipos"], ids=[c["tipo"] for c in MASCARAS["tipos"]])
def test_campo_da_mascara_igual_ao_da_previa(caso):
    for x, y, campo in caso["campos"]:
        assert campo_da_transicao(caso["tipo"], x, y, caso["largura"], caso["altura"]) == pytest.approx(campo, abs=1e-9)


@pytest.mark.skipif(not __import__("shutil").which("ffmpeg"), reason="FFmpeg não instalado")
@pytest.mark.parametrize("tipo", [c["tipo"] for c in MASCARAS["tipos"]])
def test_geq_da_mascara_faz_a_conta(tipo):
    import subprocess

    import numpy as np

    from core.config import FFMPEG

    # Um clipe branco de 160 × 90 por 1 s, com a transição de 0 a 1 s; o quadro do meio (0,5 s)
    efeitos = [{"tipo": tipo, "papel": "entra", "inicio": 0.0, "duracao": 1.0}]
    geq = filtro_de_cortina(efeitos, 0.0)
    saida = subprocess.run([FFMPEG, "-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=160x90:r=10:d=1",
                            "-vf", f"format=rgba,{geq}", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                           capture_output=True, check=True, timeout=60).stdout
    alfa = np.frombuffer(saida, np.uint8).reshape(-1, 90, 160, 4)[5, :, :, 3] / 255
    from core.utils.animacao import suavizar

    limiar = limiar_da_transicao(suavizar(0.5))
    campos = np.array([[campo_da_transicao(tipo, (x + 0.5) / 160, (y + 0.5) / 90, 160, 90) for x in range(160)]
                       for y in range(90)])
    esperado = np.clip((limiar - campos) / 0.04 + 0.5, 0, 1)
    assert np.abs(alfa - esperado).max() < 0.01, np.abs(alfa - esperado).max()
