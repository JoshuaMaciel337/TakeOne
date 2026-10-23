# -----------------------------------------------
# TakeOne Worker — câmera lenta suave
#
# Os quadros do meio, inventados pelo minterpolate do FFmpeg (compensação de movimento), em 4 vezes os quadros
# por segundo da fonte, só no trecho do clipe (com folga): fluido_<de>_<ate>.mp4 (resolução cheia, BT.709
# marcado, para o render) e a cópia leve dele com os mesmos quadros por segundo (para a prévia). O tempo do
# arquivo é o da mídia a partir do primeiro quadro do trecho (`zero`); o som continua vindo do original.
# -----------------------------------------------
import logging
import subprocess
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.config import FFPROBE
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import arquivos_do_fluido, chave_arquivo, chave_do_fluido, e_imagem
from core.utils import storage
from core.utils.ffmpeg import FILTRO_MARCAS_BT709, MARCAS_BT709, ErroFFmpeg, executar_ffmpeg, ler_como_bt709
from core.utils.mongo import agora
from worker.tarefas.ingestao import FILTRO_PROXY

VEZES = 4


def filtro_do_fluido(fps: float) -> str:
    """A interpolação: blocos compensados pelo movimento nos dois sentidos, na taxa VEZES maior."""
    return f"minterpolate=fps={fps * VEZES:.6f}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"


def primeiro_quadro(fonte: Path, de: float) -> float:
    """O instante do primeiro quadro da fonte a partir de `de`: o zero do arquivo novo (o editor e o render leem
    a mídia a partir dele, sem depender do fps arredondado)."""
    saida = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-read_intervals",
                            f"{max(de - 1, 0):.6f}%+3", "-show_entries", "frame=pts_time,best_effort_timestamp_time",
                            "-of", "csv=p=0", str(fonte)], capture_output=True, text=True, timeout=120).stdout
    tempos = sorted(float(parte) for linha in saida.split() for parte in linha.split(",") if parte not in ("", "N/A"))
    depois = [t for t in tempos if t >= de - 1e-6]
    if not depois:
        raise ErroDefinitivo("Não foi possível achar os quadros deste trecho do vídeo.")
    return depois[0]


def marcar_fluido_com_erro(db, job: dict, mensagem: str):
    entrada = job.get("entrada") or {}
    if entrada.get("midia_id"):
        chave = chave_do_fluido(entrada["de"], entrada["ate"])
        db.midias.update_one({"_id": ObjectId(entrada["midia_id"])}, {"$set": {
            f"fluidos.{chave}": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def executar_fluido(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    de, ate = float(entrada["de"]), float(entrada["ate"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes da câmera lenta suave.")
    video = midia.get("video")
    if not video or e_imagem(midia) or not video.get("fps"):
        raise ErroDefinitivo("Só vídeos gravados têm câmera lenta suave.")
    organizacao_id = midia["organizacao_id"]
    fonte = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    if not fonte.is_file():
        raise ErroDefinitivo("O arquivo original desta mídia não foi encontrado no servidor.")
    chave = chave_do_fluido(de, ate)
    nome, nome_proxy = arquivos_do_fluido(de, ate)
    fluido = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, nome))
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, nome_proxy))
    parciais = [fluido.with_name(nome.replace(".mp4", ".parcial.mp4")),
                proxy.with_name(nome_proxy.replace(".mp4", ".parcial.mp4"))]
    fps = float(video["fps"])
    filtro = ",".join([*ler_como_bt709(video.get("matriz"), video.get("hdr")), filtro_do_fluido(fps),
                       "scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p", FILTRO_MARCAS_BT709])
    # O zero do arquivo novo é o primeiro quadro do trecho (o -ss um pouco antes dele o inclui)
    zero = primeiro_quadro(fonte, de)
    try:
        executar_ffmpeg(["-ss", f"{max(zero - 0.0005, 0):.6f}", "-t", f"{ate - zero:.6f}", "-i", str(fonte),
                         "-map", "0:v:0", "-an",
                         "-vf", filtro, "-c:v", "libx264", "-preset", "medium", "-crf", "16", *MARCAS_BT709,
                         "-movflags", "+faststart", str(parciais[0])],
                        ate - de, lambda f: reportar(2 + int(f * 80), "Criando os quadros do meio"))
        # A cópia leve guarda os quadros novos (sem o limite de 30 por segundo das outras)
        executar_ffmpeg(["-i", str(parciais[0]), "-an", "-vf", FILTRO_PROXY, "-c:v", "libx264", "-preset", "veryfast",
                         "-crf", "28", "-pix_fmt", "yuv420p", *MARCAS_BT709, "-g", str(round(fps * VEZES)),
                         "-movflags", "+faststart", str(parciais[1])],
                        ate - de, lambda f: reportar(82 + int(f * 16), "Preparando a prévia"))
    except ErroFFmpeg:
        for parcial in parciais:
            parcial.unlink(missing_ok=True)
        raise
    parciais[0].replace(fluido)
    parciais[1].replace(proxy)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {f"fluidos.{chave}": {"status": "pronta", "erro": None, "de": de, "ate": ate, "zero": zero},
                 "atualizado_em": agora()},
        "$addToSet": {"arquivos": {"$each": [nome, nome_proxy]}},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Câmera lenta suave pronta ({de:.3f}–{ate:.3f}s).")
    reportar(100, "Câmera lenta suave pronta")
    return {"midia_id": str(midia_id), "arquivo": nome}
