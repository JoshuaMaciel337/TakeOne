# -----------------------------------------------
# Tarefa "palavras_chave" — as palavras-chave das legendas, pelo LLM local (Ollama)
#
# Recebe o texto de cada legenda, pergunta ao Qwen3 8B com a resposta presa a um esquema JSON
# (core/modelos/palavras_chave.py) e devolve, por legenda, os números das palavras para destacar. O editor
# é quem pinta. No modo simulado (MODO_IA=simulado) a escolha é previsível, para testar o fluxo.
# -----------------------------------------------
import logging
from collections.abc import Callable

from core.config import MODO_IA
from core.modelos.job import ErroDefinitivo
from core.modelos.palavras_chave import ESQUEMA, conferir_escolhas, escolhas_simuladas, montar_mensagens
from worker.tarefas.llm import conversar


def executar_palavras_chave(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    legendas = job["entrada"]["legendas"]
    if not legendas:
        raise ErroDefinitivo("Não há legendas para destacar.")
    if MODO_IA != "real":
        return {"chaves": escolhas_simuladas(legendas)}
    bruto = conversar(montar_mensagens(legendas), ESQUEMA, reportar, "O modelo está lendo as legendas")
    chaves = conferir_escolhas(bruto, legendas)
    logging.info(f"Palavras-chave em {len(chaves)} de {len(legendas)} legendas.")
    reportar(100, "Palavras-chave prontas")
    return {"chaves": chaves}
