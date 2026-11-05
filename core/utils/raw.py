# -----------------------------------------------
# TakeOne — fotos RAW pelo JPEG que a câmera grava dentro do arquivo (onda 16, ADR 0006)
#
# Toda câmera grava, dentro do RAW, um JPEG pronto (a prévia que a tela dela mostra), quase sempre do tamanho cheio.
# A ingestão usa esse JPEG: serve para a grade, a escolha das melhores e a edição. Revelar o RAW de verdade (os
# dados do sensor) fica para depois: pede um revelador com licença LGPL (LibRaw), decisão do dono.
#
# O JPEG: o maior que abre de verdade, entre os que começam em algum lugar do arquivo (miniatura, prévia média e a
# grande). A orientação e o EXIF vêm do próprio RAW: os de base TIFF (CR2, NEF, ARW, DNG, PEF, ORF, RW2, SRW) pelo
# leitor de EXIF do Pillow; o CR3 pelas caixas CMT1 (a câmera) e CMT2 (a foto); o RAF, pelo EXIF do próprio JPEG.
# -----------------------------------------------
import io
import re
from pathlib import Path

from PIL import Image, ImageOps

from core.config import EXTENSOES_RAW

# Um JPEG começa com FF D8 e logo depois outro marcador (APPn, DQT, DHT, SOF): assim os bytes FF D8 que aparecem
# por acaso nos dados do sensor quase nunca passam
_INICIO_DE_JPEG = re.compile(rb"\xff\xd8\xff[\xc0-\xc4\xdb\xe0-\xef]")
LADO_MINIMO = 160
TENTATIVAS = 400


class RawInvalido(ValueError):
    """O RAW não tem um JPEG que dê para usar."""


def e_raw(caminho: Path) -> bool:
    return caminho.suffix.lower() in EXTENSOES_RAW


def _jpegs(dados: bytes):
    """(área, início) dos JPEGs que abrem, do maior para o menor."""
    achados = []
    for numero, m in enumerate(_INICIO_DE_JPEG.finditer(dados)):
        if numero >= TENTATIVAS:
            break
        try:
            with Image.open(io.BytesIO(dados[m.start():])) as jpeg:
                if jpeg.format != "JPEG" or min(jpeg.size) < LADO_MINIMO:
                    continue
                achados.append((jpeg.width * jpeg.height, m.start()))
        except Exception:
            continue
    return sorted(achados, reverse=True)


class ExifDoCr3:
    """O EXIF do CR3, que vem em duas caixas: o IFD0 (a câmera, a orientação) e o ExifIFD (a hora, a exposição)."""

    def __init__(self, base: Image.Exif, interno: dict):
        self.base, self.interno = base, interno

    def get(self, etiqueta, padrao=None):
        return self.base.get(etiqueta, padrao)

    def get_ifd(self, etiqueta):
        return self.interno if etiqueta == 0x8769 else self.base.get_ifd(etiqueta)

    def __len__(self):
        return len(self.base) + len(self.interno)


def _tiff(dados: bytes) -> Image.Exif:
    """Lê um TIFF de EXIF. O ORF ("IIRO") e o RW2 ("IIU") trocam a assinatura do TIFF: volta a de sempre."""
    if dados[:2] == b"II" and dados[2:4] != b"*\x00":
        dados = b"II*\x00" + dados[4:]
    elif dados[:2] == b"MM" and dados[2:4] != b"\x00*":
        dados = b"MM\x00*" + dados[4:]
    exif = Image.Exif()
    exif.load(dados)
    return exif


def _caixa(dados: bytes, nome: bytes) -> bytes | None:
    """O conteúdo de uma caixa ISO base media (4 bytes de tamanho e o nome) pelo nome, ou None."""
    i = dados.find(nome)
    if i < 4:
        return None
    tamanho = int.from_bytes(dados[i - 4:i], "big")
    return dados[i + 4:i - 4 + tamanho] if tamanho > 8 else None


def exif_do_raw(dados: bytes):
    """O EXIF do RAW (um Image.Exif, ou o ExifDoCr3), ou None."""
    if dados[:2] in (b"II", b"MM"):
        try:
            exif = _tiff(dados)
            if len(exif):
                return exif
        except Exception:
            pass
    cmt1, cmt2 = _caixa(dados, b"CMT1"), _caixa(dados, b"CMT2")
    if cmt1:
        try:
            return ExifDoCr3(_tiff(cmt1), dict(_tiff(cmt2)) if cmt2 else {})
        except Exception:
            return None
    return None


def abrir_raw(caminho: Path) -> tuple[Image.Image, object | None]:
    """O maior JPEG do RAW, girado pela orientação (a do RAW quando o JPEG não tem), em RGB, e o EXIF do RAW."""
    dados = caminho.read_bytes()
    candidatos = _jpegs(dados)
    if not candidatos:
        raise RawInvalido("Este RAW não tem uma prévia que o TakeOne consiga ler. Exporte como JPG e envie de novo.")
    exif = exif_do_raw(dados)
    _, inicio = candidatos[0]
    with Image.open(io.BytesIO(dados[inicio:])) as jpeg:
        jpeg.load()
        orientacao_do_jpeg = jpeg.getexif().get(0x0112)
        exif = exif or jpeg.getexif()
        imagem = jpeg.convert("RGB")
    orientacao = orientacao_do_jpeg or (exif.get(0x0112) if exif else None)
    if orientacao and orientacao != 1:
        # exif_transpose lê a orientação do info da imagem: põe a do RAW para a conta ser a mesma das fotos JPEG
        com_orientacao = Image.Exif()
        com_orientacao[0x0112] = orientacao
        imagem.info["exif"] = com_orientacao.tobytes()
        imagem = ImageOps.exif_transpose(imagem)
    return imagem, exif
