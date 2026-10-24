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
    ProjetoDaImagemEntrada,
    ProjetoResumoSaida,
    ProjetoSaida,
    ProjetoSalvarEntrada,
    projeto_para_resumo,
    projeto_para_saida,
)
from api.rotas.exportacoes import apagar_exportacoes
from core.modelos.midia import STATUS_PRONTA, e_imagem
from core.modelos.projeto import (
    FAIXA_VIDEO,
    capa_do_projeto,
    conferir_linha_do_tempo,
    duracao_do_projeto,
    faixa_vazia,
    midias_usadas,
    montar_projeto,
    novo_id,
    problema_nos_caminhos,
    proporcao_mais_perto,
    tamanho_para_documento,
)
from core.utils.mongo import agora
from core.utils.tempo import TICKS_POR_SEGUNDO

# Cada camada do documento é um clipe de 5 s (DURACAO_DA_CAMADA no site)
DURACAO_DA_CAMADA = 5 * TICKS_POR_SEGUNDO

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
        {"nome": 1, "duracao": 1, "video": 1, "audio": 1, "imagem": 1, "animacao": 1, "camada_pixels": 1},
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


@router.post("/da-imagem", response_model=ProjetoSaida, status_code=status.HTTP_201_CREATED)
async def projeto_da_imagem(dados: ProjetoDaImagemEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Arquivo › Abrir: a imagem da biblioteca vira um documento do tamanho dela, com ela como a camada única (e o
    fundo transparente quando ela tem transparência)."""
    midia = await db.midias.find_one({"_id": ObjectId(dados.midia_id), "organizacao_id": usuario["organizacao_id"]})
    if midia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Imagem não encontrada.")
    if not e_imagem(midia) or midia.get("status") != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A imagem ainda está sendo preparada.")
    video = midia.get("video") or {}
    tamanho = tamanho_para_documento(int(video.get("largura") or 1080), int(video.get("altura") or 1080))
    nome = (midia.get("nome") or "Imagem").rsplit(".", 1)[0][:120] or "Imagem"
    projeto = montar_projeto(usuario["organizacao_id"], usuario["_id"], nome, None, tamanho)
    if video.get("transparente"):
        projeto["fundo"] = {"cor": "#ffffff", "transparente": True}
    camada = faixa_vazia(FAIXA_VIDEO)
    duracao = DURACAO_DA_CAMADA
    camada["clipes"] = [{
        "id": novo_id(), "midia_id": str(midia["_id"]), "inicio": 0, "duracao": duracao, "entrada": 0,
        "velocidade": 1, "volume": 1, "fade_entrada": 0, "fade_saida": 0,
        "transformacao": {"x": 0, "y": 0, "escala": 1, "rotacao": 0, "opacidade": 1},
        "recorte": {"x": 0, "y": 0, "largura": 1, "altura": 1},
    }]
    projeto["faixas"] = [camada, *projeto["faixas"]]
    projeto["midias_usadas"] = [str(midia["_id"])]
    projeto["duracao"] = duracao
    projeto["_id"] = (await db.projetos.insert_one(projeto)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Imagem aberta como documento: {nome}")
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

    imagem = atual.get("tipo") == "imagem"
    faixas = [f.model_dump() for f in dados.faixas]
    # Os canais alfa (as seleções guardadas) só existem na imagem; contam como usados, como as máscaras
    canais = [c.model_dump() for c in dados.canais] if imagem else []
    usadas = sorted(set(midias_usadas(faixas)) | {c["midia_id"] for c in canais})
    midias = await midias_do_espaco(db, usadas, usuario["organizacao_id"])
    problema = conferir_linha_do_tempo(faixas, midias, imagem=imagem)
    if not problema and len({c["id"] for c in canais}) != len(canais):
        problema = "Dois canais têm o mesmo id."
    if not problema and any(not midias.get(c["midia_id"], {}).get("camada_pixels") for c in canais):
        problema = "O canal precisa ser uma camada de pixels deste espaço."
    # Os caminhos do painel Caminhos também só existem na imagem
    caminhos = [c.model_dump() for c in dados.caminhos] if imagem else []
    if not problema:
        problema = problema_nos_caminhos(caminhos)
    if problema:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, problema)

    tamanho = (dados.tamanho.model_dump() if dados.tamanho else atual.get("tamanho")) if imagem else None
    campos = {
        "nome": dados.nome,
        # Na imagem, a proporção acompanha o tamanho
        "proporcao": proporcao_mais_perto(tamanho["largura"], tamanho["altura"]) if tamanho else dados.proporcao,
        "taxa": dados.taxa.model_dump(),
        "fundo": dados.fundo.model_dump(),
        "faixas": faixas,
        "marcadores": sorted((m.model_dump() for m in dados.marcadores), key=lambda m: m["t"]),
        "canais": canais,
        "caminhos": caminhos,
        "luz_global": dados.luz_global.model_dump() if imagem and dados.luz_global else None,
        "informacoes": dados.informacoes.model_dump() if imagem and dados.informacoes else None,
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
