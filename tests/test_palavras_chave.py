# Palavras-chave das legendas: o pedido ao LLM, a conferência do que ele devolve e o desenho delas no texto
import numpy as np

from core.modelos.palavras_chave import (
    ESQUEMA,
    conferir_escolhas,
    escolhas_simuladas,
    legendas_numeradas,
    montar_mensagens,
    palavras_do_texto,
)
from core.utils.letras import texto_do_destaque
from core.utils.texto import desenhar_texto, layout_do_texto

LEGENDAS = [
    {"id": "a", "texto": "Hoje vou mostrar\ntrês jeitos de editar"},
    {"id": "b", "texto": "O primeiro é cortar os silêncios"},
    {"id": "c", "texto": "e isso economiza 2 horas"},
]


def test_palavras_contadas_como_no_desenho():
    assert palavras_do_texto("Hoje vou mostrar\ntrês  jeitos") == ["Hoje", "vou", "mostrar", "três", "jeitos"]
    texto = {"conteudo": "Hoje vou mostrar\ntrês  jeitos"}
    assert len(layout_do_texto(texto, 1080)["palavras"]) == 5
    linhas = legendas_numeradas(LEGENDAS).splitlines()
    assert linhas[0] == "L0: [0]Hoje [1]vou [2]mostrar [3]três [4]jeitos [5]de [6]editar"
    assert "L2: [0]e [1]isso" in linhas[2]
    assert montar_mensagens(LEGENDAS)[0]["role"] == "system"
    assert ESQUEMA["required"] == ["escolhas"]


def test_conferencia_tira_o_que_nao_serve():
    bruto = {"escolhas": [
        {"legenda": 0, "palavras": [3, 3, 99, 5, 6]},      # repetida, fora do texto e "de" (vazia)
        {"legenda": 1, "palavras": [0, 2]},                # "O" e "é": nenhuma serve
        {"legenda": 2, "palavras": [3, 2, 4]},             # "2" (número curto vale) e no máximo 2 por legenda
        {"legenda": 7, "palavras": [0]},                   # legenda que não existe
        "lixo",
    ]}
    assert conferir_escolhas(bruto, LEGENDAS) == {"a": [3, 6], "c": [2, 3]}
    assert conferir_escolhas({}, LEGENDAS) == {}


def test_escolha_simulada_e_previsivel():
    chaves = escolhas_simuladas(LEGENDAS)
    assert chaves == {"a": [2], "c": [2]}


def _cores_da_palavra(imagem, layout, numero) -> tuple[int, int]:
    """Quantos pixels vermelhos e quantos brancos há na faixa da palavra (letras opacas)."""
    de, ate = layout["palavras"][numero]
    for linha in layout["linhas"]:
        letras = len(linha["xs"]) - 1
        if de < letras:
            break
        de, ate = de - letras, ate - letras
    largura, altura = imagem.size
    caixa = (int(linha["xs"][de] * largura), int(linha["y0"] * altura),
             int(linha["xs"][ate] * largura), int(linha["y1"] * altura))
    r, g, b, a = np.asarray(imagem.crop(caixa)).astype(int).transpose(2, 0, 1)
    opaco = a == 255
    vermelhos = int((opaco & (r > 200) & (g < 60) & (b < 60)).sum())
    brancos = int((opaco & (np.minimum(np.minimum(r, g), b) > 200)).sum())
    return vermelhos, brancos


def test_palavra_chave_sai_na_cor_dela_e_as_outras_nao():
    texto = {"conteudo": "Isso economiza\nduas horas", "cor": "#ffffff", "palavras_chave": [1, 3],
             "cor_chave": "#ff0000", "contorno_espessura": 0.05, "contorno_cor": "#000000"}
    imagem = desenhar_texto(texto, 1080)
    layout = layout_do_texto(texto, 1080)
    for numero, chave in ((0, False), (1, True), (2, False), (3, True)):
        vermelhos, brancos = _cores_da_palavra(imagem, layout, numero)
        assert (vermelhos > 200 and brancos == 0) if chave else (brancos > 200 and vermelhos == 0), numero
    # Sem palavra-chave, a imagem é a de sempre; e o destaque da fala não leva as palavras-chave
    assert desenhar_texto({**texto, "palavras_chave": []}, 1080).tobytes() == \
        desenhar_texto({**texto, "palavras_chave": None}, 1080).tobytes()
    assert texto_do_destaque({**texto, "destaque": {"modo": "karaoke", "cor": "#00ff00"}})["palavras_chave"] is None
