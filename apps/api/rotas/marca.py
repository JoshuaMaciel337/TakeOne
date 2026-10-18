# -----------------------------------------------
# TakeOne API — kit de marca do espaço
#
# As cores, as fontes de título e de texto e o logo (uma imagem da biblioteca) de cada espaço, guardados
# no documento da organização (campo `marca`). O editor usa o kit para pôr o logo no vídeo, aplicar a
# fonte e a cor aos textos e oferecer as cores nos seletores e nas animações.
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import MarcaEntrada, MarcaSaida
from core.modelos.midia import STATUS_PRONTA, e_imagem
from core.utils.mongo import agora

router = APIRouter(prefix="/api/marca", tags=["marca"])

MARCA_PADRAO = {"cores": [], "fonte_titulo": "display", "fonte_texto": "texto", "logo_midia_id": None}


def marca_para_saida(organizacao: dict | None) -> MarcaSaida:
    marca = {**MARCA_PADRAO, **((organizacao or {}).get("marca") or {})}
    logo = marca.get("logo_midia_id")
    return MarcaSaida(**{**marca, "logo_midia_id": str(logo) if logo else None})


@router.get("", response_model=MarcaSaida)
async def ver_marca(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    return marca_para_saida(await db.organizacoes.find_one({"_id": usuario["organizacao_id"]}, {"marca": 1}))


@router.put("", response_model=MarcaSaida)
async def salvar_marca(dados: MarcaEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Troca o kit inteiro. O logo precisa ser uma imagem pronta da biblioteca do espaço."""
    logo = None
    if dados.logo_midia_id:
        try:
            logo = ObjectId(dados.logo_midia_id)
        except InvalidId as e:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Mídia não encontrada.") from e
        midia = await db.midias.find_one({"_id": logo, "organizacao_id": usuario["organizacao_id"]})
        if midia is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Mídia não encontrada.")
        if not e_imagem(midia) or midia["status"] != STATUS_PRONTA:
            raise HTTPException(status.HTTP_409_CONFLICT, "O logo precisa ser uma imagem pronta da biblioteca.")
    marca = {**dados.model_dump(), "logo_midia_id": logo}
    await db.organizacoes.update_one({"_id": usuario["organizacao_id"]},
                                     {"$set": {"marca": marca, "atualizado_em": agora()}})
    logging.info(f"[{usuario['organizacao_id']}] Kit de marca salvo: {len(marca['cores'])} cores.")
    return marca_para_saida({"marca": marca})
