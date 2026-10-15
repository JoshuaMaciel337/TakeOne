# Imagem sem ruído: pedir, gerar o vídeo limpo e a cópia leve dele, e exportar o clipe com ela
import json
import shutil
import subprocess

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import ARQUIVO_IMAGEM_LIMPA, ARQUIVO_IMAGEM_LIMPA_PROXY, chave_arquivo
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


def sondar(caminho) -> dict:
    saida = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
                            "stream=width,height,nb_read_frames,color_space", "-of", "json", str(caminho)],
                           capture_output=True, text=True, check=True, timeout=60).stdout
    return json.loads(saida)["streams"][0]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_imagem_limpa_tem_os_mesmos_quadros_e_a_previa_so_ve_a_copia_leve(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    assert cliente.post(f"/api/midias/{midia_id}/limpeza-imagem").json()["imagem_limpa"]["status"] == "processando"
    job = pegar_proximo_job(db_limpo, ["limpeza_imagem"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    vista = cliente.get(f"/api/midias/{midia_id}").json()
    assert vista["imagem_limpa"] == {"status": "pronta", "erro": None}
    # A de resolução cheia é só do render: a API serve a cópia leve
    assert ARQUIVO_IMAGEM_LIMPA_PROXY in vista["arquivos"] and ARQUIVO_IMAGEM_LIMPA not in vista["arquivos"]
    pasta = organizacao_de(cliente), ObjectId(midia_id)
    nome_original = db_limpo.midias.find_one({"_id": ObjectId(midia_id)})["original"]
    original = storage.caminho_local(chave_arquivo(*pasta, nome_original))
    limpo = sondar(storage.caminho_local(chave_arquivo(*pasta, ARQUIVO_IMAGEM_LIMPA)))
    assert (limpo["width"], limpo["height"], limpo["nb_read_frames"]) == (640, 360, sondar(original)["nb_read_frames"])
    assert limpo["color_space"] == "bt709"
