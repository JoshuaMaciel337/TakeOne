import pytest

from core.modelos.emojis import EMOJIS, ESQUEMA, conferir_escolhas, montar_mensagens
from core.utils.emoji import desenhar_emoji, tem_fonte_de_emoji


def _legendas(n):
    return [{"id": f"c{i}", "texto": f"legenda número {i}"} for i in range(n)]


def test_so_nomes_da_lista_e_legendas_que_existem():
    legendas = _legendas(10)
    bruto = {"escolhas": [{"legenda": 0, "emoji": "fogo"}, {"legenda": 3, "emoji": "unicornio"},
                          {"legenda": 30, "emoji": "dinheiro"}, {"legenda": -1, "emoji": "fogo"},
                          {"legenda": "5", "emoji": "fogo"}, "lixo", {"legenda": 6, "emoji": "cem"}]}
    assert conferir_escolhas(bruto, legendas) == {"c0": "fogo", "c6": "cem"}


def test_nem_vizinhas_nem_repetido_seguido_nem_demais():
    legendas = _legendas(10)
    vizinhas = {"escolhas": [{"legenda": i, "emoji": "fogo" if i % 2 else "ideia"} for i in range(10)]}
    escolhidas = conferir_escolhas(vizinhas, legendas)
    numeros = sorted(int(chave[1:]) for chave in escolhidas)
    assert all(b - a >= 2 for a, b in zip(numeros, numeros[1:], strict=False))
    assert len(escolhidas) <= 4
    # O mesmo emoji em duas escolhas seguidas: só o primeiro fica
    repetido = {"escolhas": [{"legenda": 0, "emoji": "fogo"}, {"legenda": 4, "emoji": "fogo"},
                             {"legenda": 8, "emoji": "ideia"}]}
    assert conferir_escolhas(repetido, legendas) == {"c0": "fogo", "c8": "ideia"}
    assert conferir_escolhas({}, legendas) == {}


def test_o_pedido_leva_a_lista_e_o_esquema_so_aceita_ela():
    mensagens = montar_mensagens(_legendas(3))
    assert "mente_explodindo" in mensagens[0]["content"] and "L2:" in mensagens[1]["content"]
    assert ESQUEMA["properties"]["escolhas"]["items"]["properties"]["emoji"]["enum"] == list(EMOJIS)


@pytest.mark.skipif(not tem_fonte_de_emoji(), reason="sem a fonte de emoji (fonts-noto-color-emoji)")
def test_todo_emoji_da_lista_e_desenhado_colorido():
    for nome, emoji in EMOJIS.items():
        imagem = desenhar_emoji(emoji)
        # O lado maior no tamanho da fonte (109 pontos, uns 130 px); os estreitos (o "!") têm o outro lado menor
        assert 120 <= max(imagem.size) <= 170 and min(imagem.size) >= 30, (nome, imagem.size)
        cores = imagem.convert("RGB").getcolors(1 << 16)
        assert cores is None or len(cores) > 8, nome
