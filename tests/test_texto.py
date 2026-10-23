# Imagem dos clipes de texto: o mesmo desenho vai para a prévia e para o render
from core.utils.texto import TEXTO_PADRAO, carregar_fonte, desenhar_texto, layout_do_texto, linhas_do_texto


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


# -----------------------------------------------
# Espaçamento, entrelinha, sublinhado e tachado
# -----------------------------------------------
def test_espacamento_afasta_as_letras_e_o_layout_acompanha():
    base = {**TEXTO_PADRAO, "conteudo": "ABCDE", "tamanho": 0.1}
    junto = desenhar_texto(base, 1000)
    afastado = desenhar_texto({**base, "espacamento": 0.2}, 1000)
    # Quatro espaços de 0,2 × 100 px entre as cinco letras
    assert afastado.width - junto.width == 80
    layout = layout_do_texto({**base, "espacamento": 0.2}, 1000)["linhas"][0]["xs"]
    sem = layout_do_texto(base, 1000)["linhas"][0]["xs"]
    # Do começo de uma letra ao da seguinte: o avanço dela (com o kerning) mais os 20 px
    passos = [(b - a) * afastado.width for a, b in zip(layout[1:-2], layout[2:-1], strict=True)]
    passos_sem = [(b - a) * junto.width for a, b in zip(sem[1:-2], sem[2:-1], strict=True)]
    assert all(abs(c - s - 20) < 0.5 for c, s in zip(passos, passos_sem, strict=True))


def test_espacamento_negativo_aperta_e_kerning_continua():
    fonte = carregar_fonte("display", True, 100)
    from core.utils.texto import inicios_das_letras

    # Com espaçamento quase zero, a caneta de cada letra é a do Pillow na linha inteira (kerning incluído)
    quase = inicios_das_letras(fonte, "AVATAR", 1e-9)
    assert abs(quase[-1] - fonte.getlength("AVATAR")) < 1e-3
    apertado = desenhar_texto({**TEXTO_PADRAO, "conteudo": "AVATAR", "tamanho": 0.1, "espacamento": -0.05}, 1000)
    normal = desenhar_texto({**TEXTO_PADRAO, "conteudo": "AVATAR", "tamanho": 0.1}, 1000)
    assert normal.width - apertado.width == 25


def test_entrelinha_muda_a_distancia_entre_as_linhas():
    base = {**TEXTO_PADRAO, "conteudo": "Um\nDois\nTrês", "tamanho": 0.1}
    normal = desenhar_texto(base, 1000)
    larga = desenhar_texto({**base, "entrelinha": 2}, 1000)
    subida, descida = carregar_fonte("display", True, 100).getmetrics()
    esperado = 2 * (round((subida + descida) * 2) - round((subida + descida) * 1.15))
    assert larga.height - normal.height == esperado


def test_sublinhado_e_tachado_riscam_a_linha():
    base = {**TEXTO_PADRAO, "conteudo": "ooo", "tamanho": 0.1}
    liso = desenhar_texto(base, 1000)
    sublinhado = desenhar_texto({**base, "sublinhado": True}, 1000)
    tachado = desenhar_texto({**base, "tachado": True}, 1000)

    def linhas_cheias(imagem):
        alfa = imagem.getchannel("A")
        return [y for y in range(imagem.height) if all(alfa.getpixel((x, y)) > 200
                                                       for x in range(30 + 2, imagem.width - 30 - 2, 3))]

    assert linhas_cheias(liso) == []
    abaixo, acima = linhas_cheias(sublinhado), linhas_cheias(tachado)
    assert abaixo and acima and min(abaixo) > max(acima), "o sublinhado fica abaixo do tachado"


# -----------------------------------------------
# Efeitos: sombra completa, contornos extras, brilho maior e texto vazado
# -----------------------------------------------
def _centro_do_alfa(imagem, canal_extra=None):
    alfa = imagem.getchannel("A")
    soma = sx = sy = 0
    for y in range(0, imagem.height, 2):
        for x in range(0, imagem.width, 2):
            valor = alfa.getpixel((x, y))
            if canal_extra and not canal_extra(imagem.getpixel((x, y))):
                continue
            soma += valor
            sx += x * valor
            sy += y * valor
    return sx / soma, sy / soma


def test_sombra_com_cor_e_angulo():
    base = {**TEXTO_PADRAO, "conteudo": "I", "tamanho": 0.2, "sombra": 1, "sombra_cor": "#ff0000",
            "sombra_distancia": 0.15, "sombra_desfoque": 0.01}
    para_baixo = desenhar_texto({**base, "sombra_angulo": 90}, 1000)
    para_cima = desenhar_texto({**base, "sombra_angulo": -90}, 1000)
    # A sombra vermelha aparece onde a letra branca não está
    vermelho = lambda px: px[0] > 150 and px[1] < 80 and px[3] > 100  # noqa: E731
    assert _centro_do_alfa(para_baixo, vermelho)[1] > _centro_do_alfa(para_cima, vermelho)[1] + 40
    # A imagem cresce para a sombra longe caber (a de sempre não muda o tamanho)
    longe = desenhar_texto({**base, "sombra_angulo": 90, "sombra_distancia": 0.4}, 1000)
    assert longe.height > desenhar_texto({**base, "sombra": 0}, 1000).height


def test_contornos_extras_ficam_por_fora_do_principal():
    base = {**TEXTO_PADRAO, "conteudo": "O", "tamanho": 0.2, "contorno_espessura": 0.05, "contorno_cor": "#000000"}
    com_extra = desenhar_texto({**base, "contornos": [{"cor": "#00ff00", "espessura": 0.05}]}, 1000)
    sem = desenhar_texto(base, 1000)
    assert com_extra.width == sem.width + 2 * 10, "a folga cresce com o contorno extra"
    verdes = [com_extra.getpixel((x, com_extra.height // 2)) for x in range(com_extra.width)]
    primeiro_verde = next(i for i, px in enumerate(verdes) if px[1] > 200 and px[0] < 80 and px[3] > 200)
    primeiro_preto = next(i for i, px in enumerate(verdes) if px[3] > 200 and max(px[:3]) < 60)
    assert primeiro_verde < primeiro_preto, "o verde vem antes (por fora) do preto"


def test_texto_vazado_deixa_so_o_contorno():
    base = {**TEXTO_PADRAO, "conteudo": "I", "tamanho": 0.3, "contorno_espessura": 0.06}
    cheio = desenhar_texto(base, 1000)
    vazado = desenhar_texto({**base, "preenchimento": 0}, 1000)
    meio = (cheio.width // 2, cheio.height // 2)
    assert cheio.getpixel(meio)[3] == 255 and vazado.getpixel(meio)[3] == 0, "o miolo da letra fica transparente"
    linha = [vazado.getpixel((x, meio[1]))[3] for x in range(vazado.width)]
    assert max(linha) == 255, "o contorno continua"
    meio_cheio = desenhar_texto({**base, "preenchimento": 0.5}, 1000)
    assert abs(meio_cheio.getpixel(meio)[3] - 128) <= 1


def test_brilho_maior_cresce_a_imagem():
    base = {**TEXTO_PADRAO, "conteudo": "Luz", "tamanho": 0.1, "brilho": 0.8}
    normal = desenhar_texto(base, 1000)
    largo = desenhar_texto({**base, "brilho_tamanho": 2}, 1000)
    assert largo.width - normal.width == 2 * (round(100 * 0.18 * 2) - round(100 * 0.18))
