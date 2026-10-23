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
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

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
# Sublinhado e tachado: a espessura e a altura (abaixo e acima da linha de base), em frações do tamanho
LINHA_ESPESSURA = 0.06
SUBLINHADO_ABAIXO = 0.12
TACHADO_ACIMA = 0.3
# Folga em volta do texto, em frações do tamanho da letra
FOLGA = 0.3
FOLGA_FUNDO = 0.25
RAIO_FUNDO = 0.25
# Sombra deslocada para baixo e para a direita, e desfocada (o padrão: 0,06 do tamanho em cada eixo)
DESLOCAMENTO_SOMBRA = 0.06
DISTANCIA_SOMBRA = DESLOCAMENTO_SOMBRA * math.sqrt(2)
ANGULO_SOMBRA = 45
DESFOQUE_SOMBRA = 0.08
# Contornos além do principal, cada um por fora do anterior
CONTORNOS_EXTRAS = 2
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
    "palavras_chave": None,
    "cor_chave": "#ffd400",
    # Espaço a mais entre as letras (fração do tamanho; negativo aperta) e a altura de cada linha (vezes a letra)
    "espacamento": 0.0,
    "entrelinha": ENTRELINHA,
    "sublinhado": False,
    "tachado": False,
    # Sombra: cor, direção (graus, 0 para a direita e 90 para baixo), distância, desfoque e espalhar
    # (frações do tamanho)
    "sombra_cor": "#000000",
    "sombra_angulo": ANGULO_SOMBRA,
    "sombra_distancia": DISTANCIA_SOMBRA,
    "sombra_desfoque": DESFOQUE_SOMBRA,
    "sombra_espalhar": 0.0,
    # O raio do brilho, em vezes o de sempre
    "brilho_tamanho": 1.0,
    # Até dois contornos por fora do principal: [{"cor", "espessura"}]
    "contornos": None,
    # A opacidade das letras (0 deixa só o contorno: texto vazado)
    "preenchimento": 1.0,
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


def inicios_das_letras(fonte: ImageFont.FreeTypeFont, linha: str, espaco: float) -> list[float]:
    """
    Onde cada letra da linha começa, desde o começo dela, mais o fim (len(linha) + 1 valores). Sem espaçamento,
    o tamanho do prefixo (o caminho de sempre). Com ele, a caneta de cada letra (o prefixo até ela, com o
    kerning do par anterior: getlength(prefixo + letra) - getlength(letra)) mais o espaçamento das anteriores.
    """
    if not espaco:
        return [fonte.getlength(linha[:k]) for k in range(len(linha) + 1)]
    canetas = [fonte.getlength(linha[:k + 1]) - fonte.getlength(linha[k]) + k * espaco for k in range(len(linha))]
    return [*canetas, fonte.getlength(linha) + max(len(linha) - 1, 0) * espaco]


def _medidas(texto: dict, lado_menor: int) -> dict:
    """Fonte, tamanho da imagem e onde cada linha começa, para desenhar e para o layout das letras."""
    tamanho = max(int(round(texto["tamanho"] * lado_menor)), 6)
    fonte = carregar_fonte(texto["fonte"], bool(texto["negrito"]), tamanho)
    linhas = linhas_do_texto(texto)
    subida, descida = fonte.getmetrics()
    altura_linha = round((subida + descida) * texto["entrelinha"])
    espaco = texto["espacamento"] * tamanho
    larguras = [inicios_das_letras(fonte, linha, espaco)[-1] for linha in linhas]
    largura_texto = max(max(larguras), tamanho * 0.3)
    # A entrelinha só separa as linhas: depois da última não sobra espaço
    altura_texto = max(altura_linha * (len(linhas) - 1), 0) + subida + descida

    contorno = round(texto["contorno_espessura"] * tamanho)
    extras = [(round(extra["espessura"] * tamanho), extra["cor"])
              for extra in (texto["contornos"] or [])[:CONTORNOS_EXTRAS]]
    contorno_total = contorno + sum(largura for largura, _ in extras)
    # O brilho espalha em volta das letras: a imagem cresce para ele não ser cortado
    folga = round(tamanho * FOLGA) + contorno_total + (
        round(tamanho * RAIO_BRILHO * texto["brilho_tamanho"]) if texto["brilho"] > 0 else 0)
    if texto["sombra"] > 0:
        # A sombra longe ou muito desfocada também (a de sempre cabe na folga)
        alcance = math.ceil(tamanho * (texto["sombra_distancia"] + 2.5 * texto["sombra_desfoque"]
                                       + texto["sombra_espalhar"] * texto["sombra_desfoque"]))
        folga += max(0, alcance - round(tamanho * FOLGA))
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
            "folga": folga, "largura": int(largura_texto) + 2 * folga, "altura": altura_texto + 2 * folga,
            "espaco": espaco, "larguras": larguras, "subida": subida, "extras": extras,
            "contorno_total": contorno_total}


# Teto do bloco de texto, em múltiplos do lado menor do quadro: sem ele, 500 letras numa linha só com a letra
# no maior tamanho pediam uma imagem de dezenas de milhares de pixels e vários GB de memória por pedido.
# Um título grande de várias linhas fica bem abaixo disso.
LADO_MAXIMO_DO_TEXTO = 8
AREA_MAXIMA_DO_TEXTO = 6


