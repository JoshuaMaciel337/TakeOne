# -----------------------------------------------
# TakeOne API — o estilo pessoal das fotos do álbum (onda 16.7, docs/decisoes/0006-album-de-fotos.md)
#
#   GET    /api/estilos-pessoais                      os do espaço, com quantos pares e o modelo
#   POST   /api/estilos-pessoais                      cria (o nome)
#   PATCH  /api/estilos-pessoais/{id}                 muda o nome
#   DELETE /api/estilos-pessoais/{id}                 exclui, com os pares e o modelo
#   POST   /api/estilos-pessoais/{id}/ensinar         ensina com fotos do álbum (a edição delas, ou o .xmp ao lado)
#   POST   /api/estilos-pessoais/{id}/aplicar         aplica às fotos do álbum (job "aplicar_estilo_pessoal")
#   GET    /api/estilos-pessoais/{id}/parecidas       as fotos ensinadas mais parecidas com uma foto
#
# O aprendizado e a previsão rodam no worker (apps/worker/tarefas/estilo_pessoal.py, core/modelos/estilo_pessoal.py).
# -----------------------------------------------
import logging

import numpy as np
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    AplicarEstiloPessoalEntrada,
    EnsinarEstiloEntrada,
    EstiloPessoalEntrada,
    EstiloPessoalSaida,
    JobDoAlbumSaida,
    ParecidaSaida,
)
from core.modelos.estilo_pessoal import vizinhos
from core.modelos.job import montar_job
from core.utils import storage
from core.utils.mongo import agora

router = APIRouter(prefix="/api/estilos-pessoais", tags=["estilos-pessoais"])
ESTILOS_POR_ESPACO = 50


def _id(valor: str, mensagem: str) -> ObjectId:
    try:
        return ObjectId(valor)
    except (InvalidId, TypeError) as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, mensagem) from e


async def buscar_estilo(db, estilo_id: str, usuario: dict) -> dict:
    estilo = await db.estilos_pessoais.find_one({"_id": _id(estilo_id, "Estilo não encontrado."),
                                                 "organizacao_id": usuario["organizacao_id"]})
    if estilo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Estilo não encontrado.")
    return estilo


def para_saida(estilo: dict) -> EstiloPessoalSaida:
    modelo = estilo.get("modelo") or {}
    return EstiloPessoalSaida(id=str(estilo["_id"]), nome=estilo["nome"], pares=estilo.get("pares", 0),
                              modelo=modelo.get("tipo", "vizinhos"), treinado_em=modelo.get("treinado_em"),
                              criado_em=estilo["criado_em"])


