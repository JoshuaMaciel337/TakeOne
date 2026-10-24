# -----------------------------------------------
# TakeOne API — degradês, padrões, formas personalizadas e estilos de texto do espaço (editor de imagem, ADR 0003)
#
#   POST   /api/recursos                 um degradê (as paradas, em JSON), um padrão (o ladrilho, PNG em base64) ou uma
#                                        forma personalizada (os caminhos, em JSON)
#   GET    /api/recursos?tipo=degrade    os do espaço daquele tipo, na ordem em que foram criados
#   GET    /api/recursos/{id}/imagem.png o ladrilho do padrão
#   DELETE /api/recursos/{id}
#
# Como os pincéis do espaço: os dados são do editor (lib/pintura/degrade.ts) e a API só guarda.
# -----------------------------------------------
import base64
import binascii
import io
import json
import logging
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from PIL import Image
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    EstiloDoCaractereEntrada,
    EstiloDoParagrafoEntrada,
    RecursoEntrada,
    RecursoSaida,
    SubcaminhoEntrada,
)
from core.config import TZ
from core.utils import storage

router = APIRouter(prefix="/api/recursos", tags=["recursos"])

RECURSOS_POR_TIPO = 500
BYTES_DOS_DADOS = 32 * 1024
# Uma forma personalizada tem muitos pontos (um contorno vindo de uma seleção, por exemplo)
BYTES_DA_FORMA = 512 * 1024
PONTOS_DA_FORMA = 10_000
BYTES_DA_IMAGEM = 4 * 1024 * 1024
LADO_MAXIMO_DA_IMAGEM = 2048


def chave_da_imagem(organizacao_id, recurso_id) -> str:
    return f"org_{organizacao_id}/recursos/{recurso_id}/imagem.png"


def para_saida(doc: dict) -> RecursoSaida:
    return RecursoSaida(id=str(doc["_id"]), tipo=doc["tipo"], nome=doc["nome"], dados=doc.get("dados") or {},
                        imagem=doc.get("imagem"), criado_em=doc["criado_em"])


async def buscar_recurso(db, recurso_id: str, usuario: dict) -> dict:
    try:
        filtro = {"_id": ObjectId(recurso_id), "organizacao_id": usuario["organizacao_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Não encontrado.") from e
    recurso = await db.recursos.find_one(filtro)
    if recurso is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Não encontrado.")
    return recurso


def _conferir_imagem(dados: bytes) -> dict:
    """O ladrilho precisa ser um PNG inteiro de até 2048 px de lado; devolve o tamanho."""
    try:
        with Image.open(io.BytesIO(dados)) as imagem:
            if imagem.format != "PNG":
                raise ValueError
            if max(imagem.size) > LADO_MAXIMO_DA_IMAGEM:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                    f"O padrão passa de {LADO_MAXIMO_DA_IMAGEM} px.")
            imagem.load()
            return {"largura": imagem.width, "altura": imagem.height}
    except HTTPException:
        raise
    except Exception as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "O padrão precisa ser um PNG.") from erro


def _conferir_forma(dados: dict) -> list[dict]:
    """Os caminhos da forma, conferidos como os das camadas vetoriais (apps/api/esquemas.py, SubcaminhoEntrada)."""
    try:
        caminhos = [SubcaminhoEntrada.model_validate(sub) for sub in dados.get("subcaminhos") or []]
    except (ValidationError, TypeError, AttributeError) as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Os caminhos da forma vieram estragados.") from erro
    if not caminhos or sum(len(sub.nos) for sub in caminhos) > PONTOS_DA_FORMA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"A forma precisa ter de 1 a {PONTOS_DA_FORMA} pontos.")
    return [sub.model_dump() for sub in caminhos]


