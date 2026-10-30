# -----------------------------------------------
# TakeOne — o desenho de um emoji (o emoji automático das legendas, ADR 0004, 14.8)
#
# A fonte de emoji do servidor (Noto Color Emoji, OFL, do pacote fonts-noto-color-emoji) só tem os desenhos em
# bitmap de 109 pontos: o Pillow desenha nesse tamanho, com as cores da fonte, e a imagem sai cortada em volta do
# desenho, com uma folga transparente. O emoji vira uma imagem da biblioteca, como as formas.
# -----------------------------------------------
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTE_EMOJI = Path(os.environ.get("FONTE_EMOJI", "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"))
# O único tamanho em que a fonte de bitmap desenha
TAMANHO_DA_FONTE = 109
FOLGA = 6


def tem_fonte_de_emoji() -> bool:
    return FONTE_EMOJI.exists()


def desenhar_emoji(emoji: str) -> Image.Image:
    """O emoji em RGBA, cortado em volta do desenho. Lança ValueError se a fonte não o desenha."""
    fonte = ImageFont.truetype(str(FONTE_EMOJI), TAMANHO_DA_FONTE)
    tela = Image.new("RGBA", (TAMANHO_DA_FONTE * 4, TAMANHO_DA_FONTE * 2), (0, 0, 0, 0))
    ImageDraw.Draw(tela).text((TAMANHO_DA_FONTE // 2, TAMANHO_DA_FONTE // 2), emoji, font=fonte, embedded_color=True)
    caixa = tela.getchannel("A").getbbox()
    if not caixa:
        raise ValueError("A fonte de emoji não desenha este emoji.")
    x0, y0, x1, y1 = caixa
    return tela.crop((max(0, x0 - FOLGA), max(0, y0 - FOLGA),
                      min(tela.width, x1 + FOLGA), min(tela.height, y1 + FOLGA)))


def gravar_emoji(emoji: str, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    desenhar_emoji(emoji).save(destino, "PNG")
