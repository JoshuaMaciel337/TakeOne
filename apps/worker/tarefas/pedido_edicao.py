# -----------------------------------------------
# Tarefa "pedido_edicao" — o pedido de edição em palavras, pelo LLM local (Ollama)
#
# Recebe o pedido, o que o vídeo tem hoje e as frases numeradas (sem frases, o pedido vale para os cortes ainda não
# montados de uma clipagem), pergunta ao Qwen3 8B com a resposta presa ao esquema (core/modelos/pedido_edicao.py)
# e devolve o plano conferido. Quem aplica é o editor. No modo simulado, o plano sai de palavras do pedido.
# -----------------------------------------------
import json
import logging
from collections.abc import Callable

from core.config import MODO_IA
from core.modelos.job import ErroDefinitivo
from core.modelos.pedido_edicao import ESQUEMA, conferir_plano, montar_mensagens, plano_simulado
from worker.tarefas.llm import conversar


def executar_pedido_edicao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    pedido = str(entrada.get("pedido") or "").strip()
    frases = entrada.get("frases") or []
    if not pedido:
        raise ErroDefinitivo("Escreva como quer a edição.")
    if MODO_IA != "real":
        return {"plano": plano_simulado(pedido, frases)}
    # O modelo fica na placa 2 min (ultimo=False): a pessoa costuma pedir de novo logo depois de ver o plano, e
    # subir o modelo leva de 1 a 2 min no Nitro. A transcrição e o Wan esperam a placa ficar livre
    bruto = conversar(montar_mensagens(pedido, frases, entrada.get("estado")), ESQUEMA, reportar,
                      "O modelo está lendo o pedido", temperatura=0.1, ultimo=False)
    plano = conferir_plano(bruto, frases)
    logging.info(f"Plano do pedido: {json.dumps(plano, ensure_ascii=False)}")
    reportar(100, "Plano pronto")
    return {"plano": plano}
