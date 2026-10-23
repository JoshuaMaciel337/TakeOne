# Esconder os rostos: pedir uma vez, gravar a máscara (num vídeo sem rosto, toda preta) e as contas da máscara
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import ARQUIVO_MASCARA_ROSTOS, ARQUIVO_PROXY_VIDEO, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia, gerar_quadrantes, organizacao_de
from tests.integracao.test_rostos import TEM_DETECTOR
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_memoria_cobre_quem_sumiu_por_uns_quadros():
    from worker.tarefas.esconder_rostos import QUADROS_DE_MEMORIA, desenhar, seguir

    lembrados = seguir([], [(100, 80, 40, 50)])
    for _ in range(QUADROS_DE_MEMORIA):
        lembrados = seguir(lembrados, [])
    assert len(lembrados) == 1, "ainda coberto"
    assert seguir(lembrados, []) == [], "passou da memória"
    # Achado de novo perto: fica um só, o novo
    assert seguir([[100, 80, 40, 50, 3]], [(104, 82, 40, 50)]) == [[104, 82, 40, 50, 0]]
    mascara = desenhar([[100, 80, 40, 50, 0]], (300, 200), 1.0)
    assert mascara.shape == (200, 300) and mascara[80, 100] == 255 and mascara[5, 5] == 0
    # A elipse é maior que a caixa (a testa e o queixo): 1,6 vezes a altura
    assert mascara[80 + 36, 100] > 128 and mascara[80 + 46, 100] < 128


def test_pedir_entra_na_fila_uma_vez(cliente, db_limpo):
    cadastrar(cliente)
    so_audio = criar_midia(db_limpo, cliente)
    db_limpo.midias.update_one({"_id": ObjectId(so_audio)}, {"$set": {"video": None}})
    assert cliente.post(f"/api/midias/{so_audio}/esconder-rostos").status_code == 409
    midia_id = criar_midia(db_limpo, cliente)
    pedido = cliente.post(f"/api/midias/{midia_id}/esconder-rostos").json()
    assert pedido["esconder_rostos"]["status"] == "processando"
    cliente.post(f"/api/midias/{midia_id}/esconder-rostos")
    assert db_limpo.jobs.count_documents({"tipo": "esconder_rostos"}) == 1
    assert db_limpo.jobs.find_one({"tipo": "esconder_rostos"})["recurso"] == "cpu"


@pytest.mark.skipif(not TEM_DETECTOR, reason="OpenCV, modelo de rostos ou FFmpeg não instalado")
def test_video_sem_rosto_ganha_mascara_preta(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0)
    proxy = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_PROXY_VIDEO))
    proxy.parent.mkdir(parents=True, exist_ok=True)
    gerar_quadrantes(proxy)
    cliente.post(f"/api/midias/{midia_id}/esconder-rostos")
    job = pegar_proximo_job(db_limpo, ["esconder_rostos"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    midia = cliente.get(f"/api/midias/{midia_id}").json()
    assert midia["esconder_rostos"] == {"status": "pronta", "erro": None, "quadros_com_rosto": 0}
    assert ARQUIVO_MASCARA_ROSTOS in midia["arquivos"]
    mascara = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_MASCARA_ROSTOS))
    saida = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mascara), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                           capture_output=True, check=True, timeout=60).stdout
    quadros = np.frombuffer(saida, np.uint8).reshape(-1, 360, 640)
    assert 58 <= len(quadros) <= 61 and quadros.max() <= 20, (len(quadros), quadros.max())


def test_caixa_do_objeto_fica_na_ultima_boa_e_some_fora_do_trecho():
    from worker.tarefas.esconder_objeto import caixa_no_instante, desenhar

    pontos = [[1.0, 0.5, 0.5, 0.2, 0.1, 0.9], [1.1, 0.6, 0.5, 0.2, 0.1, 0.1], [1.2, 0.7, 0.5, 0.2, 0.1, 0.8]]
    assert caixa_no_instante(pontos, 0.5, 1 / 30) is None and caixa_no_instante(pontos, 2.0, 1 / 30) is None
    assert caixa_no_instante(pontos, 1.15, 1 / 30) == (0.5, 0.5, 0.2, 0.1), "a de pouca confiança fica de fora"
    assert caixa_no_instante(pontos, 1.2, 1 / 30) == (0.7, 0.5, 0.2, 0.1)
    mascara = desenhar((0.5, 0.5, 0.2, 0.1), (200, 100))
    assert mascara[50, 100] == 255 and mascara[5, 5] == 0 and mascara[50, 118] > 128 and mascara[50, 140] < 64


def test_objeto_seguido_vira_mascara(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0)
    proxy = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_PROXY_VIDEO))
    proxy.parent.mkdir(parents=True, exist_ok=True)
    gerar_quadrantes(proxy)
    rastreio_id = db_limpo.rastreios.insert_one({
        "organizacao_id": organizacao_de(cliente), "midia_id": ObjectId(midia_id), "status": "pronto",
        "pontos": [[n / 30, 0.25 + 0.5 * n / 60, 0.5, 0.2, 0.2, 0.9] for n in range(60)]}).inserted_id
    assert cliente.post(f"/api/midias/{midia_id}/objetos-escondidos",
                        json={"rastreio_id": "0" * 24}).status_code == 409
    pedido = cliente.post(f"/api/midias/{midia_id}/objetos-escondidos", json={"rastreio_id": str(rastreio_id)})
    assert pedido.json()["objetos_escondidos"][str(rastreio_id)]["status"] == "processando"
    job = pegar_proximo_job(db_limpo, ["esconder_objeto"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    midia = cliente.get(f"/api/midias/{midia_id}").json()
    arquivo = f"objeto_{rastreio_id}.mp4"
    assert midia["objetos_escondidos"][str(rastreio_id)]["status"] == "pronta" and arquivo in midia["arquivos"]
    mascara = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), arquivo))
    saida = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mascara), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                           capture_output=True, check=True, timeout=60).stdout
    quadros = np.frombuffer(saida, np.uint8).reshape(-1, 360, 640)
    # No quadro 30, o objeto está no meio (x = 0,5): branco lá, preto na esquerda
    assert quadros[30][180, 320] > 200 and quadros[30][180, 40] < 30
    assert quadros[0][180, 160] > 200 and quadros[0][180, 480] < 30, "no começo ele estava à esquerda"
