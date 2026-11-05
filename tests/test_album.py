# O álbum de fotos (onda 16): o modelo e o EXIF lido na ingestão
from PIL import Image

from core.modelos.album import mudanca_das_fotos, pasta_do_caminho
from core.utils.imagem import ler_exif, preparar_imagem


def test_pasta_do_caminho():
    assert pasta_do_caminho("Casamento/Cerimônia/IMG_01.jpg") == "Casamento/Cerimônia"
    assert pasta_do_caminho("IMG_01.jpg") == ""
    assert pasta_do_caminho("") == ""
    # Barras do Windows, pontos de subir e a barra do começo não entram
    assert pasta_do_caminho("\\Ensaio\\..\\Making of\\IMG_02.JPG") == "Ensaio/Making of"


def test_mudanca_das_fotos():
    assert mudanca_das_fotos(nota=4) == {"nota": 4}
    assert mudanca_das_fotos(cor="verde", marcacao="escolhida") == {"cor": "verde", "marcacao": "escolhida"}
    # Tirar é pedir de propósito: None sozinho não muda nada
    assert mudanca_das_fotos(tirar_cor=True, tirar_marcacao=True) == {"cor": None, "marcacao": None}
    for errado in ({"nota": 6}, {"cor": "laranja"}, {"marcacao": "talvez"}):
        try:
            mudanca_das_fotos(**errado)
        except ValueError:
            continue
        raise AssertionError(errado)


def _foto_com_exif(caminho, data="2026:05:10 15:32:10", marca="Canon", modelo="Canon EOS R6"):
    imagem = Image.new("RGB", (300, 200), (120, 80, 40))
    exif = Image.Exif()
    exif[271], exif[272] = marca, modelo
    interno = exif.get_ifd(0x8769)
    interno[36867] = data
    interno[42036] = "RF24-105mm F4 L IS USM"
    interno[34855] = 800
    interno[33437] = 2.8
    interno[33434] = 1 / 250
    interno[37386] = 50.0
    imagem.save(caminho, "JPEG", exif=exif)


def test_exif_da_foto(tmp_path):
    caminho = tmp_path / "foto.jpg"
    _foto_com_exif(caminho)
    exif = ler_exif(caminho)
    assert exif == {"data": "2026-05-10T15:32:10", "camera": "Canon EOS R6", "lente": "RF24-105mm F4 L IS USM",
                    "iso": 800, "abertura": 2.8, "exposicao": 0.004, "focal": 50.0}
    # A marca que não se repete no modelo vai na frente
    _foto_com_exif(caminho, marca="NIKON CORPORATION", modelo="Z 6_2")
    assert ler_exif(caminho)["camera"] == "NIKON CORPORATION Z 6_2"
    # Data quebrada ou sem EXIF: sai o que deu para ler, sem erro
    _foto_com_exif(caminho, data="sem data")
    assert "data" not in ler_exif(caminho)
    Image.new("RGB", (10, 10)).save(tmp_path / "sem.png")
    assert ler_exif(tmp_path / "sem.png") == {}
    (tmp_path / "quebrado.jpg").write_bytes(b"nada")
    assert ler_exif(tmp_path / "quebrado.jpg") == {}


def test_ingestao_guarda_o_exif(tmp_path):
    caminho = tmp_path / "original.jpg"
    _foto_com_exif(caminho)
    info = preparar_imagem(caminho, tmp_path)
    assert info["exif"]["data"] == "2026-05-10T15:32:10" and info["exif"]["iso"] == 800
