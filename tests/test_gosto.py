# O gosto do espaço no Clipar: os cortes avaliados viram exemplos no pedido e um ajuste pequeno na nota
from core.modelos.cortes import montar_mensagens
from core.modelos.gosto import GOSTO_MAXIMO, ajuste_do_gosto, avaliados, gosto_do_espaco, texto_do_gosto


def _clipagem(_id, *cortes):
    return {"_id": _id, "cortes": [{"titulo": f"Corte {i}", "texto": "Era uma vez " * 30, "duracao": 40.0,
                                    **corte} for i, corte in enumerate(cortes)]}


CLIPAGENS = [
    _clipagem(1, {"avaliacao": "gostei", "categoria": "historia", "duracao": 50.0},
              {"avaliacao": "gostei", "categoria": "historia", "duracao": 60.0},
              {"avaliacao": None, "categoria": "dica"}),
    _clipagem(2, {"avaliacao": "nao_gostei", "categoria": "dica", "duracao": 20.0}),
    _clipagem(3, {"avaliacao": "gostei", "categoria": "humor"}),
]


def test_sem_avaliacoes_bastantes_nao_ha_gosto():
    assert gosto_do_espaco(avaliados(CLIPAGENS[2:])) is None
    assert texto_do_gosto(None) == "" and ajuste_do_gosto({"categoria": "historia"}, None) == (0, "")


def test_a_clipagem_de_agora_fica_de_fora():
    assert len(avaliados(CLIPAGENS)) == 4
    assert len(avaliados(CLIPAGENS, tirar_id=1)) == 2


def test_exemplos_no_pedido_ao_modelo():
    gosto = gosto_do_espaco(avaliados(CLIPAGENS))
    texto = texto_do_gosto(gosto)
    assert "Gostou:" in texto and "Não gostou:" in texto and "(História, 50 s)" in texto and "(Dica, 20 s)" in texto
    janela = [{"n": 0, "inicio": 0.0, "texto": "Olá."}]
    assert texto in montar_mensagens(janela, "medio", gosto=texto)[0]["content"]
    assert "Gostou:" not in montar_mensagens(janela, "medio")[0]["content"]


def test_o_ajuste_segue_a_categoria_e_a_duracao_e_tem_teto():
    gosto = gosto_do_espaco(avaliados(CLIPAGENS))
    # História: duas vezes gostei; a duração dos que ela gostou fica entre 50 e 60 (a mediana, 60)
    pontos, motivo = ajuste_do_gosto({"categoria": "historia", "duracao": 55.0}, gosto)
    assert pontos == GOSTO_MAXIMO and "história" in motivo and "duração" in motivo
    pontos, motivo = ajuste_do_gosto({"categoria": "dica", "duracao": 15.0}, gosto)
    assert pontos == -3 and motivo.startswith("-3 pelo seu gosto")
    assert ajuste_do_gosto({"categoria": "polemica", "duracao": 15.0}, gosto) == (0, "")
    # A duração boa não compensa a categoria de que ela não gostou
    assert ajuste_do_gosto({"categoria": "dica", "duracao": 58.0}, gosto)[0] == -3
