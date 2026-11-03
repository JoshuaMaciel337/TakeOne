# Colaboração: o dono chama pelo link, quem já tem conta entra no espaço sem perder o seu, troca de espaço,
# vê o que é do espaço da vez e perde o acesso quando sai ou é tirado.
import pytest
from fastapi.testclient import TestClient

from api.main import app
from tests.integracao.test_api import cadastrar


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def entrar(cliente, email, senha="senha-segura-1"):
    cliente.cookies.clear()
    resposta = cliente.post("/api/auth/entrar", json={"email": email, "senha": senha})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_dono_chama_membro_que_troca_de_espaco_e_sai(cliente, db_limpo):
    _, email_dono = cadastrar(cliente, nome="Dona Ana", espaco="Estúdio da Ana")
    projeto_do_estudio = cliente.post("/api/projetos", json={"nome": "Vídeo do estúdio"}).json()
    convite = cliente.post("/api/espacos/atual/convite")
    assert convite.status_code == 201
    caminho = convite.json()["caminho"]
    token = caminho.rsplit("/", 1)[1]
    assert cliente.get("/api/espacos/atual/convite").json()["ativo"] is True

    cliente.cookies.clear()
    _, email_bia = cadastrar(cliente, nome="Bia Lima", espaco="Canal da Bia")
    projeto_da_bia = cliente.post("/api/projetos", json={"nome": "Vídeo da Bia"}).json()
    aberto = cliente.get(f"/api/espacos/convite/{token}").json()
    assert aberto == {"espaco": "Estúdio da Ana", "dono": "Dona Ana", "ja_faz_parte": False}
    assert cliente.get("/api/espacos/convite/inventado").status_code == 404

    sessao = cliente.post(f"/api/espacos/convite/{token}")
    assert sessao.status_code == 200
    assert (sessao.json()["organizacao"]["nome"], sessao.json()["usuario"]["papel"]) == ("Estúdio da Ana", "membro")
    # A sessão já está no espaço novo: vê os projetos dele e não os do próprio
    assert [p["nome"] for p in cliente.get("/api/projetos").json()] == ["Vídeo do estúdio"]
    assert cliente.get(f"/api/projetos/{projeto_do_estudio['id']}").status_code == 200
    assert cliente.get(f"/api/projetos/{projeto_da_bia['id']}").status_code == 404
    # O membro não chama nem tira ninguém
    assert cliente.post("/api/espacos/atual/convite").status_code == 403
    espacos = cliente.get("/api/espacos").json()
    assert [(e["nome"], e["papel"], e["atual"]) for e in espacos] == [
        ("Canal da Bia", "dono", False), ("Estúdio da Ana", "membro", True)]
    membros = cliente.get("/api/espacos/atual/membros").json()
    assert [(m["nome"], m["papel"]) for m in membros] == [("Dona Ana", "dono"), ("Bia Lima", "membro")]

    # Trocar de espaço pelo menu e voltar
    proprio = next(e for e in espacos if e["papel"] == "dono")
    assert cliente.post(f"/api/espacos/{proprio['id']}/usar").json()["organizacao"]["nome"] == "Canal da Bia"
    assert cliente.get(f"/api/projetos/{projeto_da_bia['id']}").status_code == 200
    estudio = next(e for e in espacos if e["papel"] == "membro")
    cliente.post(f"/api/espacos/{estudio['id']}/usar")
    assert cliente.get("/api/auth/eu").json()["organizacao"]["nome"] == "Estúdio da Ana"
    # Entrar de novo pelo link não duplica
    assert cliente.post(f"/api/espacos/convite/{token}").status_code == 200
    assert db_limpo.membros.count_documents({}) == 1

    # Uma chave criada no estúdio vale no estúdio
    chave = cliente.post("/api/chaves", json={"nome": "Assistente"}).json()["chave"]
    pela_chave = cliente.get("/api/auth/eu", headers={"Authorization": f"Bearer {chave}"}).json()
    assert pela_chave["organizacao"]["nome"] == "Estúdio da Ana"

    # A dona tira a Bia: a sessão dela volta ao próprio espaço e a chave do estúdio deixa de valer
    sessao_da_bia = dict(cliente.cookies)
    entrar(cliente, email_dono)
    bia = next(m for m in cliente.get("/api/espacos/atual/membros").json() if m["papel"] == "membro")
    dona = next(m for m in cliente.get("/api/espacos/atual/membros").json() if m["papel"] == "dono")
    assert cliente.delete(f"/api/espacos/atual/membros/{dona['id']}").status_code == 409
    assert cliente.delete(f"/api/espacos/atual/membros/{bia['id']}").status_code == 204
    cliente.cookies.clear()
    cliente.cookies.update(sessao_da_bia)
    assert cliente.get("/api/auth/eu").json()["organizacao"]["nome"] == "Canal da Bia"
    assert cliente.get(f"/api/projetos/{projeto_do_estudio['id']}").status_code == 404
    assert cliente.post(f"/api/espacos/{estudio['id']}/usar").status_code == 404
    assert cliente.get("/api/auth/eu", headers={"Authorization": f"Bearer {chave}"}).status_code == 401

    # Desligar o link: ninguém mais entra por ele
    entrar(cliente, email_dono)
    assert cliente.delete("/api/espacos/atual/convite").status_code == 204
    entrar(cliente, email_bia)
    assert cliente.post(f"/api/espacos/convite/{token}").status_code == 404


def test_membro_sai_sozinho(cliente, db_limpo):
    cadastrar(cliente, nome="Dona Ana", espaco="Estúdio da Ana")
    token = cliente.post("/api/espacos/atual/convite").json()["caminho"].rsplit("/", 1)[1]
    cliente.cookies.clear()
    resposta, _ = cadastrar(cliente, nome="Caio", espaco="Do Caio")
    eu = resposta.json()["usuario"]["id"]
    cliente.post(f"/api/espacos/convite/{token}")
    assert cliente.delete(f"/api/espacos/atual/membros/{eu}").status_code == 204
    assert cliente.get("/api/auth/eu").json()["organizacao"]["nome"] == "Do Caio"
    assert db_limpo.membros.count_documents({}) == 0
