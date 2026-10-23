# Fundo desfocado: a expansão do projeto para o render, a mesma de lib/projeto/fundoDesfocado.ts.
from core.utils.fundo_desfocado import SUFIXO_DO_RECORTE, expandir_para_desenhar


def _clipe(id_, **extra):
    return {"id": id_, "midia_id": "m", "inicio": 0, "duracao": 10, "entrada": 0, "velocidade": 1, "volume": 1, **extra}


def test_clipe_vira_a_copia_desfocada_e_a_recortada_por_cima():
    projeto = {"faixas": [{"id": "t", "tipo": "texto", "clipes": []},
                          {"id": "p", "tipo": "principal", "clipes": [
                              _clipe("a", fundo_desfocado=0.7, transicao={"tipo": "fusao", "duracao": 5}),
                              _clipe("b")]}]}
    desenhado = expandir_para_desenhar(projeto)
    assert [(f["id"], f["tipo"]) for f in desenhado["faixas"]] == [("t", "texto"), (f"p{SUFIXO_DO_RECORTE}", "video"),
                                                                  ("p", "principal")]
    recortado = desenhado["faixas"][1]["clipes"][0]
    assert recortado["id"] == f"a{SUFIXO_DO_RECORTE}" and recortado["remover_fundo"] and recortado["som_separado"]
    assert recortado["transicao"] is None and not recortado["fundo_desfocado"]
    desfocado, outro = desenhado["faixas"][2]["clipes"]
    assert desfocado["efeito"] == {"tipo": "desfoque", "intensidade": 0.7} and not desfocado["remover_fundo"]
    assert desfocado["transicao"] and outro is projeto["faixas"][1]["clipes"][1]
    sem = {"faixas": [{"id": "p", "tipo": "principal", "clipes": [_clipe("x")]}]}
    assert expandir_para_desenhar(sem) is sem


def test_objetos_escondidos_viram_uma_copia_cada():
    objetos = [{"rastreio": "a" * 24, "modo": "pixelizar", "forca": 0.7},
               {"rastreio": "b" * 24, "modo": "desfocar", "forca": 0.5}]
    projeto = {"faixas": [{"id": "p", "tipo": "principal", "clipes": [_clipe("v", esconder_objetos=objetos)]}]}
    desenhado = expandir_para_desenhar(projeto)
    assert [f["id"] for f in desenhado["faixas"]] == ["p~objeto0", "p~objeto1", "p"]
    primeiro, segundo = desenhado["faixas"][0]["clipes"][0], desenhado["faixas"][1]["clipes"][0]
    assert primeiro["mascara_do_recorte"] == f"objeto:{'a' * 24}" and primeiro["efeito"]["tipo"] == "pixelizar"
    assert segundo["efeito"] == {"tipo": "desfoque", "intensidade": 0.5}
    assert desenhado["faixas"][2]["clipes"][0]["esconder_objetos"] is None
