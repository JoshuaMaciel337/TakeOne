# -----------------------------------------------
# Tarefa "gancho" — a frase do gancho narrado do corte (o Clipar, ADR 0004, 14.8), pelo LLM local (Ollama)
#
# Recebe o título e o texto do corte e pede ao Qwen3 8B uma frase curta (core/modelos/gancho.py). Uma frase que não
# passa na conferência (longa, curta, com clichê) é pedida de novo, uma vez. O editor manda a frase ao texto em fala.
# -----------------------------------------------
import logging
from collections.abc import Callable

from core.config import MODO_IA
from core.modelos.gancho import ESQUEMA, FRASE_SIMULADA, conferir_frase, montar_mensagens
from core.modelos.job import ErroDefinitivo
from worker.tarefas.llm import conversar

TENTATIVAS = 2


def executar_gancho(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    if MODO_IA != "real":
        return {"frase": FRASE_SIMULADA}
    for tentativa in range(TENTATIVAS):
        bruto = conversar(montar_mensagens(entrada["titulo"], entrada["texto"]), ESQUEMA, reportar,
                          "O modelo está escrevendo o gancho", temperatura=0.4 + 0.3 * tentativa,
                          primeiro=tentativa == 0, ultimo=tentativa == TENTATIVAS - 1, progresso=50)
        frase = conferir_frase(bruto)
        if frase:
            logging.info(f"Gancho escrito: {frase}")
            reportar(100, "Gancho pronto")
            return {"frase": frase}
        logging.info(f"Gancho recusado: {bruto}")
    raise ErroDefinitivo("O modelo não escreveu um gancho que sirva. Escreva a frase você mesmo.")
