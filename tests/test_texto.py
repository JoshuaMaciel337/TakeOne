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


def test_brilho_espalha_a_cor_em_volta_das_letras():
    base = {"conteudo": "Oi", "cor": "#ffffff"}
    sem = desenhar_texto(base, 1080)
    com = desenhar_texto({**base, "brilho": 0.8, "brilho_cor": "#ff0000"}, 1080)
    assert com.width > sem.width, "a imagem cresce para o brilho não ser cortado"
    # Na borda de cima, longe das letras, a luz é vermelha e meio transparente
    vermelhos = [com.getpixel((x, com.height // 8)) for x in range(com.width)]
    assert any(r > 200 and g < 80 and 0 < a < 255 for r, g, _, a in vermelhos)


def test_texto_grande_demais_fica_de_fora_sem_desenhar():
    # 500 letras numa linha, com a letra no maior tamanho: pedia dezenas de milhares de pixels e vários GB
    from core.utils.texto import texto_cabe

    assert not texto_cabe({"conteudo": "W" * 500, "tamanho": 0.3, "sombra": 1, "brilho": 1})
    # Um título grande de várias linhas e uma legenda comum cabem com folga
    assert texto_cabe({"conteudo": "PROMOÇÃO\nDE VERÃO\nSÓ HOJE", "tamanho": 0.15, "brilho": 1})
    assert texto_cabe({"conteudo": "Uma legenda comum de duas linhas\ncom o texto da fala", "tamanho": 0.05})


def test_api_recusa_o_texto_grande_demais():
    import pytest
    from pydantic import ValidationError

    from api.esquemas import ImagemTextoEntrada

    with pytest.raises(ValidationError, match="grande demais"):
        ImagemTextoEntrada(texto={"conteudo": "W" * 500, "tamanho": 0.3}, lado_menor=2160)
