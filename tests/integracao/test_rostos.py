# Rosto: pedir, procurar com o YuNet (num vídeo sem rosto) e ler as amostras
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.config import MODELO_ROSTO
from core.modelos.midia import ARQUIVO_PROXY_VIDEO, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import TEM_FFMPEG, criar_midia, gerar_quadrantes, organizacao_de
from worker.worker_principal import processar_job

try:
    import cv2  # noqa: F401
    TEM_DETECTOR = TEM_FFMPEG and MODELO_ROSTO.is_file()
except ImportError:
    TEM_DETECTOR = False


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_pedir_rosto_entra_na_fila_uma_vez(cliente, db_limpo):
    cadastrar(cliente)
    so_audio = criar_midia(db_limpo, cliente)
    db_limpo.midias.update_one({"_id": ObjectId(so_audio)}, {"$set": {"video": None}})
    assert cliente.post(f"/api/midias/{so_audio}/rosto").status_code == 409

    midia_id = criar_midia(db_limpo, cliente)
    assert cliente.get(f"/api/midias/{midia_id}/rosto").status_code == 404
    pedido = cliente.post(f"/api/midias/{midia_id}/rosto").json()
    assert pedido["status"] == "processando" and pedido["processamento"]["status"] == "pendente"
    cliente.post(f"/api/midias/{midia_id}/rosto")
    assert db_limpo.jobs.count_documents({"tipo": "rosto"}) == 1
    assert db_limpo.jobs.find_one({"tipo": "rosto"})["recurso"] == "cpu"


@pytest.mark.skipif(not TEM_DETECTOR, reason="OpenCV, modelo de rostos ou FFmpeg não instalado")
def test_video_sem_rosto_fica_pronto_sem_amostras(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0)
    proxy = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_PROXY_VIDEO))
    proxy.parent.mkdir(parents=True, exist_ok=True)
    gerar_quadrantes(proxy)
    cliente.post(f"/api/midias/{midia_id}/rosto")
    job = pegar_proximo_job(db_limpo, ["rosto"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    pronto = cliente.get(f"/api/midias/{midia_id}/rosto").json()
    assert (pronto["status"], pronto["amostras"]) == ("pronto", [])
    # Já procurado: pedir de novo não cria outro job
    cliente.post(f"/api/midias/{midia_id}/rosto")
    assert db_limpo.jobs.count_documents({"tipo": "rosto"}) == 1
