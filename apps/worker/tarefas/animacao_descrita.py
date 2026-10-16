# -----------------------------------------------
# Tarefa "animacao_descrita" — "Descreva a animação" (experimental), pelo LLM local
#
# O Qwen3 escreve a animação em HTML e CSS a partir do pedido da pessoa (core/modelos/animacao_descrita.py);
# o que ele devolve é limpo e vira o modelo "livre". A gravação é a mesma das outras animações, no worker
# de CPU (tarefa animacao_html), e depois vem a ingestão. No modo simulado não há modelo: a animação é
# um texto simples com o pedido.
# -----------------------------------------------
import logging
from collections.abc import Callable

from bson import ObjectId

from core.config import MODO_IA
from core.modelos.animacao_descrita import (
    ESQUEMA,
    esquema_da_escolha,
    mensagens_da_escolha,
    montar_mensagens,
    resposta_simulada,
    separar_resposta,
)
from core.modelos.animacao_html import LIVRE, MODELOS, ErroAnimacao, conferir_campos
from core.modelos.job import ErroDefinitivo, montar_job
from core.utils.mongo import agora
from worker.tarefas.llm import conversar


def executar_animacao_descrita(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    if db.midias.count_documents({"_id": midia_id}, limit=1) == 0:
        raise ErroDefinitivo("A mídia foi excluída antes de a animação ser escrita.")
    modelo, campos = LIVRE, None
    if MODO_IA == "real":
        # Primeiro tenta um modelo pronto; só escreve código do zero quando nenhum serve
        escolha = conversar(mensagens_da_escolha(entrada["descricao"]), esquema_da_escolha(), reportar,
                            "O modelo está escolhendo a animação")
        if escolha.get("modelo") in MODELOS:
            try:
                campos = conferir_campos(escolha["modelo"], {**(escolha.get("campos") or {}),
                                                             **entrada.get("cores", {})})
                modelo = escolha["modelo"]
            except ErroAnimacao as e:
                logging.info(f"[midia {midia_id}] Modelo {escolha['modelo']} com campos ruins ({e}); "
                             "escrevendo do zero.")
        if campos is None:
            bruto = conversar(montar_mensagens(entrada["descricao"], entrada["duracao"], entrada["proporcao"]),
                              ESQUEMA, reportar, "O modelo está escrevendo a animação", temperatura=0.5)
    else:
        bruto = resposta_simulada(entrada["descricao"])
    if campos is None:
        try:
            css, html = separar_resposta(bruto)
            campos = conferir_campos(LIVRE, {**entrada.get("cores", {}), "css": css, "html": html})
        except ErroAnimacao as e:
            raise ErroDefinitivo(str(e)) from e
    gravacao = montar_job("animacao_html", job["organizacao_id"],
                          {"midia_id": str(midia_id), "modelo": modelo, "campos": campos,
                           "proporcao": entrada["proporcao"], "duracao": entrada["duracao"]},
                          criado_por=job.get("criado_por"))
    gravacao_id = db.jobs.insert_one(gravacao).inserted_id
    resultado = db.midias.update_one({"_id": midia_id}, {"$set": {
        "animacao.modelo": modelo, "animacao.campos": campos, "job_ingestao_id": gravacao_id,
        "atualizado_em": agora()}})
    if resultado.matched_count == 0:
        db.jobs.delete_one({"_id": gravacao_id})
        raise ErroDefinitivo("A mídia foi excluída enquanto a animação era escrita.")
    logging.info(f"[midia {midia_id}] Animação {modelo}: {campos if modelo != LIVRE else 'escrita do zero'}.")
    reportar(100, "Animação escrita")
    return {"midia_id": str(midia_id)}
