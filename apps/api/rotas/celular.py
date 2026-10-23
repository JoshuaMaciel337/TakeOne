# -----------------------------------------------
# TakeOne API — baixar no celular pelo QR code (do HolyCut)
#
#   GET /api/baixar/{token}   público: o vídeo daquele link, como download
#   GET /api/qrcode.svg       o QR code de um endereço, para mostrar na tela
#
# O token vale 24 horas e só abre aquele vídeo (core/modelos/exportacao.py).
# -----------------------------------------------
import io
from pathlib import Path

import segno
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

from api.dependencias import obter_db, usuario_atual
from core.modelos.exportacao import (
    STATUS_PRONTA,
    TIPOS_DOS_ARQUIVOS,
    arquivo_do_formato,
    chave_exportacao,
    hash_do_token,
    link_vencido,
    nome_de_arquivo,
)
from core.utils import storage

router = APIRouter(prefix="/api", tags=["celular"])

MENSAGEM_LINK_INVALIDO = "Este link não vale mais. Gere um QR code novo no TakeOne."


@router.get("/baixar/{token}")
async def baixar_pelo_link(token: str, db=Depends(obter_db)):
    exportacao = await db.exportacoes.find_one({"link_celular.token_hash": hash_do_token(token)}) if token else None
    if exportacao is None or exportacao["status"] != STATUS_PRONTA or link_vencido(exportacao.get("link_celular")):
        raise HTTPException(status.HTTP_404_NOT_FOUND, MENSAGEM_LINK_INVALIDO)
    arquivo = arquivo_do_formato(exportacao.get("formato"))
    caminho = storage.caminho_local(chave_exportacao(exportacao["organizacao_id"], exportacao["_id"], arquivo))
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "O arquivo não foi encontrado no servidor.")
    return FileResponse(caminho, media_type=TIPOS_DOS_ARQUIVOS[arquivo],
                        filename=nome_de_arquivo(exportacao["nome"], Path(arquivo).suffix),
                        headers={"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"})


@router.get("/qrcode.svg")
async def qrcode(texto: str = Query(min_length=1, max_length=400), _usuario=Depends(usuario_atual)):
    """
    Preto no branco, com margem: é o que as câmeras de celular leem melhor. Sai como arquivo SVG
    completo (com o xmlns): o svg_inline do segno é para embutir no HTML e não abre num <img>.
    """
    svg = io.BytesIO()
    segno.make(texto, error="m").save(svg, kind="svg", scale=8, border=3, dark="#000000", light="#ffffff",
                                      xmldecl=False)
    return Response(svg.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "private, no-store"})
