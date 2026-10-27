# -----------------------------------------------
# O LLM local (Ollama com o Qwen3 8B), para as tarefas do worker de GPU que conversam com ele
#
# O modelo vem do Ollama na primeira vez (uns 5 GB, no volume ollama_modelos), a resposta é presa a um
# esquema JSON e o modelo sai da placa no fim de cada pedido (keep_alive 0), para o Whisper e o Wan.
# -----------------------------------------------
import json
import logging
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from collections.abc import Callable

from core.config import MODELO_LLM, OLLAMA_URL
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


def garantir_modelo(reportar: Callable[[int, str], None]):
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


def esperar_a_placa(reportar: Callable[[int, str], None], minimo_mb: int = VRAM_LIVRE_MINIMA_MB,
                    para: str = "o LLM", progresso: int = 42):
    """Espera a placa ter minimo_mb livres (o LLM, ou o Whisper da transcrição, que não esperava e caía com um
    "CUDA failed" quando o ComfyUI segurava a memória)."""
    from worker.tarefas.geracao_video import soltar_comfyui_parado

    inicio = time.monotonic()
    soltou = False
    while (livre := _vram_livre_mb()) is not None and livre < minimo_mb:
        # Um Wan esquecido no ComfyUI parado (geração órfã) sai primeiro
        if not soltou:
            soltou = soltar_comfyui_parado()
            if soltou:
                continue
        if time.monotonic() - inicio > ESPERA_MAXIMA_PELA_PLACA_S:
            raise ErroDefinitivo("A placa de vídeo ficou ocupada por 15 minutos. "
                                 "Peça de novo quando ela estiver livre.")
        logging.info(f"Esperando a placa para {para}: {livre} MB livres.")
        reportar(progresso, "Esperando a placa de vídeo ficar livre")
        time.sleep(20)


# O contexto do modelo: com ele, o Qwen3 8B cabe inteiro nos 8 GB da placa. Os pedidos são medidos para caber
CONTEXTO = 8192


def conversar(mensagens: list[dict], esquema: dict, reportar: Callable[[int, str], None], mensagem: str,
              temperatura: float = 0.2, primeiro: bool = True, ultimo: bool = True,
              progresso: int = 45) -> dict:
    """
    Pergunta ao modelo e devolve o JSON da resposta (preso ao esquema). Numa sequência de pedidos (lotes),
    só o primeiro espera a placa (depois, quem ocupa a placa é o próprio modelo) e só o último solta o modelo.
    """
    if primeiro:
        garantir_modelo(reportar)
        esperar_a_placa(reportar)
    reportar(progresso, mensagem)
    inicio = time.monotonic()
    corpo = {"model": MODELO_LLM, "messages": mensagens, "format": esquema, "stream": False, "think": False,
             "keep_alive": 0 if ultimo else "2m", "options": {"temperature": temperatura, "num_ctx": CONTEXTO}}
    try:
        with _pedir("/api/chat", corpo, tempo_limite=900) as resposta:
            conteudo = json.load(resposta)["message"]["content"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"O Ollama recusou o pedido: {e.read().decode(errors='replace')[:300]}") from e
    try:
        bruto = json.loads(conteudo)
    except json.JSONDecodeError as e:
        raise RuntimeError("O modelo não devolveu uma resposta válida.") from e
    logging.info(f"Resposta do LLM em {time.monotonic() - inicio:.0f} s.")
    return bruto if isinstance(bruto, dict) else {}
