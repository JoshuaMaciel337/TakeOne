# Voz limpa: pedir, gerar com o deep-filter (DeepFilterNet) e exportar o clipe com ela
import shutil
import subprocess

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.config import DEEP_FILTER
from core.modelos.exportacao import ARQUIVO_VIDEO, chave_exportacao
from core.modelos.midia import ARQUIVO_VOZ_LIMPA, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia, gerar_quadrantes, organizacao_de, projeto_com
from worker.worker_principal import processar_job

TEM_FILTRO = shutil.which(DEEP_FILTER) is not None and shutil.which("ffmpeg") is not None


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_pedir_voz_limpa_entra_na_fila_uma_vez(cliente, db_limpo):
    cadastrar(cliente)
    sem_audio = criar_midia(db_limpo, cliente, audio=False)
    assert cliente.post(f"/api/midias/{sem_audio}/voz-limpa").status_code == 409

    midia_id = criar_midia(db_limpo, cliente)
    pedida = cliente.post(f"/api/midias/{midia_id}/voz-limpa")
    assert pedida.status_code == 200 and pedida.json()["voz_limpa"] == {"status": "processando", "erro": None}
    assert cliente.post(f"/api/midias/{midia_id}/voz-limpa").status_code == 200
    assert db_limpo.jobs.count_documents({"tipo": "limpeza_voz"}) == 1, "pedir de novo enquanto anda não cria outro job"
    assert db_limpo.jobs.find_one({"tipo": "limpeza_voz"})["recurso"] == "cpu"


@pytest.mark.skipif(not TEM_FILTRO, reason="deep-filter ou FFmpeg não instalado")
def test_gerar_voz_limpa_e_exportar_com_ela(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    cliente.post(f"/api/midias/{midia_id}/voz-limpa")
    job = pegar_proximo_job(db_limpo, ["limpeza_voz"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    vista = cliente.get(f"/api/midias/{midia_id}").json()
    assert vista["voz_limpa"] == {"status": "pronta", "erro": None} and ARQUIVO_VOZ_LIMPA in vista["arquivos"]
    voz = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_VOZ_LIMPA))
    sondagem = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(voz)]
    duracao = float(subprocess.run(sondagem, capture_output=True, text=True, check=True).stdout)
    assert abs(duracao - 2.0) < 0.05, "a voz limpa tem o tempo da mídia"
    assert cliente.get(f"/api/midias/{midia_id}/arquivos/{ARQUIVO_VOZ_LIMPA}").status_code == 200
    # Já pronta: pedir de novo não gera outra
    cliente.post(f"/api/midias/{midia_id}/voz-limpa")
    assert db_limpo.jobs.count_documents({"tipo": "limpeza_voz"}) == 1

    projeto = projeto_com(cliente, midia_id, duracao=2, voz_limpa=True)
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    assert video.is_file() and 1.9 < cliente.get(f"/api/exportacoes/{exportacao['id']}").json()["duracao"] < 2.1
