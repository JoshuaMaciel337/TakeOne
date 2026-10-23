# Eventos ao vivo: um change stream só para todas as conexões, e cada uma recebe só os jobs do espaço dela
import asyncio
import json

import pytest
from bson import ObjectId
from pymongo.errors import OperationFailure

from api.rotas.eventos import distribuidor, via_change_stream
from core.config import MONGO_URI
from core.modelos.job import montar_job
from core.utils.mongo import criar_cliente_async


class Conexao:
    """O pedaço do Request que o fluxo usa: se o navegador ainda está ligado."""

    def __init__(self):
        self.saiu = False

    async def is_disconnected(self):
        return self.saiu


async def _ouvir(db, organizacao_id, conexao, recebidos: list):
    async for evento in via_change_stream(db, organizacao_id, conexao):
        if evento.startswith("event: job"):
            recebidos.append(json.loads(evento.split("data: ", 1)[1]))


def test_um_fluxo_so_entrega_cada_job_ao_espaco_dele(db_limpo, monkeypatch):
    # O ping curto: cada conexão confere a saída do navegador a cada ping
    monkeypatch.setattr("api.rotas.eventos.INTERVALO_PING_SEGUNDOS", 1)

    async def cenario():
        cliente = criar_cliente_async(MONGO_URI)
        db = cliente[db_limpo.name]
        try:
            await db.command("ping")
            try:
                await (await db.jobs.watch([])).close()
            except OperationFailure:
                pytest.skip("Mongo sem replica set: os eventos vão pela consulta periódica.")
            espaco_a, espaco_b = ObjectId(), ObjectId()
            conexoes = [Conexao(), Conexao(), Conexao()]
            recebidos: list[list] = [[], [], []]
            ouvintes = [asyncio.create_task(_ouvir(db, org, conexao, lista))
                        for org, conexao, lista in zip([espaco_a, espaco_a, espaco_b], conexoes, recebidos,
                                                       strict=True)]
            await asyncio.sleep(0.5)
            central = distribuidor()
            assert len(central.assinantes) == 3 and central.tarefa is not None
            await db.jobs.insert_one(montar_job("teste", espaco_a, {"n": 1}))
            await db.jobs.insert_one(montar_job("teste", espaco_b, {"n": 2}))
            for _ in range(50):
                if len(recebidos[0]) and len(recebidos[1]) and len(recebidos[2]):
                    break
                await asyncio.sleep(0.1)
            assert [j["tipo"] for j in recebidos[0]] == ["teste"] and len(recebidos[1]) == 1
            assert len(recebidos[2]) == 1 and recebidos[2][0]["id"] != recebidos[0][0]["id"]
            # Saindo todas, o fluxo compartilhado fecha
            for conexao in conexoes:
                conexao.saiu = True
            await db.jobs.insert_one(montar_job("teste", espaco_a, {"n": 3}))
            await asyncio.wait_for(asyncio.gather(*ouvintes), 20)
            await asyncio.wait_for(central.tarefa, 5)
            assert not central.assinantes
        finally:
            await cliente.close()

    asyncio.run(cenario())
