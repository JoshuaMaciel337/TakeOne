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


def desenhar_texto(texto: dict, lado_menor: int) -> Image.Image:
    """O bloco de texto num PNG transparente, para um quadro cujo lado menor tem `lado_menor` pixels."""
    texto = {**TEXTO_PADRAO, **texto}
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
    folga = round(tamanho * FOLGA) + contorno
    largura = int(largura_texto) + 2 * folga
    altura = altura_texto + 2 * folga

    # Texto e contorno numa camada; a sombra sai dela
    camada = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    desenho = ImageDraw.Draw(camada)
    for linha, largura_linha, indice in zip(linhas, larguras, range(len(linhas)), strict=True):
        if texto["alinhamento"] == "esquerda":
            x = folga
        elif texto["alinhamento"] == "direita":
            x = folga + largura_texto - largura_linha
        else:
            x = folga + (largura_texto - largura_linha) / 2
        y = folga + indice * altura_linha
        desenho.text((x, y), linha, font=fonte, fill=(*_rgb(texto["cor"]), 255),
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
    resultado.alpha_composite(camada)
    return resultado


def para_png(imagem: Image.Image) -> bytes:
    saida = io.BytesIO()
    imagem.save(saida, format="PNG", compress_level=6)
    return saida.getvalue()
