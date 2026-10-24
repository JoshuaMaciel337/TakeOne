# -----------------------------------------------
# TakeOne API — fontes do editor de imagem (ADR 0003, onda 13.8)
#
#   GET /api/fontes                  o catálogo (as do servidor e a biblioteca de fontes livres que está na pasta)
#   GET /api/fontes/arquivo/{nome}   o arquivo da fonte (público e guardado: o mesmo nome é sempre o mesmo arquivo)
#
# O editor desenha o texto no navegador com estes arquivos (fontkit), na prévia e na exportação.
# -----------------------------------------------
import json

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from core.config import FONTES_DA_BIBLIOTECA
from core.modelos.fontes import caminho_da_fonte, catalogo

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
