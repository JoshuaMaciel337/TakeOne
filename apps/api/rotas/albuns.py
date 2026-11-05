# -----------------------------------------------
# TakeOne API — álbuns de fotos (onda 16, docs/decisoes/0006-album-de-fotos.md)
#
#   GET    /api/albuns                       os álbuns do espaço, com a contagem e a capa
#   POST   /api/albuns                       cria (nome e tipo do ensaio)
#   GET    /api/albuns/{id}                  um álbum
#   PATCH  /api/albuns/{id}                  muda o nome ou o tipo
#   DELETE /api/albuns/{id}                  exclui com as fotos enviadas para ele
#   GET    /api/albuns/{id}/fotos            as fotos, com o que a grade precisa
#   POST   /api/albuns/{id}/fotos            põe imagens da biblioteca no álbum
#   PATCH  /api/albuns/{id}/fotos            a mesma nota, cor ou marcação em várias fotos
#   POST   /api/albuns/{id}/fotos/remover    tira fotos do álbum
#
# As fotos chegam pelo envio de sempre (tus), com o álbum nos metadados (api/rotas/uploads.py).
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    AlbumAtualizarEntrada,
    AlbumEntrada,
    AlbumSaida,
    FotoDoAlbumSaida,
    FotosIdsEntrada,
    FotosMudarEntrada,
    FotosRemovidasSaida,
)
from api.rotas.midias import apagar_midia, jobs_de_ingestao, motivo_para_manter
from core.modelos.album import FOTOS_POR_ALBUM, montar_album, montar_foto, mudanca_das_fotos
from core.modelos.midia import STATUS_PROCESSANDO, STATUS_PRONTA, e_imagem
from core.utils.mongo import agora

router = APIRouter(prefix="/api/albuns", tags=["albuns"])

# Só o que a grade usa da mídia (milhares de fotos por pedido)
CAMPOS_DA_MIDIA = {"nome": 1, "status": 1, "erro": 1, "video": 1, "exif": 1, "enviado_em": 1, "album_id": 1,
                   "job_ingestao_id": 1}


# -----------------------------------------------
# FUNÇÕES AUXILIARES
# -----------------------------------------------
def _id(valor: str, mensagem: str = "Álbum não encontrado.") -> ObjectId:
    try:
        return ObjectId(valor)
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, mensagem) from e


async def buscar_album(db, album_id: str, usuario: dict) -> dict:
    album = await db.albuns.find_one({"_id": _id(album_id), "organizacao_id": usuario["organizacao_id"]})
    if album is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Álbum não encontrado.")
    return album


async def resumos(db, albuns: list[dict]) -> list[AlbumSaida]:
    """A contagem de fotos, de prontas e de escolhidas e a capa de cada álbum, numa agregação só."""
    ids = [a["_id"] for a in albuns]
    contas: dict = {}
    cursor = await db.album_fotos.aggregate([
        {"$match": {"album_id": {"$in": ids}}},
        {"$lookup": {"from": "midias", "localField": "midia_id", "foreignField": "_id", "as": "m",
                     "pipeline": [{"$project": {"status": 1}}]}},
        {"$group": {
            "_id": "$album_id",
            "fotos": {"$sum": 1},
            "prontas": {"$sum": {"$cond": [{"$eq": [{"$first": "$m.status"}, STATUS_PRONTA]}, 1, 0]}},
            "escolhidas": {"$sum": {"$cond": [{"$eq": ["$marcacao", "escolhida"]}, 1, 0]}},
            "capa": {"$min": {"$cond": [{"$eq": [{"$first": "$m.status"}, STATUS_PRONTA]}, "$midia_id", None]}},
        }},
    ])
    async for conta in cursor:
        contas[conta["_id"]] = conta
    saida = []
    for album in albuns:
        conta = contas.get(album["_id"], {})
        saida.append(AlbumSaida(
            id=str(album["_id"]), nome=album["nome"], genero=album["genero"], fotos=conta.get("fotos", 0),
            prontas=conta.get("prontas", 0), escolhidas=conta.get("escolhidas", 0),
            capa_midia_id=str(conta["capa"]) if conta.get("capa") else None,
            criado_em=album["criado_em"], atualizado_em=album["atualizado_em"]))
    return saida


async def tirar_fotos(db, album: dict, midia_ids: list[ObjectId]) -> FotosRemovidasSaida:
    """
    Tira as fotos do álbum. A foto enviada para ele sai do disco junto, a menos que um projeto, um modelo ou uma
    exportação a use: aí ela vai para a biblioteca, como qualquer imagem. A que veio da biblioteca só sai do álbum.
    """
    apagadas = na_biblioteca = 0
    async for midia in db.midias.find({"_id": {"$in": midia_ids}, "organizacao_id": album["organizacao_id"],
                                       "album_id": album["_id"]}):
        if await motivo_para_manter(db, midia):
            await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"album_id": None, "atualizado_em": agora()}})
            na_biblioteca += 1
        else:
            await apagar_midia(db, midia)
            apagadas += 1
    await db.album_fotos.delete_many({"album_id": album["_id"], "midia_id": {"$in": midia_ids}})
    return FotosRemovidasSaida(apagadas=apagadas, na_biblioteca=na_biblioteca)


