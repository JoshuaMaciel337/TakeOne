# Efeitos de vídeo: o sorteio e o desvio das cores são os mesmos que a prévia confere em efeitos.test.ts
import json
from pathlib import Path

import pytest

from core.utils.cor import desenhar_vinheta
from core.utils.efeitos import (
    ajustes_do_efeito,
    deslocamento_do_grao,
    desvio_de_cor,
    hash32,
    linhas_do_efeito,
    posicao_da_luz,
    valores_do_grao,
)

CASOS = json.loads((Path(__file__).parent / "casos" / "efeitos.json").read_text(encoding="utf-8"))


def test_hash_de_inteiros_igual_ao_da_previa():
    assert [hash32(n) for n, _ in CASOS["hash"]] == [h for _, h in CASOS["hash"]]


def test_glitch_salta_nos_mesmos_quadros_que_a_previa():
    glitch = CASOS["glitch"]
    desvios = [desvio_de_cor({"efeito": glitch["efeito"]}, q) for q in glitch["quadros"]]
    assert desvios == pytest.approx(glitch["desvios"], abs=1e-12)
    # De 3 em 3 quadros: o desvio só muda na troca de bloco
    assert all(desvios[q] == desvios[q - q % 3] for q in glitch["quadros"])


def test_vhs_desvio_fixo_linhas_e_cor():
    vhs = CASOS["vhs"]
    clipe = {"efeito": vhs["efeito"]}
    assert desvio_de_cor(clipe, 10) == vhs["desvio"] == desvio_de_cor(clipe, 99)
    assert linhas_do_efeito(clipe) == vhs["linhas"] and ajustes_do_efeito(clipe) == vhs["ajustes"]


def test_linhas_do_vhs_na_imagem_da_vinheta():
    imagem = desenhar_vinheta(40, 540, 0, linhas=0.2, faixas=270)
    # Faixa 0 (linhas 0 e 1) clara, faixa 1 (linhas 2 e 3) escura
    assert [imagem.getpixel((20, y))[0] for y in (0, 1, 2, 3)] == [255, 255, 204, 204]


def test_grao_e_luz_iguais_aos_da_previa():
    grao, luz = CASOS["grao"], CASOS["luz"]
    assert [list(deslocamento_do_grao(q, grao["colunas"])) for q in grao["quadros"]] == grao["deslocamentos"]
    valores = valores_do_grao().ravel()
    assert [round(float(valores[i]) * 255) for i, _ in grao["celulas"]] == [v for _, v in grao["celulas"]]
    assert [posicao_da_luz(s) for s in luz["segundos"]] == pytest.approx(luz["posicoes"], abs=1e-12)
