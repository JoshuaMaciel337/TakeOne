# Kit de marca: cores, fontes e logo do espaço, com o logo preso a uma imagem da biblioteca
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import montar_midia
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia, organizacao_de


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _imagem(db, cliente) -> str:
    midia = montar_midia(organizacao_de(cliente), ObjectId(), "logo.png", 100, "image/png")
    midia.update({"status": "pronta", "imagem": True, "video": {"largura": 400, "altura": 400, "transparente": True}})
    return str(db.midias.insert_one(midia).inserted_id)


def test_kit_comeca_vazio_e_guarda_cores_fontes_e_logo(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.get("/api/marca").json() == {"cores": [], "fonte_titulo": "display", "fonte_texto": "texto",
                                                "logo_midia_id": None}
    logo = _imagem(db_limpo, cliente)
    kit = {"cores": ["#FF624A", "#101828"], "fonte_titulo": "manuscrita", "fonte_texto": "texto", "logo_midia_id": logo}
    salvo = cliente.put("/api/marca", json=kit)
    assert salvo.status_code == 200, salvo.text
    assert salvo.json()["cores"] == ["#ff624a", "#101828"]
    assert cliente.get("/api/marca").json() == {**kit, "cores": ["#ff624a", "#101828"]}
    # Excluir a imagem tira o logo do kit
    assert cliente.delete(f"/api/midias/{logo}").status_code == 204
    assert cliente.get("/api/marca").json()["logo_midia_id"] is None


def test_kit_recusa_o_que_nao_serve(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_midia(db_limpo, cliente, duracao=2.0)
    assert cliente.put("/api/marca", json={"cores": ["vermelho"]}).status_code == 422
    assert cliente.put("/api/marca", json={"cores": ["#000000"] * 7}).status_code == 422
    assert cliente.put("/api/marca", json={"fonte_titulo": "comic"}).status_code == 422
    assert cliente.put("/api/marca", json={"logo_midia_id": video}).status_code == 409, "o logo é uma imagem"
    assert cliente.put("/api/marca", json={"logo_midia_id": "0" * 24}).status_code == 404


def test_cada_espaco_tem_o_seu_kit(cliente, db_limpo):
    cadastrar(cliente)
    cliente.put("/api/marca", json={"cores": ["#123456"]})
    logo = _imagem(db_limpo, cliente)
    cliente.cookies.clear()
    cadastrar(cliente)
    assert cliente.get("/api/marca").json()["cores"] == []
    assert cliente.put("/api/marca", json={"logo_midia_id": logo}).status_code == 404, "a imagem é do outro espaço"
