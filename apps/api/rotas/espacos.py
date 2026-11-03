# -----------------------------------------------
# TakeOne API — espaços e equipe (colaboração; core/modelos/espaco.py)
#
#   GET    /api/espacos                        os espaços em que a pessoa trabalha (o próprio e os de membro)
#   POST   /api/espacos/{id}/usar              troca o espaço da sessão
#   GET    /api/espacos/atual/membros          a equipe do espaço da sessão
#   DELETE /api/espacos/atual/membros/{id}     o dono tira alguém; um membro tira a si mesmo (sai do espaço)
#   GET    /api/espacos/atual/convite          se há um link de convite valendo (sem o token)
#   POST   /api/espacos/atual/convite          o dono gera o link (desliga o anterior)
#   DELETE /api/espacos/atual/convite          o dono desliga o link
#   GET    /api/espacos/convite/{token}        o espaço de um link, para a tela de entrar
#   POST   /api/espacos/convite/{token}        entra no espaço do link e passa a sessão para ele
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from api.dependencias import no_espaco, obter_db, usuario_atual
from api.esquemas import SessaoSaida
from api.rotas.auth import definir_cookie, montar_sessao
from api.seguranca import criar_token
from core.modelos.espaco import (
    MEMBROS_MAXIMOS,
    PAPEL_DONO,
    PAPEL_MEMBRO,
    convite_vencido,
    hash_do_token,
    montar_convite_do_espaco,
    montar_membro,
)
from core.utils.mongo import agora

router = APIRouter(prefix="/api/espacos", tags=["espaços"])

MENSAGEM_LINK_INVALIDO = "Este convite não vale mais. Peça um novo a quem te chamou."


class EspacoSaida(BaseModel):
    id: str
    nome: str
    papel: str
    atual: bool


class MembroSaida(BaseModel):
    id: str
    nome: str
    email: str
    papel: str
    desde: str


class ConviteDoEspacoSaida(BaseModel):
    ativo: bool
    expira_em: str | None = None
    caminho: str | None = None


class ConviteAbertoSaida(BaseModel):
    espaco: str
    dono: str
    ja_faz_parte: bool


def _id(valor: str, mensagem: str) -> ObjectId:
    try:
        return ObjectId(valor)
    except (InvalidId, TypeError) as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, mensagem) from e


def so_o_dono(usuario: dict):
    if usuario.get("papel") != PAPEL_DONO:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem é dono do espaço chama ou tira pessoas.")


