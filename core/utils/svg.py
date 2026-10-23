# -----------------------------------------------
# TakeOne — SVG enviado vira imagem
#
# O SVG (um logo, um desenho vetorial) é desenhado pelo Chromium que o worker já usa nas animações em HTML,
# como uma <img> de data URL: nesse modo o navegador não roda os scripts do arquivo nem busca nada de fora
# (e a página ainda recusa qualquer pedido). Sai um PNG com transparência, com o lado maior em LADO_DO_SVG,
# que segue pela ingestão de imagens como qualquer outro. O CairoSVG ficou de fora por ser LGPL.
# -----------------------------------------------
import base64
import io

from PIL import Image

LADO_DO_SVG = 2048
BYTES_MAXIMOS_DO_SVG = 10 * 1024 * 1024

_PAGINA = """<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: transparent; }
img { display: block; }
</style></head><body><img id="desenho" alt=""></body></html>"""

# Mede o desenho pelo próprio SVG (largura e altura, ou a proporção do viewBox) e põe a <img> no tamanho final
_MEDIR = """async ([texto, url, lado]) => {
  const raiz = new DOMParser().parseFromString(texto, "image/svg+xml").documentElement;
  if (!raiz || raiz.nodeName.toLowerCase() !== "svg") return null;
  const numero = (valor) => {
    const achado = /^\\s*([0-9.]+)\\s*(px)?\\s*$/.exec(valor || "");
    return achado ? parseFloat(achado[1]) : 0;
  };
  let largura = numero(raiz.getAttribute("width"));
  let altura = numero(raiz.getAttribute("height"));
  const caixa = (raiz.getAttribute("viewBox") || "").trim().split(/[\\s,]+/).map(Number);
  if ((!largura || !altura) && caixa.length === 4 && caixa[2] > 0 && caixa[3] > 0) {
    if (largura) altura = largura * caixa[3] / caixa[2];
    else if (altura) largura = altura * caixa[2] / caixa[3];
    else [largura, altura] = [caixa[2], caixa[3]];
  }
  if (!largura || !altura) [largura, altura] = [300, 150];
  const escala = lado / Math.max(largura, altura);
  const desenho = document.getElementById("desenho");
  desenho.width = Math.max(1, Math.round(largura * escala));
  desenho.height = Math.max(1, Math.round(altura * escala));
  desenho.src = url;
  await desenho.decode();
  return [desenho.width, desenho.height];
}"""


class SvgInvalido(ValueError):
    """O SVG não abre. A mensagem é para a pessoa."""


def rasterizar_svg(conteudo: bytes, lado: int = LADO_DO_SVG) -> Image.Image:
    """O SVG desenhado em RGBA, com o lado maior em `lado` e a proporção dele."""
    if len(conteudo) > BYTES_MAXIMOS_DO_SVG:
        raise SvgInvalido("O SVG passa de 10 MB.")
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise SvgInvalido("O SVG não está em UTF-8.") from e
    url = "data:image/svg+xml;base64," + base64.b64encode(conteudo).decode()
    from playwright.sync_api import Error as ErroDoNavegador
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        navegador = playwright.chromium.launch(args=["--font-render-hinting=none"])
        try:
            pagina = navegador.new_page(viewport={"width": lado, "height": lado})
            # Nada sai da página: o SVG vem da data URL, e os pedidos de fora são recusados
            pagina.route("**/*", lambda rota: rota.abort())
            pagina.set_content(_PAGINA)
            try:
                tamanho = pagina.evaluate(_MEDIR, [texto, url, lado])
            except ErroDoNavegador as e:
                raise SvgInvalido("O arquivo não é um SVG que dá para desenhar.") from e
            if not tamanho:
                raise SvgInvalido("O arquivo não é um SVG.")
            largura, altura = tamanho
            png = pagina.locator("#desenho").screenshot(omit_background=True, type="png", timeout=30000)
        finally:
            navegador.close()
    imagem = Image.open(io.BytesIO(png))
    imagem.load()
    if imagem.size != (largura, altura):
        imagem = imagem.resize((largura, altura), Image.Resampling.LANCZOS)
    return imagem.convert("RGBA")


def parece_svg(conteudo: bytes) -> bool:
    """O começo do arquivo tem a marca de um SVG (com ou sem o cabeçalho XML)."""
    inicio = conteudo[:2048].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    return inicio.startswith(b"<svg") or (inicio.startswith(b"<?xml") and b"<svg" in inicio) or \
        (inicio.startswith(b"<!--") and b"<svg" in inicio)

