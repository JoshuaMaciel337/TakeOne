# -----------------------------------------------
# TakeOne API — as automações do Clipar (ADR 0004, 14.9)
#
#   POST   /api/esteiras                 fazer tudo sozinho: do link (ou do vídeo enviado) aos cortes exportados
#   GET    /api/esteiras                 as esteiras do espaço, das mais novas
#   DELETE /api/esteiras/{id}            para a esteira (a que acabou sai da lista)
#   GET    /api/automacoes               os canais que o espaço acompanha
#   POST   /api/automacoes               acompanhar um canal do YouTube: cada vídeo novo vira uma esteira
#   PATCH  /api/automacoes/{id}          ligar, desligar, mudar as opções ou o horário
#   POST   /api/automacoes/{id}/verificar  olhar o canal agora
#   DELETE /api/automacoes/{id}
#
# A esteira anda sozinha pelo laço do worker da montagem (core/utils/esteiras.py); aqui só nasce, é lida e para.
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    AutomacaoEntrada,
    AutomacaoMudanca,
    AutomacaoSaida,
    EsteiraEntrada,
    EsteiraSaida,
    automacao_para_saida,
    esteira_para_saida,
)
from api.rotas.midias import importar_do_link
from core.modelos import automacao as a
from core.modelos.job import ErroDefinitivo
from core.utils.link import ErroImportacao, resolver_canal
from core.utils.mongo import agora

router = APIRouter(prefix="/api", tags=["automacoes"])


def _oid(valor: str, mensagem: str) -> ObjectId:
    try:
        return ObjectId(valor)
    except InvalidId:
        raise HTTPException(status.HTTP_404_NOT_FOUND, mensagem) from None


