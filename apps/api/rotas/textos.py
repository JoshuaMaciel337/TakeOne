# -----------------------------------------------
# TakeOne API — imagem dos clipes de texto
#
# A prévia pede aqui o PNG de cada texto, desenhado pelo mesmo código que o render usa
# (core/utils/texto.py). Assim o texto do editor é o mesmo que sai no vídeo.
# -----------------------------------------------
import json

from fastapi import APIRouter, Depends, Response
from starlette.concurrency import run_in_threadpool

from api.dependencias import usuario_atual
from api.esquemas import ImagemTextoEntrada
from core.utils.texto import desenhar_texto, layout_do_texto, para_png

router = APIRouter(prefix="/api/textos", tags=["textos"])


@router.post("/imagem")
async def imagem_do_texto(dados: ImagemTextoEntrada, _usuario=Depends(usuario_atual)):
    """
    O bloco de texto num PNG transparente, para um quadro com o lado menor pedido. O cabeçalho
    X-Layout-Texto diz onde fica cada letra, para a prévia mostrar o texto letra a letra.
    """
    texto = dados.texto.model_dump()
    imagem = await run_in_threadpool(desenhar_texto, texto, dados.lado_menor)
    png = await run_in_threadpool(para_png, imagem)
    layout = await run_in_threadpool(layout_do_texto, texto, dados.lado_menor)
    return Response(png, media_type="image/png", headers={
        "Cache-Control": "private, max-age=3600",
        "X-Layout-Texto": json.dumps(layout, separators=(",", ":")),
    })
