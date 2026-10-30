# -----------------------------------------------
# Tarefa "emojis" — o emoji automático das legendas (o Clipar, ADR 0004, 14.8), pelo LLM local (Ollama)
#
# Recebe o texto de cada legenda, pergunta ao Qwen3 8B com a resposta presa a um esquema JSON
# (core/modelos/emojis.py, só os nomes da lista) e devolve, por legenda, o nome do emoji. O editor pede o desenho
# de cada um (POST /api/elementos/emojis) e põe acima da legenda. No modo simulado a escolha é previsível.
# -----------------------------------------------
import logging
from collections.abc import Callable

from core.config import MODO_IA
from core.modelos.emojis import ESQUEMA, conferir_escolhas, escolhas_simuladas, montar_mensagens
from core.modelos.job import ErroDefinitivo
from core.modelos.palavras_chave import MAXIMO_DE_LEGENDAS
from worker.tarefas.llm import conversar


def executar_emojis(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    legendas = job["entrada"]["legendas"]
    if not legendas:
        raise ErroDefinitivo("Não há legendas para pôr emojis.")
    if MODO_IA != "real":
        return {"emojis": escolhas_simuladas(legendas)}
    # Em lotes que cabem no contexto do modelo; cada lote é numerado do zero e conferido sozinho
    lotes = [legendas[i:i + MAXIMO_DE_LEGENDAS] for i in range(0, len(legendas), MAXIMO_DE_LEGENDAS)]
    emojis = {}
    for n, lote in enumerate(lotes):
        texto = "O modelo está escolhendo os emojis" + (f" ({n + 1} de {len(lotes)})" if len(lotes) > 1 else "")
        bruto = conversar(montar_mensagens(lote), ESQUEMA, reportar, texto, primeiro=n == 0,
                          ultimo=n == len(lotes) - 1, progresso=45 + 50 * n // len(lotes))
        emojis.update(conferir_escolhas(bruto, lote))
    logging.info(f"Emojis em {len(emojis)} de {len(legendas)} legendas.")
    reportar(100, "Emojis prontos")
    return {"emojis": emojis}
