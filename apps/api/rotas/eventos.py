# -----------------------------------------------
# TakeOne API — eventos ao vivo (Server-Sent Events)
#
# O navegador abre /api/eventos e recebe cada mudança nos jobs da sua
# organização. Com o Mongo em replica set, um change stream só por processo
# (o Distribuidor) lê os jobs de todos os espaços e entrega cada evento na fila
# das conexões daquele espaço: antes, cada aba aberta abria o próprio change
# stream no Mongo. Sem replica set, cai para uma consulta periódica.
#
# O primeiro evento é "pronto". Se ele não chega ao navegador, algum proxy
# está segurando o fluxo (o túnel rápido da Cloudflare faz isso) e o painel
# passa a consultar /api/jobs sozinho.
# -----------------------------------------------
import asyncio
import json
import logging
import weakref

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pymongo.errors import OperationFailure

from api.dependencias import obter_db, usuario_atual
from api.esquemas import job_para_saida
from core.utils.mongo import agora

router = APIRouter(prefix="/api", tags=["eventos"])

INTERVALO_PING_SEGUNDOS = 15      # mantém a conexão viva no túnel da Cloudflare
INTERVALO_CONSULTA_SEGUNDOS = 2   # só no modo sem replica set
CODIGO_SEM_REPLICA_SET = 40573
ESPERA_DO_FLUXO_MS = 1000         # o change stream compartilhado confere a cada 1 s se ainda tem quem ouça
FILA_MAXIMA = 500                 # eventos guardados por conexão lenta; passando disso, os mais velhos saem


def formatar_evento(nome: str, dados: dict) -> str:
    return f"event: {nome}\ndata: {json.dumps(dados, ensure_ascii=False, default=str)}\n\n"


def evento_job(doc: dict) -> str:
    return formatar_evento("job", job_para_saida(doc).model_dump(mode="json"))


class Distribuidor:
    """
    Um change stream dos jobs para todas as conexões do processo: abre com a primeira, fecha quando a última sai.
    Cada evento é montado uma vez e vai para a fila de cada conexão do espaço do job. Se o fluxo falha, cada fila
    recebe o erro (a conexão lança e o navegador abre de novo, ou cai para a consulta sem replica set).
    """

    def __init__(self):
        self.assinantes: dict[int, tuple[object, asyncio.Queue]] = {}
        self.tarefa: asyncio.Task | None = None

    def assinar(self, db, organizacao_id) -> asyncio.Queue:
        fila: asyncio.Queue = asyncio.Queue(maxsize=FILA_MAXIMA)
        self.assinantes[id(fila)] = (organizacao_id, fila)
        if self.tarefa is None or self.tarefa.done():
            self.tarefa = asyncio.create_task(self._ler(db))
        return fila

    def sair(self, fila: asyncio.Queue):
        self.assinantes.pop(id(fila), None)

    @staticmethod
    def _entregar(fila: asyncio.Queue, item):
        if fila.full():
            # Conexão que não lê: o evento mais velho sai (o painel se acerta pelo seguinte do mesmo job)
            fila.get_nowait()
        fila.put_nowait(item)

    async def _ler(self, db):
        pipeline = [{"$match": {"operationType": {"$in": ["insert", "update", "replace"]}}}]
        try:
            fluxo = await db.jobs.watch(pipeline, full_document="updateLookup", max_await_time_ms=ESPERA_DO_FLUXO_MS)
            try:
                while self.assinantes:
                    mudanca = await fluxo.try_next()
                    doc = (mudanca or {}).get("fullDocument")
                    if not doc:
                        continue
                    evento = None
                    for organizacao_id, fila in list(self.assinantes.values()):
                        if organizacao_id == doc.get("organizacao_id"):
                            evento = evento or evento_job(doc)
                            self._entregar(fila, evento)
            finally:
                await fluxo.close()
        except Exception as e:  # noqa: BLE001 - qualquer falha do fluxo vai para as conexões, que decidem
            for _, fila in list(self.assinantes.values()):
                self._entregar(fila, e)
            return
        # Saiu porque ninguém ouvia; se alguém chegou bem nesse instante, o fluxo volta
        if self.assinantes:
            self.tarefa = asyncio.create_task(self._ler(db))


# Um distribuidor por laço de eventos: os testes abrem a API em laços diferentes
_distribuidores: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, Distribuidor]" = weakref.WeakKeyDictionary()


def distribuidor() -> Distribuidor:
    laco = asyncio.get_running_loop()
    if laco not in _distribuidores:
        _distribuidores[laco] = Distribuidor()
    return _distribuidores[laco]


async def via_change_stream(db, organizacao_id, request: Request):
    central = distribuidor()
    fila = central.assinar(db, organizacao_id)
    try:
        while not await request.is_disconnected():
            try:
                item = await asyncio.wait_for(fila.get(), INTERVALO_PING_SEGUNDOS)
            except TimeoutError:
                yield ": ping\n\n"
                continue
            if isinstance(item, BaseException):
                raise item
            yield item
    finally:
        central.sair(fila)


async def via_consulta_periodica(db, organizacao_id, request: Request):
    desde = agora()
    ultimo_ping = asyncio.get_running_loop().time()
    while not await request.is_disconnected():
        cursor = db.jobs.find({"organizacao_id": organizacao_id, "atualizado_em": {"$gt": desde}})
        async for doc in cursor.sort("atualizado_em", 1):
            desde = max(desde, doc["atualizado_em"])
            yield evento_job(doc)
        instante = asyncio.get_running_loop().time()
        if instante - ultimo_ping >= INTERVALO_PING_SEGUNDOS:
            ultimo_ping = instante
            yield ": ping\n\n"
        await asyncio.sleep(INTERVALO_CONSULTA_SEGUNDOS)


@router.get("/eventos")
async def eventos(request: Request, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    organizacao_id = usuario["organizacao_id"]

    async def gerar():
        yield "retry: 3000\n\n"
        yield formatar_evento("pronto", {})
        try:
            async for evento in via_change_stream(db, organizacao_id, request):
                yield evento
        except OperationFailure as e:
            if e.code != CODIGO_SEM_REPLICA_SET:
                raise
            logging.warning("Mongo sem replica set: eventos por consulta periódica.")
            async for evento in via_consulta_periodica(db, organizacao_id, request):
                yield evento

    return StreamingResponse(gerar(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
    })
