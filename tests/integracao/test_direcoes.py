# "Criar automaticamente" pela API: o pedido vira um job de GPU e a saída é o plano (modo simulado)
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.test_direcao import FALA
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_plano_pelo_job(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.post("/api/direcoes", json={"palavras": [], "duracao": 10}).status_code == 422
    job = cliente.post("/api/direcoes", json={"palavras": FALA, "duracao": 12}).json()
    assert job["tipo"] == "direcao" and job["recurso"] == "gpu"
    pego = pegar_proximo_job(db_limpo, ["direcao"], "w-teste")
    assert processar_job(db_limpo, pego, "w-teste") == "concluido"
    pronto = cliente.get(f"/api/jobs/{job['id']}").json()
    assert pronto["status"] == "concluido" and pronto["saida"]["plano"]["titulo"]


def test_palavras_chave_pelo_job(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.post("/api/direcoes/palavras-chave", json={"legendas": []}).status_code == 422
    legendas = [{"id": "c1", "texto": "Hoje vou mostrar três jeitos"}, {"id": "c2", "texto": "de editar"}]
    job = cliente.post("/api/direcoes/palavras-chave", json={"legendas": legendas}).json()
    assert job["tipo"] == "palavras_chave" and job["recurso"] == "gpu"
    pego = pegar_proximo_job(db_limpo, ["palavras_chave"], "w-teste")
    assert processar_job(db_limpo, pego, "w-teste") == "concluido"
    pronto = cliente.get(f"/api/jobs/{job['id']}").json()
    assert pronto["status"] == "concluido" and pronto["saida"]["chaves"] == {"c1": [2]}


def test_emojis_pelo_job(cliente, db_limpo):
    cadastrar(cliente)
    legendas = [{"id": f"c{i}", "texto": f"legenda {i}"} for i in range(7)]
    job = cliente.post("/api/direcoes/emojis", json={"legendas": legendas}).json()
    assert job["tipo"] == "emojis" and job["recurso"] == "gpu"
    pego = pegar_proximo_job(db_limpo, ["emojis"], "w-teste")
    assert processar_job(db_limpo, pego, "w-teste") == "concluido"
    pronto = cliente.get(f"/api/jobs/{job['id']}").json()
    # Um a cada três, e no máximo 40% das legendas
    assert pronto["saida"]["emojis"] == {"c0": "fogo", "c3": "dinheiro"}


def test_gancho_pelo_job(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.post("/api/direcoes/gancho", json={"titulo": " ", "texto": ""}).status_code == 422
    job = cliente.post("/api/direcoes/gancho", json={"titulo": "Câncer aos 20", "texto": "Eu descobri..."}).json()
    assert job["tipo"] == "gancho" and job["recurso"] == "gpu"
    pego = pegar_proximo_job(db_limpo, ["gancho"], "w-teste")
    assert processar_job(db_limpo, pego, "w-teste") == "concluido"
    assert cliente.get(f"/api/jobs/{job['id']}").json()["saida"]["frase"].endswith("?")


def test_pedido_de_edicao_pelo_job(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.post("/api/direcoes/pedido", json={"pedido": ""}).status_code == 422
    frases = [{"n": 0, "texto": "Oi, tudo bem?", "inicio": 0}, {"n": 1, "texto": "Hoje vou contar", "inicio": 2}]
    corpo = {"pedido": "Legenda amarela e maior, zoom, tira as pausas", "frases": frases,
             "estado": {"formato": "9:16", "legendas": True}}
    job = cliente.post("/api/direcoes/pedido", json=corpo).json()
    assert job["tipo"] == "pedido_edicao" and job["recurso"] == "gpu"
    # Na frente das clipagens e dos vídeos gerados: a pessoa espera olhando
    pego = pegar_proximo_job(db_limpo, ["pedido_edicao"], "w-teste")
    assert pego["prioridade"] == 1
    assert processar_job(db_limpo, pego, "w-teste") == "concluido"
    plano = cliente.get(f"/api/jobs/{job['id']}").json()["saida"]["plano"]
    assert plano["legenda"]["acao"] == "mudar" and plano["legenda"]["cor"] == "amarelo"
    assert plano["zoom"] == {"acao": "por", "palavras": [], "frases": [0]} and plano["pausas"] == "tirar"
