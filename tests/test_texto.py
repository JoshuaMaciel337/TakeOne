# Imagem dos clipes de texto: o mesmo desenho vai para a prévia e para o render
from core.utils.texto import desenhar_texto, linhas_do_texto


def test_tamanho_acompanha_o_lado_menor_do_quadro():
    texto = {"conteudo": "Olá, mundo\nsegunda linha", "tamanho": 0.07}
    pequeno = desenhar_texto(texto, 1080)
    grande = desenhar_texto(texto, 2160)
    assert abs(grande.width / pequeno.width - 2) < 0.05
    assert abs(grande.height / pequeno.height - 2) < 0.05
    assert pequeno.height > desenhar_texto({"conteudo": "Uma linha"}, 1080).height * 1.6


def test_linhas_como_digitadas_e_caixa_alta():
    assert linhas_do_texto({"conteudo": "a\r\nb\nc", "caixa_alta": True}) == ["A", "B", "C"]
    assert linhas_do_texto({"conteudo": "", "caixa_alta": False}) == [""]
    assert desenhar_texto({"conteudo": ""}, 1080).width > 0, "texto vazio ainda vira uma imagem"


def test_contorno_fundo_e_transparencia():
    simples = desenhar_texto({"conteudo": "Oi"}, 1080)
    assert simples.getpixel((0, 0))[3] == 0, "fora do texto é transparente"
    com_contorno = desenhar_texto({"conteudo": "Oi", "contorno_espessura": 0.2}, 1080)
    assert com_contorno.width > simples.width
    com_fundo = desenhar_texto({"conteudo": "Oi", "fundo_cor": "#ff3d77", "fundo_opacidade": 1}, 1080)
    meio = com_fundo.getpixel((com_fundo.width // 2, com_fundo.height - 12))
    assert meio == (255, 61, 119, 255), "embaixo das letras, o fundo aparece inteiro"


def test_alinhamento_muda_onde_a_linha_curta_fica():
    def primeira_coluna_com_tinta(imagem, y):
        return next(x for x in range(imagem.width) if imagem.getpixel((x, y))[3] > 128)

    base = {"conteudo": "Linha bem comprida\nCurta"}
    esquerda = desenhar_texto({**base, "alinhamento": "esquerda"}, 1080)
    direita = desenhar_texto({**base, "alinhamento": "direita"}, 1080)
    y = int(esquerda.height * 0.72)   # na segunda linha
    assert primeira_coluna_com_tinta(esquerda, y) < primeira_coluna_com_tinta(direita, y)