def sem_chave(usuario: dict):
    """A equipe e a troca de espaço são do site, com a senha; uma chave de acesso não mexe nelas."""
    if usuario.get("_pela_chave"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Mude a equipe pelo site, entrando com a senha.")


def proprio(usuario: dict) -> ObjectId:
    return usuario.get("espaco_proprio") or usuario["organizacao_id"]


async def passar_para(db, resposta: Response, usuario: dict, organizacao_id) -> SessaoSaida:
    no_novo = await no_espaco(db, {**usuario, "organizacao_id": proprio(usuario), "papel": PAPEL_DONO}, organizacao_id)
    if no_novo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Você não faz parte deste espaço.")
    definir_cookie(resposta, criar_token(str(usuario["_id"]), str(organizacao_id)))
    return await montar_sessao(db, no_novo)


@router.get("", response_model=list[EspacoSaida])
async def listar_espacos(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    ids = [proprio(usuario)]
    papeis = {ids[0]: PAPEL_DONO}
    async for membro in db.membros.find({"usuario_id": usuario["_id"]}).sort("criado_em", 1):
        ids.append(membro["organizacao_id"])
        papeis[membro["organizacao_id"]] = membro.get("papel", PAPEL_MEMBRO)
    nomes = {doc["_id"]: doc["nome"] async for doc in db.organizacoes.find({"_id": {"$in": ids}}, {"nome": 1})}
    return [EspacoSaida(id=str(i), nome=nomes[i], papel=papeis[i], atual=i == usuario["organizacao_id"])
            for i in ids if i in nomes]


@router.post("/{espaco_id}/usar", response_model=SessaoSaida)
async def usar_espaco(espaco_id: str, resposta: Response, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    sem_chave(usuario)
    return await passar_para(db, resposta, usuario, _id(espaco_id, "Espaço não encontrado."))


@router.get("/atual/membros", response_model=list[MembroSaida])
async def listar_membros(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    organizacao_id = usuario["organizacao_id"]
    pessoas = [(doc, PAPEL_DONO, doc["criado_em"]) async for doc in db.usuarios.find(
        {"organizacao_id": organizacao_id}, {"nome": 1, "email": 1, "criado_em": 1})]
    membros = [m async for m in db.membros.find({"organizacao_id": organizacao_id}).sort("criado_em", 1)]
    usuarios = {doc["_id"]: doc async for doc in db.usuarios.find(
        {"_id": {"$in": [m["usuario_id"] for m in membros]}}, {"nome": 1, "email": 1})}
    pessoas += [(usuarios[m["usuario_id"]], m.get("papel", PAPEL_MEMBRO), m["criado_em"])
                for m in membros if m["usuario_id"] in usuarios]
    return [MembroSaida(id=str(doc["_id"]), nome=doc["nome"], email=doc["email"], papel=papel, desde=desde.isoformat())
            for doc, papel, desde in pessoas]


@router.delete("/atual/membros/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def tirar_membro(usuario_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    sem_chave(usuario)
    alvo = _id(usuario_id, "Pessoa não encontrada.")
    if alvo != usuario["_id"]:
        so_o_dono(usuario)
    elif usuario.get("papel") == PAPEL_DONO:
        raise HTTPException(status.HTTP_409_CONFLICT, "Quem é dono não sai do próprio espaço.")
    resultado = await db.membros.delete_one({"organizacao_id": usuario["organizacao_id"], "usuario_id": alvo})
    if resultado.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esta pessoa não é membro do espaço.")
    logging.info(f"[{usuario['organizacao_id']}] Membro {alvo} {'saiu' if alvo == usuario['_id'] else 'tirado'}.")


@router.get("/atual/convite", response_model=ConviteDoEspacoSaida)
async def ver_convite(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    so_o_dono(usuario)
    espaco = await db.organizacoes.find_one({"_id": usuario["organizacao_id"]}, {"convite_membros": 1}) or {}
    convite = espaco.get("convite_membros")
    if convite_vencido(convite):
        return ConviteDoEspacoSaida(ativo=False)
    return ConviteDoEspacoSaida(ativo=True, expira_em=convite["expira_em"].isoformat())


@router.post("/atual/convite", response_model=ConviteDoEspacoSaida, status_code=status.HTTP_201_CREATED)
async def gerar_convite(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    sem_chave(usuario)
    so_o_dono(usuario)
    token, convite = montar_convite_do_espaco(usuario["_id"])
    await db.organizacoes.update_one({"_id": usuario["organizacao_id"]}, {"$set": {"convite_membros": convite}})
    logging.info(f"[{usuario['organizacao_id']}] Link de convite para a equipe gerado.")
    return ConviteDoEspacoSaida(ativo=True, expira_em=convite["expira_em"].isoformat(),
                                caminho=f"/app/convite/{token}")


@router.delete("/atual/convite", status_code=status.HTTP_204_NO_CONTENT)
async def desligar_convite(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    sem_chave(usuario)
    so_o_dono(usuario)
    await db.organizacoes.update_one({"_id": usuario["organizacao_id"]}, {"$unset": {"convite_membros": ""}})


async def espaco_do_convite(db, token: str) -> dict:
    espaco = await db.organizacoes.find_one({"convite_membros.token_hash": hash_do_token(token)}) if token else None
    if espaco is None or convite_vencido(espaco.get("convite_membros")):
        raise HTTPException(status.HTTP_404_NOT_FOUND, MENSAGEM_LINK_INVALIDO)
    return espaco


async def faz_parte(db, usuario: dict, espaco_id) -> bool:
    return espaco_id == proprio(usuario) or await db.membros.find_one(
        {"organizacao_id": espaco_id, "usuario_id": usuario["_id"]}, {"_id": 1}) is not None


@router.get("/convite/{token}", response_model=ConviteAbertoSaida)
async def ver_convite_aberto(token: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    espaco = await espaco_do_convite(db, token)
    dono = await db.usuarios.find_one({"organizacao_id": espaco["_id"]}, {"nome": 1}) or {}
    return ConviteAbertoSaida(espaco=espaco["nome"], dono=dono.get("nome", ""),
                              ja_faz_parte=await faz_parte(db, usuario, espaco["_id"]))


@router.post("/convite/{token}", response_model=SessaoSaida)
async def entrar_pelo_convite(token: str, resposta: Response, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    sem_chave(usuario)
    espaco = await espaco_do_convite(db, token)
    if not await faz_parte(db, usuario, espaco["_id"]):
        if await db.membros.count_documents({"organizacao_id": espaco["_id"]}) >= MEMBROS_MAXIMOS:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"O espaço já tem {MEMBROS_MAXIMOS} membros. Peça ao dono para tirar alguém.")
        try:
            await db.membros.insert_one(montar_membro(espaco["_id"], usuario["_id"],
                                                      espaco["convite_membros"].get("criado_por"), agora()))
        except DuplicateKeyError:
            pass  # entrou por outra aba no meio do caminho
        logging.info(f"[{espaco['_id']}] Novo membro: {usuario['_id']}")
    return await passar_para(db, resposta, usuario, espaco["_id"])
