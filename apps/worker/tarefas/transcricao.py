# -----------------------------------------------
# Tarefa "transcricao" — a fala de uma mídia, com o tempo de cada palavra
#
# faster-whisper (large-v3-turbo, int8, uns 3 GB de VRAM) ouve o áudio de análise que a ingestão
# gerou (WAV mono de 16 kHz), em fatias de 10 min. Ele roda num processo à parte, que termina no fim
# do job: só assim a RAM e a VRAM do modelo voltam para o sistema (o processo do worker guardava uns
# 2,5 GB depois de soltar o modelo). Com 8 GB de VRAM cabe um modelo por vez. No modo simulado
# (MODO_IA=simulado) não há modelo: as palavras são de exemplo, para testar o fluxo das legendas sem GPU.
# Adaptado da transcrição do HolyCut, sem o alinhamento do WhisperX (o tempo por palavra do
# faster-whisper basta para as legendas).
# -----------------------------------------------
import logging
import multiprocessing
import queue
import tempfile
from array import array
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.config import MODO_IA
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_AUDIO_ANALISE, ARQUIVO_NIVEIS, NIVEIS_POR_SEGUNDO, chave_arquivo
from core.modelos.transcricao import (
    MODELO,
    STATUS_ERRO,
    STATUS_PRONTA,
    aparar_no_silencio,
    encaixar_recuperadas,
    fatias_de,
    limpar_palavras,
    palavras_simuladas,
    repete_vizinhas,
    trechos_suspeitos,
)
from core.utils import storage
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg
from core.utils.mongo import agora


def _ouvir(modelo, caminho: Path, idioma: str | None, deslocamento: float, duracao: float,
           reportar: Callable[[int, str], None]) -> tuple[list[dict], str | None]:
    segmentos, info = modelo.transcribe(
        str(caminho),
        language=idioma,
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=False,
        beam_size=5,
    )
    palavras = []
    for segmento in segmentos:
        for palavra in segmento.words or []:
            palavras.append({"texto": palavra.word, "inicio": deslocamento + palavra.start,
                             "fim": deslocamento + palavra.end})
        if duracao:
            reportar(min(95, 10 + int(85 * (deslocamento + (segmento.end or 0)) / duracao)), "Transcrevendo")
    return palavras, info.language


# Na recuperação da fala omitida: folga em volta de cada trecho, e no máximo tantos trechos por mídia
FOLGA_DO_TRECHO_S = 0.15
MAXIMO_DE_TRECHOS = 200
TAXA_DO_WHISPER = 16000


def recuperar_omitidas(modelo, caminho: Path, palavras: list[dict], niveis, idioma: str | None,
                       duracao: float) -> list[dict]:
    """
    Ouve de novo, sozinhos, os trechos onde o Whisper pode ter omitido fala (core/modelos/transcricao.py)
    e encaixa o que voltar, se repetir palavras vizinhas. É o que deixa os retakes aparecerem no texto.
    """
    from faster_whisper import decode_audio

    palavras = aparar_no_silencio(limpar_palavras(palavras), niveis, NIVEIS_POR_SEGUNDO)
    trechos = trechos_suspeitos(palavras, niveis, NIVEIS_POR_SEGUNDO, duracao)[:MAXIMO_DE_TRECHOS]
    if not trechos:
        return palavras
    audio = decode_audio(str(caminho), sampling_rate=TAXA_DO_WHISPER)
    recuperados = 0
    for inicio, fim in trechos:
        a, b = max(0.0, inicio - FOLGA_DO_TRECHO_S), min(duracao, fim + FOLGA_DO_TRECHO_S)
        segmentos, _ = modelo.transcribe(audio[int(a * TAXA_DO_WHISPER):int(b * TAXA_DO_WHISPER)], language=idioma,
                                         vad_filter=True, word_timestamps=True, condition_on_previous_text=False,
                                         beam_size=5)
        novas = [{"texto": w.word, "inicio": a + w.start, "fim": a + w.end} for s in segmentos for w in s.words or []]
        novas = aparar_no_silencio(limpar_palavras(novas), niveis, NIVEIS_POR_SEGUNDO)
        if len(novas) > 1 and repete_vizinhas(novas, palavras, inicio, fim):
            palavras = encaixar_recuperadas(palavras, novas, inicio, fim)
            recuperados += 1
    logging.info(f"Fala omitida: {len(trechos)} trechos suspeitos, {recuperados} com repetição recuperada.")
    return palavras