def texto_cabe(texto: dict, lado_menor: int = 1080) -> bool:
    """O bloco de texto fica dentro do teto (só mede: não desenha nada)."""
    medidas = _medidas({**TEXTO_PADRAO, **texto}, lado_menor)
    largura, altura = medidas["largura"], medidas["altura"]
    return (max(largura, altura) <= LADO_MAXIMO_DO_TEXTO * lado_menor
            and largura * altura <= AREA_MAXIMA_DO_TEXTO * lado_menor * lado_menor)


def _mascara_das_chaves(texto: dict, medidas: dict) -> Image.Image | None:
    """Onde ficam as palavras-chave: uma faixa por palavra, da altura da linha, que vai até o meio dos espaços
    vizinhos (para levar junto o contorno das letras). None se não há palavra-chave."""
    chaves = set(texto.get("palavras_chave") or [])
    if not chaves:
        return None
    mascara = Image.new("L", (medidas["largura"], medidas["altura"]), 0)
    desenho = ImageDraw.Draw(mascara)
    fonte, numero = medidas["fonte"], 0
    for indice, (linha, (x, y)) in enumerate(zip(medidas["linhas"], medidas["posicoes"], strict=True)):
        y0 = 0 if indice == 0 else y
        y1 = medidas["altura"] if indice == len(medidas["linhas"]) - 1 else medidas["posicoes"][indice + 1][1]
        palavras = palavras_das_letras(linha)
        # Onde cada letra começa na imagem (e o fim da última)
        xs = [x + inicio for inicio in inicios_das_letras(fonte, linha, medidas["espaco"])]
        for k, (de, ate) in enumerate(palavras):
            if numero + k not in chaves:
                continue
            esquerda = (xs[palavras[k - 1][1]] + xs[de]) / 2 if k > 0 else 0
            direita = (xs[ate] + xs[palavras[k + 1][0]]) / 2 if k + 1 < len(palavras) else medidas["largura"]
            desenho.rectangle((esquerda, y0, direita, y1), fill=255)
        numero += len(palavras)
    return mascara


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
        xs = [(x + inicio) / largura for inicio in inicios_das_letras(medidas["fonte"], linha, medidas["espaco"])]
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


def _letras(texto: dict, medidas: dict, cor: str, contorno: int | None = None,
            cor_contorno: str | None = None) -> Image.Image:
    """
    As letras com o contorno (o principal, ou a largura e a cor dadas), na cor dada. Sem espaçamento, sublinhado
    nem tachado, cada linha num só traço do Pillow (o caminho de sempre). Com eles, letra a letra, em duas
    passadas, como o Pillow faz numa linha: todo o contorno primeiro e o preenchimento por cima (senão o contorno
    de uma letra cobriria a vizinha).
    """
    fonte = medidas["fonte"]
    contorno = medidas["contorno"] if contorno is None else contorno
    camada = Image.new("RGBA", (medidas["largura"], medidas["altura"]), (0, 0, 0, 0))
    desenho = ImageDraw.Draw(camada)
    cheio, borda = (*_rgb(cor), 255), (*_rgb(cor_contorno or texto["contorno_cor"]), 255)
    if not (medidas["espaco"] or texto["sublinhado"] or texto["tachado"]):
        for linha, posicao in zip(medidas["linhas"], medidas["posicoes"], strict=True):
            desenho.text(posicao, linha, font=fonte, fill=cheio, stroke_width=contorno, stroke_fill=borda)
        return camada
    tamanho = medidas["tamanho"]
    grossura = max(1, round(tamanho * LINHA_ESPESSURA))
    riscos = []
    for linha, (x, y), largura_linha in zip(medidas["linhas"], medidas["posicoes"], medidas["larguras"], strict=True):
        base = y + medidas["subida"]
        if texto["sublinhado"] and linha:
            riscos.append((x, base + round(tamanho * SUBLINHADO_ABAIXO), x + largura_linha))
        if texto["tachado"] and linha:
            riscos.append((x, base - round(tamanho * TACHADO_ACIMA), x + largura_linha))
    for passada in ("contorno", "cheio"):
        if passada == "contorno" and not contorno:
            continue
        for linha, (x, y) in zip(medidas["linhas"], medidas["posicoes"], strict=True):
            for letra, inicio in zip(linha, inicios_das_letras(fonte, linha, medidas["espaco"]), strict=False):
                if passada == "contorno":
                    desenho.text((x + inicio, y), letra, font=fonte, fill=borda, stroke_width=contorno,
                                 stroke_fill=borda)
                else:
                    desenho.text((x + inicio, y), letra, font=fonte, fill=cheio)
        recuo = contorno if passada == "contorno" else 0
        for x0, altura_risco, x1 in riscos:
            desenho.rectangle((x0 - recuo, altura_risco - recuo, x1 + recuo, altura_risco + grossura - 1 + recuo),
                              fill=borda if passada == "contorno" else cheio)
    return camada


