# -----------------------------------------------
# TakeOne API — biblioteca de modelos
#
# Os modelos do espaço (um projeto salvo como modelo, com as vagas que quem usa troca), os modelos
# salvos de cada pessoa e a contagem de usos, que ordena a biblioteca por "Populares". Os modelos
# prontos do TakeOne ficam no editor; aqui eles só aparecem pelo id, nos usos e nos salvos.
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    BibliotecaDeModelosSaida,
    ModeloCriarEntrada,
    ModeloSaida,
    ProjetoSaida,
    SalvosEntrada,
    UsoDeModeloEntrada,
    modelo_para_saida,
    projeto_para_saida,
)
from api.rotas.projetos import buscar_projeto, midias_do_espaco
from core.modelos.modelo_do_espaco import conferir_vagas, montar_modelo, projeto_do_modelo
from core.modelos.projeto import conferir_linha_do_tempo

router = APIRouter(prefix="/api/modelos", tags=["modelos"])


async def buscar_modelo(db, modelo_id: str, usuario: dict) -> dict:
    try:
        filtro = {"_id": ObjectId(modelo_id), "organizacao_id": usuario["organizacao_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modelo não encontrado.") from e
    modelo = await db.modelos.find_one(filtro)
    if modelo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modelo não encontrado.")
    return modelo


async def contar_uso(db, organizacao_id, modelo_id: str) -> None:
    await db.usos_de_modelos.update_one({"organizacao_id": organizacao_id, "modelo_id": modelo_id},
                                        {"$inc": {"usos": 1}}, upsert=True)


@router.get("", response_model=BibliotecaDeModelosSaida)
async def biblioteca(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    organizacao_id = usuario["organizacao_id"]
    do_espaco = [modelo_para_saida(m) async for m in
                 db.modelos.find({"organizacao_id": organizacao_id}, {"faixas": 0}).sort("criado_em", -1).limit(500)]
    usos = {u["modelo_id"]: u["usos"] async for u in db.usos_de_modelos.find({"organizacao_id": organizacao_id})}
    return BibliotecaDeModelosSaida(do_espaco=do_espaco, salvos=usuario.get("modelos_salvos", []), usos=usos)


@router.post("", response_model=ModeloSaida, status_code=status.HTTP_201_CREATED)
async def criar_modelo(dados: ModeloCriarEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Salva o projeto, como está no banco, como modelo do espaço (o editor salva antes de pedir)."""
    projeto = await buscar_projeto(db, dados.projeto_id, usuario)
    if not any(f["clipes"] for f in projeto["faixas"]):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "O projeto está vazio: ponha algo na linha do tempo antes.")
    vagas = [v.model_dump() for v in dados.vagas]
    problema = conferir_vagas(projeto["faixas"], vagas)
    if problema:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, problema)
    modelo = montar_modelo(projeto, usuario, dados.nome, dados.descricao, dados.categoria, vagas)
    modelo["_id"] = (await db.modelos.insert_one(modelo)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Modelo criado: {modelo['nome']} ({len(vagas)} vagas)")
    return modelo_para_saida(modelo)


@router.delete("/{modelo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_modelo(modelo_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    modelo = await buscar_modelo(db, modelo_id, usuario)
    await db.modelos.delete_one({"_id": modelo["_id"]})
    await db.usos_de_modelos.delete_many({"organizacao_id": usuario["organizacao_id"], "modelo_id": modelo_id})
    logging.info(f"[{usuario['organizacao_id']}] Modelo excluído: {modelo['nome']}")


@router.post("/{modelo_id}/usar", response_model=ProjetoSaida, status_code=status.HTTP_201_CREATED)
async def usar_modelo(modelo_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Um projeto novo, igual ao modelo, com as vagas para o editor preencher."""
    modelo = await buscar_modelo(db, modelo_id, usuario)
    usadas = modelo["midias_usadas"]
    if conferir_linha_do_tempo(modelo["faixas"], await midias_do_espaco(db, usadas, usuario["organizacao_id"])):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Uma mídia deste modelo não está mais pronta na biblioteca. Salve o modelo de novo.")
    projeto = projeto_do_modelo(modelo, usuario)
    projeto["_id"] = (await db.projetos.insert_one(projeto)).inserted_id
    await contar_uso(db, usuario["organizacao_id"], modelo_id)
    return projeto_para_saida(projeto)


@router.post("/usos", status_code=status.HTTP_204_NO_CONTENT)
async def registrar_uso(dados: UsoDeModeloEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Um modelo pronto do editor foi usado (os do espaço contam no /usar)."""
    await contar_uso(db, usuario["organizacao_id"], dados.modelo_id)


@router.put("/salvos", response_model=list[str])
async def definir_salvos(dados: SalvosEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Os modelos que a pessoa guardou na aba Salvos, na ordem em que guardou."""
    ids = list(dict.fromkeys(dados.ids))
    await db.usuarios.update_one({"_id": usuario["_id"]}, {"$set": {"modelos_salvos": ids}})
    return ids
