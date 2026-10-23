# -----------------------------------------------
# TakeOne API — LUTs importadas (.cube)
#
#   POST   /api/luts?nome=...   o .cube no corpo (texto, até 10 MB): lido, conferido e guardado em float32
#   GET    /api/luts            as do espaço, da mais nova para a mais antiga
#   GET    /api/luts/{id}/dados a tabela (float32, R, G e B por ponto), para a prévia montar a mesma LUT 3D do render
#   DELETE /api/luts/{id}       recusa enquanto algum projeto usa a LUT
# -----------------------------------------------
import logging
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import LutSaida
from core.config import TZ
from core.utils import storage
from core.utils.lut import BYTES_MAXIMOS, ErroLut, chave_da_lut, ler_cube, para_bytes

router = APIRouter(prefix="/api/luts", tags=["luts"])


def para_saida(doc: dict) -> LutSaida:
    return LutSaida(id=str(doc["_id"]), nome=doc["nome"], tamanho=doc["tamanho"], minimo=doc["minimo"],
                    maximo=doc["maximo"], criado_em=doc["criado_em"])


async def buscar_lut(db, lut_id: str, usuario: dict) -> dict:
    try:
        filtro = {"_id": ObjectId(lut_id), "organizacao_id": usuario["organizacao_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "LUT não encontrada.") from e
    lut = await db.luts.find_one(filtro)
    if lut is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "LUT não encontrada.")
    return lut


@router.post("", response_model=LutSaida, status_code=status.HTTP_201_CREATED)
async def importar_lut(request: Request, nome: str = Query(min_length=1, max_length=120),
                       usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O .cube vai no corpo, como texto. O nome sem a extensão vira o nome da LUT."""
    tamanho = int(request.headers.get("content-length") or 0)
    if tamanho > BYTES_MAXIMOS:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "O arquivo passa de 10 MB.")
    corpo = await request.body()
    if len(corpo) > BYTES_MAXIMOS:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "O arquivo passa de 10 MB.")
    try:
        texto = corpo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = corpo.decode("latin-1")
    try:
        lut = await run_in_threadpool(ler_cube, texto)
    except ErroLut as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    nome_limpo = nome.rsplit(".", 1)[0] if nome.lower().endswith(".cube") else nome
    doc = {"organizacao_id": usuario["organizacao_id"], "criado_por": usuario["_id"],
           "nome": (nome_limpo.strip() or lut.titulo or "LUT")[:120], "tamanho": lut.tamanho,
           "minimo": list(lut.minimo), "maximo": list(lut.maximo), "criado_em": datetime.now(TZ)}
    doc["_id"] = ObjectId()
    await run_in_threadpool(storage.salvar_bytes, chave_da_lut(usuario["organizacao_id"], doc["_id"]), para_bytes(lut))
    await db.luts.insert_one(doc)
    logging.info(f"[{usuario['organizacao_id']}] LUT importada: {doc['nome']} ({lut.tamanho} pontos)")
    return para_saida(doc)


@router.get("", response_model=list[LutSaida])
async def listar_luts(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    cursor = db.luts.find({"organizacao_id": usuario["organizacao_id"]}).sort("criado_em", -1).limit(500)
    return [para_saida(doc) async for doc in cursor]


@router.get("/{lut_id}/dados")
async def dados_da_lut(lut_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    lut = await buscar_lut(db, lut_id, usuario)
    caminho = storage.caminho_local(chave_da_lut(lut["organizacao_id"], lut["_id"]))
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "O arquivo da LUT não foi encontrado no servidor.")
    conteudo = await run_in_threadpool(caminho.read_bytes)
    # A tabela de uma LUT nunca muda: outra versão é outra LUT, com outro id
    return Response(conteudo, media_type="application/octet-stream",
                    headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.delete("/{lut_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_lut(lut_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    lut = await buscar_lut(db, lut_id, usuario)
    usado = await db.projetos.find_one({"organizacao_id": usuario["organizacao_id"],
                                        "faixas.clipes.cor.lut.id": str(lut["_id"])}, {"nome": 1})
    if usado:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f'O projeto "{usado["nome"]}" usa esta LUT. Tire a LUT dos clipes antes de excluir.')
    await run_in_threadpool(storage.remover, chave_da_lut(lut["organizacao_id"], lut["_id"]))
    await db.luts.delete_one({"_id": lut["_id"]})
