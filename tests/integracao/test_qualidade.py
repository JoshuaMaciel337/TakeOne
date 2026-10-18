# Avaliação dos trechos de um vídeo de verdade: bom, borrado, escuro e tremido, com cortes entre eles
import shutil
import subprocess

import cv2
import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia
from worker.worker_principal import processar_job

TEM_FFMPEG = shutil.which("ffmpeg") is not None
LARGURA, ALTURA = 640, 360


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _armadilha(caminho):
    """3 s de cada: textura andando devagar, a mesma borrada, quase preta e sacudindo."""
    sorteio = np.random.default_rng(5)
    textura = cv2.resize(sorteio.integers(40, 230, (90, 160, 3), dtype=np.uint8), (1000, 560),
                         interpolation=cv2.INTER_CUBIC)
    ffmpeg = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
                               "-s", f"{LARGURA}x{ALTURA}", "-r", "30", "-i", "-", "-c:v", "libx264", "-crf", "18",
                               "-pix_fmt", "yuv420p", str(caminho)], stdin=subprocess.PIPE)
    for i in range(360):
        trecho, k = divmod(i, 90)
        if trecho == 0:
            quadro = textura[100:100 + ALTURA, 100 + k:100 + k + LARGURA]
        elif trecho == 1:
            quadro = cv2.GaussianBlur(textura[100:100 + ALTURA, 200:200 + LARGURA], (0, 0), 8)
        elif trecho == 2:
            quadro = (textura[100:100 + ALTURA, 200:200 + LARGURA] * 0.05).astype(np.uint8)
        else:
            dx, dy = sorteio.integers(-40, 40, 2)
            quadro = textura[100 + dy:100 + dy + ALTURA, 200 + dx:200 + dx + LARGURA]
        ffmpeg.stdin.write(np.ascontiguousarray(quadro).tobytes())
    ffmpeg.stdin.close()
    assert ffmpeg.wait() == 0


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_trechos_bons_ganham_dos_ruins(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=LARGURA, altura=ALTURA, duracao=12.0, gerar=_armadilha)
    doc = db_limpo.midias.find_one({"_id": ObjectId(midia_id)})
    pasta = doc["organizacao_id"], doc["_id"]
    shutil.copy(storage.caminho_local(chave_arquivo(*pasta, doc["original"])),
                storage.caminho_local(chave_arquivo(*pasta, "proxy.mp4")))
    assert cliente.get(f"/api/midias/{midia_id}/qualidade").json()["status"] == "nenhuma"
    assert cliente.post(f"/api/midias/{midia_id}/qualidade").json()["status"] == "processando"
    cliente.post(f"/api/midias/{midia_id}/qualidade")
    assert db_limpo.jobs.count_documents({"tipo": "qualidade"}) == 1, "pedir de novo enquanto anda não repete"
    job = pegar_proximo_job(db_limpo, ["qualidade"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    qualidade = cliente.get(f"/api/midias/{midia_id}/qualidade").json()
    assert qualidade["status"] == "pronto" and len(qualidade["t"]) == 48
    nota = np.array(qualidade["nota"])
    trecho = lambda i: nota[i * 12 + 2:(i + 1) * 12 - 1]  # noqa: E731  (longe das fronteiras)
    bom, borrado, escuro, tremido = (float(trecho(i).mean()) for i in range(4))
    assert bom > 0.85, bom
    assert borrado < 0.05 and escuro < 0.05, (borrado, escuro)
    assert tremido < bom - 0.4, (tremido, bom)
    cortes = [t for t, corte in zip(qualidade["t"], qualidade["corte"], strict=True) if corte]
    assert any(abs(t - 6) < 0.3 for t in cortes), "a passagem para o quase preto é um corte"
    assert cliente.delete(f"/api/midias/{midia_id}").status_code == 204
    assert db_limpo.qualidades.count_documents({}) == 0


def test_so_video_tem_trechos(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, duracao=2.0)
    db_limpo.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {"video": None}})
    assert cliente.post(f"/api/midias/{midia_id}/qualidade").status_code == 409