# -----------------------------------------------
# ROTAS
# -----------------------------------------------
@router.get("", response_model=list[AlbumSaida])
async def listar_albuns(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    cursor = db.albuns.find({"organizacao_id": usuario["organizacao_id"]}).sort("atualizado_em", -1).limit(500)
    return await resumos(db, [a async for a in cursor])


@router.post("", response_model=AlbumSaida, status_code=status.HTTP_201_CREATED)
async def criar_album(dados: AlbumEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = montar_album(usuario["organizacao_id"], usuario["_id"], dados.nome, dados.genero)
    album["_id"] = (await db.albuns.insert_one(album)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Álbum criado: {album['nome']}")
    return (await resumos(db, [album]))[0]


@router.get("/{album_id}", response_model=AlbumSaida)
async def ver_album(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    return (await resumos(db, [await buscar_album(db, album_id, usuario)]))[0]


@router.patch("/{album_id}", response_model=AlbumSaida)
async def atualizar_album(album_id: str, dados: AlbumAtualizarEntrada, usuario=Depends(usuario_atual),
                          db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    campos = {k: v for k, v in dados.model_dump().items() if v is not None}
    if campos:
        campos["atualizado_em"] = agora()
        await db.albuns.update_one({"_id": album["_id"]}, {"$set": campos})
        album.update(campos)
    return (await resumos(db, [album]))[0]


@router.delete("/{album_id}", response_model=FotosRemovidasSaida)
async def excluir_album(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    ids = [f["midia_id"] async for f in db.album_fotos.find({"album_id": album["_id"]}, {"midia_id": 1})]
    # As que ainda chegavam (enviando) também têm o álbum: saem junto
    ids += [m["_id"] async for m in db.midias.find({"album_id": album["_id"], "_id": {"$nin": ids}}, {"_id": 1})]
    resultado = await tirar_fotos(db, album, ids)
    await db.albuns.delete_one({"_id": album["_id"]})
    logging.info(f"[{usuario['organizacao_id']}] Álbum excluído: {album['nome']} ({resultado.apagadas} fotos "
                 f"apagadas, {resultado.na_biblioteca} na biblioteca)")
    return resultado


@router.get("/{album_id}/fotos", response_model=list[FotoDoAlbumSaida])
async def listar_fotos(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    fotos = [f async for f in db.album_fotos.find({"album_id": album["_id"]})]
    midias = {m["_id"]: m async for m in db.midias.find({"_id": {"$in": [f["midia_id"] for f in fotos]}},
                                                         CAMPOS_DA_MIDIA)}
    jobs = await jobs_de_ingestao(db, [m for m in midias.values() if m.get("status") == STATUS_PROCESSANDO])
    saida = []
    for foto in fotos:
        midia = midias.get(foto["midia_id"])
        if midia is None:
            continue
        video = midia.get("video") or {}
        job = jobs.get(midia.get("job_ingestao_id"))
        saida.append(FotoDoAlbumSaida(
            midia_id=str(midia["_id"]), nome=midia["nome"], status=midia["status"], erro=midia.get("erro"),
            progresso=job.get("progresso") if job else None, largura=video.get("largura"),
            altura=video.get("altura"), exif=midia.get("exif"), pasta=foto.get("pasta", ""), nota=foto["nota"],
            cor=foto.get("cor"), marcacao=foto.get("marcacao"), enviado_em=midia.get("enviado_em"),
            do_album=midia.get("album_id") == album["_id"]))
    return saida


@router.post("/{album_id}/fotos", response_model=list[FotoDoAlbumSaida], status_code=status.HTTP_201_CREATED)
async def adicionar_fotos(album_id: str, dados: FotosIdsEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Imagens prontas da biblioteca entram no álbum (sem cópia: continuam na biblioteca)."""
    album = await buscar_album(db, album_id, usuario)
    ids = [_id(i, "Mídia não encontrada.") for i in dict.fromkeys(dados.midia_ids)]
    ja = {f["midia_id"] async for f in db.album_fotos.find({"album_id": album["_id"], "midia_id": {"$in": ids}})}
    novas = [m async for m in db.midias.find({"_id": {"$in": [i for i in ids if i not in ja]},
                                               "organizacao_id": usuario["organizacao_id"], "status": STATUS_PRONTA})]
    novas = [m for m in novas if e_imagem(m)]
    if not novas:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Nenhuma das mídias é uma imagem pronta fora do álbum.")
    total = await db.album_fotos.count_documents({"album_id": album["_id"]})
    if total + len(novas) > FOTOS_POR_ALBUM:
        limite = f"{FOTOS_POR_ALBUM:,}".replace(",", ".")
        raise HTTPException(status.HTTP_409_CONFLICT, f"O álbum chegaria a mais de {limite} fotos.")
    momento = agora()
    await db.album_fotos.insert_many([montar_foto(usuario["organizacao_id"], album["_id"], m["_id"], momento=momento)
                                      for m in novas])
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"atualizado_em": momento}})
    return [FotoDoAlbumSaida(midia_id=str(m["_id"]), nome=m["nome"], status=m["status"],
                             largura=(m.get("video") or {}).get("largura"),
                             altura=(m.get("video") or {}).get("altura"), exif=m.get("exif"),
                             enviado_em=m.get("enviado_em"), do_album=False) for m in novas]


@router.patch("/{album_id}/fotos", status_code=status.HTTP_204_NO_CONTENT)
async def mudar_fotos(album_id: str, dados: FotosMudarEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    try:
        campos = mudanca_das_fotos(dados.nota, dados.cor, dados.marcacao, dados.tirar_cor, dados.tirar_marcacao)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    ids = [_id(i, "Mídia não encontrada.") for i in dados.midia_ids]
    momento = agora()
    await db.album_fotos.update_many({"album_id": album["_id"], "midia_id": {"$in": ids}},
                                     {"$set": {**campos, "atualizado_em": momento}})
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"atualizado_em": momento}})


@router.post("/{album_id}/fotos/remover", response_model=FotosRemovidasSaida)
async def remover_fotos(album_id: str, dados: FotosIdsEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    resultado = await tirar_fotos(db, album, [_id(i, "Mídia não encontrada.") for i in dados.midia_ids])
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"atualizado_em": agora()}})
    return resultado