def _conferir_estilo(tipo: str, dados: dict) -> dict:
    """O estilo de caractere ou de parágrafo, conferido como o de um trecho ou de um parágrafo do texto."""
    esquema = EstiloDoCaractereEntrada if tipo == "estilo_caractere" else EstiloDoParagrafoEntrada
    try:
        estilo = esquema.model_validate(dados.get("estilo") or {})
    except (ValidationError, TypeError, AttributeError) as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "O estilo veio estragado.") from erro
    if not estilo.model_fields_set:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "O estilo está vazio.")
    return {"estilo": estilo.model_dump()}


@router.post("", response_model=RecursoSaida, status_code=status.HTTP_201_CREATED)
async def criar_recurso(dados: RecursoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    limite = BYTES_DA_FORMA if dados.tipo == "forma" else BYTES_DOS_DADOS
    if len(json.dumps(dados.dados)) > limite:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Os dados passam de {limite // 1024} KB.")
    if dados.tipo == "forma":
        dados.dados = {"subcaminhos": _conferir_forma(dados.dados)}
    if dados.tipo in ("estilo_caractere", "estilo_paragrafo"):
        dados.dados = _conferir_estilo(dados.tipo, dados.dados)
    if dados.tipo == "padrao" and not dados.imagem_png:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "O padrão precisa do ladrilho.")
    filtro = {"organizacao_id": usuario["organizacao_id"], "tipo": dados.tipo}
    if await db.recursos.count_documents(filtro) >= RECURSOS_POR_TIPO:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"O espaço já tem {RECURSOS_POR_TIPO} desses. Exclua alguns antes de criar outros.")
    imagem_png = None
    if dados.imagem_png:
        try:
            imagem_png = base64.b64decode(dados.imagem_png, validate=True)
        except (binascii.Error, ValueError) as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A imagem veio estragada.") from erro
        if len(imagem_png) > BYTES_DA_IMAGEM:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A imagem passa de 4 MB.")
    doc = {"_id": ObjectId(), "organizacao_id": usuario["organizacao_id"], "criado_por": usuario["_id"],
           "tipo": dados.tipo, "nome": dados.nome.strip(), "dados": dados.dados, "imagem": None,
           "criado_em": datetime.now(TZ)}
    if imagem_png is not None:
        doc["imagem"] = await run_in_threadpool(_conferir_imagem, imagem_png)
        await run_in_threadpool(storage.salvar_bytes, chave_da_imagem(usuario["organizacao_id"], doc["_id"]),
                                imagem_png)
    await db.recursos.insert_one(doc)
    logging.info(f"[{usuario['organizacao_id']}] Recurso criado ({doc['tipo']}): {doc['nome']}")
    return para_saida(doc)


@router.get("", response_model=list[RecursoSaida])
async def listar_recursos(tipo: str = Query(pattern="^(degrade|padrao|forma|estilo_caractere|estilo_paragrafo)$"),
                          usuario=Depends(usuario_atual),
                          db=Depends(obter_db)):
    filtro = {"organizacao_id": usuario["organizacao_id"], "tipo": tipo}
    cursor = db.recursos.find(filtro).sort("criado_em", 1).limit(RECURSOS_POR_TIPO)
    return [para_saida(doc) async for doc in cursor]


@router.get("/{recurso_id}/imagem.png")
async def imagem_do_recurso(recurso_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    recurso = await buscar_recurso(db, recurso_id, usuario)
    caminho = storage.caminho_local(chave_da_imagem(recurso["organizacao_id"], recurso["_id"]))
    if recurso.get("imagem") is None or not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Este recurso não tem imagem.")
    conteudo = await run_in_threadpool(caminho.read_bytes)
    # O ladrilho nunca muda: outro ladrilho é outro padrão
    return Response(conteudo, media_type="image/png", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.delete("/{recurso_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_recurso(recurso_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    recurso = await buscar_recurso(db, recurso_id, usuario)
    if recurso.get("imagem") is not None:
        await run_in_threadpool(storage.remover, chave_da_imagem(recurso["organizacao_id"], recurso["_id"]))
    await db.recursos.delete_one({"_id": recurso["_id"]})
    logging.info(f"[{usuario['organizacao_id']}] Recurso excluído ({recurso['tipo']}): {recurso['nome']}")
