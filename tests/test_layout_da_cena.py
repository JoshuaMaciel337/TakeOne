# Layouts das cenas (caber, dividido): as cópias do render, as mesmas de lib/projeto/layoutDaCena.ts
import json
from pathlib import Path

import pytest

from core.utils.layout_da_cena import SUFIXO_DO_LAYOUT, com_os_layouts, copias_do_layout, quadro_da_proporcao

CASOS = json.loads((Path(__file__).parent / "casos" / "layout.json").read_text(encoding="utf-8"))["casos"]


def _perto(a, b):
    if isinstance(a, dict):
        assert a.keys() == b.keys()
        for chave in a:
            _perto(a[chave], b[chave])
    elif isinstance(a, float | int) and not isinstance(a, bool):
        assert a == pytest.approx(b, abs=1e-9)
    else:
        assert a == b


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_copias_dos_casos(caso):
    midia = (caso["midia"]["largura"], caso["midia"]["altura"])
    embaixo, acima = copias_do_layout(caso["clipe"], midia, quadro_da_proporcao(caso["proporcao"]))
    for copia, esperado in ((embaixo, caso["embaixo"]), (acima, caso["acima"])):
        _perto({k: copia.get(k) for k in esperado}, esperado)
        recorte = copia["recorte"]
        assert 0 <= recorte["x"] <= 1 - recorte["largura"] + 1e-9 and 0 <= recorte["y"] <= 1 - recorte["altura"] + 1e-9
        assert copia["layout"] is None


def test_dividido_enche_as_duas_partes_sem_sobrar():
    # Cada parte do quadro 9:16 fica com um pedaço na proporção dela: a caixa de escala 1 tem a largura do quadro
    # e a altura da parte, e as duas se encostam no meio
    for caso in (c for c in CASOS if c["clipe"]["layout"]["tipo"] != "caber"):
        quadro = quadro_da_proporcao(caso["proporcao"])
        midia = (caso["midia"]["largura"], caso["midia"]["altura"])
        embaixo, acima = copias_do_layout(caso["clipe"], midia, quadro)
        alturas = []
        for copia in (embaixo, acima):
            r = copia["recorte"]
            largura, altura = midia[0] * r["largura"], midia[1] * r["altura"]
            encaixe = min(quadro[0] / largura, quadro[1] / altura)
            assert largura * encaixe == pytest.approx(quadro[0])
            alturas.append((copia["transformacao"]["y"], altura * encaixe / quadro[1]))
        (y1, a1), (y2, a2) = alturas
        assert a1 + a2 == pytest.approx(1)
        assert y1 - a1 / 2 == pytest.approx(-0.5) and y1 + a1 / 2 == pytest.approx(y2 - a2 / 2)


def _clipe(id_, **extra):
    return {"id": id_, "midia_id": "m", "inicio": 0, "duracao": 10, "entrada": 0, "velocidade": 1, "volume": 1,
            "transformacao": {"x": 0.2, "y": 0, "escala": 1.7, "rotacao": 0, "opacidade": 1},
            "recorte": {"x": 0, "y": 0, "largura": 1, "altura": 1},
            "keyframes": {"x": [{"t": 0, "v": 0.1}], "volume": [{"t": 0, "v": 0.5}]}, **extra}


def test_faixa_de_cima_com_as_copias_sem_som():
    layout = {"tipo": "caber", "desfoque": 0.5}
    projeto = {"proporcao": "9:16", "faixas": [
        {"id": "t", "tipo": "texto", "clipes": []},
        {"id": "p", "tipo": "principal", "muda": False,
         "clipes": [_clipe("a", layout=layout, transicao={"tipo": "fusao", "duracao": 5}), _clipe("b")]}]}
    desenhado = com_os_layouts(projeto, lambda _: (1920, 1080))
    assert [(f["id"], f["tipo"]) for f in desenhado["faixas"]] == [
        ("t", "texto"), (f"p{SUFIXO_DO_LAYOUT}", "video"), ("p", "principal")]
    assert desenhado["faixas"][1]["muda"]
    nitido = desenhado["faixas"][1]["clipes"][0]
    assert nitido["id"] == f"a{SUFIXO_DO_LAYOUT}" and nitido["som_separado"] and nitido["transicao"] is None
    assert nitido["transformacao"]["escala"] == 1 and nitido["keyframes"] == {"volume": [{"t": 0, "v": 0.5}]}
    desfocado, outro = desenhado["faixas"][2]["clipes"]
    assert desfocado["id"] == "a" and desfocado["transicao"] and desfocado["efeito"]["tipo"] == "desfoque"
    assert desfocado["transformacao"]["escala"] == pytest.approx((16 / 9) ** 2)
    assert outro is projeto["faixas"][1]["clipes"][1]
    # Sem o tamanho da mídia (ou sem layout), fica como está
    assert com_os_layouts(projeto, lambda _: None)["faixas"] == projeto["faixas"]
    sem = {"proporcao": "9:16", "faixas": [{"id": "p", "tipo": "principal", "clipes": [_clipe("x")]}]}
    assert com_os_layouts(sem, lambda _: (1920, 1080)) is sem
