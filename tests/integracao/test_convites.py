# Cadastro só com convite (o site aberto na internet)
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.rotas import auth
from api.seguranca import LimitadorTentativas
from core import config
from core.utils import convites
from core.utils.mongo import agora


@pytest.fixture
def cliente(db_limpo, monkeypatch):
    monkeypatch.setattr(config, "CADASTRO_SO_COM_CONVITE", True)
    monkeypatch.setattr(auth, "limitador", LimitadorTentativas())
    with TestClient(app) as cliente:
        yield cliente


def criar_convite(db, usos=1, dias=14):
    codigo, documento = convites.novo_convite("teste", usos, dias)
    db.convites.insert_one(documento)
    return codigo


def cadastrar(cliente, convite=None, email=None):
    corpo = {"nome": "Ana Souza", "email": email or f"{uuid.uuid4().hex[:8]}@exemplo.com", "senha": "senha-segura-1"}
    if convite is not None:
        corpo["convite"] = convite
    resposta = cliente.post("/api/auth/cadastro", json=corpo)
    cliente.post("/api/auth/sair")
    return resposta


def test_codigo_aceita_minusculas_e_sem_traco():
    codigo = convites.gerar_codigo()
    assert len(codigo) == 11 and codigo[5] == "-"
    assert not set(codigo.replace("-", "")) & set("01ILO")
    assert convites.hash_do_codigo(codigo.lower().replace("-", " ")) == convites.hash_do_codigo(codigo)


def test_tela_sabe_que_precisa_do_convite(cliente, monkeypatch):
    assert cliente.get("/api/auth/cadastro").json() == {"so_com_convite": True}
    monkeypatch.setattr(config, "CADASTRO_SO_COM_CONVITE", False)
    assert cliente.get("/api/auth/cadastro").json() == {"so_com_convite": False}
    assert cadastrar(cliente).status_code == 201


def test_sem_convite_ou_com_codigo_errado_nao_cadastra(cliente, db_limpo):
    assert cadastrar(cliente).status_code == 403
    assert cadastrar(cliente, "AAAAA-BBBBB").status_code == 403
    assert db_limpo.usuarios.count_documents({}) == 0
    assert db_limpo.organizacoes.count_documents({}) == 0


def test_convite_vale_os_usos_e_guarda_as_contas(cliente, db_limpo):
    codigo = criar_convite(db_limpo, usos=2)
    assert cadastrar(cliente, codigo.lower()).status_code == 201
    assert cadastrar(cliente, codigo).status_code == 201
    assert cadastrar(cliente, codigo).status_code == 403
    convite = db_limpo.convites.find_one()
    assert convite["usos"] == 2 and len(convite["contas"]) == 2
    assert db_limpo.usuarios.count_documents({"convite_id": convite["_id"]}) == 2


def test_convite_vencido_ou_revogado_nao_vale(cliente, db_limpo):
    vencido = criar_convite(db_limpo)
    db_limpo.convites.update_one({}, {"$set": {"expira_em": agora() - timedelta(minutes=1)}})
    assert cadastrar(cliente, vencido).status_code == 403
    revogado = criar_convite(db_limpo)
    db_limpo.convites.update_one({"hash": convites.hash_do_codigo(revogado)}, {"$set": {"revogado": True}})
    assert cadastrar(cliente, revogado).status_code == 403


def test_email_repetido_nao_gasta_o_convite(cliente, db_limpo):
    codigo = criar_convite(db_limpo, usos=2)
    email = f"{uuid.uuid4().hex[:8]}@exemplo.com"
    assert cadastrar(cliente, codigo, email).status_code == 201
    assert cadastrar(cliente, codigo, email).status_code == 409
    assert db_limpo.convites.find_one()["usos"] == 1


def test_muitos_codigos_errados_bloqueiam(cliente):
    codigos = [cadastrar(cliente, f"AAAAA-BBBB{n}").status_code for n in range(6)]
    assert codigos[:5] == [403] * 5
    assert codigos[5] == 429
