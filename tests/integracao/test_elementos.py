# Formas como mídias: desenhadas na hora, reaproveitadas quando o pedido se repete, e no render como imagem
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import chave_arquivo
from core.utils import storage
from tests.integracao.test_api import cadastrar


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_forma_vira_imagem_transparente_pronta(cliente, db_limpo):
    cadastrar(cliente)
    pedido = {"tipo": "estrela", "cor": "#FF624A", "contorno_cor": "#ffffff", "contorno": 0.05}
    resposta = cliente.post("/api/elementos/formas", json=pedido)
    assert resposta.status_code == 201, resposta.text
    midia = resposta.json()
    assert midia["status"] == "pronta" and midia["imagem"] is True and midia["nome"] == "Estrela"
    assert midia["video"]["transparente"] and midia["video"]["largura"] == 2048
    assert midia["elemento"] == {"tipo": "estrela", "cor": "#ff624a", "contorno_cor": "#ffffff", "contorno": 0.05,
                                 "proporcao": None}
    assert cliente.get(f"/api/midias/{midia['id']}/arquivos/proxy.webp").status_code == 200
    doc = db_limpo.midias.find_one({"_id": ObjectId(midia["id"])})
    assert storage.caminho_local(chave_arquivo(doc["organizacao_id"], doc["_id"], "imagem.png")).is_file()
    # O mesmo pedido devolve a mesma mídia; outra cor, outra mídia
    assert cliente.post("/api/elementos/formas", json=pedido).json()["id"] == midia["id"]
    outra = cliente.post("/api/elementos/formas", json={**pedido, "cor": "#2b6cff"}).json()
    assert outra["id"] != midia["id"]
    assert db_limpo.midias.count_documents({"elemento": {"$exists": True}}) == 2


def test_forma_que_nao_serve_e_recusada(cliente):
    cadastrar(cliente)
    assert cliente.post("/api/elementos/formas", json={"tipo": "hexagono"}).status_code == 422
    assert cliente.post("/api/elementos/formas", json={"tipo": "elipse", "cor": None}).status_code == 422
    assert cliente.post("/api/elementos/formas", json={"tipo": "elipse", "contorno": 0.5}).status_code == 422
    vazada = cliente.post("/api/elementos/formas", json={"tipo": "elipse", "cor": None, "contorno": 0.05})
    assert vazada.status_code == 201
