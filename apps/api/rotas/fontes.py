# -----------------------------------------------
# TakeOne API — fontes do editor de imagem (ADR 0003, onda 13.8)
#
#   GET    /api/fontes                       o catálogo (as do servidor e a biblioteca de fontes livres da pasta)
#   GET    /api/fontes/arquivo/{nome}        o arquivo da fonte (público e guardado: o mesmo nome é o mesmo arquivo)
#   GET    /api/fontes/espaco                as fontes que o espaço enviou, no formato do catálogo
#   POST   /api/fontes/espaco?nome=...       o arquivo .ttf ou .otf no corpo (até 10 MB): lido, conferido e guardado
#   GET    /api/fontes/espaco/arquivo/{id}   o arquivo de uma fonte do espaço
#   DELETE /api/fontes/espaco/{id}           recusa a última fonte de uma família que algum texto usa
#
# O editor desenha o texto no navegador com estes arquivos (fontkit), na prévia e na exportação.
# -----------------------------------------------
import json
import logging
import re
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from core.config import FONTES_DA_BIBLIOTECA, TZ
from core.modelos.fontes import caminho_da_fonte, catalogo
from core.utils import storage
from core.utils.fonte_enviada import BYTES_MAXIMOS, EXTENSOES, ErroFonte, ler_fonte

router = APIRouter(prefix="/api/fontes", tags=["fontes"])


@router.get("")
async def listar_fontes():
    familias = await run_in_threadpool(catalogo, FONTES_DA_BIBLIOTECA)
    return Response(
        content=json.dumps(familias, ensure_ascii=False),
        media_type="application/json",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/arquivo/{nome}")
async def arquivo_da_fonte(nome: str):
    caminho = caminho_da_fonte(nome, FONTES_DA_BIBLIOTECA)
    if caminho is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fonte não encontrada.")
    return FileResponse(
        caminho,
        media_type="font/ttf",
        headers={"Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*"},
    )


# ——— As fontes do espaço ———


def id_da_familia(familia: str) -> str:
    """O id da família no catálogo: as fontes do espaço com o mesmo nome de família formam uma família só."""
    return "espaco-" + (re.sub(r"[^a-z0-9]+", "-", familia.lower()).strip("-") or "fonte")


def chave_da_fonte(organizacao_id, fonte_id, extensao: str) -> str:
    return f"org_{organizacao_id}/fontes/{fonte_id}{extensao}"


async def buscar_fonte(db, fonte_id: str, usuario: dict) -> dict:
    try:
        filtro = {"_id": ObjectId(fonte_id), "organizacao_id": usuario["organizacao_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fonte não encontrada.") from e
    fonte = await db.fontes_do_espaco.find_one(filtro)
    if fonte is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fonte não encontrada.")
    return fonte


@router.get("/espaco")
async def fontes_do_espaco(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    familias: dict[str, dict] = {}
    async for doc in db.fontes_do_espaco.find({"organizacao_id": usuario["organizacao_id"]}).sort("familia", 1):
        fid = id_da_familia(doc["familia"])
        familia = familias.setdefault(fid, {"id": fid, "nome": doc["familia"], "categoria": "espaco",
                                            "licenca": "Enviada pelo espaço", "estilos": []})
        familia["estilos"].append({"arquivo": f"espaco/{doc['_id']}", "italico": doc["italico"], "eixos": doc["eixos"],
                                   "peso": doc["peso"], "id": str(doc["_id"]), "estilo": doc.get("estilo", "")})
    return list(familias.values())


@router.post("/espaco", status_code=status.HTTP_201_CREATED)
async def enviar_fonte(request: Request, nome: str = Query(min_length=1, max_length=200),
                       usuario=Depends(usuario_atual), db=Depends(obter_db)):
    extensao = "." + nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
    if extensao not in EXTENSOES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Envie uma fonte .ttf ou .otf.")
    if int(request.headers.get("content-length") or 0) > BYTES_MAXIMOS:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "O arquivo passa de 10 MB.")
    corpo = await request.body()
    try:
        lida = await run_in_threadpool(ler_fonte, corpo)
    except ErroFonte as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    doc = {"_id": ObjectId(), "organizacao_id": usuario["organizacao_id"], "criado_por": usuario["_id"],
           "arquivo_original": nome[:200], "extensao": extensao, "tamanho": len(corpo), "criado_em": datetime.now(TZ),
           **lida}
    chave = chave_da_fonte(usuario["organizacao_id"], doc["_id"], extensao)
    await run_in_threadpool(storage.salvar_bytes, chave, corpo)
    await db.fontes_do_espaco.insert_one(doc)
    logging.info(f"[{usuario['organizacao_id']}] Fonte enviada: {lida['familia']} {lida['estilo']}")
    return {"id": str(doc["_id"]), "familia": lida["familia"], "familia_id": id_da_familia(lida["familia"]),
            "estilo": lida["estilo"], "peso": lida["peso"], "italico": lida["italico"], "eixos": lida["eixos"]}


@router.get("/espaco/arquivo/{fonte_id}")
async def arquivo_da_fonte_do_espaco(fonte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    fonte = await buscar_fonte(db, fonte_id, usuario)
    caminho = storage.caminho_local(chave_da_fonte(fonte["organizacao_id"], fonte["_id"], fonte["extensao"]))
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "O arquivo da fonte não foi encontrado no servidor.")
    # Outra versão do arquivo é outra fonte, com outro id
    return FileResponse(caminho, media_type=EXTENSOES[fonte["extensao"]],
                        headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.delete("/espaco/{fonte_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_fonte(fonte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    fonte = await buscar_fonte(db, fonte_id, usuario)
    fid = id_da_familia(fonte["familia"])
    outras = await db.fontes_do_espaco.count_documents({"organizacao_id": usuario["organizacao_id"],
                                                         "_id": {"$ne": fonte["_id"]}, "familia": fonte["familia"]})
    if not outras:
        usado = await db.projetos.find_one({"organizacao_id": usuario["organizacao_id"], "$or": [
            {"faixas.clipes.texto_rico.estilo.familia": fid},
            {"faixas.clipes.texto_rico.paragrafos.trechos.estilo.familia": fid},
        ]}, {"nome": 1})
        if usado:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f'O projeto "{usado["nome"]}" usa a fonte {fonte["familia"]}. '
                                "Troque a fonte dos textos antes de excluir.")
    await run_in_threadpool(storage.remover, chave_da_fonte(fonte["organizacao_id"], fonte["_id"], fonte["extensao"]))
    await db.fontes_do_espaco.delete_one({"_id": fonte["_id"]})
