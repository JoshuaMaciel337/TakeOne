# -----------------------------------------------
# TakeOne API — o link de aprovação (público, sem conta; do HolyCut)
#
#   GET    /api/aprovar/{token}                  a exportação e a situação do pedido
#   GET    /api/aprovar/{token}/arquivo          o arquivo, para assistir (aceita leitura por partes)
#   POST   /api/aprovar/{token}/anotacoes        uma anotação num instante do vídeo
#   DELETE /api/aprovar/{token}/anotacoes/{id}   tira uma anotação antes de responder
#   POST   /api/aprovar/{token}                  aprova ou pede ajustes
#
# O token vale como senha daquela exportação: é aleatório (256 bits), o banco guarda só o hash, e ele
# não abre nada além dela (core/modelos/aprovacao.py).
# -----------------------------------------------
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from api.dependencias import obter_db
from api.esquemas import AnotacaoEntrada, AprovacaoPublicaSaida, AprovacaoRespostaEntrada, aprovacao_para_saida
from core.modelos.aprovacao import ANOTACOES_MAXIMAS, PENDENTE, expirada, hash_do_token, montar_anotacao, responder
from core.modelos.exportacao import STATUS_PRONTA, TIPOS_DOS_ARQUIVOS, arquivo_do_formato, chave_exportacao
from core.utils import storage

router = APIRouter(prefix="/api/aprovar", tags=["aprovação"])

MENSAGEM_LINK_INVALIDO = "Este link não vale mais. Peça um novo a quem enviou."
MENSAGEM_EXPIRADO = "Este link expirou. Peça um novo a quem enviou."
MENSAGEM_RESPONDIDO = "Este vídeo já foi respondido."
MENSAGEM_MUDOU = "O pedido mudou. Abra o link de novo."


async def buscar_pelo_token(db, token: str) -> dict:
    exportacao = await db.exportacoes.find_one({"aprovacao.token_hash": hash_do_token(token)},
                                               {"projeto": 0}) if token else None
    if exportacao is None or exportacao["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_404_NOT_FOUND, MENSAGEM_LINK_INVALIDO)
    return exportacao


def conferir_pendente(aprovacao: dict):
    if aprovacao["status"] != PENDENTE:
        raise HTTPException(status.HTTP_409_CONFLICT, MENSAGEM_RESPONDIDO)
    if expirada(aprovacao):
        raise HTTPException(status.HTTP_410_GONE, MENSAGEM_EXPIRADO)


def filtro_do_pedido(exportacao: dict) -> dict:
    """A mesma exportação, com o mesmo link e ainda sem resposta: quem grava confere isso no próprio filtro."""
    return {"_id": exportacao["_id"], "aprovacao.token_hash": exportacao["aprovacao"]["token_hash"],
            "aprovacao.status": PENDENTE}


async def para_saida(db, exportacao: dict) -> AprovacaoPublicaSaida:
    organizacao = await db.organizacoes.find_one({"_id": exportacao["organizacao_id"]}, {"nome": 1}) or {}
    return AprovacaoPublicaSaida.model_validate({
        **exportacao, "espaco": organizacao.get("nome", ""), "formato": exportacao.get("formato") or "mp4",
        "aprovacao": aprovacao_para_saida(exportacao["aprovacao"]),
    })


@router.get("/{token}", response_model=AprovacaoPublicaSaida)
async def ver_pedido(token: str, db=Depends(obter_db)):
    return await para_saida(db, await buscar_pelo_token(db, token))


@router.get("/{token}/arquivo")
async def assistir(token: str, db=Depends(obter_db)):
    exportacao = await buscar_pelo_token(db, token)
    if expirada(exportacao["aprovacao"]):
        raise HTTPException(status.HTTP_410_GONE, MENSAGEM_EXPIRADO)
    nome = arquivo_do_formato(exportacao.get("formato"))
    caminho = storage.caminho_local(chave_exportacao(exportacao["organizacao_id"], exportacao["_id"], nome))
    if nome not in exportacao.get("arquivos", []) or not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "O arquivo não foi encontrado no servidor.")
    return FileResponse(caminho, media_type=TIPOS_DOS_ARQUIVOS[nome],
                        headers={"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"})


@router.post("/{token}/anotacoes", response_model=AprovacaoPublicaSaida)
async def anotar(token: str, dados: AnotacaoEntrada, db=Depends(obter_db)):
    exportacao = await buscar_pelo_token(db, token)
    aprovacao = exportacao["aprovacao"]
    conferir_pendente(aprovacao)
    if len(aprovacao.get("anotacoes", [])) >= ANOTACOES_MAXIMAS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"O pedido aceita no máximo {ANOTACOES_MAXIMAS} anotações. Junte as que puder.")
    try:
        anotacao = montar_anotacao(dados.tempo, dados.texto, dados.nome, exportacao.get("duracao"))
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    # O limite também vai no filtro: duas abas anotando juntas não passam dele
    filtro = {**filtro_do_pedido(exportacao), f"aprovacao.anotacoes.{ANOTACOES_MAXIMAS - 1}": {"$exists": False}}
    resultado = await db.exportacoes.update_one(
        filtro, {"$push": {"aprovacao.anotacoes": {"$each": [anotacao], "$sort": {"tempo": 1}}}})
    if resultado.matched_count == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, MENSAGEM_MUDOU)
    return await para_saida(db, await buscar_pelo_token(db, token))


@router.delete("/{token}/anotacoes/{anotacao_id}", response_model=AprovacaoPublicaSaida)
async def apagar_anotacao(token: str, anotacao_id: str, db=Depends(obter_db)):
    exportacao = await buscar_pelo_token(db, token)
    conferir_pendente(exportacao["aprovacao"])
    await db.exportacoes.update_one(filtro_do_pedido(exportacao),
                                    {"$pull": {"aprovacao.anotacoes": {"id": anotacao_id}}})
    return await para_saida(db, await buscar_pelo_token(db, token))


@router.post("/{token}", response_model=AprovacaoPublicaSaida)
async def responder_pedido(token: str, dados: AprovacaoRespostaEntrada, db=Depends(obter_db)):
    exportacao = await buscar_pelo_token(db, token)
    aprovacao = exportacao["aprovacao"]
    conferir_pendente(aprovacao)
    try:
        respondida = responder(aprovacao, dados.decisao, dados.nome, dados.comentario)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    campos = {chave: respondida[chave] for chave in ("status", "respondido_por", "comentario", "respondido_em")}
    # Só grava se ninguém respondeu nem trocou o link no meio do caminho (as anotações ficam como estão)
    resultado = await db.exportacoes.update_one(
        filtro_do_pedido(exportacao), {"$set": {f"aprovacao.{chave}": valor for chave, valor in campos.items()}})
    if resultado.matched_count == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, MENSAGEM_RESPONDIDO)
    logging.info(f"[{exportacao['organizacao_id']}] Exportação {exportacao['_id']}: {dados.decisao} "
                 f"por {respondida['respondido_por']}")
    return await para_saida(db, await buscar_pelo_token(db, token))
