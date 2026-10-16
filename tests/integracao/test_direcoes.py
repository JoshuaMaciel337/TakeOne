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
