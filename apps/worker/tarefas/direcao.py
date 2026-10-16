# -----------------------------------------------
# Tarefa "direcao" — o plano do "Criar automaticamente", pelo LLM local (Ollama)
#
# Recebe as palavras da faixa principal no tempo da linha do tempo, pergunta ao Qwen3 8B com a resposta
# presa a um esquema JSON (core/modelos/direcao.py) e devolve o plano conferido. O editor é quem aplica:
# o plano só aponta números de palavras. No modo simulado (MODO_IA=simulado) não há modelo: o plano é
# previsível, para testar o fluxo.
# -----------------------------------------------
import json
import logging
from collections.abc import Callable

from core.config import MODO_IA
from core.modelos.direcao import ESQUEMA, conferir_plano, montar_mensagens, plano_simulado
from core.modelos.job import ErroDefinitivo
from worker.tarefas.llm import conversar


def executar_direcao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    palavras, duracao = entrada["palavras"], float(entrada["duracao"])
    if not palavras:
        raise ErroDefinitivo("Não há fala na faixa principal para montar o plano.")
    if MODO_IA != "real":
        return {"plano": plano_simulado(palavras)}
    bruto = conversar(montar_mensagens(palavras, duracao), ESQUEMA, reportar, "O modelo está lendo a fala")
    plano = conferir_plano(bruto, palavras)
    logging.info(f"Plano: {json.dumps(plano, ensure_ascii=False)}")
    reportar(100, "Plano pronto")
    return {"plano": plano}
