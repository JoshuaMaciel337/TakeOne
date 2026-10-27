# Legendas animadas pela API (Clipar, 14.12a): estilos, prévia, motor público, gravação e a mídia transparente
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


PALAVRAS = [{"texto": "Olá", "inicio": 0.2, "fim": 0.6}, {"texto": "pessoal", "inicio": 0.7, "fim": 1.2,
                                                          "enfase": True}]


def test_estilos_previa_motor_e_fontes(cliente):
    cadastrar(cliente)
    estilos = cliente.get("/api/legendas-animadas/estilos").json()
    assert {"editorial", "uma_palavra", "neon"} <= {e["id"] for e in estilos}
    previa = cliente.get("/api/legendas-animadas/previa",
                         params={"estilo": "pulando", "cores": '{"enfase": "#00ff00"}'})
    assert previa.status_code == 200 and "window.LEGENDA" in previa.text and "#00ff00" in previa.text
    assert "default-src 'none'" in previa.headers["content-security-policy"]
    assert cliente.get("/api/legendas-animadas/previa", params={"estilo": "x"}).status_code == 422
    assert cliente.get("/api/legendas-animadas/previa", params={"estilo": "neon",
                                                                "cores": '{"texto": "red"}'}).status_code == 422
    motor = cliente.get("/api/legendas-animadas/motor.js")
    assert motor.status_code == 200 and "estadoEm" in motor.text
    fonte = cliente.get("/api/legendas-animadas/fontes/nucleo/Montserrat[wght].ttf")
    assert fonte.status_code == 200 and fonte.headers["access-control-allow-origin"] == "*"
    assert cliente.get("/api/legendas-animadas/fontes/nucleo/..%2F..%2Fconfig.py").status_code == 404
    assert cliente.get("/api/legendas-animadas/fontes/biblioteca/Inter[opsz,wght].ttf").status_code == 404


def test_pedido_ruim_e_recusado(cliente):
    cadastrar(cliente)
    base = {"palavras": PALAVRAS, "estilo": "neon", "duracao": 2}
    assert cliente.post("/api/legendas-animadas", json={**base, "estilo": "x"}).status_code == 422
    assert cliente.post("/api/legendas-animadas", json={**base, "duracao": 400}).status_code == 422
    assert cliente.post("/api/legendas-animadas", json={**base, "palavras": []}).status_code == 422
    fora = [{"texto": "a", "inicio": 5, "fim": 5.2}]
    resposta = cliente.post("/api/legendas-animadas", json={**base, "palavras": fora})
    assert resposta.status_code == 422 and "dentro da duração" in resposta.json()["detail"]


@pytest.mark.skipif(not PODE_GRAVAR, reason="FFmpeg ou o Chromium do Playwright não instalados")
def test_legenda_vira_midia_com_transparencia(cliente, db_limpo):
    cadastrar(cliente)
    resposta = cliente.post("/api/legendas-animadas", json={"palavras": PALAVRAS, "estilo": "uma_palavra",
                                                            "proporcao": "9:16", "duracao": 2})
    assert resposta.status_code == 201
    midia = resposta.json()
    assert midia["status"] == "processando" and midia["legenda_animada"]["palavras"] == 2
    job = pegar_proximo_job(db_limpo, ["legenda_animada"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta" and (vista["video"]["largura"], vista["video"]["altura"]) == (1080, 1920)
    assert abs(vista["duracao"] - 2) < 0.1
    assert "mascara.mp4" in vista["arquivos"] and vista["recorte_fundo"] == {"status": "pronta", "erro": None}
