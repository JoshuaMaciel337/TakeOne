# -----------------------------------------------
# TakeOne API — o Clipar (ADR 0004): pedir os cortes de um vídeo longo e ler o resultado
#
# A clipagem guarda as opções da página e, quando o job "clipagem" (worker de GPU) termina, os cortes. Sem a
# transcrição da mídia, o job pede uma e espera por ela; o andamento que a página mostra é o da etapa da vez. Com
# o .srt da pessoa, a fala vem dele (guardada na clipagem) e não há transcrição.
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    AvaliacaoDoCorteEntrada,
    ClipagemEntrada,
    ClipagemSaida,
    ModeloDoCorteEntrada,
    PalavraSaida,
    ProjetoDoCorteEntrada,
    clipagem_para_saida,
)
from core.modelos.clipagem import (
    DURACAO_MINIMA,
    ESTRATEGIAS,
    STATUS_PROCESSANDO,
    faixa_das_opcoes,
    montar_clipagem,
    palavras_das_legendas,
    palavras_do_trecho,
    ritmo_do_corte,
)
from core.modelos.clipagem import STATUS_PRONTA as CLIPAGEM_PRONTA
from core.modelos.cortes import MAXIMO_DE_CORTES_NA_LISTA, continuacao, copia_do_corte
from core.modelos.job import RECURSO_GPU, STATUS_ERRO, STATUS_EXECUTANDO, STATUS_PENDENTE, montar_job
from core.modelos.midia import STATUS_PRONTA
from core.modelos.transcricao import STATUS_PRONTA as TRANSCRICAO_PRONTA
from core.utils.mongo import agora

router = APIRouter(prefix="/api/clipagens", tags=["clipagens"])


async def _buscar(db, clipagem_id: str, usuario: dict, com_palavras: bool = False) -> dict:
    try:
        oid = ObjectId(clipagem_id)
    except InvalidId:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Clipagem não encontrada.") from None
    # As palavras do .srt (até alguns MB) só são lidas pela rota da fala
    doc = await db.clipagens.find_one({"_id": oid, "organizacao_id": usuario["organizacao_id"]},
                                      None if com_palavras else {"palavras": 0})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Clipagem não encontrada.")
    return doc


async def _andamento(db, doc: dict) -> dict | None:
    """O que a página mostra enquanto processa: a transcrição, quando é ela que está andando, ou a busca."""
    if doc["status"] != STATUS_PROCESSANDO:
        return None
    # Com o .srt da pessoa, não há transcrição a esperar
    transcricao = None
    if doc.get("fala") != "legendas":
        transcricao = await db.transcricoes.find_one({"midia_id": doc["midia_id"]}, {"status": 1, "job_id": 1})
    if transcricao and transcricao["status"] != TRANSCRICAO_PRONTA and transcricao.get("job_id"):
        job = await db.jobs.find_one({"_id": transcricao["job_id"]}, {"status": 1, "progresso": 1, "mensagem": 1})
        if job and job["status"] in (STATUS_PENDENTE, STATUS_EXECUTANDO):
            na_fila = job["status"] == STATUS_PENDENTE
            return {"etapa": "transcricao", "progresso": job.get("progresso", 0),
                    "mensagem": "Transcrição na fila" if na_fila else "Transcrevendo a fala"}
    job = await db.jobs.find_one({"_id": doc.get("job_id")}, {"status": 1, "progresso": 1, "mensagem": 1}) \
        if doc.get("job_id") else None
    if job is None:
        return {"etapa": "cortes", "progresso": 0, "mensagem": "Na fila"}
    if job["status"] == STATUS_PENDENTE:
        return {"etapa": "cortes", "progresso": 0, "mensagem": job.get("mensagem") or "Na fila"}
    return {"etapa": "cortes", "progresso": job.get("progresso", 0),
            "mensagem": job.get("mensagem") or "Procurando os cortes"}


