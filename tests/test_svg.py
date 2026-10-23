# SVG enviado: o Chromium desenha como <img> (sem script e sem nada de fora), com o lado maior em 2048 e o
# fundo transparente, e a ingestão de imagens segue com o PNG.
import pytest

from core.utils.imagem import ImagemInvalida, preparar_imagem
from core.utils.svg import parece_svg, rasterizar_svg


def _tem_chromium() -> bool:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            p.chromium.launch().close()
        return True
    except Exception:
        return False


TEM_CHROMIUM = _tem_chromium()

LOGO = b"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 100">
  <script>document.title = "rodou"</script>
  <image href="http://127.0.0.1:9/fora.png" x="0" y="0" width="40" height="40"/>
  <circle cx="100" cy="50" r="40" fill="#ff0000"/>
  <rect x="150" y="10" width="40" height="20" fill="#0000ff" fill-opacity="0.5"/>
</svg>"""


def test_reconhece_o_svg_pelo_comeco():
    assert parece_svg(LOGO) and parece_svg(b"\xef\xbb\xbf  <svg viewBox='0 0 1 1'/>")
    assert parece_svg(b"<!-- feito a mao --><svg/>") and not parece_svg(b"\x89PNG\r\n")


@pytest.mark.skipif(not TEM_CHROMIUM, reason="Chromium do Playwright não instalado")
def test_svg_vira_imagem_transparente_no_tamanho_do_viewbox():
    imagem = rasterizar_svg(LOGO)
    assert imagem.mode == "RGBA" and imagem.size == (2048, 1024)
    assert imagem.getpixel((1024, 512)) == (255, 0, 0, 255), "o meio do círculo"
    assert imagem.getpixel((10, 10))[3] == 0, "o canto é transparente, e a imagem de fora não veio"
    azul = imagem.getpixel((1740, 200))
    assert azul[2] == 255 and 120 <= azul[3] <= 136, azul
    pequeno = rasterizar_svg(b'<svg xmlns="http://www.w3.org/2000/svg" width="30" height="60"><rect width="30" '
                             b'height="60" fill="#00ff00"/></svg>', lado=512)
    assert pequeno.size == (256, 512) and pequeno.getpixel((128, 256)) == (0, 255, 0, 255)


@pytest.mark.skipif(not TEM_CHROMIUM, reason="Chromium do Playwright não instalado")
def test_ingestao_da_imagem_aceita_svg_e_recusa_o_que_nao_e(tmp_path):
    logo = tmp_path / "original.svg"
    logo.write_bytes(LOGO)
    info = preparar_imagem(logo, tmp_path)
    assert info["transparente"] and (info["largura"], info["altura"]) == (2048, 1024)
    assert (tmp_path / "imagem.png").is_file() and (tmp_path / "proxy.webp").is_file()
    falso = tmp_path / "falso.svg"
    falso.write_bytes(b"<html><body>isto nao e svg</body></html>")
    with pytest.raises(ImagemInvalida):
        preparar_imagem(falso, tmp_path)
