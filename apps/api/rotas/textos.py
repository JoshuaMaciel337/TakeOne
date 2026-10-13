# -----------------------------------------------
# TakeOne API — imagem dos clipes de texto
#
# A prévia pede aqui o PNG de cada texto, desenhado pelo mesmo código que o render usa
# (core/utils/texto.py). Assim o texto do editor é o mesmo que sai no vídeo.
# -----------------------------------------------
from fastapi import APIRouter, Depends, Response
from starlette.concurrency import run_in_threadpool

from api.dependencias import usuario_atual
from api.esquemas import ImagemTextoEntrada
from core.utils.texto import desenhar_texto, para_png

router = APIRouter(prefix="/api/textos", tags=["textos"])


@router.post("/imagem")
async def imagem_do_texto(dados: ImagemTextoEntrada, _usuario=Depends(usuario_atual)):
    """O bloco de texto num PNG transparente, para um quadro com o lado menor pedido."""
    imagem = await run_in_threadpool(desenhar_texto, dados.texto.model_dump(), dados.lado_menor)
    png = await run_in_threadpool(para_png, imagem)
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})
