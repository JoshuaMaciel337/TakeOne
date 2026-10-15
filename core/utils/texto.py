# -----------------------------------------------
# TakeOne — imagem dos clipes de texto
#
# O texto vira um PNG transparente do tamanho do bloco. A prévia mostra esse PNG (pedido à API) e
# o render sobrepõe o mesmo PNG, gerado aqui no worker no tamanho do vídeo: o que aparece no
# editor é o que sai, sem depender das fontes do navegador. Ideia do HolyCut (core/utils/arte.py).
#
# O tamanho da letra é uma fração do lado menor do quadro, então o PNG é desenhado para um "lado
# de referência" e a caixa no quadro escala na mesma proporção (core/utils/geometria.py).
# Fontes em core/fontes, com licença OFL (podem ser queimadas no vídeo).
# -----------------------------------------------
import io
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from core.utils.letras import palavras_das_letras

PASTA_FONTES = Path(__file__).resolve().parent.parent / "fontes"

# Família → (arquivo, eixos da fonte variável no peso normal e no negrito). Os eixos vão em números:
# pelo nome da variação, a Inter caía no tamanho óptico de display, mais estreito.
FONTES = {
    "display": ("Montserrat[wght].ttf", {False: [600], True: [800]}),
    "texto": ("Inter[opsz,wght].ttf", {False: [14, 500], True: [14, 700]}),
    "manuscrita": ("Caveat[wght].ttf", {False: [400], True: [700]}),
}
ENTRELINHA = 1.15
# Folga em volta do texto, em frações do tamanho da letra
FOLGA = 0.3
FOLGA_FUNDO = 0.25
RAIO_FUNDO = 0.25
# Sombra deslocada para baixo e para a direita, e desfocada
DESLOCAMENTO_SOMBRA = 0.06
DESFOQUE_SOMBRA = 0.08
# Brilho: o texto desfocado na cor do brilho, por baixo dele, com este raio (fração da letra)
RAIO_BRILHO = 0.18
MAXIMO_LINHAS = 12

TEXTO_PADRAO = {
    "conteudo": "Texto",
    "fonte": "display",
    "negrito": True,
    "caixa_alta": False,
    "tamanho": 0.07,
    "cor": "#ffffff",
    "alinhamento": "centro",
    "contorno_cor": "#000000",
    "contorno_espessura": 0.0,
    "sombra": 0.0,
    "fundo_cor": "#000000",
    "fundo_opacidade": 0.0,
    "brilho": 0.0,
    "brilho_cor": "#ffffff",
}


@lru_cache(maxsize=64)
def carregar_fonte(familia: str, negrito: bool, tamanho: int) -> ImageFont.FreeTypeFont:
    arquivo, pesos = FONTES.get(familia, FONTES["display"])
    # Motor de layout fixo: com a libraqm numa máquina e sem ela em outra, o mesmo texto media
    # larguras diferentes (aprendido no HolyCut). O BASIC existe em todo lugar e atende o português.
    fonte = ImageFont.truetype(str(PASTA_FONTES / arquivo), tamanho, layout_engine=ImageFont.Layout.BASIC)
    fonte.set_variation_by_axes(pesos[negrito])
    return fonte


def _rgb(cor: str) -> tuple[int, int, int]:
    cor = cor.lstrip("#")
    return int(cor[0:2], 16), int(cor[2:4], 16), int(cor[4:6], 16)


def linhas_do_texto(texto: dict) -> list[str]:
    """As linhas como a pessoa digitou (sem quebra automática), em caixa alta se pedido."""
    conteudo = texto["conteudo"].upper() if texto.get("caixa_alta") else texto["conteudo"]
    linhas = conteudo.replace("\r\n", "\n").split("\n")[:MAXIMO_LINHAS]
    return linhas or [""]


def _medidas(texto: dict, lado_menor: int) -> dict:
    """Fonte, tamanho da imagem e onde cada linha começa, para desenhar e para o layout das letras."""
    tamanho = max(int(round(texto["tamanho"] * lado_menor)), 6)
    fonte = carregar_fonte(texto["fonte"], bool(texto["negrito"]), tamanho)
    linhas = linhas_do_texto(texto)
    subida, descida = fonte.getmetrics()
    altura_linha = round((subida + descida) * ENTRELINHA)
    larguras = [fonte.getlength(linha) for linha in linhas]
    largura_texto = max(max(larguras), tamanho * 0.3)
    # A entrelinha só separa as linhas: depois da última não sobra espaço
    altura_texto = altura_linha * (len(linhas) - 1) + subida + descida

    contorno = round(texto["contorno_espessura"] * tamanho)
    # O brilho espalha em volta das letras: a imagem cresce para ele não ser cortado
    folga = round(tamanho * FOLGA) + contorno + (round(tamanho * RAIO_BRILHO) if texto["brilho"] > 0 else 0)
    posicoes = []
    for indice, largura_linha in enumerate(larguras):
        if texto["alinhamento"] == "esquerda":
            x = folga
        elif texto["alinhamento"] == "direita":
            x = folga + largura_texto - largura_linha
        else:
            x = folga + (largura_texto - largura_linha) / 2
        posicoes.append((x, folga + indice * altura_linha))
    return {"tamanho": tamanho, "fonte": fonte, "linhas": linhas, "posicoes": posicoes, "contorno": contorno,
            "folga": folga, "largura": int(largura_texto) + 2 * folga, "altura": altura_texto + 2 * folga}


