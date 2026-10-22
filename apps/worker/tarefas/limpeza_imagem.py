# -----------------------------------------------
# Tarefa "limpeza_imagem" — tira o ruído (o granulado) da imagem de uma mídia
#
# O hqdn3d do FFmpeg (filtro de ruído espacial e temporal, rápido na CPU) na resolução cheia, como a
# ingestão faz a cópia leve: o vídeo sem ruído (limpo.mp4) é o que o render lê no lugar do original, e
# a cópia leve dele (limpo_proxy.mp4) é a que a prévia decodifica. As duas saem do mesmo filtro, na
# mesma ordem que o original e a cópia leve de sempre, e no mesmo tempo da mídia. O som continua
# vindo do original.
# -----------------------------------------------
import logging
from collections.abc import Callable

from bson import ObjectId

from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_IMAGEM_LIMPA, ARQUIVO_IMAGEM_LIMPA_PROXY, chave_arquivo
from core.utils import storage
from core.utils.ffmpeg import FILTRO_MARCAS_BT709, MARCAS_BT709, ErroFFmpeg, executar_ffmpeg, ler_como_bt709
from core.utils.mongo import agora
from worker.tarefas.ingestao import FILTRO_PROXY, FPS_MAXIMO_PROXY, reduzir_quadros

# Luma espacial, croma espacial, luma no tempo, croma no tempo. Medido num vídeo com ruído acrescentado:
# o ruído caiu pela metade (de 7,1 para 3,5 níveis em 255) e o mesmo vídeo sem ruído perdeu 2,3 de detalhe
FILTRO_DE_RUIDO = "hqdn3d=10:8:12:10"


def marcar_imagem_com_erro(db, job: dict, mensagem: str):
    """Chamado quando a limpeza falha de vez: a aba Cor mostra o erro."""
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {
            "imagem_limpa": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def executar_limpeza_imagem(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes da limpeza da imagem.")
    video = midia.get("video")
    if not video:
        raise ErroDefinitivo("Esta mídia não tem imagem para limpar.")
    organizacao_id = midia["organizacao_id"]
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    if not original.is_file():
        raise ErroDefinitivo("O arquivo original desta mídia não foi encontrado no servidor.")
    duracao = float(midia.get("duracao") or 0) or None
    limpo = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_IMAGEM_LIMPA))
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_IMAGEM_LIMPA_PROXY))
    parciais = [limpo.with_name("limpo.parcial.mp4"), proxy.with_name("limpo_proxy.parcial.mp4")]
    try:
        # Resolução cheia, sem ruído e já em BT.709 marcado, no tempo do original (para o render)
        filtro = ",".join([*ler_como_bt709(video.get("matriz")), FILTRO_DE_RUIDO,
                           "scale=out_color_matrix=bt709:out_range=tv", FILTRO_MARCAS_BT709])
        executar_ffmpeg(["-i", str(original), "-map", "0:v:0", "-an", "-vf", filtro, "-fps_mode", "passthrough",
                         "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", *MARCAS_BT709,
                         "-movflags", "+faststart", str(parciais[0])],
                        duracao, lambda f: reportar(2 + int(f * 78), "Tirando o ruído da imagem"))
        # A cópia leve dela, como a da ingestão (para a prévia)
        filtro_proxy = ",".join([FILTRO_PROXY, *reduzir_quadros(video.get("fps"))])
        executar_ffmpeg(["-i", str(parciais[0]), "-an", "-vf", filtro_proxy, "-fpsmax", str(FPS_MAXIMO_PROXY),
                         "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", *MARCAS_BT709,
                         "-g", str(FPS_MAXIMO_PROXY * 2), "-movflags", "+faststart", str(parciais[1])],
                        duracao, lambda f: reportar(80 + int(f * 18), "Preparando a prévia"))
    except ErroFFmpeg:
        for parcial in parciais:
            parcial.unlink(missing_ok=True)
        raise
    parciais[0].replace(limpo)
    parciais[1].replace(proxy)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {"imagem_limpa": {"status": "pronta", "erro": None}, "atualizado_em": agora()},
        "$addToSet": {"arquivos": {"$each": [ARQUIVO_IMAGEM_LIMPA, ARQUIVO_IMAGEM_LIMPA_PROXY]}},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Imagem sem ruído pronta.")
    reportar(100, "Imagem sem ruído pronta")
    return {"midia_id": str(midia_id)}
