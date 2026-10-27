# -----------------------------------------------
# Tarefa "pixabay" — baixar uma imagem ou um vídeo do banco da Pixabay para a biblioteca (o Clipar, 14.12f)
#
# A API já leu o item na Pixabay e mandou o endereço do arquivo; aqui ele é conferido de novo (só os endereços da
# Pixabay), baixado em pedaços com limite de tamanho e a ingestão vai para a fila, como num envio.
# -----------------------------------------------
import logging
from collections.abc import Callable

from bson import ObjectId

from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import PRIORIDADE_INGESTAO, STATUS_ERRO, chave_arquivo, pasta_da_midia
from core.utils import pixabay, storage
from core.utils.mongo import agora


def executar_pixabay(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    organizacao_id = job["organizacao_id"]
    midia = db.midias.find_one({"_id": midia_id, "organizacao_id": organizacao_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes do download.")
    if not pixabay.endereco_permitido(entrada["url"]):
        raise ErroDefinitivo("O endereço do arquivo não é da Pixabay.")
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    original.parent.mkdir(parents=True, exist_ok=True)
    reportar(2, "Baixando da Pixabay")
    try:
        tamanho = pixabay.baixar(entrada["url"], original, entrada["tipo"], reportar)
    except pixabay.ErroPixabay as erro:
        raise ErroDefinitivo(str(erro)) from erro
    momento = agora()
    ingestao = montar_job("ingestao", organizacao_id, {"midia_id": str(midia_id)}, prioridade=PRIORIDADE_INGESTAO,
                          criado_por=midia.get("criado_por"), momento=momento)
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    resultado = db.midias.update_one({"_id": midia_id, "status": {"$ne": STATUS_ERRO}}, {"$set": {
        "tamanho_total": tamanho, "bytes_recebidos": tamanho, "job_ingestao_id": ingestao_id,
        "enviado_em": momento, "atualizado_em": momento}})
    if resultado.matched_count == 0:
        db.jobs.delete_one({"_id": ingestao_id})
        storage.remover_pasta(pasta_da_midia(organizacao_id, midia_id))
        raise ErroDefinitivo("A mídia foi excluída enquanto o arquivo era baixado.")
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Baixado da Pixabay ({tamanho / 1024**2:.1f} MB). "
                 "Ingestão na fila.")
    reportar(100, "Baixado")
    return {"midia_id": str(midia_id), "tamanho": tamanho}
