# -----------------------------------------------
# TakeOne — a lixeira dos projetos (ADR 0007, 17.7)
#
# Excluir um projeto o leva para a lixeira (`lixeira_em`); a manutenção do dia (o agendador do backup) apaga de vez os
# que estão lá há mais de 30 dias, com as exportações deles. As mídias ficam na biblioteca, como sempre.
# -----------------------------------------------
import logging
from datetime import timedelta

from core.modelos.exportacao import pasta_da_exportacao
from core.utils import storage
from core.utils.mongo import agora

DIAS_NA_LIXEIRA = 30


def esvaziar_lixeira(db, dias: int = DIAS_NA_LIXEIRA) -> int:
    """Apaga de vez os projetos na lixeira há mais de `dias` dias; devolve quantos."""
    limite = agora() - timedelta(days=dias)
    vencidos = list(db.projetos.find({"lixeira_em": {"$ne": None, "$lt": limite}}, {"organizacao_id": 1}))
    for projeto in vencidos:
        for exportacao in db.exportacoes.find({"projeto_id": projeto["_id"]}, {"organizacao_id": 1}):
            storage.remover_pasta(pasta_da_exportacao(exportacao["organizacao_id"], exportacao["_id"]))
        db.exportacoes.delete_many({"projeto_id": projeto["_id"]})
        db.projetos.delete_one({"_id": projeto["_id"]})
    if vencidos:
        logging.info(f"Lixeira: {len(vencidos)} projetos apagados de vez (mais de {dias} dias lá).")
    return len(vencidos)
