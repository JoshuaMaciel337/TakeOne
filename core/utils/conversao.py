# -----------------------------------------------
# TakeOne — conversão da imagem exportada para os formatos que o navegador não grava (ADR 0003, onda 13.13)
#
# O editor de imagem exporta no navegador (PNG, JPG, WebP e os formatos escritos à mão: GIF, PNG-8, TIFF, BMP, ICO e
# PDF). O AVIF o Chrome lê mas não grava: o PNG exportado sobe em partes e o Pillow (libavif) faz o AVIF.
# -----------------------------------------------
import io
from pathlib import Path

from PIL import Image

from core.utils.pixels import PIXELS_MAXIMOS, ErroPixels

FORMATOS_DA_CONVERSAO = {"avif": "image/avif"}


def converter_imagem(caminho: Path, formato: str, qualidade: int) -> bytes:
    """O PNG convertido; a transparência vai junto. Erro de leitura vira ErroPixels (a mensagem vai para a pessoa)."""
    if formato not in FORMATOS_DA_CONVERSAO:
        raise ErroPixels("Formato de conversão desconhecido.")
    try:
        with Image.open(caminho) as imagem:
            if imagem.format != "PNG":
                raise ErroPixels("A conversão recebe um PNG.")
            if imagem.width * imagem.height > PIXELS_MAXIMOS:
                raise ErroPixels("A imagem passa de 36 megapixels.")
            imagem.load()
            modo = "RGBA" if imagem.mode in ("RGBA", "LA", "P") else "RGB"
            convertida = imagem.convert(modo)
    except ErroPixels:
        raise
    except Exception as erro:
        raise ErroPixels("O PNG enviado está incompleto ou estragado.") from erro
    saida = io.BytesIO()
    # A velocidade 8 deixa uma foto grande em segundos; a diferença de tamanho para a 6 fica em poucos por cento
    convertida.save(saida, format="AVIF", quality=max(0, min(100, qualidade)), speed=8)
    return saida.getvalue()
