# Congelar o quadro: a foto do instante sai do vídeo pela regra do render (o último quadro que chegou até ele)
import shutil
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from core.modelos.midia import chave_arquivo
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
    # Dez quadros por segundo, cada um um cinza (luma 20 × o número do quadro, em faixa de TV)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=black:s=64x48:r=10:d=1,format=yuv420p,geq=lum='16+20*N':cb=128:cr=128",
                    "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p",
                    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", str(caminho)],
                   check=True, timeout=60)


def _processar(db, tipo):
    job = pegar_proximo_job(db, [tipo], "w-teste")
    assert job is not None
    assert processar_job(db, job, "w-teste") == "concluido", db.jobs.find_one({"_id": job["_id"]})["erro"]


def _cinza_da_foto(db, organizacao, midia_id):
    doc = db.midias.find_one({"_id": ObjectId(midia_id)})
    with Image.open(storage.caminho_local(chave_arquivo(organizacao, doc["_id"], "imagem.png"))) as aberta:
        return float(np.asarray(aberta.convert("RGB"))[24, 32].mean())


@pytest.mark.parametrize(("segundos", "quadro"), [(0.35, 3), (0.4, 4), (0.0, 0)])
def test_quadro_congelado_e_o_que_o_render_mostra(cliente, db_limpo, segundos, quadro):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    video_id = str(enviar_imagem(db_limpo, organizacao, "Cinzas.mp4", _video))
    resposta = cliente.post(f"/api/midias/{video_id}/quadro", json={"segundos": segundos})
    assert resposta.status_code == 201, resposta.text
    assert resposta.json()["status"] == "processando" and "(quadro 0:" in resposta.json()["nome"]
    _processar(db_limpo, "quadro")
    _processar(db_limpo, "ingestao")
    foto = cliente.get(f"/api/midias/{resposta.json()['id']}").json()
    assert foto["status"] == "pronta" and foto["imagem"]
    assert foto["quadro_de"]["segundos"] == pytest.approx(segundos)
    # O cinza do quadro, convertido da faixa de TV para RGB: (16 + 20n − 16) × 255/219. A conversão do FFmpeg
    # (a mesma do render) fica uns 3 níveis abaixo da conta; os quadros vizinhos ficam 23 níveis longe
    esperado = 20 * quadro * 255 / 219
    assert _cinza_da_foto(db_limpo, organizacao, foto["id"]) == pytest.approx(esperado, abs=5)


def test_congelar_recusa_foto_e_versao_que_nao_existe(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    video_id = str(enviar_imagem(db_limpo, organizacao, "Cinzas.mp4", _video))
    sem_limpa = cliente.post(f"/api/midias/{video_id}/quadro", json={"segundos": 0.2, "imagem_limpa": True})
    assert sem_limpa.status_code == 409

    def foto(caminho):
        Image.new("RGB", (40, 30), (10, 20, 30)).save(caminho, "PNG")

    foto_id = str(enviar_imagem(db_limpo, organizacao, "Foto.png", foto))
    assert cliente.post(f"/api/midias/{foto_id}/quadro", json={"segundos": 0}).status_code == 409


def test_quadro_de_video_sem_marcacao_sai_em_bt709_como_o_render(cliente, db_limpo, tmp_path):
    # Colorido e sem marcação de cor: o render lê como BT.709; a conversão para RGB tem de ser a mesma
    def colorido(caminho):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "testsrc2=s=160x90:r=10:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0",
                        "-pix_fmt", "yuv420p", str(caminho)], check=True, timeout=60)
        subprocess.run(["cp", str(caminho), str(tmp_path / "fonte.mp4")], check=True)

    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    video_id = str(enviar_imagem(db_limpo, organizacao, "Cores.mp4", colorido))
    resposta = cliente.post(f"/api/midias/{video_id}/quadro", json={"segundos": 0.4})
    _processar(db_limpo, "quadro")
    _processar(db_limpo, "ingestao")
    doc = db_limpo.midias.find_one({"_id": ObjectId(resposta.json()["id"])})
    with Image.open(storage.caminho_local(chave_arquivo(organizacao, doc["_id"], "imagem.png"))) as aberta:
        foto = np.asarray(aberta.convert("RGB")).astype(float)
    cru = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(tmp_path / "fonte.mp4"), "-vf",
                          "setparams=colorspace=bt709,scale=flags=bicubic,format=rgb24", "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    quadros = np.frombuffer(cru, np.uint8).reshape(-1, 90, 160, 3).astype(float)
    assert np.abs(foto - quadros[4]).mean() < 0.5
