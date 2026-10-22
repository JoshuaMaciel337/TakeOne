# Letra a letra e destaque: os mesmos casos que a prévia confere em letras.test.ts, as caixas do
# render e o layout das letras no PNG do texto
import json
from pathlib import Path

import pytest

from core.utils.letras import caixas_escondidas, comandos_das_letras, cortes, palavras_das_letras, trecho_visivel
from core.utils.texto import desenhar_texto, layout_do_texto

DOC = json.loads((Path(__file__).parent / "casos" / "letras.json").read_text(encoding="utf-8"))
LAYOUT, CASOS = DOC["layout"], DOC["casos"]


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_trecho_e_cortes_iguais_aos_da_previa(caso):
    trecho = trecho_visivel(caso["clipe"], LAYOUT, caso["t"], caso["destaque"])
    assert (list(trecho) if trecho else None) == caso["trecho"]
    if trecho:
        assert {chave: list(valor) for chave, valor in cortes(LAYOUT, *trecho).items()} == caso["cortes"]


def test_caixas_escondem_o_que_fica_fora_do_trecho():
    # "Tudo" na segunda linha: some a primeira linha inteira e o resto da segunda
    acima, antes, depois, abaixo = caixas_escondidas(LAYOUT, 8, 12, 200, 100)
    assert acima == (0, 0, 200, 50)
    assert antes[2:] == (1, 1) and antes[:2] == (-2, -2), "a palavra começa na borda: nada antes dela"
    assert depois == (100, 50, 100, 50)
    assert abaixo[:2] == (-2, -2)


def test_trecho_inteiro_nao_esconde_nada():
    assert all(caixa == (-2, -2, 1, 1) for caixa in caixas_escondidas(LAYOUT, 0, LAYOUT["n"], 200, 100))


def test_roteiro_so_escreve_quando_o_trecho_muda():
    clipe = {"inicio": 1, "duracao": 2, "animacao": {"entrada": {"tipo": "palavras", "duracao": 1},
                                                    "saida": {"tipo": "nenhuma", "duracao": 0}}}
    roteiro = comandos_das_letras(clipe, LAYOUT, (1, 3), 10, "drawbox@m1c", 200, 100).splitlines()
    # 4 palavras em 1 s: muda em 0; 0,25 (arredondado para o quadro 0,3); 0,5; 0,8 e 1
    assert [linha.split(" ")[0] for linha in roteiro] == ["0.000000", "0.300000", "0.500000", "0.800000", "1.000000"]
    assert "drawbox@m1c3 h" in roteiro[0]


def test_palavras_separadas_por_espaco():
    assert palavras_das_letras("  Oi,  mundo! ") == [[2, 5], [7, 13]]


def test_layout_bate_com_a_imagem_e_separa_as_linhas():
    texto = {"conteudo": "Oi mundo\nTudo bem", "contorno_espessura": 0.1}
    layout = layout_do_texto(texto, 1080)
    assert layout["n"] == 16
    assert layout["palavras"] == [[0, 2], [3, 8], [8, 12], [13, 16]], "a quebra de linha separa palavras"
    primeira, segunda = layout["linhas"]
    assert primeira["y0"] == 0 and segunda["y1"] == 1 and primeira["y1"] == segunda["y0"]
    assert primeira["xs"][0] == 0 and primeira["xs"][-1] == 1
    assert all(a < b for a, b in zip(primeira["xs"], primeira["xs"][1:], strict=False))
    # As letras de dentro ficam onde a imagem tem tinta: a coluna entre "O" e "i" está na parte opaca
    imagem = desenhar_texto(texto, 1080)
    alfa = imagem.getchannel("A")
    meio_da_linha = round(primeira["y1"] * imagem.height / 2)
    x_do_o = round((primeira["xs"][1] - 0.01) * imagem.width)
    assert max(alfa.getpixel((x, meio_da_linha)) for x in range(x_do_o - 5, x_do_o)) > 0


def test_destaque_de_texto_com_brilho_tem_o_tamanho_e_o_layout_do_texto():
    from core.utils.letras import texto_do_destaque
    from core.utils.texto import TEXTO_PADRAO, desenhar_texto, layout_do_texto

    texto = {**TEXTO_PADRAO, "conteudo": "Bom dia, pessoal", "tamanho": 0.06, "brilho": 0.5,
             "destaque": {"modo": "karaoke", "cor": "#ffd400"}}
    destaque = texto_do_destaque(texto)
    assert desenhar_texto(destaque, 1080).size == desenhar_texto(texto, 1080).size
    assert layout_do_texto(destaque, 1080) == layout_do_texto(texto, 1080)
    # A luz do destaque não aparece: na folga do brilho (a borda da imagem) o alfa fica 0, e no texto não
    import numpy as np

    alfa_destaque = np.asarray(desenhar_texto(destaque, 1080).getchannel("A"))
    alfa_texto = np.asarray(desenhar_texto(texto, 1080).getchannel("A"))
    assert alfa_destaque[:4].max() == 0 and alfa_texto[:40].max() > 0
