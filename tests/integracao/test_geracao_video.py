# Vídeo gerado com IA: pedir, gerar (no modo simulado, sem o ComfyUI) e passar pela ingestão como um envio
import shutil

import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from worker.worker_principal import processar_job

TEM_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_pedido_invalido_e_recusado(cliente):
    cadastrar(cliente)
    assert cliente.post("/api/midias/gerar-video", json={"descricao": "  a "}).status_code == 422
    assert cliente.post("/api/midias/gerar-video", json={"descricao": "Mar", "formato": "4:3"}).status_code == 422
    assert cliente.post("/api/midias/gerar-video", json={"descricao": "Mar", "duracao": 9}).status_code == 422


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_video_gerado_entra_na_biblioteca_pela_ingestao(cliente, db_limpo):
    cadastrar(cliente)
    pedido = {"descricao": "Ondas do mar ao pôr do sol, câmera lenta", "formato": "9:16", "duracao": 2}
    resposta = cliente.post("/api/midias/gerar-video", json=pedido)
    assert resposta.status_code == 201
    midia = resposta.json()
    assert midia["nome"] == "IA · Ondas do mar ao pôr do sol" and midia["status"] == "processando"
    assert midia["gerada"] == {"descricao": "Ondas do mar ao pôr do sol, câmera lenta", "formato": "9:16", "duracao": 2}
    assert midia["processamento"]["status"] == "pendente"

    job = pegar_proximo_job(db_limpo, ["geracao_video"], "w-teste")
    assert job["entrada"]["midia_id"] == midia["id"] and isinstance(job["entrada"]["semente"], int)
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    # Gerado, a mídia segue na fila da ingestão, que mostra o progresso dela
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "processando" and vista["tamanho_total"] > 0

    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert ingestao["entrada"]["midia_id"] == midia["id"]
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta"
    assert (vista["video"]["largura"], vista["video"]["altura"]) == (480, 832)
    assert abs(vista["duracao"] - 2) < 0.1
    assert "proxy.mp4" in vista["arquivos"] and "capa.jpg" in vista["arquivos"]


def test_excluir_durante_a_geracao_cancela_o_job(cliente, db_limpo):
    cadastrar(cliente)
    midia = cliente.post("/api/midias/gerar-video", json={"descricao": "Floresta com neblina"}).json()
    assert cliente.delete(f"/api/midias/{midia['id']}").status_code == 204
    assert pegar_proximo_job(db_limpo, ["geracao_video"], "w-teste") is None