def _camada_das_letras(texto: dict, medidas: dict) -> Image.Image:
    """
    As letras, o contorno principal e os extras por baixo, com as palavras-chave na cor delas (o mesmo texto
    desenhado de novo, colado só nas faixas das palavras: as letras ficam no mesmo lugar). Com o preenchimento
    abaixo de 1, o anel do contorno fica inteiro e as letras ficam transparentes nessa medida.
    """
    contorno = medidas["contorno"]

    def preenchidas(largura_contorno: int) -> Image.Image:
        camada = _letras(texto, medidas, texto["cor"], largura_contorno)
        mascara = _mascara_das_chaves(texto, medidas)
        if mascara is not None:
            camada.paste(_letras(texto, medidas, texto["cor_chave"], largura_contorno), (0, 0), mascara)
        return camada

    if texto["preenchimento"] >= 1:
        camada = preenchidas(contorno)
    else:
        so_letras = preenchidas(0)
        anel = ImageChops.subtract(_letras(texto, medidas, texto["contorno_cor"], contorno).getchannel("A"),
                                   so_letras.getchannel("A")) if contorno else None
        camada = Image.new("RGBA", so_letras.size, (*_rgb(texto["contorno_cor"]), 0))
        if anel is not None:
            camada.putalpha(anel)
        so_letras.putalpha(so_letras.getchannel("A").point(lambda valor: round(valor * texto["preenchimento"])))
        camada.alpha_composite(so_letras)
    if medidas["extras"]:
        # Do contorno mais de fora para o mais de dentro, cada um com a largura somada dos de dentro
        base = Image.new("RGBA", camada.size, (0, 0, 0, 0))
        acumulado, larguras = contorno, []
        for largura_extra, cor in medidas["extras"]:
            acumulado += largura_extra
            larguras.append((acumulado, cor))
        for largura_total, cor in reversed(larguras):
            base.alpha_composite(_letras(texto, medidas, cor, largura_total, cor))
        base.alpha_composite(camada)
        camada = base
    return camada


def _sombra(texto: dict, camada: Image.Image, tamanho: int) -> Image.Image:
    """A sombra das letras: deslocada pelo ângulo e pela distância, espalhada, desfocada e na cor dela."""
    if abs(texto["sombra_angulo"] - ANGULO_SOMBRA) < 1e-9 and abs(texto["sombra_distancia"] - DISTANCIA_SOMBRA) < 1e-9:
        # A de sempre, como era calculada (o arredondamento do seno e do cosseno mudaria um pixel às vezes)
        dx = dy = max(round(tamanho * DESLOCAMENTO_SOMBRA), 1)
    else:
        angulo = math.radians(texto["sombra_angulo"])
        dx = round(tamanho * texto["sombra_distancia"] * math.cos(angulo))
        dy = round(tamanho * texto["sombra_distancia"] * math.sin(angulo))
    alfa = camada.getchannel("A").point(lambda valor: round(valor * texto["sombra"]))
    espalhar = round(texto["sombra_espalhar"] * texto["sombra_desfoque"] * tamanho)
    if espalhar > 0:
        alfa = alfa.filter(ImageFilter.MaxFilter(2 * espalhar + 1))
    deslocado = Image.new("L", camada.size, 0)
    deslocado.paste(alfa, (dx, dy))
    sombra = Image.new("RGBA", camada.size, (*_rgb(texto["sombra_cor"]), 255))
    sombra.putalpha(deslocado)
    if texto["sombra_desfoque"] > 0:
        sombra = sombra.filter(ImageFilter.GaussianBlur(radius=max(tamanho * texto["sombra_desfoque"], 1)))
    return sombra


def desenhar_texto(texto: dict, lado_menor: int) -> Image.Image:
    """O bloco de texto num PNG transparente, para um quadro cujo lado menor tem `lado_menor` pixels."""
    texto = {**TEXTO_PADRAO, **texto}
    medidas = _medidas(texto, lado_menor)
    tamanho, folga = medidas["tamanho"], medidas["folga"]
    largura, altura = medidas["largura"], medidas["altura"]

    # Texto e contornos numa camada; a sombra e o brilho saem dela
    camada = _camada_das_letras(texto, medidas)

    resultado = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    if texto["fundo_opacidade"] > 0:
        fundo = ImageDraw.Draw(resultado)
        recuo = max(folga - round(tamanho * FOLGA_FUNDO) - medidas["contorno_total"], 0)
        fundo.rounded_rectangle((recuo, recuo, largura - recuo - 1, altura - recuo - 1),
                                radius=round(tamanho * RAIO_FUNDO),
                                fill=(*_rgb(texto["fundo_cor"]), round(255 * texto["fundo_opacidade"])))
    if texto["sombra"] > 0:
        resultado.alpha_composite(_sombra(texto, camada, tamanho))
    if texto["brilho"] > 0:
        # Duas camadas desfocadas: uma larga e fraca, outra justa e forte, para a luz não virar mancha
        alfa = camada.getchannel("A")
        raio_brilho = RAIO_BRILHO * texto["brilho_tamanho"]
        for raio, peso in ((raio_brilho, 0.7), (raio_brilho / 3, 1.0)):
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
