# As mensagens de validação da API, em português e com o motivo
from api.main import traduzir_erro


def test_mensagem_do_validador_chega_inteira():
    erro = {"loc": ("body", "faixas", 0, "clipes", 0, "texto"), "type": "value_error",
            "msg": "Value error, O texto ficou grande demais. Quebre em linhas ou diminua o tamanho da letra."}
    assert traduzir_erro(erro) == "O texto ficou grande demais. Quebre em linhas ou diminua o tamanho da letra."


def test_lista_longa_demais_diz_o_limite():
    erro = {"loc": ("body", "faixas", 0, "clipes", 0, "abaixamento", "pontos"), "type": "too_long",
            "ctx": {"max_length": 4000}}
    assert traduzir_erro(erro).endswith("pode ter no máximo 4000 itens.")
