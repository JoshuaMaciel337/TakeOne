# -----------------------------------------------
# Tarefa "fala" — texto em fala com o Kokoro-82M na CPU (core/utils/fala.py)
#
# Como a geração de vídeo: a mídia já está na biblioteca (criada pela API com status "processando"); a
# fala vira o original dela, em AAC, e segue para a ingestão como um envio comum. Sem o modelo e no modo
# simulado (o CI não baixa os 326 MB), sai um tom do tamanho aproximado da fala, para testar o fluxo.
# -----------------------------------------------
import logging
import tempfile
import wave
from collections.abc import Callable
from pathlib import Path

import numpy as np
from bson import ObjectId

from core.config import ESPEAK, MODELO_FALA, MODO_IA
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import PRIORIDADE_INGESTAO, chave_arquivo, pasta_da_midia
from core.utils import storage
from core.utils.fala import TAXA, sintetizar
from core.utils.ffmpeg import executar_ffmpeg
from core.utils.mongo import agora

LETRAS_POR_SEGUNDO = 15


def _salvar_wav(caminho: Path, som: np.ndarray):
    with wave.open(str(caminho), "wb") as arquivo:
        arquivo.setnchannels(1)
        arquivo.setsampwidth(2)
        arquivo.setframerate(TAXA)
        arquivo.writeframes((np.clip(som, -1, 1) * 32767).astype("<i2").tobytes())


def _som_simulado(texto: str) -> np.ndarray:
    t = np.arange(int(max(1.0, len(texto) / LETRAS_POR_SEGUNDO) * TAXA)) / TAXA
    return (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def executar_fala(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de a fala ficar pronta.")
    organizacao_id = midia["organizacao_id"]
    reportar(2, "Preparando a voz")
    if (MODELO_FALA / "model.onnx").is_file():
        som = sintetizar(entrada["texto"], MODELO_FALA, entrada["voz"], float(entrada["velocidade"]), ESPEAK,
                         lambda fracao: reportar(5 + int(85 * fracao), "Falando o texto"))
    elif MODO_IA != "real":
        som = _som_simulado(entrada["texto"])
    else:
        raise ErroDefinitivo("O modelo de voz não está instalado no worker. Reconstrua a imagem do worker.")
    if not len(som):
        raise ErroDefinitivo("O texto não tem nada que dê para falar.")

    # A síntese leva até um minuto: se a mídia foi excluída nesse meio-tempo, a pasta não é recriada
    if db.midias.count_documents({"_id": midia_id}, limit=1) == 0:
        raise ErroDefinitivo("A mídia foi excluída enquanto a fala era gerada.")
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    original.parent.mkdir(parents=True, exist_ok=True)
    parcial = original.with_name("fala.parcial.m4a")
    reportar(92, "Salvando o áudio")
    try:
        with tempfile.TemporaryDirectory() as pasta:
            wav = Path(pasta) / "fala.wav"
            _salvar_wav(wav, som)
            executar_ffmpeg(["-i", str(wav), "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-f", "mp4", str(parcial)])
        parcial.replace(original)
    except BaseException:
        parcial.unlink(missing_ok=True)
        raise
    # Daqui em diante é uma mídia enviada como outra qualquer: a ingestão faz a forma de onda e o resto
    ingestao = montar_job("ingestao", organizacao_id, {"midia_id": str(midia_id)},
                          prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"))
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    momento = agora()
    resultado = db.midias.update_one({"_id": midia_id}, {"$set": {
        "tamanho_total": original.stat().st_size, "bytes_recebidos": original.stat().st_size,
        "job_ingestao_id": ingestao_id, "enviado_em": momento, "atualizado_em": momento,
    }})
    if resultado.matched_count == 0:
        # Excluída enquanto o áudio era salvo: a pasta que o worker criou sai junto, senão fica órfã no disco
        db.jobs.delete_one({"_id": ingestao_id})
        storage.remover_pasta(pasta_da_midia(organizacao_id, midia_id))
        raise ErroDefinitivo("A mídia foi excluída enquanto a fala era gerada.")
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Fala gerada ({len(som) / TAXA:.1f} s); ingestão na fila.")
    reportar(100, "Fala pronta")
    return {"midia_id": str(midia_id), "segundos": round(len(som) / TAXA, 2)}
