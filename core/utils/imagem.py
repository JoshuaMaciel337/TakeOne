# -----------------------------------------------
# TakeOne — fotos e imagens da biblioteca (JPG, PNG, WebP)
#
# A ingestão de uma imagem não passa pelo FFmpeg: o Pillow abre o arquivo, gira pela orientação do EXIF
# (o navegador gira, o FFmpeg não, e a prévia ficaria diferente do vídeo exportado) e grava:
#   imagem.png    — para o render, no máximo 4096 px no lado maior, com a transparência se houver
#   proxy.webp    — para a prévia, no máximo 1920 px, com a transparência
#   capa.jpg      — para a biblioteca, 640 px de largura, sobre um fundo escuro se for transparente
#   miniaturas.jpg — uma miniatura só (a linha do tempo repete a mesma ao longo do clipe)
# -----------------------------------------------
from pathlib import Path

from PIL import Image, ImageOps

LADO_MAXIMO_RENDER = 4096
LADO_MAXIMO_PROXY = 1920
LARGURA_CAPA = 640
LARGURA_MINIATURA = 160
# Acima disso o arquivo é recusado: uma imagem de 100 milhões de pixels já ocupa 400 MB aberta
PIXELS_MAXIMOS = 100_000_000
FUNDO_DA_CAPA = (24, 25, 32)


class ImagemInvalida(ValueError):
    """A imagem não abre ou não serve: a mensagem vai para a pessoa."""


def _reduzida(imagem: Image.Image, lado_maximo: int) -> Image.Image:
    if max(imagem.size) <= lado_maximo:
        return imagem
    escala = lado_maximo / max(imagem.size)
    return imagem.resize((max(1, round(imagem.width * escala)), max(1, round(imagem.height * escala))),
                         Image.Resampling.LANCZOS)


def _tem_transparencia(imagem: Image.Image) -> bool:
    if imagem.mode != "RGBA":
        return False
    menor, _ = imagem.getchannel("A").getextrema()
    return menor < 255


def _sobre_fundo(imagem: Image.Image) -> Image.Image:
    if imagem.mode != "RGBA":
        return imagem.convert("RGB")
    fundo = Image.new("RGB", imagem.size, FUNDO_DA_CAPA)
    fundo.paste(imagem, mask=imagem.getchannel("A"))
    return fundo


def abrir_imagem(caminho: Path) -> Image.Image:
    """A imagem já girada pelo EXIF, em RGB ou RGBA (CMYK, paleta e 16 bits viram RGB/RGBA). O SVG é desenhado
    pelo Chromium do worker (core/utils/svg.py), em RGBA."""
    if caminho.suffix.lower() == ".svg":
        from core.utils.svg import SvgInvalido, rasterizar_svg

        try:
            return rasterizar_svg(caminho.read_bytes())
        except SvgInvalido as e:
            raise ImagemInvalida(str(e)) from e
    try:
        with Image.open(caminho) as arquivo:
            if arquivo.width * arquivo.height > PIXELS_MAXIMOS:
                raise ImagemInvalida(f"A imagem é grande demais ({arquivo.width}×{arquivo.height}). "
                                     "Use uma de até 100 megapixels.")
            if getattr(arquivo, "n_frames", 1) > 1:
                arquivo.seek(0)
            imagem = ImageOps.exif_transpose(arquivo)
            imagem.load()
    except ImagemInvalida:
        raise
    except Exception as e:
        raise ImagemInvalida("O arquivo não é uma imagem válida. Confira se ele abre no computador.") from e
    tem_alfa = imagem.mode in ("RGBA", "LA", "PA") or (imagem.mode == "P" and "transparency" in imagem.info)
    if imagem.mode == "I;16" or imagem.mode == "I":
        imagem = imagem.point(lambda v: v / 256).convert("L")
    return imagem.convert("RGBA" if tem_alfa else "RGB")


def preparar_imagem(original: Path, pasta: Path) -> dict:
    """Grava os quatro arquivos da imagem em `pasta` e devolve {largura, altura, transparente} da imagem.png."""
    imagem = abrir_imagem(original)
    transparente = _tem_transparencia(imagem)
    if not transparente and imagem.mode == "RGBA":
        imagem = imagem.convert("RGB")

    render = _reduzida(imagem, LADO_MAXIMO_RENDER)
    render.save(pasta / "imagem.png", optimize=False, compress_level=6)
    _reduzida(imagem, LADO_MAXIMO_PROXY).save(pasta / "proxy.webp", quality=90, method=4)

    opaca = _sobre_fundo(imagem)
    capa = opaca.resize((LARGURA_CAPA, max(1, round(opaca.height * LARGURA_CAPA / opaca.width))),
                        Image.Resampling.LANCZOS)
    capa.save(pasta / "capa.jpg", quality=88)
    miniatura = capa.resize((LARGURA_MINIATURA, max(1, round(capa.height * LARGURA_MINIATURA / capa.width))),
                            Image.Resampling.LANCZOS)
    miniatura.save(pasta / "miniaturas.jpg", quality=85)
    return {"largura": render.width, "altura": render.height, "transparente": transparente,
            "miniatura": {"largura": miniatura.width, "altura": miniatura.height}}


def quadro_inicial(caminho: Path, tamanho: tuple[int, int], destino: Path):
    """A imagem cobrindo `tamanho` (cortada no meio, como o "cobrir" da prévia), em RGB e sem transparência,
    para ser o primeiro quadro de um vídeo gerado. O transparente vira o fundo escuro da capa."""
    largura, altura = tamanho
    imagem = _sobre_fundo(abrir_imagem(caminho))
    escala = max(largura / imagem.width, altura / imagem.height)
    medida = (max(largura, round(imagem.width * escala)), max(altura, round(imagem.height * escala)))
    imagem = imagem.resize(medida, Image.Resampling.LANCZOS)
    x, y = (medida[0] - largura) // 2, (medida[1] - altura) // 2
    imagem.crop((x, y, x + largura, y + altura)).save(destino, "PNG")
