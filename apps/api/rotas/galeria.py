# -----------------------------------------------
# TakeOne API — a galeria do cliente (pública, sem conta; onda 16.10, core/modelos/galeria.py)
#
#   GET    /api/galeria/{token}                          o álbum, as fotos e o que o cliente já marcou
#   GET    /api/galeria/{token}/fotos/{midia}/{tipo}     a capa ou a cópia leve da foto, com a edição
#   PATCH  /api/galeria/{token}/fotos/{midia}            favorita e comentário de uma foto
#   POST   /api/galeria/{token}/enviar                   envia a seleção (nome e comentário)
#
# O token vale como senha daquelas fotos: aleatório (256 bits), só o hash no banco, e não abre nada além delas.
# -----------------------------------------------
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.dependencias import obter_db
from core.modelos.aprovacao import hash_do_token
from core.modelos.galeria import ABERTA, LETRAS_DO_COMENTARIO, LETRAS_DO_NOME, enviar, marcacao_do_cliente, vencida
from core.modelos.midia import ARQUIVO_CAPA, ARQUIVO_PROXY_IMAGEM, STATUS_PRONTA, chave_arquivo
from core.utils import storage
from core.utils.mongo import agora

router = APIRouter(prefix="/api/galeria", tags=["galeria"])

MENSAGEM_LINK_INVALIDO = "Este link não vale mais. Peça um novo a quem enviou."
MENSAGEM_VENCIDA = "Este link expirou. Peça um novo a quem enviou."
MENSAGEM_ENVIADA = "A seleção já foi enviada."


class FotoDaGaleriaSaida(BaseModel):
    midia_id: str
    nome: str
    largura: int | None = None
    altura: int | None = None
    # A versão da edição desenhada (muda o endereço da imagem quando o fotógrafo edita de novo)
    versao: int | None = None
    favorita: bool = False
    comentario: str = ""


class GaleriaPublicaSaida(BaseModel):
    album: str
    espaco: str
    para: str
    mensagem: str
    status: str
    expira_em: datetime
    nome: str | None = None
    comentario: str | None = None
    enviada_em: datetime | None = None
    fotos: list[FotoDaGaleriaSaida]


class MarcarFotoEntrada(BaseModel):
    favorita: bool | None = None
    comentario: str | None = Field(default=None, max_length=LETRAS_DO_COMENTARIO)


class EnviarSelecaoEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=LETRAS_DO_NOME)
    comentario: str = Field(default="", max_length=LETRAS_DO_COMENTARIO)


async def buscar_pelo_token(db, token: str) -> dict:
    album = await db.albuns.find_one({"galeria.token_hash": hash_do_token(token)}) if token else None
    if album is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, MENSAGEM_LINK_INVALIDO)
    return album


