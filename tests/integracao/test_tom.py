# Tom da voz: pedir, gerar a voz no tom (asetrate + atempo) e medir que a altura mudou sem mudar o tempo
import shutil
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import arquivo_do_tom, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia, gerar_quadrantes, organizacao_de
from worker.worker_principal import processar_job

TEM_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def frequencia(caminho) -> float:
    """A frequência mais forte do som (FFT de 1 s do meio)."""
    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", "0.5", "-t", "1", "-i", str(caminho), "-ac", "1",
                          "-ar", "48000", "-f", "f32le", "-"], capture_output=True, check=True, timeout=60).stdout
    amostras = np.frombuffer(pcm, np.float32)
    espectro = np.abs(np.fft.rfft(amostras * np.hanning(len(amostras))))
    return float(np.argmax(espectro) * 48000 / len(amostras))


def test_pedir_tom_entra_na_fila_uma_vez(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente)
    assert cliente.post(f"/api/midias/{midia_id}/tom", json={"semitons": 0}).status_code == 422
    assert cliente.post(f"/api/midias/{midia_id}/tom", json={"semitons": 3, "limpa": True}).status_code == 409
    pedido = cliente.post(f"/api/midias/{midia_id}/tom", json={"semitons": 3})
    assert pedido.status_code == 200 and pedido.json()["tons"] == {"tom_p3": {"status": "processando", "erro": None}}
    cliente.post(f"/api/midias/{midia_id}/tom", json={"semitons": 3})
    assert db_limpo.jobs.count_documents({"tipo": "tom"}) == 1, "pedir de novo enquanto anda não cria outro job"


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_uma_oitava_acima_dobra_a_frequencia_sem_mudar_o_tempo(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    cliente.post(f"/api/midias/{midia_id}/tom", json={"semitons": 12})
    job = pegar_proximo_job(db_limpo, ["tom"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    vista = cliente.get(f"/api/midias/{midia_id}").json()
    nome = arquivo_do_tom(12, False)
    assert vista["tons"]["tom_p12"] == {"status": "pronta", "erro": None} and nome in vista["arquivos"]
    assert cliente.get(f"/api/midias/{midia_id}/arquivos/{nome}").status_code == 200
    caminho = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), nome))
    assert frequencia(caminho) == pytest.approx(880, abs=5), "440 Hz uma oitava acima"
    sondagem = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(caminho)]
    duracao = float(subprocess.run(sondagem, capture_output=True, text=True, check=True).stdout)
    assert duracao == pytest.approx(2, abs=0.05), "a voz no tom tem o tempo da mídia"