@router.get("", response_model=list[EstiloPessoalSaida])
async def listar(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    return [para_saida(e) async for e in db.estilos_pessoais.find({"organizacao_id": usuario["organizacao_id"]})
            .sort("criado_em", 1)]


@router.post("", response_model=EstiloPessoalSaida, status_code=status.HTTP_201_CREATED)
async def criar(dados: EstiloPessoalEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    if await db.estilos_pessoais.count_documents({"organizacao_id": usuario["organizacao_id"]}) >= ESTILOS_POR_ESPACO:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"O espaço já tem {ESTILOS_POR_ESPACO} estilos pessoais. Exclua algum antes.")
    estilo = {"_id": ObjectId(), "organizacao_id": usuario["organizacao_id"], "nome": dados.nome.strip(), "pares": 0,
              "modelo": None, "criado_por": usuario["_id"], "criado_em": agora()}
    await db.estilos_pessoais.insert_one(estilo)
    return para_saida(estilo)


@router.patch("/{estilo_id}", response_model=EstiloPessoalSaida)
async def renomear(estilo_id: str, dados: EstiloPessoalEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    estilo = await buscar_estilo(db, estilo_id, usuario)
    await db.estilos_pessoais.update_one({"_id": estilo["_id"]}, {"$set": {"nome": dados.nome.strip()}})
    return para_saida({**estilo, "nome": dados.nome.strip()})


@router.delete("/{estilo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir(estilo_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    estilo = await buscar_estilo(db, estilo_id, usuario)
    await db.estilo_pessoal_pares.delete_many({"estilo_id": estilo["_id"]})
    storage.remover(f"org_{estilo['organizacao_id']}/estilos_pessoais/{estilo['_id']}/modelo.pkl")
    await db.estilos_pessoais.delete_one({"_id": estilo["_id"]})
    logging.info(f"[{usuario['organizacao_id']}] Estilo pessoal excluído: {estilo['nome']}")


async def _album(db, album_id: str, usuario: dict) -> dict:
    album = await db.albuns.find_one({"_id": _id(album_id, "Álbum não encontrado."),
                                      "organizacao_id": usuario["organizacao_id"]})
    if album is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Álbum não encontrado.")
    return album


@router.post("/{estilo_id}/ensinar", response_model=JobDoAlbumSaida, status_code=status.HTTP_202_ACCEPTED)
async def ensinar(estilo_id: str, dados: EnsinarEstiloEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Ensina com as fotos do álbum: a edição de cada uma, ou o .xmp de outro programa ao lado dela."""
    estilo = await buscar_estilo(db, estilo_id, usuario)
    album = await _album(db, dados.album_id, usuario)
    job = montar_job("ensinar_estilo", usuario["organizacao_id"],
                     {"estilo_id": str(estilo["_id"]), "album_id": str(album["_id"]), "midia_ids": dados.midia_ids,
                      "origem": dados.origem}, criado_por=usuario["_id"])
    return JobDoAlbumSaida(job_id=str((await db.jobs.insert_one(job)).inserted_id))


@router.post("/{estilo_id}/aplicar", response_model=JobDoAlbumSaida, status_code=status.HTTP_202_ACCEPTED)
async def aplicar(estilo_id: str, dados: AplicarEstiloPessoalEntrada, usuario=Depends(usuario_atual),
                  db=Depends(obter_db)):
    estilo = await buscar_estilo(db, estilo_id, usuario)
    if not estilo.get("pares"):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Este estilo ainda não aprendeu nada: ensine com fotos editadas antes.")
    album = await _album(db, dados.album_id, usuario)
    job = montar_job("aplicar_estilo_pessoal", usuario["organizacao_id"],
                     {"estilo_id": str(estilo["_id"]), "album_id": str(album["_id"]), "midia_ids": dados.midia_ids,
                      "intensidade": dados.intensidade}, criado_por=usuario["_id"])
    return JobDoAlbumSaida(job_id=str((await db.jobs.insert_one(job)).inserted_id))


@router.get("/{estilo_id}/parecidas", response_model=list[ParecidaSaida])
async def parecidas(estilo_id: str, midia_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """As 5 fotos ensinadas mais parecidas com esta ("parece com estas fotos suas")."""
    estilo = await buscar_estilo(db, estilo_id, usuario)
    medidas = await db.fotos_medidas.find_one({"midia_id": _id(midia_id, "Foto não encontrada."),
                                               "organizacao_id": usuario["organizacao_id"]}, {"vetor": 1})
    if not medidas:
        return []
    from core.modelos.estilo_pessoal import Par

    pares = [Par(str(p["midia_id"]), np.frombuffer(bytes(p["vetor"]), np.float16).astype(np.float32), (0, 0, 0), {},
                 {}) async for p in db.estilo_pessoal_pares.find({"estilo_id": estilo["_id"]}, {"vetor": 1,
                                                                                               "midia_id": 1})]
    vetor = np.frombuffer(bytes(medidas["vetor"]), np.float16).astype(np.float32)
    return [ParecidaSaida(midia_id=pares[i].midia_id, semelhanca=round(c, 3)) for i, c in vizinhos(pares, vetor)
            if pares[i].midia_id != midia_id]
