# -----------------------------------------------
# TakeOne API — álbuns de fotos (onda 16, docs/decisoes/0006-album-de-fotos.md)
#
#   GET    /api/albuns                       os álbuns do espaço, com a contagem e a capa
#   POST   /api/albuns                       cria (nome e tipo do ensaio)
#   GET    /api/albuns/{id}                  um álbum
#   PATCH  /api/albuns/{id}                  muda o nome ou o tipo
#   DELETE /api/albuns/{id}                  exclui com as fotos enviadas para ele
#   GET    /api/albuns/{id}/fotos            as fotos, com o que a grade precisa
#   POST   /api/albuns/{id}/fotos            põe imagens da biblioteca no álbum
#   PATCH  /api/albuns/{id}/fotos            a mesma nota, cor ou marcação em várias fotos
#   POST   /api/albuns/{id}/fotos/remover    tira fotos do álbum
#   GET    /api/albuns/pasta-do-computador   as pastas da pasta das fotos do Nitro (montada só para leitura)
#   POST   /api/albuns/{id}/importar         importa uma pasta dela sem copiar (job "importar_pasta")
#   POST   /api/albuns/{id}/analisar         mede as fotos que faltam (job "medir_album")
#   POST   /api/albuns/{id}/escolher         escolhe as melhores pelas medidas (core/modelos/escolha.py)
#   PUT    /api/albuns/{id}/edicoes          a edição de cada foto (cor, igualar, giro, recorte), desenhada pelo
#                                            worker (job "editar_album", core/utils/edicao_de_foto.py)
#   POST   /api/albuns/{id}/exportar         as fotos num ZIP (job "exportar_album": a edição, a marca, o XMP)
#   GET    /api/albuns/{id}/saidas/{job}     o ZIP pronto
#   GET    /api/albuns/{id}/pessoas          as pessoas achadas nos rostos (core/modelos/pessoas.py)
#   PATCH  /api/albuns/{id}/pessoas/{n}      dá um nome a uma pessoa
#   POST   /api/albuns/{id}/galeria          gera o link da galeria do cliente (api/rotas/galeria.py é a pública)
#   DELETE /api/albuns/{id}/galeria          desliga o link
#   PUT    /api/albuns/{id}/monitorar        liga a pasta monitorada (core/utils/pasta_monitorada.py)
#   DELETE /api/albuns/{id}/monitorar        desliga
#
# As fotos chegam pelo envio de sempre (tus), com o álbum nos metadados (api/rotas/uploads.py).
# -----------------------------------------------
import logging
import mimetypes
import zipfile
from pathlib import PurePosixPath
from urllib.parse import quote

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response
from pymongo import UpdateOne
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import (
    AlbumAtualizarEntrada,
    AlbumEntrada,
    AlbumSaida,
    EdicoesEntrada,
    EscolhaSaida,
    EscolherEntrada,
    ExportarAlbumEntrada,
    FotoDoAlbumSaida,
    FotosIdsEntrada,
    FotosMudarEntrada,
    FotosRemovidasSaida,
    GaleriaCriadaSaida,
    GaleriaEntrada,
    ImportarPastaEntrada,
    JobDoAlbumSaida,
    MonitorarEntrada,
    PastaDoComputadorSaida,
    PessoaAtualizarEntrada,
    PessoaDoAlbumSaida,
)
from api.rotas.midias import apagar_midia, jobs_de_ingestao, motivo_para_manter
from core.modelos.album import FOTOS_POR_ALBUM, montar_album, montar_foto, mudanca_das_fotos
from core.modelos.escolha import escolha_no_album
from core.modelos.galeria import montar_galeria
from core.modelos.job import STATUS_EXECUTANDO as STATUS_JOB_EXECUTANDO
from core.modelos.job import STATUS_PENDENTE as STATUS_JOB_PENDENTE
from core.modelos.job import montar_job
from core.modelos.midia import STATUS_PROCESSANDO, STATUS_PRONTA, chave_arquivo, e_imagem
from core.utils import fotos_no_lugar, storage
from core.utils.mongo import agora

router = APIRouter(prefix="/api/albuns", tags=["albuns"])

# Só o que a grade usa da mídia (milhares de fotos por pedido)
CAMPOS_DA_MIDIA = {"nome": 1, "status": 1, "erro": 1, "video": 1, "exif": 1, "enviado_em": 1, "album_id": 1,
                   "job_ingestao_id": 1}