@router.get("/estrategias")
async def listar_estrategias(usuario=Depends(usuario_atual)):
    """As estratégias prontas: o id, o nome, a faixa que sugerem e o que pedem ao modelo."""
    return [{"id": chave, "nome": nome, "faixa": faixa, "descricao": descricao}
            for chave, (nome, faixa, descricao) in ESTRATEGIAS.items()]


@router.get("/fila")
async def fila_da_placa(usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Quantos pedidos estão na frente na placa de vídeo (de qualquer espaço: a placa é uma só), para a página de
    opções dizer que a clipagem vai esperar. Só a contagem; nada dos pedidos dos outros."""
    filtro = {"recurso": RECURSO_GPU, "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}}
    return {"na_frente": await db.jobs.count_documents(filtro)}


@router.post("", response_model=ClipagemSaida, status_code=status.HTTP_201_CREATED)
async def pedir_clipagem(dados: ClipagemEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    try:
        midia_id = ObjectId(dados.midia_id)
    except InvalidId:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vídeo não encontrado.") from None
    midia = await db.midias.find_one({"_id": midia_id, "organizacao_id": usuario["organizacao_id"]})
    if midia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vídeo não encontrado.")
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "O vídeo ainda está sendo preparado.")
    if midia.get("imagem") or not midia.get("audio"):
        raise HTTPException(status.HTTP_409_CONFLICT, "O Clipar procura os cortes pela fala: escolha um vídeo com som.")
    if float(midia.get("duracao") or 0) < DURACAO_MINIMA:
        raise HTTPException(status.HTTP_409_CONFLICT, "O vídeo tem menos de 1 minuto: ele já é um corte.")
    opcoes = dados.opcoes.model_dump()
    if opcoes["fim"] is not None and opcoes["fim"] > float(midia["duracao"]) + 1:
        opcoes["fim"] = float(midia["duracao"])
    if opcoes["fim"] is not None and opcoes["fim"] - (opcoes["inicio"] or 0) < DURACAO_MINIMA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "O trecho a analisar precisa ter pelo menos 1 minuto.")
    palavras = None
    if dados.legendas is not None:
        palavras = palavras_das_legendas([legenda.model_dump() for legenda in dados.legendas])
        palavras = palavras_do_trecho(palavras, opcoes["inicio"], opcoes["fim"])
        if len(palavras) < 20:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "O .srt quase não tem fala no trecho escolhido.")
    documento = montar_clipagem(usuario["organizacao_id"], usuario["_id"], midia, opcoes, palavras)
    documento["_id"] = (await db.clipagens.insert_one(documento)).inserted_id
    entrada = {"clipagem_id": str(documento["_id"]), "midia_id": str(midia_id)}
    job = montar_job("clipagem", usuario["organizacao_id"], entrada,
                     criado_por=usuario["_id"])
    documento["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.clipagens.update_one({"_id": documento["_id"]}, {"$set": {"job_id": documento["job_id"]}})
    logging.info(f"[{usuario['organizacao_id']}] Clipagem pedida: {midia['nome']} ({opcoes['estrategia']}, "
                 f"{opcoes['faixa']})")
    return clipagem_para_saida(documento, await _andamento(db, documento))


@router.get("", response_model=list[ClipagemSaida])
async def listar_clipagens(midia_id: str | None = Query(default=None),
                           projeto_id: str | None = Query(default=None, pattern=r"^[0-9a-f]{24}$"),
                           usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """As clipagens do espaço; com projeto_id, só a que tem um corte montado nesse projeto (o editor do corte)."""
    filtro = {"organizacao_id": usuario["organizacao_id"]}
    if projeto_id:
        filtro["cortes.projeto_id"] = projeto_id
    if midia_id:
        try:
            filtro["midia_id"] = ObjectId(midia_id)
        except InvalidId:
            return []
    docs = await db.clipagens.find(filtro, {"palavras": 0}).sort("criado_em", -1).to_list(200)
    # Pelo projeto, a clipagem vem inteira (o editor lê o corte)
    return [clipagem_para_saida(doc, await _andamento(db, doc), resumida=not projeto_id) for doc in docs]


@router.get("/{clipagem_id}", response_model=ClipagemSaida)
async def ver_clipagem(clipagem_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    doc = await _buscar(db, clipagem_id, usuario)
    return clipagem_para_saida(doc, await _andamento(db, doc))


@router.get("/{clipagem_id}/fala", response_model=list[PalavraSaida])
async def fala_da_clipagem(clipagem_id: str, de: float = Query(default=0, ge=0),
                           ate: float | None = Query(default=None), usuario=Depends(usuario_atual),
                           db=Depends(obter_db)):
    """As palavras da fala entre de e ate (segundos da mídia): do .srt da pessoa ou da transcrição. A montagem de
    cada corte (as legendas e a limpeza das pausas) parte delas."""
    doc = await _buscar(db, clipagem_id, usuario, com_palavras=True)
    return palavras_do_trecho(await _palavras(db, doc), de, ate)


async def _palavras(db, doc: dict) -> list[dict]:
    """A fala da clipagem: o .srt da pessoa (guardado nela) ou a transcrição da mídia."""
    if doc.get("palavras"):
        return doc["palavras"]
    transcricao = await db.transcricoes.find_one({"midia_id": doc["midia_id"]}, {"palavras": 1, "status": 1})
    if transcricao is None or transcricao["status"] != TRANSCRICAO_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A fala deste vídeo ainda não foi transcrita.")
    return transcricao.get("palavras") or []


def _corte(doc: dict, corte_id: str) -> tuple[int, dict]:
    for i, corte in enumerate(doc.get("cortes") or []):
        if corte.get("id") == corte_id:
            return i, corte
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Corte não encontrado.")


async def _por_depois(db, doc: dict, posicao: int, novo: dict) -> None:
    """Põe o corte novo logo depois de outro, com o limite da lista."""
    if doc["status"] != CLIPAGEM_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Os cortes ainda estão sendo procurados.")
    if len(doc.get("cortes") or []) >= MAXIMO_DE_CORTES_NA_LISTA:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A lista já tem {MAXIMO_DE_CORTES_NA_LISTA} cortes.")
    await db.clipagens.update_one({"_id": doc["_id"]},
                                  {"$push": {"cortes": {"$each": [novo], "$position": posicao + 1}},
                                   "$set": {"atualizado_em": agora()}})


@router.post("/{clipagem_id}/cortes/{corte_id}/copia", response_model=ClipagemSaida, status_code=201)
async def duplicar_corte(clipagem_id: str, corte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A cópia do corte, logo depois dele, para montar o mesmo trecho com outra edição."""
    doc = await _buscar(db, clipagem_id, usuario)
    posicao, corte = _corte(doc, corte_id)
    await _por_depois(db, doc, posicao, copia_do_corte(corte, doc["cortes"]))
    return clipagem_para_saida(await _buscar(db, clipagem_id, usuario), None)


@router.post("/{clipagem_id}/cortes/{corte_id}/continuacao", response_model=ClipagemSaida, status_code=201)
async def parte_seguinte(clipagem_id: str, corte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A parte 2: o corte que continua a ideia, das frases logo depois do fim deste, na faixa pedida."""
    doc = await _buscar(db, clipagem_id, usuario, com_palavras=True)
    posicao, corte = _corte(doc, corte_id)
    palavras = await _palavras(db, doc)
    parte = continuacao(corte, palavras, faixa_das_opcoes(doc.get("opcoes") or {}), doc["cortes"])
    if parte is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A fala do vídeo acaba logo depois deste corte.")
    parte["medidas"] = {"ritmo": ritmo_do_corte(parte, palavras)}
    await _por_depois(db, doc, posicao, parte)
    return clipagem_para_saida(await _buscar(db, clipagem_id, usuario), None)


@router.put("/{clipagem_id}/cortes/{corte_id}/modelo", response_model=ClipagemSaida)
async def mudar_modelo_do_corte(clipagem_id: str, corte_id: str, dados: ModeloDoCorteEntrada,
                                usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O modelo de corte só deste corte (vale mais que o da clipagem), ou None para voltar ao da clipagem. O projeto
    já montado não muda aqui: a página monta de novo."""
    doc = await _buscar(db, clipagem_id, usuario)
    _corte(doc, corte_id)
    modelo = dados.modelo_corte.model_dump() if dados.modelo_corte else None
    await db.clipagens.update_one({"_id": doc["_id"], "cortes.id": corte_id},
                                  {"$set": {"cortes.$.modelo_corte": modelo, "atualizado_em": agora()}})
    return clipagem_para_saida(await _buscar(db, clipagem_id, usuario), None)


@router.delete("/{clipagem_id}/cortes/{corte_id}", response_model=ClipagemSaida)
async def apagar_corte(clipagem_id: str, corte_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Tira o corte da lista. O projeto em que ele foi montado continua nos projetos."""
    doc = await _buscar(db, clipagem_id, usuario)
    _corte(doc, corte_id)
    await db.clipagens.update_one({"_id": doc["_id"]},
                                  {"$pull": {"cortes": {"id": corte_id}}, "$set": {"atualizado_em": agora()}})
    return clipagem_para_saida(await _buscar(db, clipagem_id, usuario), None)


@router.put("/{clipagem_id}/cortes/{corte_id}/avaliacao", response_model=ClipagemSaida)
async def avaliar_corte(clipagem_id: str, corte_id: str, dados: AvaliacaoDoCorteEntrada,
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Gostei, não gostei, ou nenhum (null). Guardado no corte, para o gosto do espaço entrar nas próximas."""
    doc = await _buscar(db, clipagem_id, usuario)
    if not any(corte.get("id") == corte_id for corte in doc.get("cortes") or []):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corte não encontrado.")
    await db.clipagens.update_one({"_id": doc["_id"], "cortes.id": corte_id},
                                  {"$set": {"cortes.$.avaliacao": dados.avaliacao, "atualizado_em": agora()}})
    return clipagem_para_saida(await _buscar(db, clipagem_id, usuario), None)


@router.put("/{clipagem_id}/cortes/{corte_id}/projeto", response_model=ClipagemSaida)
async def ligar_projeto(clipagem_id: str, corte_id: str, dados: ProjetoDoCorteEntrada,
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Liga o corte ao projeto em que ele foi montado (ou solta, com null). O projeto precisa ser do espaço."""
    doc = await _buscar(db, clipagem_id, usuario)
    if not any(corte.get("id") == corte_id for corte in doc.get("cortes") or []):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Corte não encontrado.")
    projeto_id = None
    if dados.projeto_id:
        try:
            projeto_id = ObjectId(dados.projeto_id)
        except InvalidId:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado.") from None
        if await db.projetos.count_documents({"_id": projeto_id, "organizacao_id": usuario["organizacao_id"]}) == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado.")
    await db.clipagens.update_one({"_id": doc["_id"], "cortes.id": corte_id},
                                  {"$set": {"cortes.$.projeto_id": str(projeto_id) if projeto_id else None,
                                            "atualizado_em": agora()}})
    return clipagem_para_saida(await _buscar(db, clipagem_id, usuario), None)


@router.delete("/{clipagem_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_clipagem(clipagem_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    doc = await _buscar(db, clipagem_id, usuario)
    momento = agora()
    # O job que ainda ia procurar os cortes para aqui (a transcrição continua: ela serve à mídia)
    await db.jobs.update_many(
        {"entrada.clipagem_id": str(doc["_id"]), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}},
        {"$set": {"status": STATUS_ERRO, "erro": "A clipagem foi excluída.", "mensagem": "Cancelado",
                  "lease_ate": None, "concluido_em": momento, "atualizado_em": momento}},
    )
    await db.clipagens.delete_one({"_id": doc["_id"]})
