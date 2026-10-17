# Batidas: pedir, achar num som de ritmo conhecido (worker de CPU, com FFmpeg) e ler pela API
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.config import FFMPEG
from core.utils.batidas import TAXA
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import TEM_FFMPEG, criar_midia
from tests.test_batidas import _faixa
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _gerar_musica(caminho: Path):
    """12 s a 120 BPM, em AAC, como uma música enviada."""
    som, _ = _faixa(120.0, desvio_s=0.25)
    with tempfile.TemporaryDirectory() as pasta:
        wav = Path(pasta) / "musica.wav"
        with wave.open(str(wav), "wb") as arquivo:
            arquivo.setnchannels(1)
            arquivo.setsampwidth(2)
            arquivo.setframerate(TAXA)
            arquivo.writeframes((np.clip(som, -1, 1) * 32000).astype("<i2").tobytes())
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav), "-c:a", "aac",
                        str(caminho)], check=True)


def test_pedir_batidas_entra_na_fila_uma_vez(cliente, db_limpo):
    cadastrar(cliente)
    sem_som = criar_midia(db_limpo, cliente, audio=False)
    assert cliente.post(f"/api/midias/{sem_som}/batidas").status_code == 409
    midia_id = criar_midia(db_limpo, cliente)
    assert cliente.get(f"/api/midias/{midia_id}/batidas").json()["status"] == "nenhuma"
    pedido = cliente.post(f"/api/midias/{midia_id}/batidas").json()
    assert pedido["status"] == "processando" and pedido["processamento"]["status"] == "pendente"
    cliente.post(f"/api/midias/{midia_id}/batidas")
    assert db_limpo.jobs.count_documents({"tipo": "batidas"}) == 1
    assert db_limpo.jobs.find_one({"tipo": "batidas"})["recurso"] == "cpu"


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_acha_as_batidas_de_uma_musica(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, duracao=12.0, gerar=_gerar_musica)
    cliente.post(f"/api/midias/{midia_id}/batidas")
    job = pegar_proximo_job(db_limpo, ["batidas"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    pronto = cliente.get(f"/api/midias/{midia_id}/batidas").json()
    assert pronto["status"] == "pronto" and abs(pronto["bpm"] - 120) < 1.5
    # O AAC atrasa o começo em alguns milissegundos: as batidas ficam perto da grade de 0,5 s a partir de 0,25 s
    batidas = np.array(pronto["batidas"])
    assert len(batidas) >= 20 and np.max(np.abs(((batidas - 0.25) + 0.25) % 0.5 - 0.25)) < 0.05
    assert len(pronto["fortes"]) >= 5
    # Já achadas: pedir de novo não cria outro job, e apagar a mídia apaga as batidas
    cliente.post(f"/api/midias/{midia_id}/batidas")
    assert db_limpo.jobs.count_documents({"tipo": "batidas"}) == 1
    assert cliente.delete(f"/api/midias/{midia_id}").status_code == 204
    assert db_limpo.batidas.count_documents({}) == 0
