# Contorno e sombra (core/utils/silhueta.py): a margem, o deslocamento e a borda do contorno, com os casos que o
# TypeScript (lib/projeto/silhueta.ts) confere em tests/casos/silhueta.json, e o grafo do render.
import json
import math
from pathlib import Path

import pytest

from core.utils.silhueta import (
    LIMIAR_DO_CONTORNO,
    cobertura_do_contorno,
    deslocamento_da_sombra,
    filtros_da_silhueta,
    margem_da_silhueta,
    tem_silhueta,
)

CASOS = Path(__file__).parent / "casos" / "silhueta.json"
CONTORNO = {"cor": "#ffffff", "largura": 0.05}
SOMBRA = {"cor": "#000000", "opacidade": 0.6, "desfoque": 0.02, "distancia": 0.04, "angulo": 135}


def test_a_borda_do_contorno_fica_a_dois_sigmas():
    # Um degrau desfocado vale Φ(−d/σ) a d pixels para fora: na largura (2σ) a cobertura é a metade
    sigma = 10
    assert cobertura_do_contorno(LIMIAR_DO_CONTORNO, sigma) == pytest.approx(0.5)
    fora = 0.5 * math.erfc((2 * sigma + 3) / sigma / math.sqrt(2))
    dentro = 0.5 * math.erfc((2 * sigma - 3) / sigma / math.sqrt(2))
    assert cobertura_do_contorno(fora, sigma) == 0 and cobertura_do_contorno(dentro, sigma) == 1
    assert cobertura_do_contorno(0.9, sigma) == 1
    # Longe do clipe (alfa 0), nenhum contorno, mesmo o fino
    for fino in (0.2, 0.5, 1, 1.18):
        assert cobertura_do_contorno(0, fino) == 0
        assert cobertura_do_contorno(LIMIAR_DO_CONTORNO, fino) == pytest.approx(0.5)


def test_margem_e_deslocamento():
    assert not tem_silhueta({}) and not tem_silhueta({"contorno": {"cor": "#fff", "largura": 0}})
    assert tem_silhueta({"sombra": SOMBRA})
    assert margem_da_silhueta({"contorno": CONTORNO}, 400) == 22
    assert margem_da_silhueta({"contorno": CONTORNO, "sombra": SOMBRA}, 400) == math.ceil((0.04 + 0.06) * 400 + 2)
    dx, dy = deslocamento_da_sombra({**SOMBRA, "angulo": 90}, 200)
    assert (round(dx, 6), dy) == (0, pytest.approx(8))


def test_casos_compartilhados_com_a_previa():
    casos = {
        "cobertura": [{"alfa": a, "sigma": s, "cobertura": round(cobertura_do_contorno(a, s), 9)}
                      for a in (0, 0.01, 0.02, 0.02275, 0.03, 0.2) for s in (0.5, 4, 25)],
        "margem": [{"clipe": c, "altura": h, "margem": margem_da_silhueta(c, h)}
                   for c in ({"contorno": CONTORNO}, {"sombra": SOMBRA}, {"contorno": CONTORNO, "sombra": SOMBRA})
                   for h in (100, 731.5)],
        "deslocamento": [{"sombra": {**SOMBRA, "angulo": a}, "altura": 300,
                          "dx": round(deslocamento_da_sombra({**SOMBRA, "angulo": a}, 300)[0], 9),
                          "dy": round(deslocamento_da_sombra({**SOMBRA, "angulo": a}, 300)[1], 9)}
                         for a in (0, 45, 135, -90)],
    }
    if not CASOS.exists():
        CASOS.write_text(json.dumps(casos, indent=1) + "\n", encoding="utf-8")
    assert json.loads(CASOS.read_text(encoding="utf-8")) == json.loads(json.dumps(casos))


def test_grafo_com_contorno_e_sombra():
    grafo, margem = filtros_da_silhueta({"contorno": CONTORNO, "sombra": SOMBRA}, 400, 3, "[2:v]scale=10:10")
    assert margem == 42
    assert grafo.startswith("[2:v]scale=10:10,format=rgba,pad=iw+84:ih+84:42:42:color=black@0,split=3")
    assert ("format=gray16le,gblur=sigma=10.0000:steps=6,"
            "lut=c0='clip((val/65535-0.02275)/0.00539900+0.5,0,1)*maxval'") in grafo
    assert "[co3][sl3_0]overlay=format=rgb,format=rgba[cl3]" in grafo
    # A sombra a 135° (para a esquerda e para baixo), 16 pixels: -11 e 11
    assert "crop=iw-22:ih-22:22:0" in grafo
    assert grafo.endswith("[so3][sd3]overlay=format=rgb,format=rgba")
    so_contorno, _ = filtros_da_silhueta({"contorno": CONTORNO}, 400, 1, "[0:v]")
    assert so_contorno.startswith("[0:v]format=rgba") and so_contorno.endswith("overlay=format=rgb,format=rgba")
    so_sombra, _ = filtros_da_silhueta({"sombra": SOMBRA}, 400, 1, "[0:v]")
    assert "[sl1_0]split=3" in so_sombra and "alphaextract,gblur" in so_sombra
