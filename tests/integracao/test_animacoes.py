# Animações em HTML pela API: modelos, prévia, gravação no worker e a mídia transparente na biblioteca
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.test_animacao_html import PODE_GRAVAR
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_modelos_previa_e_fontes(cliente):
    cadastrar(cliente)
    modelos = cliente.get("/api/animacoes/modelos").json()
    assert "tarja" in {m["id"] for m in modelos}
    previa = cliente.get("/api/animacoes/previa", params={"modelo": "tarja", "proporcao": "9:16", "duracao": 3,
                                                          "campos": '{"nome": "Bia"}'})
    assert previa.status_code == 200 and "Bia" in previa.text and "getAnimations" in previa.text
    assert "default-src 'none'" in previa.headers["content-security-policy"]
    ruim = {"modelo": "tarja", "campos": '{"cor_1": "x"}'}
    assert cliente.get("/api/animacoes/previa", params=ruim).status_code == 422
    fonte = cliente.get("/api/animacoes/fontes/Inter[opsz,wght].ttf")
    assert fonte.status_code == 200 and fonte.headers["access-control-allow-origin"] == "*"
    assert cliente.get("/api/animacoes/fontes/..%2Fconfig.py").status_code == 404


def test_pedido_com_campo_ruim_e_recusado(cliente):
    cadastrar(cliente)
    assert cliente.post("/api/animacoes", json={"modelo": "tarja", "campos": {"cor_1": "azul"}}).status_code == 422
    assert cliente.post("/api/animacoes", json={"modelo": "tarja", "duracao": 30}).status_code == 422


@pytest.mark.skipif(not PODE_GRAVAR, reason="FFmpeg ou o Chromium do Playwright não instalados")
def test_animacao_vira_midia_com_transparencia(cliente, db_limpo):
    cadastrar(cliente)
    resposta = cliente.post("/api/animacoes", json={"modelo": "cta", "campos": {"texto": "Siga o perfil"},
                                                    "proporcao": "9:16", "duracao": 2})
    assert resposta.status_code == 201
    midia = resposta.json()
    assert midia["nome"] == "Animação · Chamada (CTA): Siga o perfil" and midia["status"] == "processando"
    job = pegar_proximo_job(db_limpo, ["animacao_html"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta" and (vista["video"]["largura"], vista["video"]["altura"]) == (1080, 1920)
    assert abs(vista["duracao"] - 2) < 0.1
    # A transparência continua depois da ingestão, pronta para o clipe usar
    assert "mascara.mp4" in vista["arquivos"] and "proxy.mp4" in vista["arquivos"]
    assert vista["recorte_fundo"] == {"status": "pronta", "erro": None}
    assert vista["animacao"]["modelo"] == "cta"


@pytest.mark.skipif(not PODE_GRAVAR, reason="FFmpeg ou o Chromium do Playwright não instalados")
def test_animacao_descrita_passa_pelo_llm_pela_gravacao_e_pela_ingestao(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.post("/api/animacoes/descrita", json={"descricao": "oi"}).status_code == 422
    assert cliente.post("/api/animacoes", json={"modelo": "livre", "campos": {}}).status_code == 422
    midia = cliente.post("/api/animacoes/descrita", json={"descricao": "Um título dizendo Bem-vindos",
                                                          "proporcao": "1:1", "duracao": 2}).json()
    for tipo in ("animacao_descrita", "animacao_html", "ingestao"):
        job = pegar_proximo_job(db_limpo, [tipo], "w-teste")
        assert job and processar_job(db_limpo, job, "w-teste") == "concluido", tipo
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta" and "mascara.mp4" in vista["arquivos"]
    assert vista["animacao"]["modelo"] == "livre" and "Bem-vindos" in vista["animacao"]["campos"]["html"]
