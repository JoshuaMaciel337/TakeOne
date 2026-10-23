# -----------------------------------------------
# TakeOne — camadas de pixels do editor de imagem: o PNG de cada versão, conferido antes de guardar
# -----------------------------------------------
from pathlib import Path

from PIL import Image

# O proxy do Next guarda o corpo inteiro de cada pedido e corta em 10 MB: as partes têm 8, como no tus
BYTES_DA_PARTE = 8 * 1024 * 1024
# Uma camada de 8192 × 8192 sem compressão nenhuma tem 256 MB; o PNG fica abaixo disso
BYTES_MAXIMOS = 300 * 1024 * 1024
LADO_MAXIMO = 8192
PIXELS_MAXIMOS = 36_000_000


class ErroPixels(Exception):
    """O PNG enviado não serve como versão da camada; a mensagem vai para a pessoa."""


def conferir_png(caminho: Path, largura: int, altura: int) -> None:
    """Confere que o arquivo é um PNG inteiro do tamanho da camada, sem decodificar mais do que o necessário."""
    if caminho.stat().st_size > BYTES_MAXIMOS:
        raise ErroPixels("A camada passa de 300 MB.")
    try:
        with Image.open(caminho) as imagem:
            if imagem.format != "PNG":
                raise ErroPixels("A versão da camada precisa ser um PNG.")
            if imagem.size != (largura, altura):
                raise ErroPixels(f"A camada tem {largura} × {altura} pixels; o PNG veio com {imagem.width} × "
                                 f"{imagem.height}.")
            if imagem.mode not in ("RGBA", "RGB", "LA", "L", "P"):
                raise ErroPixels("O PNG precisa ser RGB ou RGBA de 8 bits.")
            # Lê até o fim: um PNG cortado (envio pela metade) falha aqui, não na prévia
            imagem.load()
    except ErroPixels:
        raise
    except Exception as erro:
        raise ErroPixels("O PNG da camada está incompleto ou estragado.") from erro