def _midia_da_galeria(album: dict, midia_id: str) -> ObjectId:
    try:
        mid = ObjectId(midia_id)
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.") from e
    if mid not in album["galeria"]["fotos"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.")
    return mid


def conferir_aberta(galeria: dict):
    if galeria["status"] != ABERTA:
        raise HTTPException(status.HTTP_409_CONFLICT, MENSAGEM_ENVIADA)
    if vencida(galeria):
        raise HTTPException(status.HTTP_410_GONE, MENSAGEM_VENCIDA)


@router.get("/{token}", response_model=GaleriaPublicaSaida)
async def ver_galeria(token: str, db=Depends(obter_db)):
    album = await buscar_pelo_token(db, token)
    galeria = album["galeria"]
    if vencida(galeria):
        raise HTTPException(status.HTTP_410_GONE, MENSAGEM_VENCIDA)
    ids = galeria["fotos"]
    registros = {f["midia_id"]: f async for f in db.album_fotos.find(
        {"album_id": album["_id"], "midia_id": {"$in": ids}}, {"midia_id": 1, "edicao": 1, "cliente": 1})}
    midias = {m["_id"]: m async for m in db.midias.find({"_id": {"$in": ids}, "status": STATUS_PRONTA},
                                                         {"nome": 1, "video": 1})}
    organizacao = await db.organizacoes.find_one({"_id": album["organizacao_id"]}, {"nome": 1}) or {}
    fotos = []
    for mid in ids:
        if mid not in midias or mid not in registros:
            continue
        edicao = registros[mid].get("edicao") or {}
        cliente = registros[mid].get("cliente") or {}
        video = midias[mid].get("video") or {}
        desenhada = edicao.get("gerada") is not None
        fotos.append(FotoDaGaleriaSaida(
            midia_id=str(mid), nome=midias[mid]["nome"],
            largura=edicao.get("largura") if desenhada else video.get("largura"),
            altura=edicao.get("altura") if desenhada else video.get("altura"),
            versao=edicao.get("gerada"), favorita=bool(cliente.get("favorita")),
            comentario=cliente.get("comentario") or ""))
    return GaleriaPublicaSaida(album=album["nome"], espaco=organizacao.get("nome", ""), para=galeria.get("para", ""),
                               mensagem=galeria.get("mensagem", ""), status=galeria["status"],
                               expira_em=galeria["expira_em"], nome=galeria.get("nome"),
                               comentario=galeria.get("comentario"), enviada_em=galeria.get("enviada_em"), fotos=fotos)


@router.get("/{token}/fotos/{midia_id}/{tipo}")
async def foto_da_galeria(token: str, midia_id: str, tipo: str, db=Depends(obter_db)):
    if tipo not in ("capa", "proxy"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    album = await buscar_pelo_token(db, token)
    if vencida(album["galeria"]):
        raise HTTPException(status.HTTP_410_GONE, MENSAGEM_VENCIDA)
    mid = _midia_da_galeria(album, midia_id)
    registro = await db.album_fotos.find_one({"album_id": album["_id"], "midia_id": mid}, {"edicao": 1}) or {}
    gerada = (registro.get("edicao") or {}).get("gerada")
    nome = ARQUIVO_CAPA if tipo == "capa" else ARQUIVO_PROXY_IMAGEM
    caminho = None
    if gerada is not None:
        editado = f"album_{album['_id']}_{gerada}_{'capa.jpg' if tipo == 'capa' else 'proxy.webp'}"
        caminho = storage.caminho_local(chave_arquivo(album["organizacao_id"], mid, editado))
        if not caminho.is_file():
            caminho = None
    if caminho is None:
        caminho = storage.caminho_local(chave_arquivo(album["organizacao_id"], mid, nome))
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    return FileResponse(caminho, media_type="image/jpeg" if caminho.suffix == ".jpg" else "image/webp",
                        headers={"Cache-Control": "private, max-age=3600", "Referrer-Policy": "no-referrer"})


@router.patch("/{token}/fotos/{midia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def marcar_foto(token: str, midia_id: str, dados: MarcarFotoEntrada, db=Depends(obter_db)):
    album = await buscar_pelo_token(db, token)
    conferir_aberta(album["galeria"])
    mid = _midia_da_galeria(album, midia_id)
    registro = await db.album_fotos.find_one({"album_id": album["_id"], "midia_id": mid}, {"cliente": 1})
    if registro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.")
    await db.album_fotos.update_one(
        {"_id": registro["_id"]},
        {"$set": {"cliente": marcacao_do_cliente(dados.favorita, dados.comentario, registro.get("cliente"), agora())}})


@router.post("/{token}/enviar", response_model=GaleriaPublicaSaida)
async def enviar_selecao(token: str, dados: EnviarSelecaoEntrada, db=Depends(obter_db)):
    album = await buscar_pelo_token(db, token)
    galeria = album["galeria"]
    conferir_aberta(galeria)
    try:
        nova = enviar(galeria, dados.nome, dados.comentario, agora())
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    # O mesmo link e ainda aberta: duas abas não enviam duas vezes
    feito = await db.albuns.update_one({"_id": album["_id"], "galeria.token_hash": galeria["token_hash"],
                                        "galeria.status": ABERTA}, {"$set": {"galeria": nova}})
    if feito.matched_count == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, MENSAGEM_ENVIADA)
    return await ver_galeria(token, db)