def transcrever(caminho: Path, idioma: str | None, duracao: float,
                reportar: Callable[[int, str], None], niveis=None) -> tuple[list[dict], str]:
    import ctranslate2
    from faster_whisper import WhisperModel

    if ctranslate2.get_cuda_device_count() < 1:
        raise ErroDefinitivo("A GPU não está disponível para a transcrição.")
    reportar(5, "Carregando o modelo de transcrição")
    modelo = WhisperModel(MODELO, device="cuda", compute_type="int8")
    palavras, detectado = [], idioma
    fatias = fatias_de(duracao)
    with tempfile.TemporaryDirectory(prefix="takeone-fala-") as pasta:
        for indice, (inicio, fim) in enumerate(fatias):
            arquivo = caminho
            if len(fatias) > 1:
                arquivo = Path(pasta) / f"fatia-{indice:02d}.wav"
                try:
                    executar_ffmpeg(["-ss", f"{inicio:.3f}", "-to", f"{fim:.3f}", "-i", str(caminho),
                                     "-c", "copy", str(arquivo)])
                except ErroFFmpeg as erro:
                    raise ErroDefinitivo("Não foi possível separar um trecho do áudio para transcrever.") from erro
            # O idioma da primeira fatia vale para as outras
            da_fatia, detectado = _ouvir(modelo, arquivo, detectado, inicio, duracao, reportar)
            palavras += da_fatia
    if niveis:
        reportar(96, "Procurando fala repetida")
        palavras = recuperar_omitidas(modelo, caminho, palavras, niveis, detectado, duracao)
    return palavras, detectado or "pt"


def _transcrever_no_filho(caminho: str, idioma: str | None, duracao: float, caminho_niveis: str | None, fila) -> None:
    """Roda no processo filho: manda o progresso e o resultado (ou o erro) pela fila."""
    try:
        # Os níveis são int8 com sinal (dB), um por janela de 10 ms
        niveis = array("b", Path(caminho_niveis).read_bytes()) if caminho_niveis else None
        palavras, detectado = transcrever(Path(caminho), idioma, duracao, lambda p, m: fila.put(("progresso", p, m)),
                                          niveis)
        fila.put(("fim", palavras, detectado))
    except ErroDefinitivo as erro:
        fila.put(("definitivo", str(erro)))
    except Exception as erro:  # noqa: BLE001 - o pai decide se tenta de novo
        fila.put(("erro", f"{type(erro).__name__}: {erro}"))


def transcrever_em_outro_processo(caminho: Path, idioma: str | None, duracao: float,
                                  reportar: Callable[[int, str], None],
                                  caminho_niveis: Path | None = None) -> tuple[list[dict], str]:
    """A transcrição num processo novo (spawn), que leva o modelo embora quando termina."""
    contexto = multiprocessing.get_context("spawn")
    fila = contexto.Queue()
    niveis = str(caminho_niveis) if caminho_niveis else None
    filho = contexto.Process(target=_transcrever_no_filho, args=(str(caminho), idioma, duracao, niveis, fila),
                             daemon=True)
    filho.start()
    try:
        while True:
            try:
                mensagem = fila.get(timeout=5)
            except queue.Empty:
                if not filho.is_alive():
                    codigo = filho.exitcode
                    raise RuntimeError(f"O processo da transcrição parou sem responder (código {codigo}).") from None
                continue
            if mensagem[0] == "progresso":
                reportar(mensagem[1], mensagem[2])
            elif mensagem[0] == "fim":
                return mensagem[1], mensagem[2]
            elif mensagem[0] == "definitivo":
                raise ErroDefinitivo(mensagem[1])
            else:
                raise RuntimeError(mensagem[1])
    finally:
        filho.join(timeout=30)
        if filho.is_alive():
            filho.kill()


def marcar_transcricao_com_erro(db, job: dict, mensagem: str):
    """Chamado quando a transcrição falha de vez: o editor mostra o erro."""
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.transcricoes.update_one({"midia_id": ObjectId(midia_id)}, {"$set": {
            "status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora(),
        }})


def executar_transcricao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes da transcrição.")
    if not midia.get("audio"):
        raise ErroDefinitivo("Esta mídia não tem áudio para transcrever.")
    organizacao_id = midia["organizacao_id"]
    caminho = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_AUDIO_ANALISE))
    if not caminho.is_file():
        raise ErroDefinitivo("O áudio de análise desta mídia não foi encontrado. Envie o arquivo de novo.")
    pedido = job["entrada"].get("idioma") or "auto"
    duracao = float(midia.get("duracao") or 0)
    rotulo = f"[{organizacao_id}] [midia {midia_id}]"

    niveis = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_NIVEIS))
    if MODO_IA == "real":
        brutas, idioma = transcrever_em_outro_processo(caminho, None if pedido == "auto" else pedido, duracao, reportar,
                                                       niveis if niveis.is_file() else None)
    else:
        brutas, idioma = palavras_simuladas(duracao), "pt" if pedido == "auto" else pedido
    palavras = limpar_palavras(brutas)
    if niveis.is_file():
        # Os níveis são int8 com sinal (dB), um por janela de 10 ms
        palavras = aparar_no_silencio(palavras, array("b", niveis.read_bytes()), NIVEIS_POR_SEGUNDO)

    db.transcricoes.update_one({"midia_id": midia_id}, {"$set": {
        "status": STATUS_PRONTA, "idioma": idioma, "modelo": MODELO if MODO_IA == "real" else "simulado",
        "palavras": palavras, "erro": None, "atualizado_em": agora(),
    }})
    logging.info(f"{rotulo} Transcrição pronta: {len(palavras)} palavras, idioma {idioma}.")
    reportar(100, "Transcrição pronta")
    return {"midia_id": str(midia_id), "palavras": len(palavras), "idioma": idioma}
