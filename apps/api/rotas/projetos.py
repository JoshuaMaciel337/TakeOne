# -----------------------------------------------
# TakeOne API — projetos de edição
#
# O editor salva o projeto inteiro de cada vez, com a versão que abriu. Se outra aba salvou antes,
# a versão no banco é outra e a resposta é 409: nada é sobrescrito sem a pessoa ver.
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    ProjetoCriarEntrada,
    ProjetoResumoSaida,
    ProjetoSaida,
    ProjetoSalvarEntrada,
    projeto_para_resumo,
    projeto_para_saida,
)
from api.rotas.exportacoes import apagar_exportacoes
from core.modelos.midia import STATUS_PRONTA
from core.modelos.projeto import (
    capa_do_projeto,
    conferir_linha_do_tempo,
    duracao_do_projeto,
    midias_usadas,
    montar_projeto,
    proporcao_mais_perto,
)
from core.utils.mongo import agora

router = APIRouter(prefix="/api/projetos", tags=["projetos"])

MENSAGEM_CONFLITO = ("Este projeto foi salvo em outra aba ou outro computador. "
                     "Recarregue a página para continuar da versão mais nova.")


async def buscar_projeto(db, projeto_id: str, usuario: dict, projecao: dict | None = None) -> dict:
    try:
        filtro = {"_id": ObjectId(projeto_id), "organizacao_id": usuario["organizacao_id"]}
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado.") from e
    projeto = await db.projetos.find_one(filtro, projecao)
    if projeto is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado.")
    return projeto


async def midias_do_espaco(db, ids: list[str], organizacao_id) -> dict[str, dict]:
    """As mídias prontas do espaço entre os ids pedidos. Id de outro espaço simplesmente não aparece."""
    validos = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]
    if not validos:
        return {}
    cursor = db.midias.find(
        {"_id": {"$in": validos}, "organizacao_id": organizacao_id, "status": STATUS_PRONTA},
        {"nome": 1, "duracao": 1, "video": 1, "audio": 1, "imagem": 1, "animacao": 1},
    )
    return {str(m["_id"]): m async for m in cursor}


@router.get("", response_model=list[ProjetoResumoSaida])
async def listar_projetos(limite: int = Query(default=60, ge=1, le=200),
                          antes: str | None = Query(default=None, description="id do último da página anterior"),
                          usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Os projetos do espaço, dos mexidos há menos tempo para os mais antigos, em páginas: a seguinte começa depois
    de `antes` (o id do último da página), pela data dele e, no empate, pelo id."""
    filtro: dict = {"organizacao_id": usuario["organizacao_id"]}
    if antes:
        try:
            ultimo = await db.projetos.find_one({"_id": ObjectId(antes), "organizacao_id": usuario["organizacao_id"]},
                                                {"atualizado_em": 1})
        except InvalidId as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Página inválida.") from erro
        if ultimo is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Página inválida: o projeto saiu da lista.")
        filtro["$or"] = [{"atualizado_em": {"$lt": ultimo["atualizado_em"]}},
                         {"atualizado_em": ultimo["atualizado_em"], "_id": {"$lt": ultimo["_id"]}}]
    cursor = db.projetos.find(filtro, {"faixas": 0}).sort([("atualizado_em", -1), ("_id", -1)]).limit(limite)
    return [projeto_para_resumo(p) async for p in cursor]


@router.post("", response_model=ProjetoSaida, status_code=status.HTTP_201_CREATED)
async def criar_projeto(dados: ProjetoCriarEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    tamanho = dados.tamanho.model_dump() if dados.tamanho else None
    projeto = montar_projeto(usuario["organizacao_id"], usuario["_id"], dados.nome, dados.proporcao, tamanho)
    resultado = await db.projetos.insert_one(projeto)
    projeto["_id"] = resultado.inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Projeto criado: {projeto['nome']}")
    return projeto_para_saida(projeto)


@router.get("/{projeto_id}", response_model=ProjetoSaida)
async def abrir_projeto(projeto_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    return projeto_para_saida(await buscar_projeto(db, projeto_id, usuario))


@router.put("/{projeto_id}", response_model=ProjetoSaida)
async def salvar_projeto(projeto_id: str, dados: ProjetoSalvarEntrada,
                         usuario=Depends(usuario_atual), db=Depends(obter_db)):
    atual = await buscar_projeto(db, projeto_id, usuario, {"versao": 1, "tipo": 1, "tamanho": 1})
    if atual["versao"] != dados.versao:
        raise HTTPException(status.HTTP_409_CONFLICT, MENSAGEM_CONFLITO)

    faixas = [f.model_dump() for f in dados.faixas]
    usadas = midias_usadas(faixas)
    problema = conferir_linha_do_tempo(faixas, await midias_do_espaco(db, usadas, usuario["organizacao_id"]))
    if problema:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, problema)

    imagem = atual.get("tipo") == "imagem"
    tamanho = (dados.tamanho.model_dump() if dados.tamanho else atual.get("tamanho")) if imagem else None
    campos = {
        "nome": dados.nome,
        # Na imagem, a proporção acompanha o tamanho
        "proporcao": proporcao_mais_perto(tamanho["largura"], tamanho["altura"]) if tamanho else dados.proporcao,
        "taxa": dados.taxa.model_dump(),
        "fundo": dados.fundo.model_dump(),
        "faixas": faixas,
        "marcadores": sorted((m.model_dump() for m in dados.marcadores), key=lambda m: m["t"]),
        "duracao": duracao_do_projeto(faixas),
        "midias_usadas": usadas,
        "capa_midia_id": capa_do_projeto(faixas, "imagem" if imagem else "video"),
        **({"tamanho": tamanho} if imagem else {}),
        "versao": dados.versao + 1,
        "atualizado_em": agora(),
    }
    # A versão entra no filtro: duas abas salvando ao mesmo tempo, só a primeira passa
    resultado = await db.projetos.update_one({"_id": atual["_id"], "versao": dados.versao}, {"$set": campos})
    if resultado.matched_count == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, MENSAGEM_CONFLITO)
    return projeto_para_saida(await buscar_projeto(db, projeto_id, usuario))


@router.delete("/{projeto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_projeto(projeto_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    projeto = await buscar_projeto(db, projeto_id, usuario, {"nome": 1})
    await apagar_exportacoes(db, {"projeto_id": projeto["_id"], "organizacao_id": usuario["organizacao_id"]})
    await db.projetos.delete_one({"_id": projeto["_id"]})
    logging.info(f"[{usuario['organizacao_id']}] Projeto excluído: {projeto['nome']}")
