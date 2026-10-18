# -----------------------------------------------
# Tarefa "qualidade" — a nota de cada instante de um vídeo, para a montagem automática
#
# Lê a cópia leve em quadros cinza pequenos (320 de largura, 4 por segundo), mede nitidez, brilho,
# deslocamento da câmera e mudança do histograma, e core/utils/qualidade.py junta tudo numa nota por
# amostra. O resultado fica na coleção `qualidades`, um documento por mídia; o editor escolhe os trechos
# (apps/web/src/lib/projeto/montagem.ts).
# -----------------------------------------------
import logging
import subprocess
from collections.abc import Callable

from bson import ObjectId

from core.config import FFMPEG
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_PROXY_VIDEO, chave_arquivo, e_imagem
from core.modelos.qualidade import STATUS_ERRO, STATUS_PRONTO
from core.utils import storage
from core.utils.ffmpeg import resumir_sondagem, sondar
from core.utils.mongo import agora
from core.utils.qualidade import AMOSTRAS_POR_SEGUNDO, LARGURA_DE_ANALISE, notas
from worker.tarefas.rosto import _ler


def medir(caminho, duracao: float, reportar: Callable[[int, str], None]) -> dict:
    """As medidas de cada amostra e a nota: {t, nota, corte}."""
    import cv2
    import numpy as np

    video = resumir_sondagem(sondar(caminho))["video"] or {}
    largura_video, altura_video = int(video.get("largura") or 0), int(video.get("altura") or 0)
    if largura_video <= 0 or altura_video <= 0:
        raise ErroDefinitivo("Não foi possível ler o tamanho do vídeo.")
    largura = LARGURA_DE_ANALISE
    altura = max(2, round(altura_video * largura / largura_video / 2) * 2)
    processo = subprocess.Popen(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(caminho),
         "-vf", f"fps={AMOSTRAS_POR_SEGUNDO}:round=up,scale={largura}:{altura}", "-f", "rawvideo", "-pix_fmt", "gray",
         "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    nitidez, brilho, deslocamento, histograma = [], [], [], []
    anterior = histograma_anterior = None
    janela = cv2.createHanningWindow((largura, altura), cv2.CV_32F)
    try:
        while True:
            bruto = _ler(processo.stdout, largura * altura)
            if len(bruto) < largura * altura:
                break
            quadro = np.frombuffer(bruto, dtype=np.uint8).reshape(altura, largura)
            cinza = quadro.astype(np.float32)
            nitidez.append(float(cv2.Laplacian(cinza, cv2.CV_32F).var()))
            brilho.append(float(cinza.mean() / 255))
            if anterior is None:
                deslocamento.append((0.0, 0.0))
            else:
                (dx, dy), _ = cv2.phaseCorrelate(anterior, cinza, janela)
                deslocamento.append((dx / largura, dy / largura))
            atual = cv2.calcHist([quadro], [0], None, [32], [0, 256]).ravel()
            atual /= max(float(atual.sum()), 1.0)
            mudanca = 0.0 if histograma_anterior is None else 0.5 * np.abs(atual - histograma_anterior).sum()
            histograma.append(float(mudanca))
            anterior, histograma_anterior = cinza, atual
            if duracao and len(nitidez) % 40 == 0:
                reportar(min(95, 5 + int(90 * len(nitidez) / (duracao * AMOSTRAS_POR_SEGUNDO))), "Avaliando os trechos")
    finally:
        if processo.stdout:
            processo.stdout.close()
        processo.wait(timeout=120)
    if processo.returncode not in (0, None):
        raise RuntimeError(f"Não foi possível ler os quadros do vídeo (código {processo.returncode}).")
    resultado = notas(np.array(nitidez), np.array(brilho), np.array(deslocamento), np.array(histograma))
    return {"t": [round(i / AMOSTRAS_POR_SEGUNDO, 3) for i in range(len(nitidez))], **resultado}


def marcar_qualidade_com_erro(db, job: dict, mensagem: str):
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.qualidades.update_one({"midia_id": ObjectId(midia_id)},
                                 {"$set": {"status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora()}})


def executar_qualidade(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None or not midia.get("video") or e_imagem(midia):
        raise ErroDefinitivo("Só vídeos têm trechos para avaliar.")
    proxy = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia_id, ARQUIVO_PROXY_VIDEO))
    if not proxy.is_file():
        raise ErroDefinitivo("A cópia leve do vídeo não foi encontrada. Envie a mídia de novo.")
    reportar(3, "Lendo o vídeo")
    medidas = medir(proxy, float(midia.get("duracao") or 0), reportar)
    db.qualidades.update_one({"midia_id": midia_id}, {"$set": {
        "status": STATUS_PRONTO, **medidas, "erro": None, "atualizado_em": agora(),
    }})
    logging.info(f"[{midia['organizacao_id']}] [midia {midia_id}] Trechos avaliados: {len(medidas['t'])} amostras.")
    reportar(100, "Trechos avaliados")
    return {"midia_id": str(midia_id), "amostras": len(medidas["t"])}
