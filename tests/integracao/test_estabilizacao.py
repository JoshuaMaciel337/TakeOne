# Estabilização: um vídeo tremido de verdade, a medida do tremor antes e depois, as regras e o que a API serve
import json
import shutil
import subprocess

import cv2
import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import arquivos_da_estabilizacao, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import SEGUNDO, criar_midia, organizacao_de
from worker.worker_principal import processar_job

TEM_FFMPEG = shutil.which("ffmpeg") is not None
LARGURA, ALTURA, QUADROS = 640, 360, 90


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _gerar_tremido(caminho):
    """Uma textura clara (sem preto, para achar borda vazia) vista por uma câmera que treme até 12 px."""
    sorteio = np.random.default_rng(7)
    textura = cv2.resize(sorteio.integers(70, 256, (60, 100, 3), dtype=np.uint8), (1000, 600),
                         interpolation=cv2.INTER_CUBIC)
    tremor = np.clip(np.cumsum(sorteio.normal(0, 3, (QUADROS, 2)), axis=0), -12, 12)
    tremor += sorteio.normal(0, 2, (QUADROS, 2))
    ffmpeg = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
                               "-s", f"{LARGURA}x{ALTURA}", "-r", "30", "-i", "-", "-c:v", "libx264", "-crf", "16",
                               "-pix_fmt", "yuv420p", str(caminho)], stdin=subprocess.PIPE)
    for i in range(QUADROS):
        x, y = int(180 + i * 1.5 + tremor[i, 0]), int(120 + tremor[i, 1])
        ffmpeg.stdin.write(textura[y:y + ALTURA, x:x + LARGURA].tobytes())
    ffmpeg.stdin.close()
    assert ffmpeg.wait() == 0


def _quadros(caminho) -> list[np.ndarray]:
    captura, quadros = cv2.VideoCapture(str(caminho)), []
    while True:
        ok, quadro = captura.read()
        if not ok:
            return quadros
        quadros.append(quadro)


def _tremor(quadros) -> float:
    """O que sobra do caminho da câmera depois de tirar o movimento lento (média de 1 s): o tremor, em px."""
    cinza = [np.float32(cv2.cvtColor(q, cv2.COLOR_BGR2GRAY)) for q in quadros]
    passos = np.array([cv2.phaseCorrelate(a, b)[0] for a, b in zip(cinza, cinza[1:], strict=False)])
    caminho = np.cumsum(passos, axis=0)
    return float(np.sqrt(((caminho - cv2.GaussianBlur(caminho, (1, 31), 0)) ** 2).mean()))


def _sondar(caminho) -> dict:
    saida = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
                            "stream=width,height,nb_read_frames,color_space", "-of", "json", str(caminho)],
                           capture_output=True, text=True, check=True, timeout=60).stdout
    return json.loads(saida)["streams"][0]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_estabilizar_tira_o_tremor_sem_mudar_os_quadros(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=LARGURA, altura=ALTURA, duracao=QUADROS / 30,
                           gerar=_gerar_tremido)
    # Sobre a imagem sem ruído, só depois de ela ficar pronta
    resposta = cliente.post(f"/api/midias/{midia_id}/estabilizacao", json={"limpa": True})
    assert resposta.status_code == 409 and "sem ruído" in resposta.json()["detail"]
    pedido = cliente.post(f"/api/midias/{midia_id}/estabilizacao", json={})
    assert pedido.json()["estabilizacoes"] == {"estavel": {"status": "processando", "erro": None}}
    # Pedir de novo enquanto anda não põe outro job na fila
    cliente.post(f"/api/midias/{midia_id}/estabilizacao", json={})
    assert db_limpo.jobs.count_documents({"tipo": "estabilizacao"}) == 1
    job = pegar_proximo_job(db_limpo, ["estabilizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    vista = cliente.get(f"/api/midias/{midia_id}").json()
    assert vista["estabilizacoes"] == {"estavel": {"status": "pronta", "erro": None}}
    nome, nome_proxy = arquivos_da_estabilizacao(False)
    assert nome_proxy in vista["arquivos"]
    # A de resolução cheia é só do render: a API serve a cópia leve
    assert cliente.get(f"/api/midias/{midia_id}/arquivos/{nome_proxy}").status_code == 200
    assert cliente.get(f"/api/midias/{midia_id}/arquivos/{nome}").status_code == 404

    pasta = organizacao_de(cliente), ObjectId(midia_id)
    nome_original = db_limpo.midias.find_one({"_id": ObjectId(midia_id)})["original"]
    original = storage.caminho_local(chave_arquivo(*pasta, nome_original))
    estavel = storage.caminho_local(chave_arquivo(*pasta, nome))
    sondado = _sondar(estavel)
    assert (sondado["width"], sondado["height"], int(sondado["nb_read_frames"])) == (LARGURA, ALTURA, QUADROS)
    assert sondado["color_space"] == "bt709"
    antes, depois = _tremor(_quadros(original)), _tremor(estavel_quadros := _quadros(estavel))
    assert antes > 2.5, antes
    assert depois < antes * 0.4, f"tremor de {antes:.2f} px para {depois:.2f} px"
    # O zoom esconde as bordas: nenhuma linha ou coluna da beira fica sem imagem (a textura não tem preto)
    for quadro in estavel_quadros:
        for beira in (quadro[0], quadro[-1], quadro[:, 0], quadro[:, -1]):
            assert (beira.max(axis=1) < 30).mean() < 0.2


def test_estabilizar_so_vale_em_video_gravado_e_sem_recorte_do_fundo(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, duracao=2.0)
    so_audio = criar_midia(db_limpo, cliente, duracao=2.0)
    db_limpo.midias.update_one({"_id": ObjectId(so_audio)}, {"$set": {"video": None}})
    assert cliente.post(f"/api/midias/{so_audio}/estabilizacao", json={}).status_code == 409

    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    clipe = {"id": "c1", "midia_id": midia_id, "inicio": 0, "duracao": SEGUNDO, "entrada": 0, "velocidade": 1,
             "volume": 1, "estabilizar": True, "remover_fundo": True}
    corpo = {"versao": projeto["versao"], "nome": "Estável", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": [clipe]}]}
    resposta = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert resposta.status_code == 422 and "estabilizado" in resposta.json()["detail"]
    corpo["faixas"][0]["clipes"][0]["remover_fundo"] = False
    assert cliente.put(f"/api/projetos/{projeto['id']}", json=corpo).status_code == 200
