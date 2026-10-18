# Seguir um objeto: um disco andando em curva sobre uma textura, marcado no meio e seguido para os dois lados
import shutil
import subprocess

import cv2
import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.config import MODELO_RASTREIO
from core.modelos.midia import chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia, organizacao_de
from worker.worker_principal import processar_job

TEM_FFMPEG = shutil.which("ffmpeg") is not None
TEM_MODELO = MODELO_RASTREIO.is_file()
LARGURA, ALTURA, QUADROS = 640, 360, 120


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _centro(i: int) -> tuple[float, float]:
    """Onde o disco está no quadro i (em pixels): anda da esquerda para a direita, subindo e descendo."""
    t = i / QUADROS
    return 90 + 460 * t, 180 + 90 * np.sin(2 * np.pi * t)


def _gerar(caminho):
    sorteio = np.random.default_rng(11)
    fundo = cv2.GaussianBlur(sorteio.integers(40, 200, (ALTURA, LARGURA, 3), dtype=np.uint8), (0, 0), 3)
    ffmpeg = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
                               "-s", f"{LARGURA}x{ALTURA}", "-r", "30", "-i", "-", "-c:v", "libx264", "-crf", "18",
                               "-pix_fmt", "yuv420p", str(caminho)], stdin=subprocess.PIPE)
    for i in range(QUADROS):
        quadro = fundo.copy()
        cx, cy = _centro(i)
        cv2.circle(quadro, (int(cx), int(cy)), 28, (40, 200, 255), -1)
        cv2.putText(quadro, "T", (int(cx) - 12, int(cy) + 12), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (20, 20, 20), 3)
        ffmpeg.stdin.write(quadro.tobytes())
    ffmpeg.stdin.close()
    assert ffmpeg.wait() == 0


def _midia_com_proxy(db, cliente) -> str:
    """Mídia pronta cuja cópia leve é o próprio vídeo gerado (o rastreio lê a cópia leve)."""
    midia_id = criar_midia(db, cliente, largura=LARGURA, altura=ALTURA, duracao=QUADROS / 30, gerar=_gerar)
    doc = db.midias.find_one({"_id": ObjectId(midia_id)})
    pasta = doc["organizacao_id"], doc["_id"]
    shutil.copy(storage.caminho_local(chave_arquivo(*pasta, doc["original"])),
                storage.caminho_local(chave_arquivo(*pasta, "proxy.mp4")))
    db.midias.update_one({"_id": doc["_id"]}, {"$set": {"arquivos": ["proxy.mp4", "capa.jpg"]}})
    return midia_id


def test_pedido_que_nao_serve_e_recusado(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, duracao=4.0)
    db_limpo.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {"arquivos": ["proxy.mp4"]}})
    caixa = {"x": 0.4, "y": 0.4, "largura": 0.1, "altura": 0.1}
    pedir = lambda **extra: cliente.post(f"/api/midias/{midia_id}/rastreios",  # noqa: E731
                                         json={"t": 1, "caixa": caixa, "de": 0, "ate": 2, **extra})
    assert pedir(t=3).status_code == 422, "o instante marcado fica dentro do trecho"
    assert pedir(caixa={**caixa, "largura": 0.005}).status_code == 422
    assert pedir(caixa={**caixa, "x": 0.95}).status_code == 422, "o retângulo fica dentro da imagem"
    assert pedir(arquivo="mascara.mp4").status_code == 422
    assert pedir(arquivo="limpo_proxy.mp4").status_code == 422, "só arquivos que a mídia tem"
    assert pedir(arquivo="../../segredo.mp4").status_code == 422
    assert pedir().status_code == 201


@pytest.mark.skipif(not (TEM_FFMPEG and TEM_MODELO), reason="FFmpeg ou o modelo do rastreador não instalado")
def test_objeto_marcado_no_meio_e_seguido_para_os_dois_lados(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = _midia_com_proxy(db_limpo, cliente)
    marcado = 60
    cx, cy = _centro(marcado)
    caixa = {"x": (cx - 32) / LARGURA, "y": (cy - 32) / ALTURA, "largura": 64 / LARGURA, "altura": 64 / ALTURA}
    pedido = cliente.post(f"/api/midias/{midia_id}/rastreios",
                          json={"t": marcado / 30, "caixa": caixa, "de": 0.5, "ate": 3.5})
    assert pedido.status_code == 201, pedido.text
    rastreio = pedido.json()
    assert rastreio["status"] == "processando" and rastreio["processamento"]["status"] == "pendente"
    job = pegar_proximo_job(db_limpo, ["rastreio"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    pronto = cliente.get(f"/api/midias/{midia_id}/rastreios/{rastreio['id']}").json()
    assert pronto["status"] == "pronto"
    pontos = pronto["pontos"]
    tempos = [p[0] for p in pontos]
    assert tempos == sorted(tempos) and len(set(tempos)) == len(tempos)
    # De 0,5 s a 3,5 s, um ponto a cada quadro
    assert abs(tempos[0] - 0.5) < 0.02 and abs(tempos[-1] - (3.5 - 1 / 30)) < 0.05 and len(pontos) == 90
    erros = []
    for t, x, y, _largura, _altura, _nota in pontos:
        ex, ey = _centro(round(t * 30))
        erros.append(np.hypot(x * LARGURA - ex, y * ALTURA - ey))
    assert np.mean(erros) < 6 and max(erros) < 20, (np.mean(erros), max(erros))
    assert min(p[5] for p in pontos) > 0.3

    # Excluir a mídia leva os rastreios dela junto
    assert cliente.delete(f"/api/midias/{midia_id}").status_code == 204
    assert db_limpo.rastreios.count_documents({}) == 0


def test_rastreio_de_outro_espaco_nao_aparece(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, duracao=4.0)
    db_limpo.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {"arquivos": ["proxy.mp4"]}})
    caixa = {"x": 0.4, "y": 0.4, "largura": 0.1, "altura": 0.1}
    pedido = {"t": 1, "caixa": caixa, "de": 0, "ate": 2}
    rastreio = cliente.post(f"/api/midias/{midia_id}/rastreios", json=pedido).json()
    cliente.cookies.clear()
    cadastrar(cliente)
    assert cliente.get(f"/api/midias/{midia_id}/rastreios/{rastreio['id']}").status_code == 404
    assert organizacao_de(cliente) != db_limpo.midias.find_one({"_id": ObjectId(midia_id)})["organizacao_id"]
