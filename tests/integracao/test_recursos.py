# Degradês e padrões do espaço (editor de imagem): criar, listar por tipo, baixar o ladrilho, excluir e os limites.
import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from tests.integracao.test_api import cadastrar


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def png_base64(largura: int, altura: int) -> str:
    saida = io.BytesIO()
    Image.new("RGB", (largura, altura), (200, 30, 30)).save(saida, "PNG")
    return base64.b64encode(saida.getvalue()).decode()


def test_degrades_e_padroes(cliente, db_limpo):
    cadastrar(cliente)
    paradas = {"tipo": "solido", "cores": [{"posicao": 0, "cor": "#000000", "meio": 0.5}], "opacidades": []}
    degrade = cliente.post("/api/recursos", json={"tipo": "degrade", "nome": "Meu degradê", "dados": paradas})
    assert degrade.status_code == 201, degrade.text
    assert degrade.json()["dados"] == paradas and degrade.json()["imagem"] is None
    padrao = cliente.post("/api/recursos", json={"tipo": "padrao", "nome": "Listras", "imagem_png": png_base64(24, 16)})
    assert padrao.status_code == 201, padrao.text
    assert padrao.json()["imagem"] == {"largura": 24, "altura": 16}
    imagem = cliente.get(f"/api/recursos/{padrao.json()['id']}/imagem.png")
    assert imagem.status_code == 200 and Image.open(io.BytesIO(imagem.content)).size == (24, 16)
    assert [r["nome"] for r in cliente.get("/api/recursos?tipo=degrade").json()] == ["Meu degradê"]
    assert [r["nome"] for r in cliente.get("/api/recursos?tipo=padrao").json()] == ["Listras"]
    assert cliente.get("/api/recursos?tipo=outro").status_code == 422
    # Padrão sem ladrilho, ladrilho que não é PNG e grande demais
    assert cliente.post("/api/recursos", json={"tipo": "padrao", "nome": "Sem"}).status_code == 422
    nao_png = base64.b64encode(b"isso nao e png").decode()
    assert cliente.post("/api/recursos", json={"tipo": "padrao", "nome": "X", "imagem_png": nao_png}).status_code == 422
    grande = cliente.post("/api/recursos", json={"tipo": "padrao", "nome": "G", "imagem_png": png_base64(2049, 4)})
    assert grande.status_code == 422
    assert cliente.delete(f"/api/recursos/{padrao.json()['id']}").status_code == 204
    assert cliente.get(f"/api/recursos/{padrao.json()['id']}/imagem.png").status_code == 404
