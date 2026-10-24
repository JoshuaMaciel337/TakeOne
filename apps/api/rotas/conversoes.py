# -----------------------------------------------
# TakeOne API — conversão da imagem exportada (ADR 0003, onda 13.13)
#
#   POST /api/conversoes/imagem?formato=avif&qualidade=&envio=&parte=&total=
#                                 uma parte (até 8 MB) do PNG exportado; na última, a resposta é o arquivo convertido
#
# O PNG sobe em partes como as versões das camadas de pixels (o proxy do Next corta o corpo em 10 MB) e fica numa
# pasta temporária do espaço, que some quando a conversão termina.
# -----------------------------------------------
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from api.dependencias import usuario_atual
from core.utils import storage
from core.utils.conversao import FORMATOS_DA_CONVERSAO, converter_imagem
from core.utils.pixels import BYTES_DA_PARTE, BYTES_MAXIMOS, ErroPixels

router = APIRouter(prefix="/api/conversoes", tags=["conversoes"])

_ENVIO = re.compile(r"[0-9a-f]{16}")


@router.post("/imagem")
async def converter(request: Request, formato: str = Query(), qualidade: int = Query(default=80, ge=0, le=100),
                    envio: str = Query(), parte: int = Query(ge=0),
                    total: int = Query(ge=1, le=BYTES_MAXIMOS // BYTES_DA_PARTE + 1), usuario=Depends(usuario_atual)):
    """As partes vão em ordem; cada uma, menos a última, tem exatamente 8 MB. Na última, o arquivo volta inteiro."""
    if formato not in FORMATOS_DA_CONVERSAO or not _ENVIO.fullmatch(envio) or parte >= total:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Conversão inválida.")
    corpo = await request.body()
    ultima_parte = parte == total - 1
    if len(corpo) > BYTES_DA_PARTE or (not ultima_parte and len(corpo) != BYTES_DA_PARTE) or not corpo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Parte com o tamanho errado.")
    temporario = storage.caminho_local(f"org_{usuario['organizacao_id']}/conversoes/{envio}.png")

    def gravar() -> None:
        temporario.parent.mkdir(parents=True, exist_ok=True)
        recebido = temporario.stat().st_size if temporario.exists() else 0
        inicio = parte * BYTES_DA_PARTE
        if recebido < inicio:
            raise ErroPixels("Faltam partes antes desta. Exporte de novo.")
        with open(temporario, "r+b" if temporario.exists() else "wb") as arquivo:
            arquivo.seek(inicio)
            arquivo.write(corpo)
            arquivo.truncate()

    try:
        await run_in_threadpool(gravar)
        if not ultima_parte:
            return Response(status_code=status.HTTP_202_ACCEPTED)
        convertido = await run_in_threadpool(converter_imagem, temporario, formato, qualidade)
    except ErroPixels as erro:
        await run_in_threadpool(temporario.unlink, True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(erro)) from erro
    await run_in_threadpool(temporario.unlink, True)
    logging.info(f"[{usuario['organizacao_id']}] Imagem convertida para {formato} ({len(convertido)} bytes)")
    return Response(convertido, media_type=FORMATOS_DA_CONVERSAO[formato])
