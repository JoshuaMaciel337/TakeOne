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
from core.modelos.palavras_chave import (
    ESQUEMA,
    MAXIMO_DE_LEGENDAS,
    conferir_escolhas,
    escolhas_simuladas,
    montar_mensagens,
)
from worker.tarefas.llm import conversar


def executar_palavras_chave(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    legendas = job["entrada"]["legendas"]
    if not legendas:
        raise ErroDefinitivo("Não há legendas para destacar.")
    if MODO_IA != "real":
        return {"chaves": escolhas_simuladas(legendas)}
    # Em lotes que cabem no contexto do modelo; cada lote é numerado do zero e conferido sozinho
    lotes = [legendas[i:i + MAXIMO_DE_LEGENDAS] for i in range(0, len(legendas), MAXIMO_DE_LEGENDAS)]
    chaves = {}
    for n, lote in enumerate(lotes):
        texto = "O modelo está lendo as legendas" + (f" ({n + 1} de {len(lotes)})" if len(lotes) > 1 else "")
        bruto = conversar(montar_mensagens(lote), ESQUEMA, reportar, texto, primeiro=n == 0,
                          ultimo=n == len(lotes) - 1, progresso=45 + 50 * n // len(lotes))
        chaves.update(conferir_escolhas(bruto, lote))
    logging.info(f"Palavras-chave em {len(chaves)} de {len(legendas)} legendas.")
    reportar(100, "Palavras-chave prontas")
    return {"chaves": chaves}
