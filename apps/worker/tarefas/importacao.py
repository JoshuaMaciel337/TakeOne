# -----------------------------------------------
# Tarefa "importar_link" — baixar o vídeo de um link (YouTube, Drive, Vimeo, Twitch, TikTok, Instagram)
#
# Do HolyCut, sem a conferência do canal da igreja. O yt-dlp lê os dados do vídeo só com o extrator do
# site do link (core/modelos/importacao.py), espera a live acabar e baixa até 1080p. Depois o vídeo
# segue o caminho de um envio comum: a ingestão. Como a fala e o vídeo gerado, a mídia já está na
# biblioteca, processando, e este job aparece como o progresso dela.
# -----------------------------------------------
import logging
from collections.abc import Callable
from datetime import timedelta

from bson import ObjectId

from core.config import ESPACO_MINIMO_LIVRE_BYTES, EXTENSOES_VIDEO
from core.modelos.importacao import (
    DURACAO_MAXIMA,
    ESPERA_LIVE_MINUTOS,
    MAXIMO_ESPERAS_LIVE,
    canal_do_video,
    nome_de_arquivo_do_video,
    precisa_esperar,
    titulo_do_video,
)
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import PRIORIDADE_INGESTAO, STATUS_ERRO, chave_arquivo, pasta_da_midia
from core.utils import storage
from core.utils.link import ErroImportacao, baixar, ler_metadados, mensagem_definitiva
from core.utils.mongo import agora

BITS_POR_SEGUNDO_ESTIMADO = 6_000_000   # 1080p, quando o site não informa o tamanho


def _tamanho_estimado(metadados: dict) -> int:
    formatos = metadados.get("requested_formats") or [metadados]
    informado = sum(int(item.get("filesize") or item.get("filesize_approx") or 0) for item in formatos)
    return max(informado, int(float(metadados.get("duration") or 0) * BITS_POR_SEGUNDO_ESTIMADO / 8))


def _esperar_a_live(db, job: dict, midia: dict) -> dict:
    """A live ainda está no ar: um job novo olha de novo daqui a 10 min. Não gasta as tentativas."""
    esperas = int(job["entrada"].get("esperas") or 0)
    if esperas >= MAXIMO_ESPERAS_LIVE:
        raise ErroDefinitivo("A live passou de 8 horas no ar. Importe de novo quando ela terminar.")
    momento = agora()
    novo = montar_job("importar_link", job["organizacao_id"], {**job["entrada"], "esperas": esperas + 1},
                      prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"), momento=momento)
    novo["disponivel_em"] = momento + timedelta(minutes=ESPERA_LIVE_MINUTOS)
    novo["mensagem"] = f"A live ainda está no ar. Nova olhada às {novo['disponivel_em'].strftime('%H:%M')}."
    novo_id = db.jobs.insert_one(novo).inserted_id
    db.midias.update_one({"_id": midia["_id"]}, {"$set": {"job_ingestao_id": novo_id, "atualizado_em": momento}})
    logging.info("[%s] [midia %s] Live no ar. Nova olhada em %s min.", job["organizacao_id"], midia["_id"],
                 ESPERA_LIVE_MINUTOS)
    return {"midia_id": str(midia["_id"]), "aguardando": True}


def executar_importacao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    organizacao_id = job["organizacao_id"]
    midia = db.midias.find_one({"_id": midia_id, "organizacao_id": organizacao_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes da importação.")

    reportar(2, "Lendo o vídeo")
    try:
        metadados = ler_metadados(entrada["url"], entrada["origem"])
    except ErroImportacao as erro:
        definitiva = mensagem_definitiva(erro)
        if definitiva:
            raise ErroDefinitivo(definitiva) from erro
        raise   # rede, limite do site: a fila tenta de novo mais tarde
    if precisa_esperar(metadados):
        return _esperar_a_live(db, job, midia)
    if float(metadados.get("duration") or 0) > DURACAO_MAXIMA:
        raise ErroDefinitivo(f"O vídeo tem mais de {DURACAO_MAXIMA // 3600} horas. Corte o trecho e envie o arquivo.")
    if storage.espaco_livre() - _tamanho_estimado(metadados) < ESPACO_MINIMO_LIVRE_BYTES:
        raise ErroDefinitivo("Não há espaço no disco do servidor para esse vídeo.")

    pasta = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, "original")).parent
    pasta.mkdir(parents=True, exist_ok=True)
    try:
        arquivo = baixar(entrada["url"], entrada["origem"], pasta, reportar)
    except ErroImportacao as erro:
        for parcial in pasta.glob("original.*"):
            parcial.unlink(missing_ok=True)
        definitiva = mensagem_definitiva(erro)
        if definitiva:
            raise ErroDefinitivo(definitiva) from erro
        raise
    extensao = arquivo.suffix.lower()
    if extensao not in EXTENSOES_VIDEO:
        arquivo.unlink(missing_ok=True)
        raise ErroDefinitivo("O link não trouxe um vídeo que o TakeOne aceite.")

    reportar(95, "Preparando o vídeo")
    momento = agora()
    ingestao = montar_job("ingestao", organizacao_id, {"midia_id": str(midia_id)}, prioridade=PRIORIDADE_INGESTAO,
                          criado_por=midia.get("criado_por"), momento=momento)
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    titulo = titulo_do_video(metadados, midia.get("nome") or "Vídeo importado")
    tamanho = arquivo.stat().st_size
    campos = {"nome": titulo, "nome_original": nome_de_arquivo_do_video(titulo, extensao), "extensao": extensao,
              "original": f"original{extensao}", "tamanho_total": tamanho, "bytes_recebidos": tamanho,
              "job_ingestao_id": ingestao_id, "enviado_em": momento, "atualizado_em": momento,
              "importacao.titulo": titulo,
              "importacao.canal": canal_do_video(metadados)}
    resultado = db.midias.update_one({"_id": midia_id, "status": {"$ne": STATUS_ERRO}}, {"$set": campos})
    if resultado.matched_count == 0:
        # Excluída enquanto baixava: a pasta que o worker criou sai junto, senão fica órfã no disco
        db.jobs.delete_one({"_id": ingestao_id})
        storage.remover_pasta(pasta_da_midia(organizacao_id, midia_id))
        raise ErroDefinitivo("A mídia foi excluída enquanto o vídeo era baixado.")
    reportar(100, "Vídeo baixado")
    logging.info("[%s] [midia %s] Importado do %s: %s (%.1f MB). Ingestão na fila.", organizacao_id, midia_id,
                 entrada["origem"], titulo, tamanho / 1024**2)
    return {"midia_id": str(midia_id), "tamanho": tamanho}
