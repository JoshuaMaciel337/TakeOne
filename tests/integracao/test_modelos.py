# Biblioteca de modelos: salvar um projeto como modelo do espaço, usar, salvos, usos e isolamento
import pytest
from fastapi.testclient import TestClient

from api.main import app
from tests.integracao.test_api import cadastrar
from tests.integracao.test_projetos import SEGUNDO, clipe, criar_midia, principal_com, salvar

TEXTO = {"conteudo": "Título do modelo", "cor": "#ffffff"}


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def projeto_pronto(cliente, db):
    """Um projeto com um vídeo na principal e um título por cima, salvo."""
    midia_id = criar_midia(db, cliente)
    projeto = cliente.post("/api/projetos", json={"proporcao": "9:16"}).json()
    titulo = {**clipe(None, 0, 2, id_="titulo"), "midia_id": None, "texto": TEXTO}
    faixas = [{"id": "textos", "tipo": "texto", "oculta": False, "muda": False, "travada": False, "clipes": [titulo]},
              *principal_com(projeto, [clipe(midia_id, 0, 4, id_="video1")])]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    return salvo.json(), midia_id


VAGAS = [{"clipe_id": "video1", "tipo": "midia", "rotulo": "Seu vídeo"},
         {"clipe_id": "titulo", "tipo": "texto", "rotulo": "Título"}]


def test_salvar_usar_e_listar(cliente, db_limpo):
    cadastrar(cliente)
    projeto, _ = projeto_pronto(cliente, db_limpo)
    corpo = {"projeto_id": projeto["id"], "nome": " Abertura do canal ", "vagas": VAGAS}
    criado = cliente.post("/api/modelos", json=corpo)
    assert criado.status_code == 201, criado.text
    modelo = criado.json()
    assert modelo["nome"] == "Abertura do canal" and modelo["proporcao"] == "9:16" and modelo["duracao"] == 4 * SEGUNDO
    assert [v["rotulo"] for v in modelo["vagas"]] == ["Seu vídeo", "Título"]

    usado = cliente.post(f"/api/modelos/{modelo['id']}/usar")
    assert usado.status_code == 201, usado.text
    novo = usado.json()
    assert novo["id"] != projeto["id"] and novo["nome"] == "Abertura do canal"
    assert [f["tipo"] for f in novo["faixas"]] == [f["tipo"] for f in projeto["faixas"]]
    assert novo["modelo_origem"] == {"id": modelo["id"], "nome": "Abertura do canal", "vagas": modelo["vagas"]}
    # O projeto novo abre igual pelo GET e o de origem continua sem origem
    assert cliente.get(f"/api/projetos/{novo['id']}").json()["modelo_origem"]["id"] == modelo["id"]
    assert cliente.get(f"/api/projetos/{projeto['id']}").json()["modelo_origem"] is None

    biblioteca = cliente.get("/api/modelos").json()
    assert [m["id"] for m in biblioteca["do_espaco"]] == [modelo["id"]]
    assert biblioteca["usos"] == {modelo["id"]: 1}
    assert "faixas" not in biblioteca["do_espaco"][0]


def test_vaga_que_nao_bate_e_projeto_vazio_sao_recusados(cliente, db_limpo):
    cadastrar(cliente)
    projeto, _ = projeto_pronto(cliente, db_limpo)
    trocada = [{"clipe_id": "titulo", "tipo": "midia", "rotulo": "Título"}]
    resposta = cliente.post("/api/modelos", json={"projeto_id": projeto["id"], "nome": "X", "vagas": trocada})
    assert resposta.status_code == 422 and "não é um clipe de mídia" in resposta.json()["detail"]
    sumida = [{"clipe_id": "nao-existe", "tipo": "texto", "rotulo": "Y"}]
    resposta = cliente.post("/api/modelos", json={"projeto_id": projeto["id"], "nome": "X", "vagas": sumida})
    assert resposta.status_code == 422
    vazio = cliente.post("/api/projetos", json={}).json()
    resposta = cliente.post("/api/modelos", json={"projeto_id": vazio["id"], "nome": "X"})
    assert resposta.status_code == 422 and "vazio" in resposta.json()["detail"]


def test_salvos_usos_dos_prontos_e_midia_presa_ao_modelo(cliente, db_limpo):
    cadastrar(cliente)
    projeto, midia_id = projeto_pronto(cliente, db_limpo)
    modelo = cliente.post("/api/modelos", json={"projeto_id": projeto["id"], "nome": "Meu"}).json()
    ids = ["tres-dicas", modelo["id"], "tres-dicas", "animacao-ao_vivo"]
    salvos = cliente.put("/api/modelos/salvos", json={"ids": ids})
    assert salvos.json() == ["tres-dicas", modelo["id"], "animacao-ao_vivo"]
    assert cliente.put("/api/modelos/salvos", json={"ids": ["Com Espaço"]}).status_code == 422
    for _ in range(2):
        assert cliente.post("/api/modelos/usos", json={"modelo_id": "tres-dicas"}).status_code == 204
    biblioteca = cliente.get("/api/modelos").json()
    assert biblioteca["salvos"] == ["tres-dicas", modelo["id"], "animacao-ao_vivo"]
    assert biblioteca["usos"]["tres-dicas"] == 2

    # Tirada de todo projeto, a mídia ainda é do modelo: não sai da biblioteca enquanto ele existir
    for doc in list(db_limpo.projetos.find({})):
        db_limpo.projetos.update_one({"_id": doc["_id"]}, {"$set": {"midias_usadas": []}})
    resposta = cliente.delete(f"/api/midias/{midia_id}")
    assert resposta.status_code == 409 and "modelo" in resposta.json()["detail"]
    assert cliente.delete(f"/api/modelos/{modelo['id']}").status_code == 204
    assert cliente.get("/api/modelos").json()["do_espaco"] == []
    assert cliente.delete(f"/api/midias/{midia_id}").status_code == 204


def test_modelos_sao_do_espaco(cliente, db_limpo):
    cadastrar(cliente)
    projeto, _ = projeto_pronto(cliente, db_limpo)
    modelo = cliente.post("/api/modelos", json={"projeto_id": projeto["id"], "nome": "Só nosso"}).json()
    cliente.post("/api/auth/sair")
    cadastrar(cliente)
    assert cliente.get("/api/modelos").json()["do_espaco"] == []
    assert cliente.post(f"/api/modelos/{modelo['id']}/usar").status_code == 404
    assert cliente.delete(f"/api/modelos/{modelo['id']}").status_code == 404
    assert cliente.post("/api/modelos", json={"projeto_id": projeto["id"], "nome": "Roubado"}).status_code == 404
