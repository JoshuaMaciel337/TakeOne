# -----------------------------------------------
# Tarefa "estabilizacao" — tira o tremor da câmera de uma mídia
#
# O vidstab do FFmpeg em duas passadas: a primeira mede o movimento entre os quadros (vidstabdetect),
# a segunda suaviza o caminho da câmera e move cada quadro para ele (vidstabtransform), com um zoom fixo
# que esconde as bordas. Como a imagem sem ruído: o vídeo estável em resolução cheia (estavel.mp4) é o
# que o render lê no lugar do original, e a cópia leve dele (estavel_proxy.mp4) é a que a prévia
# decodifica, no mesmo tempo da mídia. Com limpa=true parte da imagem sem ruído (estavel_limpo*). O som
# continua vindo do original.
# -----------------------------------------------
import logging
import tempfile
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.modelos.job import ErroDefinitivo
from core.modelos.midia import (
    ARQUIVO_IMAGEM_LIMPA,
    arquivos_da_estabilizacao,
    chave_arquivo,
    chave_da_estabilizacao,
    e_imagem,
)
from core.utils import storage
from core.utils.ffmpeg import FILTRO_MARCAS_BT709, MARCAS_BT709, ErroFFmpeg, executar_ffmpeg, ler_como_bt709
from core.utils.mongo import agora
from worker.tarefas.ingestao import FILTRO_PROXY, FPS_MAXIMO_PROXY, reduzir_quadros

# Medido num vídeo tremido sintético (panorâmica de 300 px com tremor de ±15 px, a 30 fps): o tremor que
# sobra caiu de 4,5 px para 1,2 px com 10 quadros de suavização, 0,6 com 20 e 0,45 com 30; a panorâmica
# andou 291, 277 e 268 px. 20 quadros a 30 fps (dois terços de segundo para cada lado) é o meio-termo.
SUAVIZACAO_S = 20 / 30
# Quanto do tremor a medida aceita (1 a 10) e a precisão dela (1 a 15)
FILTRO_DE_MEDIDA = "vidstabdetect=shakiness=5:accuracy=15"


def suavizacao_em_quadros(fps: float | None) -> int:
    return max(5, round(SUAVIZACAO_S * (fps or 30)))


def marcar_estabilizacao_com_erro(db, job: dict, mensagem: str):
    """Chamado quando a estabilização falha de vez: a aba Básico mostra o erro."""
    entrada = job.get("entrada") or {}
    if entrada.get("midia_id"):
        chave = chave_da_estabilizacao(bool(entrada.get("limpa")))
        db.midias.update_one({"_id": ObjectId(entrada["midia_id"])}, {"$set": {
            f"estabilizacoes.{chave}": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def executar_estabilizacao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    limpa = bool(entrada.get("limpa"))
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes da estabilização.")
    video = midia.get("video")
    if not video or e_imagem(midia):
        raise ErroDefinitivo("Só vídeos podem ser estabilizados.")
    organizacao_id = midia["organizacao_id"]
    # Sobre a imagem sem ruído, que já está em BT.709; o original passa pela leitura de sempre
    nome_da_fonte = ARQUIVO_IMAGEM_LIMPA if limpa else midia["original"]
    fonte = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, nome_da_fonte))
    if not fonte.is_file():
        raise ErroDefinitivo("A imagem sem ruído ainda não está pronta." if limpa
                             else "O arquivo original desta mídia não foi encontrado no servidor.")
    leitura = [] if limpa else ler_como_bt709(video.get("matriz"))
    duracao = float(midia.get("duracao") or 0) or None
    nome, nome_proxy = arquivos_da_estabilizacao(limpa)
    estavel = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, nome))
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, nome_proxy))
    parciais = [estavel.with_name(nome.replace(".mp4", ".parcial.mp4")),
                proxy.with_name(nome_proxy.replace(".mp4", ".parcial.mp4"))]
    try:
        with tempfile.TemporaryDirectory(prefix="takeone_estab_") as pasta:
            # O caminho entra no filtro: sem dois-pontos nem aspas, numa pasta só desta tarefa
            movimento = Path(pasta) / "movimento.trf"
            executar_ffmpeg(["-i", str(fonte), "-map", "0:v:0", "-an",
                             "-vf", ",".join([*leitura, f"{FILTRO_DE_MEDIDA}:result={movimento}"]), "-f", "null", "-"],
                            duracao, lambda f: reportar(2 + int(f * 38), "Medindo o tremor da câmera"))
            transformar = (f"vidstabtransform=input={movimento}:smoothing={suavizacao_em_quadros(video.get('fps'))}"
                           ":optzoom=1:interpol=bicubic")
            filtro = ",".join([*leitura, transformar, "scale=out_color_matrix=bt709:out_range=tv", FILTRO_MARCAS_BT709])
            executar_ffmpeg(["-i", str(fonte), "-map", "0:v:0", "-an", "-vf", filtro, "-fps_mode", "passthrough",
                             "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
                             *MARCAS_BT709, "-movflags", "+faststart", str(parciais[0])],
                            duracao, lambda f: reportar(40 + int(f * 42), "Estabilizando a imagem"))
        # A cópia leve dele, como a da ingestão (para a prévia)
        filtro_proxy = ",".join([FILTRO_PROXY, *reduzir_quadros(video.get("fps"))])
        executar_ffmpeg(["-i", str(parciais[0]), "-an", "-vf", filtro_proxy, "-fpsmax", str(FPS_MAXIMO_PROXY),
                         "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", *MARCAS_BT709,
                         "-g", str(FPS_MAXIMO_PROXY * 2), "-movflags", "+faststart", str(parciais[1])],
                        duracao, lambda f: reportar(82 + int(f * 16), "Preparando a prévia"))
    except ErroFFmpeg:
        for parcial in parciais:
            parcial.unlink(missing_ok=True)
        raise
    parciais[0].replace(estavel)
    parciais[1].replace(proxy)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {f"estabilizacoes.{chave_da_estabilizacao(limpa)}": {"status": "pronta", "erro": None},
                 "atualizado_em": agora()},
        "$addToSet": {"arquivos": {"$each": [nome, nome_proxy]}},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Imagem estável pronta{' (sem ruído)' if limpa else ''}.")
    reportar(100, "Imagem estável pronta")
    return {"midia_id": str(midia_id), "arquivo": nome}
