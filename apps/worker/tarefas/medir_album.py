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
from core.modelos.pessoas import Rosto, agrupar
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
    reportar(99, "Juntando as pessoas")
    pessoas = atualizar_pessoas(db, album_id)
    db.albuns.update_one({"_id": album_id}, {"$set": {"analisado_em": agora()}})
    logging.info(f"[album {album_id}] {feitas} fotos medidas ({falhas} sem imagem, {len(medidas)} já estavam).")
    return {"album_id": str(album_id), "medidas": feitas, "falhas": falhas, "ja_estavam": len(medidas),
            "pessoas": pessoas}


def atualizar_pessoas(db, album_id: ObjectId) -> int:
    """Junta os rostos medidos das fotos do álbum em pessoas (core/modelos/pessoas.py), guardando os números e os
    nomes de antes; cada foto do álbum fica com os números das pessoas que aparecem nela."""
    ids = [f["midia_id"] for f in db.album_fotos.find({"album_id": album_id}, {"midia_id": 1})]
    rostos = []
    for m in db.fotos_medidas.find({"midia_id": {"$in": ids}}, {"midia_id": 1, "rostos": 1, "pessoas": 1}):
        vetores = np.frombuffer(bytes(m.get("pessoas") or b""), np.float16).reshape(-1, 128)
        for indice, (rosto, vetor) in enumerate(zip(m.get("rostos") or [], vetores, strict=False)):
            caixa = rosto["caixa"]
            rostos.append(Rosto(str(m["midia_id"]), indice, vetor.astype(np.float32), caixa[2] * caixa[3], caixa))
    antigas = {p["numero"]: p for p in db.album_pessoas.find({"album_id": album_id})}
    pessoas = agrupar(rostos, [(n, np.frombuffer(bytes(p["centro"]), np.float32)) for n, p in antigas.items()])
    por_foto: dict[str, list[int]] = {}
    # A pessoa de cada rosto da foto, na ordem dos rostos medidos (None: rosto pequeno ou sem vetor)
    por_rosto: dict[str, dict[int, int]] = {}
    for pessoa in pessoas:
        for midia in pessoa.fotos:
            por_foto.setdefault(midia, []).append(pessoa.numero)
        for rosto in pessoa.rostos:
            por_rosto.setdefault(rosto.midia_id, {})[rosto.indice] = pessoa.numero
        capa = pessoa.capa
        db.album_pessoas.update_one({"album_id": album_id, "numero": pessoa.numero}, {"$set": {
            "nome": antigas.get(pessoa.numero, {}).get("nome", ""), "fotos": len(pessoa.fotos),
            "centro": Binary(pessoa.centro.astype(np.float32).tobytes()),
            "capa": {"midia_id": ObjectId(capa.midia_id), "caixa": capa.caixa}, "atualizado_em": agora(),
        }}, upsert=True)
    # As de antes que sumiram (as fotos dela saíram): ficam só se têm nome, sem fotos, para voltar se ela voltar
    vivas = [p.numero for p in pessoas]
    db.album_pessoas.delete_many({"album_id": album_id, "numero": {"$nin": vivas}, "nome": ""})
    db.album_pessoas.update_many({"album_id": album_id, "numero": {"$nin": vivas}}, {"$set": {"fotos": 0}})
    db.album_fotos.update_many({"album_id": album_id}, {"$set": {"pessoas": [], "pessoas_por_rosto": []}})
    for midia, numeros in por_foto.items():
        rostos = por_rosto.get(midia, {})
        lista = [rostos.get(i) for i in range(max(rostos, default=-1) + 1)]
        db.album_fotos.update_one({"album_id": album_id, "midia_id": ObjectId(midia)},
                                  {"$set": {"pessoas": numeros, "pessoas_por_rosto": lista}})
    return len(pessoas)
