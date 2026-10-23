# Câmera lenta suave: o worker inventa os quadros do meio no trecho pedido, a 4 vezes os quadros da fonte, e
# guarda onde o arquivo começa na mídia (o primeiro quadro do trecho)
import shutil
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import arquivos_do_fluido, chave_arquivo, chave_do_fluido
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
    # 30 quadros a 10 fps: o cinza sobe 5 a cada quadro
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=black:s=64x48:r=10:d=3,format=yuv420p,geq=lum='16+5*N':cb=128:cr=128",
                    "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p",
                    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", str(caminho)],
                   check=True, timeout=60)


def test_camera_lenta_suave_do_trecho(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    video_id = str(enviar_imagem(db_limpo, organizacao, "Rampa.mp4", _video))
    resposta = cliente.post(f"/api/midias/{video_id}/fluido", json={"de": 1.0, "ate": 2.0})
    assert resposta.status_code == 200, resposta.text
    chave = chave_do_fluido(1.0, 2.0)
    assert resposta.json()["fluidos"][chave]["status"] == "processando"
    job = pegar_proximo_job(db_limpo, ["fluido"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    pronto = cliente.get(f"/api/midias/{video_id}").json()["fluidos"][chave]
    assert pronto["status"] == "pronta" and pronto["zero"] == pytest.approx(1.0, abs=1e-6)

    nome = arquivos_do_fluido(1.0, 2.0)[0]
    caminho = storage.caminho_local(chave_arquivo(organizacao, ObjectId(video_id), nome))
    cru = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(caminho), "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    cinzas = np.frombuffer(cru, np.uint8).reshape(-1, 48, 64)[:, 24, 32].astype(float)
    # Os últimos quadros do trecho não têm o seguinte para inventar os do meio e ficam de fora: cabem na folga de
    # 1 s que o editor pede em volta do clipe
    assert 32 <= len(cinzas) <= 41, len(cinzas)
    # O quadro 4k do novo é o quadro 10 + k do original (o primeiro do trecho), e os do meio ficam entre eles
    originais = [5 * (10 + k) * 255 / 219 for k in range(10)]
    for k in range((len(cinzas) - 3) // 4):
        assert abs(cinzas[4 * k] - originais[k]) <= 3, k
        assert originais[k] - 3 <= cinzas[4 * k + 2] <= originais[k + 1] + 3, k
    assert len(set(np.round(cinzas[:8]))) >= 5, "os quadros do meio são novos, não cópias"
