# -----------------------------------------------
# Tarefa "rosto" — onde está o rosto principal da mídia, ao longo do tempo
#
# YuNet (detector de rostos do OpenCV, modelo MIT) na CPU, sobre o proxy: 2 quadros por segundo,
# reduzidos para 480 de largura. No Nitro, uns 75 quadros por segundo. As amostras vão para a coleção
# `rostos`; o editor faz delas os keyframes do reenquadramento.
# Adaptado do enquadramento por rosto do HolyCut, que usa o MediaPipe: o YuNet roda com o OpenCV sem
# as dependências de interface gráfica.
# -----------------------------------------------
import logging
import subprocess
from collections.abc import Callable

from bson import ObjectId

from core.config import FFMPEG, MODELO_ROSTO
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_PROXY_VIDEO, chave_arquivo
from core.modelos.rosto import (
    AMOSTRAS_POR_SEGUNDO,
    CONFIANCA_MINIMA,
    LARGURA_DE_ANALISE,
    STATUS_ERRO,
    STATUS_PRONTO,
    escolher_rosto,
)
from core.utils import storage
from core.utils.mongo import agora


def _altura_par(largura: int, altura: int) -> int:
    valor = max(int(round(altura * LARGURA_DE_ANALISE / max(largura, 1))), 2)
    return valor + valor % 2


def _ler(saida, tamanho: int) -> bytes:
    """Um quadro inteiro: um read() no cano pode voltar com menos bytes sem ser o fim."""
    pedacos, faltam = [], tamanho
    while faltam > 0:
        pedaco = saida.read(faltam)
        if not pedaco:
            break
        pedacos.append(pedaco)
        faltam -= len(pedaco)
    return b"".join(pedacos)


def detectar(caminho, largura_video: int, altura_video: int, duracao: float,
             reportar: Callable[[int, str], None]) -> list[dict]:
    """As amostras {t, x, y, a} do rosto principal, em frações da imagem."""
    import cv2
    import numpy as np

    largura, altura = LARGURA_DE_ANALISE, _altura_par(largura_video, altura_video)
    detector = cv2.FaceDetectorYN.create(str(MODELO_ROSTO), "", (largura, altura), CONFIANCA_MINIMA, 0.3, 5000)
    processo = subprocess.Popen(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(caminho),
         "-vf", f"fps={AMOSTRAS_POR_SEGUNDO},scale={largura}:{altura}",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    tamanho = largura * altura * 3
    amostras, ultimo, n = [], None, 0
    try:
        while True:
            bruto = _ler(processo.stdout, tamanho)
            if len(bruto) < tamanho:
                break
            _, faces = detector.detect(np.frombuffer(bruto, dtype=np.uint8).reshape(altura, largura, 3))
            rostos = [((x + w / 2) / largura, (y + h / 2) / altura, (w * h) / (largura * altura))
                      for x, y, w, h in (face[:4] for face in (faces if faces is not None else [])) if w > 0 and h > 0]
            escolhido = escolher_rosto(ultimo, rostos)
            if escolhido is not None:
                ultimo = escolhido[:2]
                amostras.append({"t": round(n / AMOSTRAS_POR_SEGUNDO, 3), "x": round(float(escolhido[0]), 4),
                                 "y": round(float(escolhido[1]), 4), "a": round(float(escolhido[2]), 5)})
            n += 1
            if duracao and n % 20 == 0:
                reportar(min(95, 5 + int(90 * n / (duracao * AMOSTRAS_POR_SEGUNDO))), "Procurando o rosto")
    finally:
        if processo.stdout:
            processo.stdout.close()
        processo.wait(timeout=120)
    if processo.returncode not in (0, None):
        raise RuntimeError(f"Não foi possível ler os quadros do vídeo (código {processo.returncode}).")
    return amostras


def marcar_rosto_com_erro(db, job: dict, mensagem: str):
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.rostos.update_one({"midia_id": ObjectId(midia_id)}, {"$set": {
            "status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora(),
        }})


def executar_rosto(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None or not midia.get("video"):
        raise ErroDefinitivo("Esta mídia não tem imagem para seguir o rosto.")
    organizacao_id = midia["organizacao_id"]
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_PROXY_VIDEO))
    if not proxy.is_file():
        raise ErroDefinitivo("A cópia leve do vídeo não foi encontrada. Envie a mídia de novo.")
    if not MODELO_ROSTO.is_file():
        raise ErroDefinitivo("O modelo de rostos não está instalado no worker.")
    video = midia["video"]
    reportar(3, "Lendo o vídeo")
    amostras = detectar(proxy, int(video["largura"]), int(video["altura"]), float(midia.get("duracao") or 0), reportar)
    db.rostos.update_one({"midia_id": midia_id}, {"$set": {
        "status": STATUS_PRONTO, "amostras": amostras, "erro": None, "atualizado_em": agora(),
    }})
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Rosto em {len(amostras)} amostras.")
    reportar(100, "Rosto encontrado" if amostras else "Nenhum rosto encontrado")
    return {"midia_id": str(midia_id), "amostras": len(amostras)}
