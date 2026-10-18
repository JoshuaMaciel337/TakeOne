# -----------------------------------------------
# Tarefa "rastreio" — segue um objeto marcado num quadro do vídeo
#
# VitTrack (rastreador do OpenCV Zoo, Apache-2.0) na CPU, sobre a mesma cópia leve que a prévia mostra
# (a de sempre, a sem ruído ou a estável), a 30 quadros por segundo e no tamanho dela. Começa no quadro
# marcado e vai para a frente até o fim do trecho; depois volta do quadro marcado até o começo, em blocos
# de 2 s (o rastreador anda para trás, o FFmpeg só lê para a frente). Os pontos vão para a coleção
# `rastreios`; o editor faz deles os keyframes de quem segue o objeto.
# -----------------------------------------------
import logging
import subprocess
from collections.abc import Callable, Iterator
from pathlib import Path

from bson import ObjectId

from core.config import FFMPEG, MODELO_RASTREIO
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import chave_arquivo
from core.modelos.rastreio import (
    LARGURA_MAXIMA_DE_ANALISE,
    QUADROS_POR_BLOCO,
    QUADROS_POR_SEGUNDO,
    STATUS_ERRO,
    STATUS_PRONTO,
)
from core.utils import storage
from core.utils.ffmpeg import resumir_sondagem, sondar
from core.utils.mongo import agora
from worker.tarefas.rosto import _ler


