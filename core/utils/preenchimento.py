# -----------------------------------------------
# TakeOne — as contas de imagem do preenchimento generativo (Pillow, sem o modelo)
# A entrada é um PNG com o alfa 0 na área a preencher. Ela vai ao modelo no tamanho dele (geracao.py), e o que volta
# é levado ao tamanho da entrada; o resultado é só a área pedida (um pouco maior e com a borda suave no alfa), que o
# editor põe como camada por cima do recorte: o resto da imagem fica exatamente como era.
# -----------------------------------------------
from PIL import Image, ImageFilter, ImageStat

from core.modelos.geracao import tamanho_do_preenchimento

# A área pedida cresce uns pixels e a borda é suavizada, para a emenda sumir (em pixels da entrada)
CRESCER = 5
SUAVIZAR = 2.5


class EntradaInvalida(ValueError):
    pass


def ler_entrada(caminho) -> Image.Image:
    """O PNG da entrada, em RGBA, com alguma área a preencher (alfa abaixo de 128)."""
    try:
        with Image.open(caminho) as imagem:
            imagem.load()
            entrada = imagem.convert("RGBA")
    except OSError as e:
        raise EntradaInvalida("A imagem do preenchimento não pôde ser lida.") from e
    if entrada.getchannel("A").point(lambda v: 255 if v < 128 else 0).getbbox() is None:
        raise EntradaInvalida("Marque a área a preencher.")
    return entrada


def para_o_modelo(entrada: Image.Image) -> Image.Image:
    """A entrada no tamanho do modelo; o alfa continua 0 ou 255 (a máscara do VACE é dura)."""
    largura, altura = tamanho_do_preenchimento(*entrada.size)
    cor = entrada.convert("RGB").resize((largura, altura), Image.LANCZOS)
    alfa = entrada.getchannel("A").resize((largura, altura), Image.BILINEAR).point(lambda v: 255 if v >= 128 else 0)
    cor.putalpha(alfa)
    return cor


def mascara_suave(entrada: Image.Image) -> Image.Image:
    """Onde o resultado entra: a área pedida, crescida e com a borda suave (255 dentro)."""
    buraco = entrada.getchannel("A").point(lambda v: 255 if v < 128 else 0)
    return buraco.filter(ImageFilter.MaxFilter(2 * CRESCER + 1)).filter(ImageFilter.GaussianBlur(SUAVIZAR))


def compor(entrada: Image.Image, gerada: Image.Image) -> Image.Image:
    """O resultado do modelo no tamanho da entrada, com o alfa da máscara suave (transparente fora da área)."""
    resultado = gerada.convert("RGB").resize(entrada.size, Image.LANCZOS)
    resultado.putalpha(mascara_suave(entrada))
    return resultado


def simular(entrada: Image.Image) -> Image.Image:
    """Sem o modelo (o CI): a área pedida na cor média da volta dela."""
    buraco = entrada.getchannel("A").point(lambda v: 255 if v < 128 else 0)
    # O anel em volta: a área crescida, menos ela mesma
    fora = Image.eval(buraco, lambda v: 255 - v)
    anel = Image.composite(buraco.filter(ImageFilter.MaxFilter(15)), Image.new("L", entrada.size, 0), fora)
    media = ImageStat.Stat(entrada.convert("RGB"), anel).mean if anel.getbbox() else [128, 128, 128]
    return compor(entrada, Image.new("RGB", entrada.size, tuple(round(c) for c in media)))
