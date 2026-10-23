# Pincéis do espaço (editor de imagem): criar com e sem ponta, listar, baixar a ponta, excluir e os limites.
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
    Image.new("RGBA", (largura, altura), (255, 255, 255, 200)).save(saida, "PNG")
    return base64.b64encode(saida.getvalue()).decode()


def test_pinceis_do_espaco(cliente, db_limpo):
    cadastrar(cliente)
    salvo = cliente.post("/api/pinceis", json={"nome": "Meu giz", "opcoes": {"tamanho": 40, "ponta": "giz"}})
    assert salvo.status_code == 201, salvo.text
    assert salvo.json()["tem_ponta"] is False and salvo.json()["pasta"] == "meus"
    importado = cliente.post("/api/pinceis", json={"nome": "Pincel 1", "pasta": "importados", "opcoes": {"tamanho": 32},
                                                   "ponta_png": png_base64(32, 20)})
    assert importado.status_code == 201, importado.text
    pincel = importado.json()
    assert pincel["ponta"] == {"largura": 32, "altura": 20}
    ponta = cliente.get(f"/api/pinceis/{pincel['id']}/ponta.png")
    assert ponta.status_code == 200 and Image.open(io.BytesIO(ponta.content)).size == (32, 20)
    assert [item["nome"] for item in cliente.get("/api/pinceis").json()] == ["Meu giz", "Pincel 1"]
    assert cliente.get(f"/api/pinceis/{salvo.json()['id']}/ponta.png").status_code == 404

    # Ponta que não é PNG, grande demais, e opções gigantes
    nada = base64.b64encode(b"nada").decode()
    ruim = cliente.post("/api/pinceis", json={"nome": "x", "opcoes": {}, "ponta_png": nada})
    assert ruim.status_code == 422
    grande = cliente.post("/api/pinceis", json={"nome": "x", "opcoes": {}, "ponta_png": png_base64(2600, 10)})
    assert grande.status_code == 422 and "2500" in grande.json()["detail"]
    assert cliente.post("/api/pinceis", json={"nome": "x", "opcoes": {"a": "b" * 40000}}).status_code == 422

    assert cliente.delete(f"/api/pinceis/{pincel['id']}").status_code == 204
    assert [item["nome"] for item in cliente.get("/api/pinceis").json()] == ["Meu giz"]
    assert cliente.get(f"/api/pinceis/{pincel['id']}/ponta.png").status_code == 404
