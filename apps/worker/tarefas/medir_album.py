# -----------------------------------------------
# Tarefa "medir_album" — mede as fotos prontas do álbum que ainda não foram medidas (onda 16.2, ADR 0006)
#
# As medidas (core/utils/medir_foto.py) ficam em fotos_medidas, uma por mídia, com o vetor da foto e os dos
# rostos (as pessoas, 128 números por rosto) em float16. O job pode
# cair no meio: rodar de novo continua das que faltam. Fotos que chegam depois pedem outra rodada.
# -----------------------------------------------
import logging
from collections.abc import Callable

import numpy as np
from bson import Binary, ObjectId

from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_IMAGEM, ARQUIVO_PROXY_IMAGEM, STATUS_PRONTA, chave_arquivo
from core.utils import storage
from core.utils.medir_foto import VERSAO_DAS_MEDIDAS, Modelos, medir
from core.utils.mongo import agora

_modelos: Modelos | None = None


def modelos() -> Modelos:
    global _modelos
    if _modelos is None:
        _modelos = Modelos()
    return _modelos


def _ler(midia: dict):
    """A cópia leve da foto (1920 px), ou a imagem do render se a cópia leve faltar."""
    import cv2

    for nome in (ARQUIVO_PROXY_IMAGEM, ARQUIVO_IMAGEM):
        caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], nome))
        if caminho.is_file():
            imagem = cv2.imread(str(caminho), cv2.IMREAD_COLOR)
            if imagem is not None:
                return imagem
    return None


def executar_medir_album(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    album_id = ObjectId(job["entrada"]["album_id"])
    if db.albuns.count_documents({"_id": album_id}, limit=1) == 0:
        raise ErroDefinitivo("O álbum foi excluído antes da análise.")
    ids = [f["midia_id"] for f in db.album_fotos.find({"album_id": album_id}, {"midia_id": 1})]
    prontas = list(db.midias.find({"_id": {"$in": ids}, "status": STATUS_PRONTA}, {"organizacao_id": 1}))
    medidas = {m["midia_id"] for m in db.fotos_medidas.find(
        {"midia_id": {"$in": [p["_id"] for p in prontas]}, "versao": VERSAO_DAS_MEDIDAS}, {"midia_id": 1})}
    pendentes = [p for p in prontas if p["_id"] not in medidas]
    reportar(2, f"Analisando {len(pendentes)} fotos")
    feitas = falhas = 0
    for numero, midia in enumerate(pendentes):
        imagem = _ler(midia)
        if imagem is None:
            falhas += 1
            continue
        lidas, vetor, pessoas = medir(imagem, modelos())
        db.fotos_medidas.update_one({"midia_id": midia["_id"]}, {"$set": {
            **lidas, "midia_id": midia["_id"], "organizacao_id": midia["organizacao_id"],
            "vetor": Binary(vetor.astype(np.float16).tobytes()),
            "pessoas": Binary(pessoas.astype(np.float16).tobytes()), "medido_em": agora(),
        }}, upsert=True)
        feitas += 1
        if numero % 5 == 0 or numero == len(pendentes) - 1:
            andamento = 2 + int(97 * (numero + 1) / max(1, len(pendentes)))
            reportar(andamento, f"Analisando {numero + 1} de {len(pendentes)}")
    db.albuns.update_one({"_id": album_id}, {"$set": {"analisado_em": agora()}})
    logging.info(f"[album {album_id}] {feitas} fotos medidas ({falhas} sem imagem, {len(medidas)} já estavam).")
    return {"album_id": str(album_id), "medidas": feitas, "falhas": falhas, "ja_estavam": len(medidas)}
