# O vídeo ao contrário: o worker inverte em blocos e emenda; o quadro k vira o quadro N − 1 − k, e o som também
import shutil
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import ARQUIVO_INVERTIDO, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import organizacao_de
from tests.integracao.test_imagens import enviar_imagem
from worker.worker_principal import processar_job

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg não instalado")


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _video(caminho):
    # 45 quadros a 10 fps (4,5 s, três blocos de 2 s): o cinza sobe 5 a cada quadro; o som sobe de volume
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=black:s=64x48:r=10:d=4.5,format=yuv420p,geq=lum='16+5*N':cb=128:cr=128",
                    "-f", "lavfi", "-i", "aevalsrc='0.2*t/4.5*sin(2*PI*440*t)':s=48000:d=4.5",
                    "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p",
                    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                    "-c:a", "aac", "-shortest", str(caminho)], check=True, timeout=60)


def test_video_ao_contrario(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    video_id = str(enviar_imagem(db_limpo, organizacao, "Rampa.mp4", _video))
    resposta = cliente.post(f"/api/midias/{video_id}/inversao")
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["invertido"]["status"] == "processando"
    # Pedir de novo não põe outro job na fila
    cliente.post(f"/api/midias/{video_id}/inversao")
    assert db_limpo.jobs.count_documents({"tipo": "inversao"}) == 1
    job = pegar_proximo_job(db_limpo, ["inversao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    midia = cliente.get(f"/api/midias/{video_id}").json()
    assert midia["invertido"]["status"] == "pronta" and "invertido_proxy.mp4" in midia["arquivos"]

    caminho = storage.caminho_local(chave_arquivo(organizacao, ObjectId(video_id), ARQUIVO_INVERTIDO))
    cru = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(caminho), "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    quadros = np.frombuffer(cru, np.uint8).reshape(-1, 48, 64)[:, 24, 32].astype(float)
    assert len(quadros) == 45
    # O primeiro quadro do invertido é o último do original (luma 16 + 5 × 44), e assim por diante; a saída em
    # cinza leva a faixa de TV (16 a 235) para a cheia
    esperado = np.array([5 * (44 - k) * 255 / 219 for k in range(45)])
    assert np.abs(quadros - esperado).max() <= 2
    # O som sai do mais alto para o mais baixo
    som = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(caminho), "-ac", "1", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    amostras = np.abs(np.frombuffer(som, np.float32))
    comeco, fim = amostras[: 48000].max(), amostras[-48000:].max()
    assert comeco > 3 * fim, (comeco, fim)