# -----------------------------------------------
# FUNÇÕES AUXILIARES
# -----------------------------------------------
def _id(valor: str, mensagem: str = "Álbum não encontrado.") -> ObjectId:
    try:
        return ObjectId(valor)
    except InvalidId as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, mensagem) from e


async def buscar_album(db, album_id: str, usuario: dict) -> dict:
    album = await db.albuns.find_one({"_id": _id(album_id), "organizacao_id": usuario["organizacao_id"]})
    if album is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Álbum não encontrado.")
    return album


def resumo_da_galeria(galeria: dict | None, favoritas: int) -> dict | None:
    if not galeria:
        return None
    return {"status": galeria["status"], "para": galeria.get("para", ""), "fotos": len(galeria.get("fotos", [])),
            "favoritas": favoritas, "expira_em": galeria["expira_em"], "pedida_em": galeria["pedida_em"],
            "nome": galeria.get("nome"), "comentario": galeria.get("comentario"),
            "enviada_em": galeria.get("enviada_em")}


def resumo_do_monitorar(monitorar: dict | None) -> dict | None:
    if not monitorar:
        return None
    campos = ("caminho", "subpastas", "analisar", "escolher", "intensidade", "etapa", "ultima_volta", "ultimas_novas",
              "erro")
    return {**{c: monitorar.get(c) for c in campos},
            "estilo_pessoal_id": str(monitorar["estilo_pessoal_id"]) if monitorar.get("estilo_pessoal_id") else None}


async def resumos(db, albuns: list[dict]) -> list[AlbumSaida]:
    """A contagem de fotos, de prontas e de escolhidas e a capa de cada álbum, numa agregação só."""
    ids = [a["_id"] for a in albuns]
    contas: dict = {}
    cursor = await db.album_fotos.aggregate([
        {"$match": {"album_id": {"$in": ids}}},
        {"$lookup": {"from": "midias", "localField": "midia_id", "foreignField": "_id", "as": "m",
                     "pipeline": [{"$project": {"status": 1}}]}},
        {"$group": {
            "_id": "$album_id",
            "fotos": {"$sum": 1},
            "prontas": {"$sum": {"$cond": [{"$eq": [{"$first": "$m.status"}, STATUS_PRONTA]}, 1, 0]}},
            "escolhidas": {"$sum": {"$cond": [{"$eq": ["$marcacao", "escolhida"]}, 1, 0]}},
            "favoritas": {"$sum": {"$cond": [{"$eq": ["$cliente.favorita", True]}, 1, 0]}},
            "capa": {"$min": {"$cond": [{"$eq": [{"$first": "$m.status"}, STATUS_PRONTA]}, "$midia_id", None]}},
        }},
    ])
    async for conta in cursor:
        contas[conta["_id"]] = conta
    saida = []
    for album in albuns:
        conta = contas.get(album["_id"], {})
        saida.append(AlbumSaida(
            id=str(album["_id"]), nome=album["nome"], genero=album["genero"], unica=bool(album.get("unica")),
            fotos=conta.get("fotos", 0),
            escolha_opcoes=album.get("escolha_opcoes"),
            prontas=conta.get("prontas", 0), escolhidas=conta.get("escolhidas", 0),
            capa_midia_id=str(conta["capa"]) if conta.get("capa") else None,
            galeria=resumo_da_galeria(album.get("galeria"), conta.get("favoritas", 0)),
            monitorar=resumo_do_monitorar(album.get("monitorar")),
            criado_em=album["criado_em"], atualizado_em=album["atualizado_em"]))
    return saida


