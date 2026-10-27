# Efeitos sonoros desenhados aqui (Clipar, 14.12d): a lista, o som para ouvir e a mídia, que o espaço reaproveita
import io
import shutil
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.utils.efeitos_sonoros import EFEITOS, TAXA, sintetizar
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_cada_efeito_sai_igual_sempre_com_o_pico_certo_e_sem_estalo_nas_pontas():
    for efeito in EFEITOS:
        som = sintetizar(efeito)
        assert som.shape[0] == 2 and 0.1 < som.shape[1] / TAXA <= 2.5, efeito
        assert np.abs(som).max() == pytest.approx(10 ** (-1 / 20), abs=1e-6), efeito
        assert np.abs(som[:, 0]).max() < 1e-3 and np.abs(som[:, -1]).max() < 1e-3, efeito
        assert np.array_equal(som, sintetizar(efeito)), efeito
    # O whoosh anda da esquerda para a direita: o começo pesa mais na esquerda e o fim na direita
    whoosh = sintetizar("whoosh")
    terco = whoosh.shape[1] // 3
    assert np.abs(whoosh[0, :terco]).mean() > np.abs(whoosh[1, :terco]).mean()
    assert np.abs(whoosh[1, -terco:]).mean() > np.abs(whoosh[0, -terco:]).mean()
    with pytest.raises(ValueError):
        sintetizar("trovao")


def test_lista_e_som_para_ouvir(cliente):
    cadastrar(cliente)
    assert {e["id"] for e in cliente.get("/api/efeitos-sonoros").json()} == set(EFEITOS)
    resposta = cliente.get("/api/efeitos-sonoros/camera.wav")
    assert resposta.status_code == 200 and resposta.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(resposta.content)) as arquivo:
        assert (arquivo.getnchannels(), arquivo.getframerate(), arquivo.getsampwidth()) == (2, 48000, 2)
    assert cliente.get("/api/efeitos-sonoros/trovao.wav").status_code == 404


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg não instalado")
def test_efeito_vira_midia_de_som_e_o_segundo_pedido_devolve_a_mesma(cliente, db_limpo):
    cadastrar(cliente)
    midia = cliente.post("/api/efeitos-sonoros/whoosh").json()
    assert midia["nome"] == "Efeito · Whoosh" and midia["status"] == "processando"
    assert cliente.post("/api/efeitos-sonoros/whoosh").json()["id"] == midia["id"]
    job = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta" and vista["audio"] and not vista["video"]
    assert abs(vista["duracao"] - 0.9) < 0.05
    assert cliente.post("/api/efeitos-sonoros/whoosh").json()["id"] == midia["id"]
    assert cliente.post("/api/efeitos-sonoros/trovao").status_code == 404
