# O RAW pelo JPEG que a câmera grava dentro dele (core/utils/raw.py): o maior JPEG, a orientação e o EXIF do RAW
import io

import pytest
from PIL import Image

from core.utils.imagem import ImagemInvalida, ler_exif, preparar_imagem
from core.utils.raw import abrir_raw


def _jpeg(largura: int, altura: int, cor, exif: Image.Exif | None = None) -> bytes:
    saida = io.BytesIO()
    Image.new("RGB", (largura, altura), cor).save(saida, "JPEG", quality=90, **({"exif": exif} if exif else {}))
    return saida.getvalue()


def _tiff_do_exif(orientacao: int = 1, data: str = "2026:05:10 10:00:00", modelo: str = "Canon EOS R5") -> bytes:
    """Um TIFF só com o EXIF, como o começo de um CR2, NEF ou ARW."""
    exif = Image.Exif()
    exif[271], exif[272], exif[274] = "Canon", modelo, orientacao
    interno = exif.get_ifd(0x8769)
    interno[36867] = data
    interno[34855] = 1600
    return exif.tobytes()[6:]  # sem o "Exif\0\0" do começo


def test_raw_de_base_tiff_usa_a_maior_previa_girada_pelo_raw(tmp_path):
    caminho = tmp_path / "IMG_0001.CR2"
    # Os bytes do sensor de mentira têm até um falso começo de JPEG, que não abre
    sensor = b"\x12\x34" * 5000 + b"\xff\xd8\xff\xe0lixo" + b"\x00" * 300
    caminho.write_bytes(_tiff_do_exif(orientacao=6) + sensor + _jpeg(160, 120, (0, 0, 255)) + sensor
                        + _jpeg(600, 400, (255, 0, 0)))
    imagem, _ = abrir_raw(caminho)
    # A prévia grande (600×400, vermelha), de pé pela orientação 6 do RAW
    assert imagem.size == (400, 600) and imagem.getpixel((200, 300))[0] > 200
    exif = ler_exif(caminho)
    assert exif == {"data": "2026-05-10T10:00:00", "camera": "Canon EOS R5", "iso": 1600}

    info = preparar_imagem(caminho, tmp_path)
    assert (info["largura"], info["altura"]) == (400, 600) and info["exif"]["iso"] == 1600


def test_orf_e_rw2_com_outra_assinatura_do_tiff(tmp_path):
    tiff = _tiff_do_exif(modelo="E-M1MarkII")
    # O Pillow grava o TIFF em big-endian ("MM"): a variante "MMOR" do ORF existe; a do RW2 testa o mesmo caminho
    for extensao, assinatura in ((".ORF", b"MMOR"), (".RW2", b"MMU\x00")):
        caminho = tmp_path / f"foto{extensao}"
        caminho.write_bytes(assinatura + tiff[4:] + _jpeg(320, 240, (0, 200, 0)))
        assert ler_exif(caminho)["camera"] == "Canon E-M1MarkII"
        assert abrir_raw(caminho)[0].size == (320, 240)


def test_cr3_le_o_exif_das_caixas(tmp_path):
    def caixa(nome: bytes, conteudo: bytes) -> bytes:
        return (8 + len(conteudo)).to_bytes(4, "big") + nome + conteudo

    base = Image.Exif()
    base[271], base[272] = "Canon", "Canon EOS R6"
    interno = Image.Exif()
    interno[36867] = "2026:05:11 09:30:15"
    interno[33437] = 4.0
    caminho = tmp_path / "IMG_0002.CR3"
    caminho.write_bytes(caixa(b"ftyp", b"crx ") + caixa(b"CMT1", base.tobytes()[6:])
                        + caixa(b"CMT2", interno.tobytes()[6:]) + caixa(b"mdat", _jpeg(800, 533, (10, 10, 10))))
    assert ler_exif(caminho) == {"data": "2026-05-11T09:30:15", "camera": "Canon EOS R6", "abertura": 4.0}
    assert abrir_raw(caminho)[0].size == (800, 533)


def test_raf_usa_o_exif_do_proprio_jpeg(tmp_path):
    exif = Image.Exif()
    exif[271], exif[272], exif[274] = "FUJIFILM", "X-T4", 8
    exif.get_ifd(0x8769)[36867] = "2026:05:12 18:00:00"
    caminho = tmp_path / "DSCF0001.RAF"
    caminho.write_bytes(b"FUJIFILMCCD-RAW 0201" + b"\x00" * 200 + _jpeg(300, 200, (200, 200, 0), exif))
    assert ler_exif(caminho) == {"data": "2026-05-12T18:00:00", "camera": "FUJIFILM X-T4"}
    # Orientação 8 (girada 90° para a esquerda): fica de pé
    assert abrir_raw(caminho)[0].size == (200, 300)


def test_raw_sem_previa_explica_o_que_fazer(tmp_path):
    caminho = tmp_path / "vazio.NEF"
    caminho.write_bytes(_tiff_do_exif() + b"\x00" * 1000)
    with pytest.raises(ImagemInvalida, match="Exporte como JPG"):
        preparar_imagem(caminho, tmp_path)