def _quadros(caminho: Path, de: float, ate: float, largura: int, altura: int) -> Iterator[bytes]:
    """Os quadros de [de, ate), na grade de 30 por segundo a partir de `de` (o k-ésimo é o de de + k/30)."""
    processo = subprocess.Popen(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-ss", f"{de:.4f}", "-t", f"{max(ate - de, 0.001):.4f}",
         "-i", str(caminho), "-vf", f"fps={QUADROS_POR_SEGUNDO}:round=up,scale={largura}:{altura}",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    tamanho = largura * altura * 3
    try:
        while True:
            bruto = _ler(processo.stdout, tamanho)
            if len(bruto) < tamanho:
                break
            yield bruto
    finally:
        if processo.stdout:
            processo.stdout.close()
        processo.wait(timeout=120)
    if processo.returncode not in (0, None):
        raise RuntimeError(f"Não foi possível ler os quadros do vídeo (código {processo.returncode}).")


def seguir(caminho: Path, t: float, caixa: dict, de: float, ate: float,
           reportar: Callable[[int, str], None]) -> list[list[float]]:
    """Os pontos [t, x, y, largura, altura, nota] do objeto, em ordem de tempo e em frações da imagem."""
    import cv2
    import numpy as np

    video = resumir_sondagem(sondar(caminho))["video"] or {}
    largura, altura = int(video.get("largura") or 0), int(video.get("altura") or 0)
    if largura <= 0 or altura <= 0:
        raise ErroDefinitivo("Não foi possível ler o tamanho do vídeo.")
    # A cópia leve já é pequena (até 720p): o rastreador vê o quadro como ele é
    escala = min(1.0, LARGURA_MAXIMA_DE_ANALISE / max(largura, altura))
    largura, altura = max(2, round(largura * escala / 2) * 2), max(2, round(altura * escala / 2) * 2)
    total = max(1, round((ate - de) * QUADROS_POR_SEGUNDO))
    feitos = 0

    def avancar():
        nonlocal feitos
        feitos += 1
        if feitos % 30 == 0:
            reportar(min(95, 5 + int(90 * feitos / total)), "Seguindo o objeto")

    def como_quadro(bruto: bytes):
        return np.frombuffer(bruto, dtype=np.uint8).reshape(altura, largura, 3)

    marcado = (round(caixa["x"] * largura), round(caixa["y"] * altura),
               max(4, round(caixa["largura"] * largura)), max(4, round(caixa["altura"] * altura)))

    def rastreador(quadro):
        parametros = cv2.TrackerVit_Params()
        parametros.net = str(MODELO_RASTREIO)
        novo = cv2.TrackerVit_create(parametros)
        novo.init(quadro, marcado)
        return novo

    def ponto(instante: float, retangulo, nota: float) -> list[float]:
        x, y, w, h = (float(v) for v in retangulo)
        return [round(instante, 4), round((x + w / 2) / largura, 5), round((y + h / 2) / altura, 5),
                round(w / largura, 5), round(h / altura, 5), round(float(nota), 3)]

    # Para a frente, do quadro marcado até o fim do trecho
    frente: list[list[float]] = []
    inicial = None
    for k, bruto in enumerate(_quadros(caminho, t, ate, largura, altura)):
        quadro = como_quadro(bruto)
        if k == 0:
            inicial = quadro.copy()
            atual = rastreador(quadro)
            frente.append(ponto(t, marcado, 1.0))
        else:
            _, retangulo = atual.update(quadro)
            frente.append(ponto(t + k / QUADROS_POR_SEGUNDO, retangulo, atual.getTrackingScore()))
        avancar()
    if inicial is None:
        raise ErroDefinitivo("O instante marcado ficou fora do vídeo.")

    # Para trás, em blocos de alguns segundos (o FFmpeg só lê para a frente): cada bloco é lido inteiro e
    # percorrido do fim para o começo. Os blocos começam na grade do quadro marcado (t − n/30).
    tras: list[list[float]] = []
    atual = rastreador(inicial)
    faltam = int(round((t - de) * QUADROS_POR_SEGUNDO))
    while faltam > 0:
        quantos = min(QUADROS_POR_BLOCO, faltam)
        inicio_bloco = t - faltam / QUADROS_POR_SEGUNDO
        bloco = [como_quadro(b) for b in _quadros(caminho, inicio_bloco, inicio_bloco + quantos / QUADROS_POR_SEGUNDO,
                                                   largura, altura)][:quantos]
        for k in range(len(bloco) - 1, -1, -1):
            _, retangulo = atual.update(bloco[k])
            tras.append(ponto(inicio_bloco + k / QUADROS_POR_SEGUNDO, retangulo, atual.getTrackingScore()))
            avancar()
        faltam -= quantos
    # Na ordem do tempo, sem repetir o instante marcado
    return [p for p in reversed(tras) if p[0] < t - 1e-6] + frente


def marcar_rastreio_com_erro(db, job: dict, mensagem: str):
    rastreio_id = (job.get("entrada") or {}).get("rastreio_id")
    if rastreio_id:
        db.rastreios.update_one({"_id": ObjectId(rastreio_id)}, {"$set": {
            "status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora(),
        }})


def executar_rastreio(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    rastreio_id = ObjectId(job["entrada"]["rastreio_id"])
    pedido = db.rastreios.find_one({"_id": rastreio_id})
    if pedido is None:
        raise ErroDefinitivo("O pedido para seguir o objeto não existe mais.")
    midia = db.midias.find_one({"_id": pedido["midia_id"]})
    if midia is None or not midia.get("video"):
        raise ErroDefinitivo("A mídia foi excluída antes de o objeto ser seguido.")
    caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], pedido["arquivo"]))
    if not caminho.is_file():
        raise ErroDefinitivo("A cópia leve do vídeo não foi encontrada. Envie a mídia de novo.")
    if not MODELO_RASTREIO.is_file():
        raise ErroDefinitivo("O modelo que segue objetos não está instalado no worker.")
    reportar(3, "Lendo o vídeo")
    pontos = seguir(caminho, float(pedido["t"]), pedido["caixa"], float(pedido["de"]), float(pedido["ate"]), reportar)
    db.rastreios.update_one({"_id": rastreio_id}, {"$set": {
        "status": STATUS_PRONTO, "pontos": pontos, "erro": None, "atualizado_em": agora(),
    }})
    logging.info(f"[{midia['organizacao_id']}] [midia {midia['_id']}] Objeto seguido em {len(pontos)} quadros.")
    reportar(100, "Objeto seguido")
    return {"rastreio_id": str(rastreio_id), "pontos": len(pontos)}
