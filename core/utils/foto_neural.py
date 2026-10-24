# -----------------------------------------------
# TakeOne — as contas de imagem dos filtros neurais (Pillow, sem o modelo)
# A transferência de estilo e o colorir passam pelo VACE no tamanho dele (geracao.py); o resultado volta ao tamanho
# da foto. No colorir, só a cor volta (o Cb e o Cr, com a saturação pedida) e a luz é a da foto, na resolução
# cheia: o detalhe não muda. No estilo, o resultado é misturado à foto pela intensidade. A transparência da foto fica.
# -----------------------------------------------
from PIL import Image, ImageOps

from core.modelos.geracao import tamanho_do_preenchimento


def para_o_vace(foto: Image.Image, cinza: bool) -> Image.Image:
    """A foto no tamanho do modelo, opaca (sobre preto onde é transparente), em cinza para o colorir."""
    largura, altura = tamanho_do_preenchimento(*foto.size)
    opaca = Image.alpha_composite(Image.new("RGBA", foto.size, (0, 0, 0, 255)), foto.convert("RGBA")).convert("RGB")
    if cinza:
        opaca = ImageOps.grayscale(opaca).convert("RGB")
    return opaca.resize((largura, altura), Image.LANCZOS)


def colorir(foto: Image.Image, gerada: Image.Image, saturacao: float = 1.0) -> Image.Image:
    """A luz da foto com a cor da gerada: o Y do YCbCr da foto e o Cb e o Cr da gerada, puxados ao neutro ou além
    pela saturação (o Lab do Pillow sem perfil não é o CIELAB e mudava a luz)."""
    rgba = foto.convert("RGBA")
    luz = rgba.convert("RGB").convert("YCbCr").getchannel("Y")
    _, cb, cr = gerada.convert("RGB").resize(rgba.size, Image.BICUBIC).convert("YCbCr").split()
    if abs(saturacao - 1) > 1e-6:
        cb = cb.point(lambda v: max(0, min(255, round(128 + (v - 128) * saturacao))))
        cr = cr.point(lambda v: max(0, min(255, round(128 + (v - 128) * saturacao))))
    resultado = Image.merge("YCbCr", (luz, cb, cr)).convert("RGB")
    resultado.putalpha(rgba.getchannel("A"))
    return resultado


def estilizar(foto: Image.Image, gerada: Image.Image, intensidade: float = 1.0) -> Image.Image:
    """O resultado do estilo no tamanho da foto, misturado a ela pela intensidade (0 a 1)."""
    rgba = foto.convert("RGBA")
    estilo = gerada.convert("RGB").resize(rgba.size, Image.LANCZOS)
    if intensidade < 1:
        estilo = Image.blend(rgba.convert("RGB"), estilo, max(0.0, intensidade))
    estilo.putalpha(rgba.getchannel("A"))
    return estilo


def simular(foto: Image.Image, tipo: str) -> Image.Image:
    """Sem o modelo (o CI): o estilo vira a foto posterizada, e o colorir, a foto em sépia."""
    rgb = foto.convert("RGB")
    if tipo == "colorir":
        return ImageOps.colorize(ImageOps.grayscale(rgb), "#2b1a0e", "#f3dcb4")
    return ImageOps.posterize(rgb, 3)