# -----------------------------------------------
# AS ESTEIRAS
# -----------------------------------------------
@router.post("/esteiras", response_model=EsteiraSaida, status_code=status.HTTP_201_CREATED)
async def criar_esteira(dados: EsteiraEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O vídeo entra (o link baixa agora, mesmo com horário), e a esteira procura os cortes, monta e exporta os
    melhores sem a página aberta."""
    if dados.url:
        midia = await importar_do_link(db, usuario, dados.url, dados.titulo)
        origem = "link"
    else:
        midia = await db.midias.find_one({"_id": _oid(dados.midia_id, "Vídeo não encontrado."),
                                          "organizacao_id": usuario["organizacao_id"]})
        if midia is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Vídeo não encontrado.")
        if midia.get("imagem"):
            raise HTTPException(status.HTTP_409_CONFLICT, "O Clipar procura os cortes pela fala: escolha um vídeo.")
        origem = "envio"
    ativa = await db.esteiras.find_one({"organizacao_id": usuario["organizacao_id"], "midia_id": midia["_id"],
                                        "status": {"$in": list(a.ATIVAS)}}, {"_id": 1})
    if ativa:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este vídeo já está numa esteira.")
    esteira = a.montar_esteira(usuario["organizacao_id"], usuario["_id"], origem, dados.opcoes.model_dump(),
                               dados.quantos, dados.resolucao, dados.horario, midia_id=midia["_id"],
                               titulo=dados.titulo or midia.get("nome") or "")
    esteira["_id"] = (await db.esteiras.insert_one(esteira)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Esteira pedida ({origem}): {esteira['titulo']}, "
                 f"{dados.quantos} cortes{f' às {dados.horario}' if dados.horario else ''}")
    return esteira_para_saida(esteira)


@router.get("/esteiras", response_model=list[EsteiraSaida])
async def listar_esteiras(limite: int = Query(default=30, ge=1, le=100), usuario=Depends(usuario_atual),
                          db=Depends(obter_db)):
    cursor = db.esteiras.find({"organizacao_id": usuario["organizacao_id"]}).sort("criado_em", -1).limit(limite)
    return [esteira_para_saida(doc) async for doc in cursor]


@router.delete("/esteiras/{esteira_id}", status_code=status.HTTP_204_NO_CONTENT)
async def parar_esteira(esteira_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A que ainda anda para (o que já foi feito, como a clipagem e os vídeos, continua); a que acabou sai da
    lista."""
    filtro = {"_id": _oid(esteira_id, "Esteira não encontrada."), "organizacao_id": usuario["organizacao_id"]}
    esteira = await db.esteiras.find_one(filtro, {"status": 1})
    if esteira is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esteira não encontrada.")
    if esteira["status"] in a.ATIVAS:
        await db.esteiras.update_one(filtro, {"$set": {"status": a.CANCELADA, "concluida_em": agora(),
                                                       "atualizado_em": agora()}})
    else:
        await db.esteiras.delete_one(filtro)


# -----------------------------------------------
# OS CANAIS
# -----------------------------------------------
async def _buscar_automacao(db, automacao_id: str, usuario: dict) -> dict:
    doc = await db.automacoes.find_one({"_id": _oid(automacao_id, "Automação não encontrada."),
                                        "organizacao_id": usuario["organizacao_id"]})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Automação não encontrada.")
    return doc


@router.get("/automacoes", response_model=list[AutomacaoSaida])
async def listar_automacoes(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    cursor = db.automacoes.find({"organizacao_id": usuario["organizacao_id"]}).sort("criado_em", 1)
    return [automacao_para_saida(doc) async for doc in cursor]


@router.post("/automacoes", response_model=AutomacaoSaida, status_code=status.HTTP_201_CREATED)
async def criar_automacao(dados: AutomacaoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O canal é conferido agora (o @ vira o id que o feed pede, e o nome dele aparece na lista)."""
    try:
        canal = a.normalizar_canal(dados.canal)
    except ValueError as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(erro)) from None
    try:
        canal_id, nome = await run_in_threadpool(resolver_canal, canal["handle"] or f"channel/{canal['id']}")
    except ErroImportacao as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(erro)) from erro
    except ErroDefinitivo as erro:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(erro)) from erro
    filtro = {"organizacao_id": usuario["organizacao_id"]}
    if await db.automacoes.find_one({**filtro, "canal.id": canal_id}, {"_id": 1}):
        raise HTTPException(status.HTTP_409_CONFLICT, "Este canal já é acompanhado.")
    if await db.automacoes.count_documents(filtro) >= a.MAXIMO_DE_AUTOMACOES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Dá para acompanhar até {a.MAXIMO_DE_AUTOMACOES} canais.")
    doc = a.montar_automacao(usuario["organizacao_id"], usuario["_id"], {**canal, "id": canal_id}, nome,
                             dados.opcoes.model_dump(), dados.quantos, dados.resolucao, dados.horario,
                             dados.duracao_minima)
    doc["_id"] = (await db.automacoes.insert_one(doc)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Canal acompanhado: {nome} ({canal_id})")
    return automacao_para_saida(doc)


@router.patch("/automacoes/{automacao_id}", response_model=AutomacaoSaida)
async def mudar_automacao(automacao_id: str, dados: AutomacaoMudanca, usuario=Depends(usuario_atual),
                          db=Depends(obter_db)):
    doc = await _buscar_automacao(db, automacao_id, usuario)
    campos = dados.model_dump(exclude_unset=True, exclude_none=True)
    if "opcoes" in campos:
        campos["opcoes"] = {**campos["opcoes"], "inicio": 0, "fim": None}
    if campos.get("horario") == "":
        campos["horario"] = None
    if campos.get("ativa") and not doc["ativa"]:
        # Religada: olha o canal na próxima volta
        campos["proxima_verificacao"] = agora()
    if campos:
        await db.automacoes.update_one({"_id": doc["_id"]}, {"$set": {**campos, "atualizado_em": agora()}})
    return automacao_para_saida(await _buscar_automacao(db, automacao_id, usuario))


@router.post("/automacoes/{automacao_id}/verificar", response_model=AutomacaoSaida)
async def verificar_agora(automacao_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    doc = await _buscar_automacao(db, automacao_id, usuario)
    await db.automacoes.update_one({"_id": doc["_id"]}, {"$set": {"proxima_verificacao": agora()}})
    return automacao_para_saida(doc)


@router.delete("/automacoes/{automacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_automacao(automacao_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """As esteiras que o canal já começou continuam."""
    doc = await _buscar_automacao(db, automacao_id, usuario)
    await db.automacoes.delete_one({"_id": doc["_id"]})
