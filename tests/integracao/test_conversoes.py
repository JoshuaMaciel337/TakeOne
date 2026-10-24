# Conversão da imagem exportada para AVIF: o PNG sobe em partes e volta convertido, com a transparência; o arquivo
# temporário some no fim, e o que não é PNG é recusado.
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from api.rotas import conversoes as rota
from core.utils import storage
from tests.integracao.test_api import cadastrar


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def png(largura: int, altura: int) -> bytes:
    imagem = Image.new("RGBA", (largura, altura), (30, 120, 220, 255))
    for x in range(largura // 2):
        for y in range(altura):
            imagem.putpixel((x, y), (250, 60, 20, 0 if y < 4 else 255))
    saida = io.BytesIO()
    imagem.save(saida, "PNG")
    return saida.getvalue()


def test_avif_em_partes(cliente, monkeypatch):
    cadastrar(cliente)
    monkeypatch.setattr(rota, "BYTES_DA_PARTE", 50)
    dados = png(40, 24)
    partes = [dados[i:i + 50] for i in range(0, len(dados), 50)]
    assert len(partes) >= 2
    base = f"/api/conversoes/imagem?formato=avif&qualidade=90&envio=0123456789abcdef&total={len(partes)}"
    cabecalho = {"Content-Type": "application/octet-stream"}
    for indice, parte in enumerate(partes[:-1]):
        assert cliente.post(f"{base}&parte={indice}", content=parte, headers=cabecalho).status_code == 202
    resposta = cliente.post(f"{base}&parte={len(partes) - 1}", content=partes[-1], headers=cabecalho)
    assert resposta.status_code == 200, resposta.text
    assert resposta.headers["content-type"] == "image/avif"
    lida = Image.open(io.BytesIO(resposta.content))
    assert lida.format == "AVIF" and lida.size == (40, 24)
    rgba = lida.convert("RGBA")
    assert rgba.getpixel((5, 1))[3] == 0
    cor = rgba.getpixel((30, 12))
    assert max(abs(a - b) for a, b in zip(cor, (30, 120, 220, 255), strict=True)) <= 12
    # O temporário some
    usuario = cliente.get("/api/auth/eu").json()
    pasta = storage.caminho_local(f"org_{usuario['organizacao']['id']}/conversoes")
    assert not any(pasta.glob("*.png")) if pasta.exists() else True


def test_recusa_o_que_nao_e_png(cliente):
    cadastrar(cliente)
    base = "/api/conversoes/imagem?formato=avif&envio=0123456789abcdef&parte=0&total=1"
    resposta = cliente.post(base, content=b"GIF89a nada", headers={"Content-Type": "application/octet-stream"})
    assert resposta.status_code == 422
    assert cliente.post(base.replace("avif", "heic"), content=png(4, 4)).status_code == 422
    assert cliente.post(base.replace("0123456789abcdef", "nao-vale"), content=png(4, 4)).status_code == 422