def layout_do_texto(texto: dict, lado_menor: int) -> dict:
    """
    Onde fica cada letra no PNG de desenhar_texto, em frações da imagem (core/utils/letras.py):
    n: quantas letras, sem as quebras de linha; palavras: [de, ate) de cada uma;
    linhas: a faixa y0–y1 de cada linha e o x onde cada letra começa, mais o fim (xs).
    As faixas cobrem a imagem inteira, e a primeira e a última letra de cada linha vão até a borda,
    para o contorno e a sombra aparecerem junto com a letra.
    """
    texto = {**TEXTO_PADRAO, **texto}
    medidas = _medidas(texto, lado_menor)
    largura, altura = medidas["largura"], medidas["altura"]
    linhas = []
    for indice, (linha, (x, y)) in enumerate(zip(medidas["linhas"], medidas["posicoes"], strict=True)):
        xs = [(x + medidas["fonte"].getlength(linha[:k])) / largura for k in range(len(linha) + 1)]
        if xs:
            xs[0], xs[-1] = 0.0, 1.0
        y0 = 0.0 if indice == 0 else y / altura
        y1 = 1.0 if indice == len(medidas["linhas"]) - 1 else medidas["posicoes"][indice + 1][1] / altura
        linhas.append({"y0": round(y0, 6), "y1": round(y1, 6), "xs": [round(v, 6) for v in xs]})
    # As palavras não passam de uma linha para a outra
    palavras, contadas = [], 0
    for linha in medidas["linhas"]:
        palavras += [[de + contadas, ate + contadas] for de, ate in palavras_das_letras(linha)]
        contadas += len(linha)
    return {"n": contadas, "palavras": palavras, "linhas": linhas}


def desenhar_texto(texto: dict, lado_menor: int) -> Image.Image:
    """O bloco de texto num PNG transparente, para um quadro cujo lado menor tem `lado_menor` pixels."""
    texto = {**TEXTO_PADRAO, **texto}
    medidas = _medidas(texto, lado_menor)
    tamanho, fonte, contorno, folga = medidas["tamanho"], medidas["fonte"], medidas["contorno"], medidas["folga"]
    largura, altura = medidas["largura"], medidas["altura"]

    # Texto e contorno numa camada; a sombra sai dela
    camada = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    desenho = ImageDraw.Draw(camada)
    for linha, posicao in zip(medidas["linhas"], medidas["posicoes"], strict=True):
        desenho.text(posicao, linha, font=fonte, fill=(*_rgb(texto["cor"]), 255),
                     stroke_width=contorno, stroke_fill=(*_rgb(texto["contorno_cor"]), 255))

    resultado = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    if texto["fundo_opacidade"] > 0:
        fundo = ImageDraw.Draw(resultado)
        recuo = max(folga - round(tamanho * FOLGA_FUNDO) - contorno, 0)
        fundo.rounded_rectangle((recuo, recuo, largura - recuo - 1, altura - recuo - 1),
                                radius=round(tamanho * RAIO_FUNDO),
                                fill=(*_rgb(texto["fundo_cor"]), round(255 * texto["fundo_opacidade"])))
    if texto["sombra"] > 0:
        sombra = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
        alfa = camada.getchannel("A").point(lambda valor: round(valor * texto["sombra"]))
        deslocamento = max(round(tamanho * DESLOCAMENTO_SOMBRA), 1)
        sombra.paste((0, 0, 0, 255), (deslocamento, deslocamento), alfa.crop((0, 0, largura - deslocamento,
                                                                              altura - deslocamento)))
        resultado.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(radius=max(tamanho * DESFOQUE_SOMBRA, 1))))
    if texto["brilho"] > 0:
        # Duas camadas desfocadas: uma larga e fraca, outra justa e forte, para a luz não virar mancha
        alfa = camada.getchannel("A")
        for raio, peso in ((RAIO_BRILHO, 0.7), (RAIO_BRILHO / 3, 1.0)):
            desfocado = alfa.filter(ImageFilter.GaussianBlur(radius=max(tamanho * raio, 1)))
            forca = min(1.0, texto["brilho"] * peso * 1.6)
            luz = Image.new("RGBA", (largura, altura), (*_rgb(texto["brilho_cor"]), 255))
            luz.putalpha(desfocado.point(lambda valor, forca=forca: min(255, round(valor * forca))))
            resultado.alpha_composite(luz)
    resultado.alpha_composite(camada)
    return resultado


def para_png(imagem: Image.Image) -> bytes:
    saida = io.BytesIO()
    imagem.save(saida, format="PNG", compress_level=6)
    return saida.getvalue()
