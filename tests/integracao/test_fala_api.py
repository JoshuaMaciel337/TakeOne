# Texto em fala pela API: a mídia nasce processando, a fala vira o original e passa pela ingestão
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import TEM_FFMPEG
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_pedido_valida_o_texto_e_a_voz(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.post("/api/midias/fala", json={"texto": " "}).status_code == 422
    assert cliente.post("/api/midias/fala", json={"texto": "Oi, tudo bem?", "voz": "outra"}).status_code == 422
    assert cliente.post("/api/midias/fala", json={"texto": "Oi", "velocidade": 3}).status_code == 422
    pedido = {"texto": "Olá! Hoje tem novidade no canal.", "voz": "pm_alex"}
    midia = cliente.post("/api/midias/fala", json=pedido).json()
    assert midia["status"] == "processando" and midia["nome"] == "Fala · Olá! Hoje tem novidade no canal"
    job = db_limpo.jobs.find_one({"tipo": "fala"})
    assert job["recurso"] == "cpu" and job["entrada"]["voz"] == "pm_alex"
    # Uma barra no texto não vira caminho: o nome fica inteiro e a mídia continua .m4a
    com_barra = cliente.post("/api/midias/fala", json={"texto": "Promoção 2/3 e/ou 50% off/"})
    assert com_barra.status_code == 201, com_barra.text
    assert com_barra.json()["nome"] == "Fala · Promoção 2/3 e/ou 50% off/"
    # A fala do gancho narrado de um corte vem marcada; a de sempre, não
    assert com_barra.json()["fala"] == {"texto": "Promoção 2/3 e/ou 50% off/", "voz": "pf_dora", "velocidade": 1.0}
    gancho = cliente.post("/api/midias/fala", json={"texto": "Sabe o que quase ninguém percebe?", "gancho": True})
    assert gancho.json()["fala"]["gancho"] is True


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_fala_vira_uma_midia_pronta(cliente, db_limpo):
    cadastrar(cliente)
    midia = cliente.post("/api/midias/fala", json={"texto": "Olá, tudo bem? Hoje tem novidade no canal."}).json()
    job = pegar_proximo_job(db_limpo, ["fala"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    pronta = cliente.get(f"/api/midias/{midia['id']}").json()
    assert pronta["status"] == "pronta" and pronta["audio"] and not pronta["video"]
    assert 1.0 < pronta["duracao"] < 8.0
