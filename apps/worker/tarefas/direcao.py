# -----------------------------------------------
# Tarefa "direcao" — o plano do "Criar automaticamente", pelo LLM local (Ollama)
#
# Recebe as palavras da faixa principal no tempo da linha do tempo, pergunta ao Qwen3 8B com a resposta
# presa a um esquema JSON (core/modelos/direcao.py) e devolve o plano conferido. O editor é quem aplica:
# o plano só aponta números de palavras. O modelo vem do Ollama na primeira vez (uns 5 GB, no volume
# ollama_modelos) e sai da placa no fim de cada pedido (keep_alive 0), para o Whisper e o Wan terem espaço.
# No modo simulado (MODO_IA=simulado) não há modelo: o plano é previsível, para testar o fluxo.
# -----------------------------------------------
import json
import logging
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from collections.abc import Callable

from core.config import MODELO_LLM, MODO_IA, OLLAMA_URL
from core.modelos.direcao import ESQUEMA, conferir_plano, montar_mensagens, plano_simulado
from core.modelos.job import ErroDefinitivo

VRAM_LIVRE_MINIMA_MB = 6000        # o Qwen3 8B em 4 bits com 8 mil de contexto usa uns 5,5 GB
ESPERA_MAXIMA_PELA_PLACA_S = 15 * 60


def _pedir(caminho: str, corpo: dict | None = None, tempo_limite: float = 30):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    pedido = urllib.request.Request(OLLAMA_URL + caminho, data=dados, headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(pedido, timeout=tempo_limite)


def _vram_livre_mb() -> int | None:
    if not shutil.which("nvidia-smi"):
        return None
    try:
        saida = subprocess.run(["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
                               capture_output=True, text=True, timeout=10, check=True).stdout
        return int(saida.split()[0])
    except (subprocess.SubprocessError, ValueError, IndexError):
        return None


def _garantir_modelo(reportar: Callable[[int, str], None]):
    """Baixa o modelo na primeira vez, mostrando o progresso. O Ollama desligado é erro definitivo."""
    try:
        with _pedir("/api/tags", tempo_limite=10) as resposta:
            modelos = {m["name"] for m in json.load(resposta).get("models", [])}
    except (urllib.error.URLError, OSError) as e:
        raise ErroDefinitivo("O serviço do modelo de linguagem está desligado. Ligue com "
                             "\"docker compose --profile gpu up -d\" e peça de novo.") from e
    if MODELO_LLM in modelos or f"{MODELO_LLM}:latest" in modelos:
        return
    logging.info(f"Baixando o modelo {MODELO_LLM} (só na primeira vez).")
    with _pedir("/api/pull", {"model": MODELO_LLM, "stream": True}, tempo_limite=3600) as resposta:
        for linha in resposta:
            estado = json.loads(linha)
            if estado.get("error"):
                raise RuntimeError(f"O download do modelo falhou: {estado['error']}")
            if estado.get("total"):
                parte = estado.get("completed", 0) / estado["total"]
                reportar(min(40, int(40 * parte)), f"Baixando o modelo de linguagem (uns 5 GB, só na primeira vez) · "
                                                   f"{int(100 * parte)}%")


def _esperar_a_placa(reportar: Callable[[int, str], None]):
    inicio = time.monotonic()
    while (livre := _vram_livre_mb()) is not None and livre < VRAM_LIVRE_MINIMA_MB:
        if time.monotonic() - inicio > ESPERA_MAXIMA_PELA_PLACA_S:
            raise ErroDefinitivo("A placa de vídeo ficou ocupada por 15 minutos. "
                                 "Peça de novo quando ela estiver livre.")
        logging.info(f"Esperando a placa para o LLM: {livre} MB livres.")
        reportar(42, "Esperando a placa de vídeo ficar livre")
        time.sleep(20)


def executar_direcao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    palavras, duracao = entrada["palavras"], float(entrada["duracao"])
    if not palavras:
        raise ErroDefinitivo("Não há fala na faixa principal para montar o plano.")
    if MODO_IA != "real":
        return {"plano": plano_simulado(palavras)}

    _garantir_modelo(reportar)
    _esperar_a_placa(reportar)
    reportar(45, "O modelo está lendo a fala")
    inicio = time.monotonic()
    corpo = {"model": MODELO_LLM, "messages": montar_mensagens(palavras, duracao), "format": ESQUEMA,
             "stream": False, "think": False, "keep_alive": 0,
             "options": {"temperature": 0.2, "num_ctx": 8192}}
    try:
        with _pedir("/api/chat", corpo, tempo_limite=900) as resposta:
            conteudo = json.load(resposta)["message"]["content"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"O Ollama recusou o pedido: {e.read().decode(errors='replace')[:300]}") from e
    try:
        bruto = json.loads(conteudo)
    except json.JSONDecodeError as e:
        raise RuntimeError("O modelo não devolveu um plano válido.") from e
    plano = conferir_plano(bruto if isinstance(bruto, dict) else {}, palavras)
    logging.info(f"Plano em {time.monotonic() - inicio:.0f} s: {json.dumps(plano, ensure_ascii=False)}")
    reportar(100, "Plano pronto")
    return {"plano": plano}
