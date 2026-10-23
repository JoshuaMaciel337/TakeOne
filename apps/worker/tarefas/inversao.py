# -----------------------------------------------
# TakeOne Worker — o vídeo ao contrário
#
# Como a imagem estável, um par de arquivos: invertido.mp4 (resolução cheia, BT.709 marcado, com o som ao
# contrário, para o render) e invertido_proxy.mp4 (a cópia leve, com o som, para a prévia). O `reverse` do
# FFmpeg guarda o trecho inteiro na memória, então o vídeo é invertido em blocos de BLOCO_S segundos, do
# último para o primeiro, e os blocos são emendados sem recodificar a imagem. O som vai em PCM nos blocos e
# é codificado uma vez só no fim (o AAC de cada bloco deixaria uma falha em cada emenda).
# -----------------------------------------------
import logging
import math
import tempfile
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_INVERTIDO, ARQUIVO_INVERTIDO_PROXY, chave_arquivo, e_imagem
from core.utils import storage
from core.utils.ffmpeg import FILTRO_MARCAS_BT709, MARCAS_BT709, ErroFFmpeg, executar_ffmpeg, ler_como_bt709
from core.utils.mongo import agora
from worker.tarefas.ingestao import FILTRO_PROXY, FPS_MAXIMO_PROXY, reduzir_quadros

BLOCO_S = 2.0


def marcar_inversao_com_erro(db, job: dict, mensagem: str):
    """Chamado quando a inversão falha de vez: a aba Velocidade mostra o erro."""
    entrada = job.get("entrada") or {}
    if entrada.get("midia_id"):
        db.midias.update_one({"_id": ObjectId(entrada["midia_id"])}, {"$set": {
            "invertido": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def blocos(duracao: float) -> list[tuple[float, float]]:
    """(começo, duração) de cada bloco, do último para o primeiro: a ordem em que entram no vídeo invertido."""
    quantos = max(1, math.ceil(duracao / BLOCO_S - 1e-9))
    return [(i * BLOCO_S, min(BLOCO_S, duracao - i * BLOCO_S)) for i in reversed(range(quantos))]


def executar_inversao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de ficar pronta ao contrário.")
    video = midia.get("video")
    if not video or e_imagem(midia):
        raise ErroDefinitivo("Só vídeos tocam ao contrário.")
    organizacao_id = midia["organizacao_id"]
    fonte = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    if not fonte.is_file():
        raise ErroDefinitivo("O arquivo original desta mídia não foi encontrado no servidor.")
    # A imagem acaba onde a imagem acaba (o som do celular passa uns quadros): o invertido começa nela
    duracao = float(video.get("duracao") or midia.get("duracao") or 0)
    if duracao <= 0:
        raise ErroDefinitivo("Não foi possível saber a duração deste vídeo.")
    leitura = ler_como_bt709(video.get("matriz"), video.get("hdr"))
    com_som = bool(midia.get("audio"))
    invertido = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_INVERTIDO))
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_INVERTIDO_PROXY))
    parciais = [invertido.with_name("invertido.parcial.mp4"), proxy.with_name("invertido_proxy.parcial.mp4")]
    imagem = ",".join([*leitura, "reverse", "scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p",
                       FILTRO_MARCAS_BT709])
    try:
        with tempfile.TemporaryDirectory(prefix="takeone_inverter_") as pasta:
            lista = Path(pasta) / "blocos.txt"
            partes = blocos(duracao)
            nomes = []
            for k, (inicio, tamanho) in enumerate(partes):
                parte = Path(pasta) / f"bloco_{k:04d}.mkv"
                executar_ffmpeg(["-ss", f"{inicio:.6f}", "-t", f"{tamanho:.6f}", "-i", str(fonte), "-map", "0:v:0",
                                 *(["-map", "0:a:0", "-af", "areverse", "-c:a", "pcm_s16le"] if com_som else ["-an"]),
                                 "-vf", imagem, "-fps_mode", "passthrough", "-c:v", "libx264", "-preset", "medium",
                                 "-crf", "16", *MARCAS_BT709, str(parte)])
                nomes.append(parte)
                reportar(2 + int(70 * (k + 1) / len(partes)), "Invertendo o vídeo")
            lista.write_text("".join(f"file '{nome.as_posix()}'\n" for nome in nomes), encoding="utf-8")
            executar_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(lista), "-c:v", "copy",
                             *(["-c:a", "aac", "-b:a", "192k"] if com_som else ["-an"]),
                             "-movflags", "+faststart", str(parciais[0])])
        reportar(80, "Preparando a prévia")
        filtro_proxy = ",".join([FILTRO_PROXY, *reduzir_quadros(video.get("fps"))])
        executar_ffmpeg(["-i", str(parciais[0]), "-vf", filtro_proxy, "-fpsmax", str(FPS_MAXIMO_PROXY),
                         "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", *MARCAS_BT709,
                         "-g", str(FPS_MAXIMO_PROXY * 2),
                         *(["-c:a", "aac", "-b:a", "128k"] if com_som else ["-an"]),
                         "-movflags", "+faststart", str(parciais[1])],
                        duracao, lambda f: reportar(80 + int(f * 18), "Preparando a prévia"))
    except ErroFFmpeg:
        for parcial in parciais:
            parcial.unlink(missing_ok=True)
        raise
    parciais[0].replace(invertido)
    parciais[1].replace(proxy)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {"invertido": {"status": "pronta", "erro": None}, "atualizado_em": agora()},
        "$addToSet": {"arquivos": {"$each": [ARQUIVO_INVERTIDO, ARQUIVO_INVERTIDO_PROXY]}},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Vídeo ao contrário pronto ({len(blocos(duracao))} blocos).")
    reportar(100, "Vídeo ao contrário pronto")
    return {"midia_id": str(midia_id), "arquivo": ARQUIVO_INVERTIDO}
