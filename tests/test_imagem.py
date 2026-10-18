# Imagens da biblioteca: orientação do EXIF, transparência, tamanhos e arquivos que não servem
import pytest
from PIL import Image

from core.utils import imagem as modulo
from core.utils.imagem import (
    FUNDO_DA_CAPA,
    LADO_MAXIMO_PROXY,
    LADO_MAXIMO_RENDER,
    ImagemInvalida,
    abrir_imagem,
    preparar_imagem,
    quadro_inicial,
)


def _jpeg_em_pe(caminho):
    """Uma foto de celular: gravada deitada (vermelho à esquerda) com a orientação 6 (girar 90° no sentido horário)."""
    foto = Image.new("RGB", (400, 200), (0, 0, 255))
    foto.paste((255, 0, 0), (0, 0, 100, 200))
    exif = Image.Exif()
    exif[0x0112] = 6
    foto.save(caminho, "JPEG", exif=exif.tobytes(), quality=95)


def test_foto_do_celular_e_girada_pelo_exif(tmp_path):
    _jpeg_em_pe(tmp_path / "foto.jpg")
    info = preparar_imagem(tmp_path / "foto.jpg", tmp_path)
    assert (info["largura"], info["altura"]) == (200, 400)
    assert info["transparente"] is False
    with Image.open(tmp_path / "imagem.png") as png:
        assert png.size == (200, 400) and png.mode == "RGB"
        # Girada no sentido horário: o vermelho, que estava à esquerda, vai para cima
        assert png.getpixel((100, 20))[0] > 200 and png.getpixel((100, 380))[2] > 200
    for nome in ("proxy.webp", "capa.jpg", "miniaturas.jpg"):
        assert (tmp_path / nome).is_file()
    with Image.open(tmp_path / "capa.jpg") as capa:
        assert capa.width == 640


def test_png_transparente_mantem_o_alfa(tmp_path):
    logo = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    logo.paste((255, 98, 74, 255), (100, 100, 200, 200))
    logo.save(tmp_path / "logo.png")
    info = preparar_imagem(tmp_path / "logo.png", tmp_path)
    assert info["transparente"] is True
    with Image.open(tmp_path / "imagem.png") as png, Image.open(tmp_path / "proxy.webp") as webp:
        assert png.mode == "RGBA" and png.getpixel((10, 10))[3] == 0 and png.getpixel((150, 150))[3] == 255
        assert webp.mode == "RGBA" and webp.getpixel((10, 10))[3] < 10
    # PNG com canal alfa mas todo opaco não conta como transparente (vai para a faixa principal)
    Image.new("RGBA", (50, 50), (10, 20, 30, 255)).save(tmp_path / "opaca.png")
    assert preparar_imagem(tmp_path / "opaca.png", tmp_path)["transparente"] is False


def test_cmyk_e_16_bits_viram_rgb(tmp_path):
    Image.new("CMYK", (40, 30), (0, 255, 255, 0)).save(tmp_path / "cmyk.jpg")
    assert abrir_imagem(tmp_path / "cmyk.jpg").mode == "RGB"
    Image.new("I;16", (40, 30), 30000).save(tmp_path / "16.png")
    assert abrir_imagem(tmp_path / "16.png").mode == "RGB"


def test_imagem_grande_e_reduzida(tmp_path):
    Image.new("RGB", (6000, 3000), (40, 40, 40)).save(tmp_path / "grande.jpg", quality=70)
    info = preparar_imagem(tmp_path / "grande.jpg", tmp_path)
    assert (info["largura"], info["altura"]) == (LADO_MAXIMO_RENDER, 2048)
    with Image.open(tmp_path / "proxy.webp") as webp:
        assert webp.size == (LADO_MAXIMO_PROXY, 960)


def test_o_que_nao_serve_e_recusado(tmp_path, monkeypatch):
    (tmp_path / "falso.jpg").write_bytes(b"isto nao e uma imagem" * 10)
    with pytest.raises(ImagemInvalida, match="não é uma imagem válida"):
        abrir_imagem(tmp_path / "falso.jpg")
    Image.new("RGB", (200, 200)).save(tmp_path / "media.png")
    monkeypatch.setattr(modulo, "PIXELS_MAXIMOS", 100 * 100)
    with pytest.raises(ImagemInvalida, match="grande demais"):
        abrir_imagem(tmp_path / "media.png")


def test_quadro_inicial_cobre_o_formato_cortando_no_meio(tmp_path):
    # Faixas verticais: vermelho, verde e azul. Num quadro em pé, só o meio (verde) sobra.
    faixas = Image.new("RGB", (900, 300), (255, 0, 0))
    faixas.paste((0, 255, 0), (300, 0, 600, 300))
    faixas.paste((0, 0, 255), (600, 0, 900, 300))
    faixas.save(tmp_path / "faixas.png")
    quadro_inicial(tmp_path / "faixas.png", (480, 832), tmp_path / "quadro.png")
    with Image.open(tmp_path / "quadro.png") as quadro:
        assert quadro.size == (480, 832) and quadro.mode == "RGB"
        assert quadro.getpixel((240, 416)) == (0, 255, 0)
        assert quadro.getpixel((5, 5))[1] > 200 and quadro.getpixel((474, 826))[1] > 200
    # Deitado, a imagem cobre a largura e corta em cima e embaixo; o transparente vira o fundo escuro
    logo = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    logo.paste((255, 255, 255, 255), (150, 150, 250, 250))
    logo.save(tmp_path / "logo.png")
    quadro_inicial(tmp_path / "logo.png", (832, 480), tmp_path / "quadro.png")
    with Image.open(tmp_path / "quadro.png") as quadro:
        assert quadro.size == (832, 480) and quadro.mode == "RGB"
        assert quadro.getpixel((416, 240)) == (255, 255, 255)
        assert quadro.getpixel((20, 240)) == FUNDO_DA_CAPA
