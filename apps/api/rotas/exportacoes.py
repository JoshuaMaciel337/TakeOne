# -----------------------------------------------
# TakeOne API — exportações (o vídeo final de um projeto)
#
# Pedir a exportação copia o projeto salvo e põe o render na fila do worker. O progresso chega
# pelos eventos do job, como na ingestão das mídias.
# -----------------------------------------------
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import ExportacaoCriarEntrada, ExportacaoSaida, LinkCelularSaida, exportacao_para_saida
from core.modelos.exportacao import (
    ARQUIVO_VIDEO,
    ARQUIVOS_PUBLICOS,
    PRIORIDADE_RENDER,
    STATUS_PROCESSANDO,
    STATUS_PRONTA,
    chave_exportacao,
    montar_exportacao,
    montar_link_celular,
    nome_de_arquivo,
    pasta_da_exportacao,
)
from core.modelos.job import STATUS_ERRO as STATUS_JOB_ERRO
from core.modelos.job import STATUS_EXECUTANDO, STATUS_PENDENTE, montar_job
from core.utils import storage
from core.utils.mongo import agora

router = APIRouter(prefix="/api/exportacoes", tags=["exportacoes"])


# -----------------------------------------------
# FUNÇÕES AUXILIARES
# -----------------------------------------------
def _id_ou_404(valor: str, mensagem: str) -> ObjectId:
    try:
        return ObjectId(valor)
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, mensagem) from e


async def para_saida(db, exportacoes: list[dict]) -> list[ExportacaoSaida]:
    """Junta o job de render das que estão em andamento, numa consulta só."""
    ids = [e["job_id"] for e in exportacoes if e["status"] == STATUS_PROCESSANDO and e.get("job_id")]
    jobs = {}
    if ids:
        cursor = db.jobs.find({"_id": {"$in": ids}}, {"status": 1, "progresso": 1, "mensagem": 1, "erro": 1})
        jobs = {job["_id"]: job async for job in cursor}
    return [exportacao_para_saida(e, jobs.get(e.get("job_id"))) for e in exportacoes]


async def buscar_exportacao(db, exportacao_id: str, usuario: dict) -> dict:
    filtro = {"_id": _id_ou_404(exportacao_id, "Exportação não encontrada."),
              "organizacao_id": usuario["organizacao_id"]}
    exportacao = await db.exportacoes.find_one(filtro)
    if exportacao is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exportação não encontrada.")
    return exportacao


async def apagar_exportacoes(db, filtro: dict):
    """Apaga exportações, os arquivos delas e os renders que ainda estavam na fila."""
    momento = agora()
    async for exportacao in db.exportacoes.find(filtro, {"organizacao_id": 1}):
        await db.jobs.update_many(
            {"entrada.exportacao_id": str(exportacao["_id"]), "status": {"$in": [STATUS_PENDENTE, STATUS_EXECUTANDO]}},
            {"$set": {"status": STATUS_JOB_ERRO, "erro": "A exportação foi excluída.", "mensagem": "Cancelado",
                      "lease_ate": None, "concluido_em": momento, "atualizado_em": momento}},
        )
        pasta = pasta_da_exportacao(exportacao["organizacao_id"], exportacao["_id"])
        await run_in_threadpool(storage.remover_pasta, pasta)
    await db.exportacoes.delete_many(filtro)


# -----------------------------------------------
# ROTAS
# -----------------------------------------------
@router.post("", response_model=ExportacaoSaida, status_code=status.HTTP_201_CREATED)
async def criar_exportacao(dados: ExportacaoCriarEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Exporta o projeto como está salvo agora. O editor salva sozinho antes de pedir."""
    projeto = await db.projetos.find_one({"_id": _id_ou_404(dados.projeto_id, "Projeto não encontrado."),
                                          "organizacao_id": usuario["organizacao_id"]})
    if projeto is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado.")
    if projeto.get("tipo") == "imagem":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Imagens são exportadas no próprio editor de imagem, em PNG, JPG ou WebP.")
    if not projeto.get("duracao"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "O projeto está vazio. Coloque alguma mídia na linha do tempo antes de exportar.")

    exportacao = montar_exportacao(usuario["organizacao_id"], usuario["_id"], projeto, dados.resolucao)
    exportacao["_id"] = (await db.exportacoes.insert_one(exportacao)).inserted_id
    job = montar_job("renderizacao", usuario["organizacao_id"], {"exportacao_id": str(exportacao["_id"])},
                     prioridade=PRIORIDADE_RENDER, criado_por=usuario["_id"])
    exportacao["job_id"] = (await db.jobs.insert_one(job)).inserted_id
    await db.exportacoes.update_one({"_id": exportacao["_id"]}, {"$set": {"job_id": exportacao["job_id"]}})
    logging.info(f"[{usuario['organizacao_id']}] Exportação pedida: {projeto['nome']} em {dados.resolucao}")
    return (await para_saida(db, [exportacao]))[0]


@router.get("", response_model=list[ExportacaoSaida])
async def listar_exportacoes(projeto_id: str | None = None, limite: int = Query(default=20, ge=1, le=100),
                             usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """As do projeto, ou as do espaço todo, da mais nova para a mais antiga."""
    filtro = {"organizacao_id": usuario["organizacao_id"]}
    if projeto_id:
        if not ObjectId.is_valid(projeto_id):
            return []
        filtro["projeto_id"] = ObjectId(projeto_id)
    cursor = db.exportacoes.find(filtro, {"projeto": 0}).sort("criado_em", -1).limit(limite)
    return await para_saida(db, [e async for e in cursor])


@router.get("/{exportacao_id}", response_model=ExportacaoSaida)
async def ver_exportacao(exportacao_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    return (await para_saida(db, [await buscar_exportacao(db, exportacao_id, usuario)]))[0]


@router.get("/{exportacao_id}/arquivos/{nome}")
async def baixar_arquivo(exportacao_id: str, nome: str, baixar: bool = False,
                         usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O vídeo final. Com baixar=true, o navegador salva o arquivo com o nome do projeto."""
    exportacao = await buscar_exportacao(db, exportacao_id, usuario)
    if nome not in ARQUIVOS_PUBLICOS or nome not in exportacao.get("arquivos", []):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    caminho = storage.caminho_local(chave_exportacao(exportacao["organizacao_id"], exportacao["_id"], nome))
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    return FileResponse(
        caminho,
        media_type="video/mp4",
        filename=nome_de_arquivo(exportacao["nome"]) if baixar else None,
        content_disposition_type="attachment" if baixar else "inline",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.delete("/{exportacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_exportacao(exportacao_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    exportacao = await buscar_exportacao(db, exportacao_id, usuario)
    await apagar_exportacoes(db, {"_id": exportacao["_id"]})


@router.post("/{exportacao_id}/link-celular", response_model=LinkCelularSaida)
async def criar_link_celular(exportacao_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Um link de 24 h para o QR code: o celular baixa o vídeo sem entrar na conta."""
    exportacao = await buscar_exportacao(db, exportacao_id, usuario)
    if exportacao["status"] != STATUS_PRONTA or ARQUIVO_VIDEO not in exportacao.get("arquivos", []):
        raise HTTPException(status.HTTP_409_CONFLICT, "Espere o vídeo ficar pronto.")
    token, link = montar_link_celular()
    await db.exportacoes.update_one({"_id": exportacao["_id"]}, {"$set": {"link_celular": link}})
    return LinkCelularSaida(caminho=f"/api/baixar/{token}", expira_em=link["expira_em"])