async def tirar_fotos(db, album: dict, midia_ids: list[ObjectId]) -> FotosRemovidasSaida:
    """
    Tira as fotos do álbum. A foto enviada para ele sai do disco junto, a menos que um projeto, um modelo ou uma
    exportação a use: aí ela vai para a biblioteca, como qualquer imagem. A que veio da biblioteca só sai do álbum.
    """
    apagadas = na_biblioteca = 0
    async for midia in db.midias.find({"_id": {"$in": midia_ids}, "organizacao_id": album["organizacao_id"],
                                       "album_id": album["_id"]}):
        if await motivo_para_manter(db, midia):
            await db.midias.update_one({"_id": midia["_id"]}, {"$set": {"album_id": None, "atualizado_em": agora()}})
            na_biblioteca += 1
        else:
            await apagar_midia(db, midia)
            apagadas += 1
    # A capa e a cópia leve editadas no álbum saem com ela (a foto que fica na biblioteca não as usa)
    async for foto in db.album_fotos.find({"album_id": album["_id"], "midia_id": {"$in": midia_ids},
                                           "edicao": {"$ne": None}}, {"midia_id": 1}):
        pasta = storage.caminho_local(chave_arquivo(album["organizacao_id"], foto["midia_id"], "x")).parent
        for arquivo in pasta.glob(f"album_{album['_id']}_*"):
            arquivo.unlink(missing_ok=True)
        await db.midias.update_one({"_id": foto["midia_id"]},
                                   {"$pull": {"arquivos": {"$regex": f"^album_{album['_id']}_"}}})
    await db.album_fotos.delete_many({"album_id": album["_id"], "midia_id": {"$in": midia_ids}})
    return FotosRemovidasSaida(apagadas=apagadas, na_biblioteca=na_biblioteca)


