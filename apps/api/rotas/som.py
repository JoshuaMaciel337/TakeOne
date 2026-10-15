# -----------------------------------------------
# TakeOne API — arquivos do som
#
# A resposta ao impulso do reverb (core/utils/som.py): a prévia faz a convolução no navegador com
# o mesmo arquivo que o worker usa no render.
# -----------------------------------------------
from functools import lru_cache

from fastapi import APIRouter, Response

from core.utils.som import wav_do_reverb

router = APIRouter(prefix="/api/som", tags=["som"])


@lru_cache(maxsize=1)
def _reverb() -> bytes:
    return wav_do_reverb()


@router.get("/reverb.wav")
def reverb():
    """O mesmo para todo mundo: o navegador guarda por um dia."""
    return Response(_reverb(), media_type="audio/wav", headers={"Cache-Control": "public, max-age=86400"})
