# Camadas de pixels do editor de imagem: a camada nasce vazia, cada versão sobe em partes e vira v<n>.png, e o
# projeto de imagem aponta a versão no clipe (o vídeo recusa).
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from api.rotas import pixels as rota
from tests.integracao.test_api import cadastrar
from tests.integracao.test_projetos import SEGUNDO, salvar


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def png(largura: int, altura: int, cor=(255, 0, 0, 128)) -> bytes:
    saida = io.BytesIO()
    Image.new("RGBA", (largura, altura), cor).save(saida, "PNG")
    return saida.getvalue()


def enviar(cliente, midia_id: str, dados: bytes, envio: str = "0123456789abcdef", parte_bytes: int | None = None):
    tamanho = parte_bytes or rota.BYTES_DA_PARTE
    partes = [dados[i:i + tamanho] for i in range(0, len(dados), tamanho)] or [b""]
    resposta = None
    for indice, parte in enumerate(partes):
        resposta = cliente.post(f"/api/midias/{midia_id}/pixels?envio={envio}&parte={indice}&total={len(partes)}",
                                content=parte, headers={"Content-Type": "application/octet-stream"})
        if resposta.status_code != 200:
            return resposta
    return resposta


def test_camada_versoes_em_partes(cliente, db_limpo, monkeypatch):
    cadastrar(cliente)
    resposta = cliente.post("/api/camadas-pixels", json={"largura": 64, "altura": 48})
    assert resposta.status_code == 201, resposta.text
    camada = resposta.json()
    assert camada["camada_pixels"] == {"largura": 64, "altura": 48, "ultima": 0}
    assert camada["video"]["largura"] == 64 and camada["imagem"] and camada["status"] == "pronta"

    primeira = enviar(cliente, camada["id"], png(64, 48))
    assert primeira.status_code == 200 and primeira.json() == {"versao": 1}
    servida = cliente.get(f"/api/midias/{camada['id']}/arquivos/v1.png")
    assert servida.status_code == 200 and Image.open(io.BytesIO(servida.content)).size == (64, 48)

    # Em partes pequenas (o limite de verdade é 8 MB); repetir uma parte não estraga
    monkeypatch.setattr(rota, "BYTES_DA_PARTE", 100)
    dados = png(64, 48, (0, 0, 255, 255)) + b""
    partes = [dados[i:i + 100] for i in range(0, len(dados), 100)]
    assert len(partes) >= 2
    base = f"/api/midias/{camada['id']}/pixels?envio=fedcba9876543210&total={len(partes)}"
    cabecalho = {"Content-Type": "application/octet-stream"}
    assert cliente.post(f"{base}&parte=0", content=partes[0], headers=cabecalho).json() == {"versao": None}
    assert cliente.post(f"{base}&parte=0", content=partes[0], headers=cabecalho).status_code == 200
    for indice, parte in enumerate(partes[1:], start=1):
        resposta = cliente.post(f"{base}&parte={indice}", content=parte, headers=cabecalho)
    assert resposta.json() == {"versao": 2}
    pixel = Image.open(io.BytesIO(cliente.get(f"/api/midias/{camada['id']}/arquivos/v2.png").content)).getpixel((0, 0))
    assert pixel == (0, 0, 255, 255)

    # Pulando uma parte, e o PNG do tamanho errado
    pulando = cliente.post(f"/api/midias/{camada['id']}/pixels?envio=aaaaaaaaaaaaaaaa&parte=1&total=3",
                           content=b"x" * 100, headers=cabecalho)
    assert pulando.status_code == 422 and "Faltam partes" in pulando.json()["detail"]
    monkeypatch.setattr(rota, "BYTES_DA_PARTE", 8 * 1024 * 1024)
    errado = enviar(cliente, camada["id"], png(10, 10), envio="bbbbbbbbbbbbbbbb")
    assert errado.status_code == 422 and "64 × 48" in errado.json()["detail"]
    lixo = enviar(cliente, camada["id"], b"nao e png", envio="cccccccccccccccc")
    assert lixo.status_code == 422

    # Uma foto comum não recebe versões
    foto = cliente.post("/api/elementos/formas", json={"tipo": "elipse", "cor": "#ff0000"}).json()
    assert enviar(cliente, foto["id"], png(4, 4), envio="dddddddddddddddd").status_code == 422


def test_projeto_aponta_a_versao(cliente, db_limpo):
    cadastrar(cliente)
    camada = cliente.post("/api/camadas-pixels", json={"largura": 1080, "altura": 1080}).json()
    clipe = {"id": "p1", "midia_id": camada["id"], "inicio": 0, "duracao": 5 * SEGUNDO, "entrada": 0, "velocidade": 1,
             "volume": 1, "pixels": {"versao": 0}}
    faixa = {"id": "fp", "tipo": "video", "oculta": False, "muda": False, "travada": False, "clipes": [clipe]}
    imagem = cliente.post("/api/projetos", json={"tamanho": {"largura": 1080, "altura": 1080}}).json()
    resposta = salvar(cliente, imagem, [faixa] + imagem["faixas"])
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["faixas"][0]["clipes"][0]["pixels"] == {"versao": 0}

    video = cliente.post("/api/projetos", json={}).json()
    sobre = {**faixa, "id": "fs"}
    resposta = salvar(cliente, video, video["faixas"] + [sobre])
    assert resposta.status_code == 422 and "camadas de pixels" in resposta.json()["detail"]


def test_camada_de_fundo_fica_embaixo(cliente, db_limpo):
    cadastrar(cliente)
    camada = cliente.post("/api/camadas-pixels", json={"largura": 100, "altura": 100}).json()
    imagem = cliente.post("/api/projetos", json={"tamanho": {"largura": 100, "altura": 100}}).json()

    def faixa(id_, **campos):
        clipe = {"id": f"c{id_}", "midia_id": camada["id"], "inicio": 0, "duracao": 5 * SEGUNDO, "entrada": 0,
                 "velocidade": 1, "volume": 1, "pixels": {"versao": 0}}
        return {"id": id_, "tipo": "video", "oculta": False, "muda": False, "travada": False, "clipes": [clipe],
                **campos}

    fundo = faixa("f", fundo=True, nome="Fundo", travas={"transparencia": True, "posicao": True})
    assert salvar(cliente, imagem, [faixa("a"), fundo] + imagem["faixas"]).status_code == 200
    imagem = cliente.get(f"/api/projetos/{imagem['id']}").json()
    resposta = salvar(cliente, imagem, [fundo, faixa("a")] + imagem["faixas"][2:])
    assert resposta.status_code == 422 and "fundo" in resposta.json()["detail"]
