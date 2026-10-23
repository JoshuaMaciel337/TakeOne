# -----------------------------------------------
# TakeOne API — pincéis do espaço (editor de imagem, ADR 0003, onda 13.2)
#
#   POST   /api/pinceis               um pincel: o nome, as opções (JSON do editor) e, se tiver, a ponta (PNG em base64)
#   GET    /api/pinceis               os do espaço, na ordem em que foram criados
#   GET    /api/pinceis/{id}/ponta.png a ponta (branco com o alfa da tinta)
#   DELETE /api/pinceis/{id}
#
# Os pincéis importados de um .abr e os salvos pela pessoa ("Novo pincel predefinido") ficam aqui. As opções são do
# editor (lib/pintura/traco.ts) e a API só guarda: quem lê é o navegador.
# -----------------------------------------------
import base64
import binascii
import io
import json
import logging
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from PIL import Image
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import PincelEntrada, PincelSaida
from core.config import TZ
from core.utils import storage

router = APIRouter(prefix="/api/pinceis", tags=["pinceis"])

PINCEIS_POR_ESPACO = 500
BYTES_DAS_OPCOES = 32 * 1024
BYTES_DA_PONTA = 4 * 1024 * 1024
LADO_MAXIMO_DA_PONTA = 2500


def chave_da_ponta(organizacao_id, pincel_id) -> str:
    return f"org_{organizacao_id}/pinceis/{pincel_id}/ponta.png"


def para_saida(doc: dict) -> PincelSaida:
    return PincelSaida(id=str(doc["_id"]), nome=doc["nome"], pasta=doc["pasta"], opcoes=doc["opcoes"],
                       tem_ponta=doc.get("ponta") is not None, ponta=doc.get("ponta"), criado_em=doc["criado_em"])


async def buscar_pincel(db, pincel_id: str, usuario: dict) -> dict:
    try:
        filtro = {"_id": ObjectId(pincel_id), "organizacao_id": usuario["organizacao_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pincel não encontrado.") from e
    pincel = await db.pinceis.find_one(filtro)
    if pincel is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pincel não encontrado.")
    return pincel


def _conferir_ponta(dados: bytes) -> dict:
    """A ponta precisa ser um PNG inteiro de até 2500 px de lado; devolve o tamanho."""
    try:
        with Image.open(io.BytesIO(dados)) as imagem:
            if imagem.format != "PNG":
                raise ValueError
            if max(imagem.size) > LADO_MAXIMO_DA_PONTA:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                    f"A ponta passa de {LADO_MAXIMO_DA_PONTA} px.")
            imagem.load()
            return {"largura": imagem.width, "altura": imagem.height}
    except HTTPException:
        raise
    except Exception as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A ponta precisa ser um PNG.") from erro


@router.post("", response_model=PincelSaida, status_code=status.HTTP_201_CREATED)
async def criar_pincel(dados: PincelEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    if len(json.dumps(dados.opcoes)) > BYTES_DAS_OPCOES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "As opções do pincel passam de 32 KB.")
    if await db.pinceis.count_documents({"organizacao_id": usuario["organizacao_id"]}) >= PINCEIS_POR_ESPACO:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"O espaço já tem {PINCEIS_POR_ESPACO} pincéis. Exclua alguns antes de criar outros.")
    ponta_png = None
    if dados.ponta_png:
        try:
            ponta_png = base64.b64decode(dados.ponta_png, validate=True)
        except (binascii.Error, ValueError) as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A ponta veio estragada.") from erro
        if len(ponta_png) > BYTES_DA_PONTA:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A ponta passa de 4 MB.")
    doc = {"_id": ObjectId(), "organizacao_id": usuario["organizacao_id"], "criado_por": usuario["_id"],
           "nome": dados.nome.strip(), "pasta": dados.pasta, "opcoes": dados.opcoes, "ponta": None,
           "criado_em": datetime.now(TZ)}
    if ponta_png is not None:
        doc["ponta"] = await run_in_threadpool(_conferir_ponta, ponta_png)
        await run_in_threadpool(storage.salvar_bytes, chave_da_ponta(usuario["organizacao_id"], doc["_id"]), ponta_png)
    await db.pinceis.insert_one(doc)
    logging.info(f"[{usuario['organizacao_id']}] Pincel criado: {doc['nome']}")
    return para_saida(doc)


@router.get("", response_model=list[PincelSaida])
async def listar_pinceis(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    filtro = {"organizacao_id": usuario["organizacao_id"]}
    cursor = db.pinceis.find(filtro).sort("criado_em", 1).limit(PINCEIS_POR_ESPACO)
    return [para_saida(doc) async for doc in cursor]


@router.get("/{pincel_id}/ponta.png")
async def ponta_do_pincel(pincel_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    pincel = await buscar_pincel(db, pincel_id, usuario)
    caminho = storage.caminho_local(chave_da_ponta(pincel["organizacao_id"], pincel["_id"]))
    if pincel.get("ponta") is None or not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Este pincel não tem ponta própria.")
    conteudo = await run_in_threadpool(caminho.read_bytes)
    # A ponta de um pincel nunca muda: outra ponta é outro pincel
    return Response(conteudo, media_type="image/png", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.delete("/{pincel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_pincel(pincel_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    pincel = await buscar_pincel(db, pincel_id, usuario)
    if pincel.get("ponta") is not None:
        await run_in_threadpool(storage.remover, chave_da_ponta(pincel["organizacao_id"], pincel["_id"]))
    await db.pinceis.delete_one({"_id": pincel["_id"]})
    logging.info(f"[{usuario['organizacao_id']}] Pincel excluído: {pincel['nome']}")
