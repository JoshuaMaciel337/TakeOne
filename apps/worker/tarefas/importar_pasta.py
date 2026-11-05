# -----------------------------------------------
# Tarefa "importar_pasta" — as fotos de uma pasta do computador entram no álbum sem cópia (onda 16, ADR 0006)
#
# A pasta das fotos fica montada só para leitura (core/utils/fotos_no_lugar.py). Cada foto vira uma mídia que aponta
# para o arquivo (`externo`), já com o álbum, e vai para a ingestão como um envio comum. A mesma foto importada de
# novo no mesmo álbum fica de fora, então importar a pasta outra vez traz só as novas.
# -----------------------------------------------
import logging
from collections.abc import Callable

from bson import ObjectId

from core.modelos.album import FOTOS_POR_ALBUM, montar_foto
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import PRIORIDADE_INGESTAO, STATUS_PROCESSANDO, montar_midia
from core.utils.fotos_no_lugar import CaminhoInvalido, disponivel, fotos_da_pasta, relativo_de
from core.utils.mongo import agora


def executar_importar_pasta(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    album_id = ObjectId(entrada["album_id"])
    album = db.albuns.find_one({"_id": album_id})
    if album is None:
        raise ErroDefinitivo("O álbum foi excluído antes de a pasta ser importada.")
    if not disponivel():
        raise ErroDefinitivo("A pasta das fotos não está montada no servidor (PASTA_DAS_FOTOS_HOST no .env).")
    reportar(2, "Lendo a pasta")
    try:
        fotos = list(fotos_da_pasta(entrada["caminho"], bool(entrada.get("subpastas", True))))
    except CaminhoInvalido as e:
        raise ErroDefinitivo(str(e)) from e
    if not fotos:
        raise ErroDefinitivo("A pasta não tem fotos (JPG, PNG, HEIC, RAW...).")
    ja = {m["externo"] for m in db.midias.find({"album_id": album_id, "externo": {"$exists": True}}, {"externo": 1})}
    novas = [foto for foto in fotos if relativo_de(foto) not in ja]
    total = db.album_fotos.count_documents({"album_id": album_id})
    if total + len(novas) > FOTOS_POR_ALBUM:
        limite = f"{FOTOS_POR_ALBUM:,}".replace(",", ".")
        raise ErroDefinitivo(f"O álbum passaria de {limite} fotos. Importe uma pasta menor.")
    organizacao_id = album["organizacao_id"]
    for numero, foto in enumerate(novas):
        relativo = relativo_de(foto)
        momento = agora()
        midia = montar_midia(organizacao_id, job.get("criado_por"), foto.name, foto.stat().st_size, momento=momento)
        midia.update({"status": STATUS_PROCESSANDO, "externo": relativo, "album_id": album_id,
                      "bytes_recebidos": midia["tamanho_total"], "enviado_em": momento})
        midia["_id"] = db.midias.insert_one(midia).inserted_id
        pasta = "/".join(relativo.split("/")[:-1])
        db.album_fotos.insert_one(montar_foto(organizacao_id, album_id, midia["_id"], pasta, momento))
        ingestao = montar_job("ingestao", organizacao_id, {"midia_id": str(midia["_id"]), "album_id": str(album_id)},
                              prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"))
        ingestao_id = db.jobs.insert_one(ingestao).inserted_id
        db.midias.update_one({"_id": midia["_id"]}, {"$set": {"job_ingestao_id": ingestao_id}})
        if numero % 20 == 0:
            reportar(5 + int(90 * numero / max(1, len(novas))), f"Importando {numero + 1} de {len(novas)}")
    db.albuns.update_one({"_id": album_id}, {"$set": {"atualizado_em": agora()}})
    logging.info(f"[{organizacao_id}] [album {album_id}] {len(novas)} fotos importadas no lugar de "
                 f"{entrada['caminho'] or '/'} ({len(fotos) - len(novas)} já estavam).")
    reportar(100, "Fotos na fila")
    return {"album_id": str(album_id), "novas": len(novas), "ja_estavam": len(fotos) - len(novas)}