# -----------------------------------------------
# ROTAS
# -----------------------------------------------
@router.get("", response_model=list[AlbumSaida])
async def listar_albuns(unica: bool = False, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    # Os álbuns da edição em massa, ou (com ?unica=true) as edições de uma foto
    filtro = {"organizacao_id": usuario["organizacao_id"], "unica": True if unica else {"$ne": True}}
    cursor = db.albuns.find(filtro).sort("atualizado_em", -1).limit(500)
    return await resumos(db, [a async for a in cursor])


@router.post("", response_model=AlbumSaida, status_code=status.HTTP_201_CREATED)
async def criar_album(dados: AlbumEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = montar_album(usuario["organizacao_id"], usuario["_id"], dados.nome, dados.genero, unica=dados.unica)
    album["_id"] = (await db.albuns.insert_one(album)).inserted_id
    logging.info(f"[{usuario['organizacao_id']}] Álbum criado: {album['nome']}")
    return (await resumos(db, [album]))[0]


@router.get("/pasta-do-computador", response_model=PastaDoComputadorSaida)
async def pasta_do_computador(caminho: str = "", usuario=Depends(usuario_atual)):
    """As pastas e as fotos de uma pasta da pasta das fotos do Nitro (PASTA_DAS_FOTOS_HOST no .env)."""
    if not fotos_no_lugar.disponivel():
        return PastaDoComputadorSaida(disponivel=False)
    try:
        lida = await run_in_threadpool(fotos_no_lugar.listar, caminho)
    except fotos_no_lugar.CaminhoInvalido as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    return PastaDoComputadorSaida(disponivel=True, **lida)


@router.post("/{album_id}/importar", response_model=JobDoAlbumSaida, status_code=status.HTTP_202_ACCEPTED)
async def importar_pasta(album_id: str, dados: ImportarPastaEntrada, usuario=Depends(usuario_atual),
                         db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    if not fotos_no_lugar.disponivel():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "A pasta das fotos não está montada no servidor (PASTA_DAS_FOTOS_HOST no .env).")
    try:
        await run_in_threadpool(fotos_no_lugar.listar, dados.caminho)
    except fotos_no_lugar.CaminhoInvalido as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    job = montar_job("importar_pasta", usuario["organizacao_id"],
                     {"album_id": str(album["_id"]), "caminho": dados.caminho, "subpastas": dados.subpastas},
                     criado_por=usuario["_id"])
    return JobDoAlbumSaida(job_id=str((await db.jobs.insert_one(job)).inserted_id))


@router.post("/{album_id}/analisar", response_model=JobDoAlbumSaida, status_code=status.HTTP_202_ACCEPTED)
async def analisar(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Mede as fotos prontas que ainda não foram medidas; se já há uma análise na fila ou rodando, devolve ela."""
    album = await buscar_album(db, album_id, usuario)
    return JobDoAlbumSaida(job_id=await pedir_job_do_album(db, "medir_album", album, usuario))


@router.post("/{album_id}/escolher", response_model=EscolhaSaida)
async def escolher_melhores(album_id: str, dados: EscolherEntrada, usuario=Depends(usuario_atual),
                            db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    registros = {f["midia_id"]: f async for f in db.album_fotos.find({"album_id": album["_id"]})}
    midias = {m["_id"]: m async for m in db.midias.find(
        {"_id": {"$in": list(registros)}, "status": STATUS_PRONTA}, {"exif": 1, "enviado_em": 1})}
    medidas = {m["midia_id"]: m async for m in db.fotos_medidas.find(
        {"midia_id": {"$in": list(midias)}}, {"pessoas": 0})}
    if not medidas:
        raise HTTPException(status.HTTP_409_CONFLICT, "Analise as fotos antes de escolher as melhores.")
    gravacoes, contagem = await run_in_threadpool(escolha_no_album, registros, midias, medidas, dados.model_dump(),
                                                  album["genero"], agora())
    gravacoes = [UpdateOne({"album_id": album["_id"], "midia_id": mid}, {"$set": campos}) for mid, campos in gravacoes]
    if gravacoes:
        await db.album_fotos.bulk_write(gravacoes, ordered=False)
    await db.albuns.update_one({"_id": album["_id"]},
                               {"$set": {"escolha_opcoes": dados.model_dump(), "atualizado_em": agora()}})
    return EscolhaSaida(categorias=contagem, sem_analise=len(midias) - len(medidas))


@router.get("/{album_id}", response_model=AlbumSaida)
async def ver_album(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    return (await resumos(db, [await buscar_album(db, album_id, usuario)]))[0]


@router.patch("/{album_id}", response_model=AlbumSaida)
async def atualizar_album(album_id: str, dados: AlbumAtualizarEntrada, usuario=Depends(usuario_atual),
                          db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    campos = {k: v for k, v in dados.model_dump().items() if v is not None}
    if campos:
        campos["atualizado_em"] = agora()
        await db.albuns.update_one({"_id": album["_id"]}, {"$set": campos})
        album.update(campos)
    return (await resumos(db, [album]))[0]


@router.delete("/{album_id}", response_model=FotosRemovidasSaida)
async def excluir_album(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    ids = [f["midia_id"] async for f in db.album_fotos.find({"album_id": album["_id"]}, {"midia_id": 1})]
    # As que ainda chegavam (enviando) também têm o álbum: saem junto
    ids += [m["_id"] async for m in db.midias.find({"album_id": album["_id"], "_id": {"$nin": ids}}, {"_id": 1})]
    resultado = await tirar_fotos(db, album, ids)
    await db.albuns.delete_one({"_id": album["_id"]})
    await db.album_pessoas.delete_many({"album_id": album["_id"]})
    logging.info(f"[{usuario['organizacao_id']}] Álbum excluído: {album['nome']} ({resultado.apagadas} fotos "
                 f"apagadas, {resultado.na_biblioteca} na biblioteca)")
    return resultado


@router.get("/{album_id}/fotos", response_model=list[FotoDoAlbumSaida])
async def listar_fotos(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    fotos = [f async for f in db.album_fotos.find({"album_id": album["_id"]})]
    midias = {m["_id"]: m async for m in db.midias.find({"_id": {"$in": [f["midia_id"] for f in fotos]}},
                                                         CAMPOS_DA_MIDIA)}
    jobs = await jobs_de_ingestao(db, [m for m in midias.values() if m.get("status") == STATUS_PROCESSANDO])
    medidas = {m.pop("midia_id"): m async for m in db.fotos_medidas.find(
        {"midia_id": {"$in": list(midias)}}, {"_id": 0, "vetor": 0, "pessoas": 0, "organizacao_id": 0, "medido_em": 0})}
    saida = []
    for foto in fotos:
        midia = midias.get(foto["midia_id"])
        if midia is None:
            continue
        video = midia.get("video") or {}
        job = jobs.get(midia.get("job_ingestao_id"))
        saida.append(FotoDoAlbumSaida(
            midia_id=str(midia["_id"]), nome=midia["nome"], status=midia["status"], erro=midia.get("erro"),
            progresso=job.get("progresso") if job else None, largura=video.get("largura"),
            altura=video.get("altura"), exif=midia.get("exif"), pasta=foto.get("pasta", ""), nota=foto["nota"],
            cor=foto.get("cor"), marcacao=foto.get("marcacao"), enviado_em=midia.get("enviado_em"),
            do_album=midia.get("album_id") == album["_id"], medidas=medidas.get(midia["_id"]),
            categoria=foto.get("categoria"), grupo=foto.get("grupo"), cena=foto.get("cena"),
            nota_ia=foto.get("nota_ia"), motivo=foto.get("motivo"), pessoas=foto.get("pessoas") or [],
            edicao=foto.get("edicao"), cliente=foto.get("cliente")))
    return saida


async def pedir_job_do_album(db, tipo: str, album: dict, usuario: dict) -> str:
    """O job do álbum (a análise, a edição): o que já está na fila ou rodando, ou um novo."""
    andando = await db.jobs.find_one({"tipo": tipo, "entrada.album_id": str(album["_id"]),
                                      "status": {"$in": [STATUS_JOB_PENDENTE, STATUS_JOB_EXECUTANDO]}}, {"_id": 1})
    if andando:
        return str(andando["_id"])
    job = montar_job(tipo, usuario["organizacao_id"], {"album_id": str(album["_id"])}, criado_por=usuario["_id"])
    return str((await db.jobs.insert_one(job)).inserted_id)


@router.put("/{album_id}/edicoes", response_model=JobDoAlbumSaida, status_code=status.HTTP_202_ACCEPTED)
async def editar_fotos(album_id: str, dados: EdicoesEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Guarda a edição de cada foto (a versão sobe) e põe na fila o desenho da capa e da cópia leve editadas. A
    edição vazia (cor neutra, sem giro nem recorte) conta como tirar."""
    album = await buscar_album(db, album_id, usuario)
    operacoes = []
    for item in dados.edicoes:
        midia_id = _id(item.midia_id, "Foto não encontrada.")
        filtro = {"album_id": album["_id"], "midia_id": midia_id}
        edicao = item.edicao.model_dump(exclude_none=True) if item.edicao else None
        if edicao and not edicao.get("cor") and not edicao.get("igualar") and not edicao.get("giro") \
                and not edicao.get("recorte") and not edicao.get("auto") and not edicao.get("retoque") \
                and not edicao.get("fundo") and not edicao.get("ruido") and not edicao.get("distracoes"):
            edicao = None
        if edicao is None:
            operacoes.append(UpdateOne({**filtro, "edicao": {"$ne": None}},
                                       {"$set": {"edicao": None, "edicao_tirada": True}}))
            continue
        # A edição nova inteira, com a versão seguinte; a gerada (a última desenhada) fica até a nova sair
        versao = {"versao": {"$add": [{"$ifNull": ["$edicao.versao", 0]}, 1]},
                  "gerada": {"$ifNull": ["$edicao.gerada", None]}}
        operacoes.append(UpdateOne(filtro, [{"$set": {"edicao": {"$mergeObjects": [{"$literal": edicao}, versao]}}}]))
    ids = [_id(item.midia_id, "Foto não encontrada.") for item in dados.edicoes]
    if not await db.album_fotos.count_documents({"album_id": album["_id"], "midia_id": {"$in": ids}}, limit=1):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nenhuma das fotos está no álbum.")
    await db.album_fotos.bulk_write(operacoes, ordered=False)
    return JobDoAlbumSaida(job_id=await pedir_job_do_album(db, "editar_album", album, usuario))


@router.post("/{album_id}/exportar", response_model=JobDoAlbumSaida, status_code=status.HTTP_202_ACCEPTED)
async def exportar_fotos(album_id: str, dados: ExportarAlbumEntrada, usuario=Depends(usuario_atual),
                         db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    ids = [_id(i, "Foto não encontrada.") for i in dict.fromkeys(dados.midia_ids)]
    if not await db.album_fotos.count_documents({"album_id": album["_id"], "midia_id": {"$in": ids}}, limit=1):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nenhuma das fotos está no álbum.")
    job = montar_job("exportar_album", usuario["organizacao_id"],
                     {"album_id": str(album["_id"]), "midia_ids": [str(i) for i in ids],
                      "opcoes": dados.opcoes.model_dump()}, criado_por=usuario["_id"])
    return JobDoAlbumSaida(job_id=str((await db.jobs.insert_one(job)).inserted_id))


@router.get("/{album_id}/saidas/{job_id}")
async def baixar_saida(album_id: str, job_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    job = await db.jobs.find_one({"_id": _id(job_id, "Exportação não encontrada."), "tipo": "exportar_album",
                                  "organizacao_id": usuario["organizacao_id"], "entrada.album_id": str(album["_id"])})
    caminho = storage.caminho_local(f"org_{album['organizacao_id']}/albuns/{album['_id']}/saidas/{job_id}.zip") \
        if job else None
    if not job or job.get("status") != "concluido" or not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exportação não encontrada.")
    nome = f"{album['nome']}.zip".replace('"', "")
    if album.get("unica"):
        # A edição de uma foto baixa a foto, não um ZIP com ela (o XMP, se pedido, fica de fora)
        foto = await run_in_threadpool(foto_do_zip, caminho)
        if foto:
            nome_da_foto, conteudo = foto
            return Response(conteudo, media_type=mimetypes.guess_type(nome_da_foto)[0] or "application/octet-stream",
                            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nome_da_foto)}"})
    return FileResponse(caminho, media_type="application/zip", filename=nome)


def foto_do_zip(caminho) -> tuple[str, bytes] | None:
    """O nome e os bytes da única foto do ZIP (sem os .xmp), ou None se ele tem outra coisa."""
    with zipfile.ZipFile(caminho) as arquivo:
        fotos = [item for item in arquivo.infolist()
                 if not item.is_dir() and not item.filename.lower().endswith(".xmp")]
        if len(fotos) != 1:
            return None
        return PurePosixPath(fotos[0].filename).name, arquivo.read(fotos[0])


@router.get("/{album_id}/pessoas", response_model=list[PessoaDoAlbumSaida])
async def listar_pessoas(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    return [PessoaDoAlbumSaida(numero=p["numero"], nome=p.get("nome", ""), fotos=p.get("fotos", 0),
                               capa_midia_id=str(p["capa"]["midia_id"]), caixa=p["capa"]["caixa"])
            async for p in db.album_pessoas.find({"album_id": album["_id"]}, {"centro": 0}).sort(
                [("fotos", -1), ("numero", 1)])]


@router.patch("/{album_id}/pessoas/{numero}", response_model=PessoaDoAlbumSaida)
async def nomear_pessoa(album_id: str, numero: int, dados: PessoaAtualizarEntrada, usuario=Depends(usuario_atual),
                        db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    pessoa = await db.album_pessoas.find_one_and_update(
        {"album_id": album["_id"], "numero": numero}, {"$set": {"nome": dados.nome.strip()}},
        projection={"centro": 0}, return_document=True)
    if pessoa is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pessoa não encontrada.")
    return PessoaDoAlbumSaida(numero=pessoa["numero"], nome=pessoa["nome"], fotos=pessoa.get("fotos", 0),
                              capa_midia_id=str(pessoa["capa"]["midia_id"]), caixa=pessoa["capa"]["caixa"])


@router.post("/{album_id}/fotos", response_model=list[FotoDoAlbumSaida], status_code=status.HTTP_201_CREATED)
async def adicionar_fotos(album_id: str, dados: FotosIdsEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Imagens prontas da biblioteca entram no álbum (sem cópia: continuam na biblioteca)."""
    album = await buscar_album(db, album_id, usuario)
    ids = [_id(i, "Mídia não encontrada.") for i in dict.fromkeys(dados.midia_ids)]
    ja = {f["midia_id"] async for f in db.album_fotos.find({"album_id": album["_id"], "midia_id": {"$in": ids}})}
    novas = [m async for m in db.midias.find({"_id": {"$in": [i for i in ids if i not in ja]},
                                               "organizacao_id": usuario["organizacao_id"], "status": STATUS_PRONTA})]
    novas = [m for m in novas if e_imagem(m)]
    if not novas:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Nenhuma das mídias é uma imagem pronta fora do álbum.")
    total = await db.album_fotos.count_documents({"album_id": album["_id"]})
    if total + len(novas) > FOTOS_POR_ALBUM:
        limite = f"{FOTOS_POR_ALBUM:,}".replace(",", ".")
        raise HTTPException(status.HTTP_409_CONFLICT, f"O álbum chegaria a mais de {limite} fotos.")
    momento = agora()
    await db.album_fotos.insert_many([montar_foto(usuario["organizacao_id"], album["_id"], m["_id"], momento=momento)
                                      for m in novas])
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"atualizado_em": momento}})
    return [FotoDoAlbumSaida(midia_id=str(m["_id"]), nome=m["nome"], status=m["status"],
                             largura=(m.get("video") or {}).get("largura"),
                             altura=(m.get("video") or {}).get("altura"), exif=m.get("exif"),
                             enviado_em=m.get("enviado_em"), do_album=False) for m in novas]


@router.patch("/{album_id}/fotos", status_code=status.HTTP_204_NO_CONTENT)
async def mudar_fotos(album_id: str, dados: FotosMudarEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    try:
        campos = mudanca_das_fotos(dados.nota, dados.cor, dados.marcacao, dados.tirar_cor, dados.tirar_marcacao)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    ids = [_id(i, "Mídia não encontrada.") for i in dados.midia_ids]
    momento = agora()
    # O que a pessoa marca fica marcado como dela: escolher de novo não passa por cima
    await db.album_fotos.update_many({"album_id": album["_id"], "midia_id": {"$in": ids}},
                                     {"$set": {**campos, "origem": "pessoa", "atualizado_em": momento}})
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"atualizado_em": momento}})


@router.post("/{album_id}/fotos/remover", response_model=FotosRemovidasSaida)
async def remover_fotos(album_id: str, dados: FotosIdsEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    resultado = await tirar_fotos(db, album, [_id(i, "Mídia não encontrada.") for i in dados.midia_ids])
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"atualizado_em": agora()}})
    return resultado


@router.post("/{album_id}/galeria", response_model=GaleriaCriadaSaida, status_code=status.HTTP_201_CREATED)
async def criar_galeria(album_id: str, dados: GaleriaEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Um link novo (o anterior para de valer). As marcações do cliente da galeria de antes saem: é outra rodada."""
    album = await buscar_album(db, album_id, usuario)
    ids = [_id(i, "Foto não encontrada.") for i in dados.midia_ids]
    do_album = {f["midia_id"] async for f in db.album_fotos.find({"album_id": album["_id"], "midia_id": {"$in": ids}},
                                                                  {"midia_id": 1})}
    prontas = [m["_id"] async for m in db.midias.find({"_id": {"$in": list(do_album)}, "status": STATUS_PRONTA},
                                                       {"_id": 1})]
    if not prontas:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nenhuma dessas fotos está pronta no álbum.")
    prontas_set = set(prontas)
    token, galeria = montar_galeria([i for i in ids if i in prontas_set], usuario["_id"], dados.para, dados.mensagem,
                                    agora())
    await db.album_fotos.update_many({"album_id": album["_id"], "cliente": {"$exists": True}},
                                     {"$unset": {"cliente": ""}})
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"galeria": galeria, "atualizado_em": agora()}})
    return GaleriaCriadaSaida(token=token, expira_em=galeria["expira_em"])


@router.delete("/{album_id}/galeria", status_code=status.HTTP_204_NO_CONTENT)
async def desligar_galeria(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    await db.albuns.update_one({"_id": album["_id"]}, {"$unset": {"galeria": ""}})


@router.put("/{album_id}/monitorar", response_model=AlbumSaida)
async def ligar_monitorar(album_id: str, dados: MonitorarEntrada, usuario=Depends(usuario_atual),
                          db=Depends(obter_db)):
    """Liga a pasta monitorada: o worker olha a pasta a cada minuto e traz as fotos novas, com a ação pedida."""
    album = await buscar_album(db, album_id, usuario)
    if not fotos_no_lugar.disponivel():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "A pasta das fotos não está montada no servidor (PASTA_DAS_FOTOS_HOST no .env).")
    try:
        await run_in_threadpool(fotos_no_lugar.listar, dados.caminho)
    except fotos_no_lugar.CaminhoInvalido as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    estilo_id = None
    if dados.estilo_pessoal_id:
        estilo = await db.estilos_pessoais.find_one({"_id": _id(dados.estilo_pessoal_id, "Estilo não encontrado."),
                                                     "organizacao_id": usuario["organizacao_id"]}, {"_id": 1})
        if estilo is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Estilo não encontrado.")
        estilo_id = estilo["_id"]
    monitorar = {**dados.model_dump(), "estilo_pessoal_id": estilo_id, "por": usuario["_id"], "etapa": "olhando",
                 "ligado_em": agora(), "proxima_volta": agora(), "ultima_volta": None, "ultimas_novas": 0,
                 "erro": None}
    await db.albuns.update_one({"_id": album["_id"]}, {"$set": {"monitorar": monitorar, "atualizado_em": agora()}})
    return (await resumos(db, [await buscar_album(db, album_id, usuario)]))[0]


@router.delete("/{album_id}/monitorar", status_code=status.HTTP_204_NO_CONTENT)
async def desligar_monitorar(album_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    album = await buscar_album(db, album_id, usuario)
    await db.albuns.update_one({"_id": album["_id"]}, {"$unset": {"monitorar": ""}})
