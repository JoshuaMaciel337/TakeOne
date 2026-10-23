# -----------------------------------------------
# TakeOne Worker — congelar o quadro de um vídeo
#
# Tira o quadro que o render mostraria no instante (o último que chegou até ele, a regra do fps com
# round=up) do mesmo arquivo que o render lê, lido como BT.709 (ou o HDR convertido), e grava como a foto da
# mídia nova; daí em diante ela é uma imagem enviada como outra qualquer (a ingestão gira, copia e mede).
# -----------------------------------------------
import logging
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import PRIORIDADE_INGESTAO, chave_arquivo, pasta_da_midia
from core.utils import storage
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg, ler_como_bt709
from core.utils.mongo import agora

# O quadro é procurado a partir deste tanto antes do instante (o -ss do FFmpeg cai no quadro-chave anterior
# e descarta o resto, então só os quadros do trecho são decodificados)
ANTES_S = 1.0
# A mesma folga do render para o quadro que começa exatamente no instante
FOLGA_S = 0.0005


def filtros_do_quadro(segundos: float, inicio: float, cor: list[str]) -> str:
    """
    A cadeia que deixa passar só os quadros até o instante (o último fica no arquivo) e passa para RGB. O `scale`
    explícito, como no render, lê a matriz de cor do quadro: com o -ss antes do -i, a conversão que o FFmpeg
    põe sozinho para o `format` ignorava o setparams e saía em BT.601 (2,7 níveis de diferença, medido).
    """
    limite = segundos - inicio + FOLGA_S
    return ",".join([*cor, f"select='lte(t,{limite:.6f})'", "scale=flags=bicubic", "format=rgb24"])


def extrair_quadro(caminho: Path, segundos: float, cor: list[str], destino: Path) -> None:
    inicio = max(0.0, segundos - ANTES_S)
    executar_ffmpeg(["-ss", f"{inicio:.6f}", "-t", f"{segundos - inicio + 0.2:.6f}", "-i", str(caminho), "-an",
                     "-vf", filtros_do_quadro(segundos, inicio, cor), "-fps_mode", "passthrough", "-update", "1",
                     "-f", "image2", str(destino)])
    if not destino.is_file():
        raise ErroDefinitivo("Não foi possível tirar o quadro deste instante do vídeo.")


def executar_quadro(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de ficar pronta.")
    origem = db.midias.find_one({"_id": ObjectId(entrada["origem_id"])})
    if origem is None:
        raise ErroDefinitivo("O vídeo de origem foi excluído.")
    caminho = storage.caminho_local(chave_arquivo(origem["organizacao_id"], origem["_id"], entrada["arquivo"]))
    if not caminho.is_file():
        raise ErroDefinitivo("O arquivo do vídeo não foi encontrado no servidor.")
    video = origem.get("video") or {}
    # O original é lido como o render lê; a imagem sem ruído e a estável já saem em BT.709 marcado
    cor = ler_como_bt709(video.get("matriz"), video.get("hdr")) if entrada["arquivo"] == origem["original"] else []
    reportar(20, "Tirando o quadro")
    original = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia_id, midia["original"]))
    original.parent.mkdir(parents=True, exist_ok=True)
    parcial = original.with_name("quadro.parcial.png")
    try:
        extrair_quadro(caminho, float(entrada["segundos"]), cor, parcial)
    except ErroFFmpeg as erro:
        raise ErroDefinitivo("Não foi possível tirar o quadro deste instante do vídeo.") from erro
    parcial.replace(original)
    ingestao = montar_job("ingestao", midia["organizacao_id"], {"midia_id": str(midia_id)},
                          prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"))
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    momento = agora()
    tamanho = original.stat().st_size
    atualizado = db.midias.update_one({"_id": midia_id}, {"$set": {
        "tamanho_total": tamanho, "bytes_recebidos": tamanho, "job_ingestao_id": ingestao_id, "enviado_em": momento,
        "atualizado_em": momento,
    }})
    if atualizado.matched_count == 0:
        db.jobs.delete_one({"_id": ingestao_id})
        storage.remover_pasta(pasta_da_midia(midia["organizacao_id"], midia_id))
        raise ErroDefinitivo("A mídia foi excluída enquanto o quadro era tirado.")
    logging.info(f"[{midia['organizacao_id']}] [midia {midia_id}] Quadro de {origem['nome']} em "
                 f"{entrada['segundos']:.3f}s.")
    reportar(100, "Pronto")
    return {"midia_id": str(midia_id)}
