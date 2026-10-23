# Recorte do fundo: pedir, gerar a máscara (MODNet) no tempo da cópia leve e servir o arquivo
import json
import shutil
import subprocess

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.config import MODELO_RECORTE
from core.modelos.midia import ARQUIVO_MASCARA, ARQUIVO_MASCARA_IMAGEM, ARQUIVO_PROXY_VIDEO, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia, organizacao_de
from worker.tarefas.recorte_fundo import tamanhos, tamanhos_da_foto
from worker.worker_principal import processar_job

TEM_TUDO = shutil.which("ffmpeg") is not None and MODELO_RECORTE.is_file()


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_tamanhos_seguem_a_proporcao_do_video():
    assert tamanhos(1280, 720) == ((448, 256), (640, 360))
    assert tamanhos(720, 1280) == ((256, 448), (360, 640))


def test_tamanhos_da_foto_seguem_a_proporcao_e_a_mascara_tem_no_maximo_2048():
    assert tamanhos_da_foto(1080, 1350) == ((512, 640), (1080, 1350))
    assert tamanhos_da_foto(4000, 3000) == ((672, 512), (2048, 1536))


def test_pedir_recorte_entra_na_fila_uma_vez(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente)
    pedido = cliente.post(f"/api/midias/{midia_id}/recorte-fundo")
    assert pedido.status_code == 200 and pedido.json()["recorte_fundo"] == {"status": "processando", "erro": None}
    cliente.post(f"/api/midias/{midia_id}/recorte-fundo")
    assert db_limpo.jobs.count_documents({"tipo": "recorte_fundo"}) == 1


def contar_quadros(caminho) -> tuple[int, int, int]:
    saida = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
                            "stream=width,height,nb_read_frames", "-of", "json", str(caminho)],
                           capture_output=True, text=True, check=True, timeout=60).stdout
    fluxo = json.loads(saida)["streams"][0]
    return int(fluxo["width"]), int(fluxo["height"]), int(fluxo["nb_read_frames"])


@pytest.mark.skipif(not TEM_TUDO, reason="FFmpeg ou o modelo MODNet não instalado")
def test_mascara_tem_um_quadro_para_cada_quadro_da_copia_leve(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=1.0)
    proxy = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_PROXY_VIDEO))
    proxy.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(proxy)], check=True, timeout=60)
    cliente.post(f"/api/midias/{midia_id}/recorte-fundo")
    job = pegar_proximo_job(db_limpo, ["recorte_fundo"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    vista = cliente.get(f"/api/midias/{midia_id}").json()
    assert vista["recorte_fundo"] == {"status": "pronta", "erro": None} and ARQUIVO_MASCARA in vista["arquivos"]
    assert cliente.get(f"/api/midias/{midia_id}/arquivos/{ARQUIVO_MASCARA}").status_code == 200
    mascara = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_MASCARA))
    assert contar_quadros(mascara) == (640, 360, contar_quadros(proxy)[2])


@pytest.mark.skipif(not TEM_TUDO, reason="FFmpeg ou o modelo MODNet não instalado")
def test_foto_ganha_uma_mascara_em_png(cliente, db_limpo):
    from PIL import Image

    from tests.integracao.test_imagens import enviar_imagem

    cadastrar(cliente)
    organizacao = organizacao_de(cliente)

    def foto(caminho):
        imagem = Image.new("RGB", (900, 600), (90, 140, 200))
        imagem.paste((230, 190, 160), (330, 120, 570, 600))
        imagem.save(caminho, "JPEG")

    midia_id = enviar_imagem(db_limpo, organizacao, "Foto.jpg", foto)
    pedido = cliente.post(f"/api/midias/{midia_id}/recorte-fundo")
    assert pedido.status_code == 200, pedido.text
    job = pegar_proximo_job(db_limpo, ["recorte_fundo"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    vista = cliente.get(f"/api/midias/{midia_id}").json()
    assert vista["recorte_fundo"] == {"status": "pronta", "erro": None} and ARQUIVO_MASCARA_IMAGEM in vista["arquivos"]
    resposta = cliente.get(f"/api/midias/{midia_id}/arquivos/{ARQUIVO_MASCARA_IMAGEM}")
    assert resposta.status_code == 200
    mascara = storage.caminho_local(chave_arquivo(organizacao, ObjectId(midia_id), ARQUIVO_MASCARA_IMAGEM))
    with Image.open(mascara) as aberta:
        assert aberta.mode == "L" and aberta.size == (900, 600)
    # Pedir de novo não põe outro job: a máscara já está pronta
    cliente.post(f"/api/midias/{midia_id}/recorte-fundo")
    assert db_limpo.jobs.count_documents({"tipo": "recorte_fundo"}) == 1
