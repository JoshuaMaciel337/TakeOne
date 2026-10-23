# -----------------------------------------------
# TakeOne API — chaves de acesso
#
#   GET    /api/chaves        as da pessoa (o nome, o começo da chave, quando foi criada e usada)
#   POST   /api/chaves        cria uma; a chave inteira só aparece nesta resposta
#   DELETE /api/chaves/{id}   apaga (o programa que usava para de entrar na hora)
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import ChaveCriadaSaida, ChaveEntrada, ChaveSaida
from core.modelos.chave import CHAVES_MAXIMAS, montar_chave

router = APIRouter(prefix="/api/chaves", tags=["chaves"])


def para_saida(doc: dict) -> ChaveSaida:
    return ChaveSaida(id=str(doc["_id"]), nome=doc["nome"], inicio=doc["inicio"], criado_em=doc["criado_em"],
                      usado_em=doc.get("usado_em"))


@router.get("", response_model=list[ChaveSaida])
async def listar_chaves(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    cursor = db.chaves_de_acesso.find({"usuario_id": usuario["_id"]}).sort("criado_em", -1)
    return [para_saida(doc) async for doc in cursor]


@router.post("", response_model=ChaveCriadaSaida, status_code=status.HTTP_201_CREATED)
async def criar_chave(dados: ChaveEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    # Uma chave não cria outra: quem a tem não ganha acesso duradouro além do que já tem
    if usuario.get("_pela_chave"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Crie chaves pelo site, entrando com a senha.")
    if await db.chaves_de_acesso.count_documents({"usuario_id": usuario["_id"]}) >= CHAVES_MAXIMAS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Dá para ter até {CHAVES_MAXIMAS} chaves. Apague uma antes.")
    chave, doc = montar_chave(usuario["organizacao_id"], usuario["_id"], dados.nome.strip())
    doc["_id"] = (await db.chaves_de_acesso.insert_one(doc)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Chave de acesso criada: {doc['nome']} ({doc['inicio']}…)")
    return ChaveCriadaSaida(**para_saida(doc).model_dump(), chave=chave)


@router.delete("/{chave_id}", status_code=status.HTTP_204_NO_CONTENT)
async def apagar_chave(chave_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    try:
        filtro = {"_id": ObjectId(chave_id), "usuario_id": usuario["_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chave não encontrada.") from e
    if (await db.chaves_de_acesso.delete_one(filtro)).deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chave não encontrada.")
