# -----------------------------------------------
# Tarefa "batidas" — acha as batidas do som de uma mídia (worker de CPU)
#
# O FFmpeg decodifica o original em mono, 22 kHz e ponto flutuante direto para um pipe, e a conta
# (core/utils/batidas.py) acha o andamento, as batidas e os tempos fortes. O resultado fica na coleção
# batidas, um documento por mídia.
# -----------------------------------------------
import logging
import subprocess
from collections.abc import Callable

import numpy as np
from bson import ObjectId

from core.config import FFMPEG
from core.modelos.batidas import DURACAO_MAXIMA_S, STATUS_ERRO, STATUS_PRONTO
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import chave_arquivo
from core.utils import storage
from core.utils.batidas import TAXA, analisar
from core.utils.mongo import agora


def decodificar(caminho, duracao_maxima: float = DURACAO_MAXIMA_S) -> np.ndarray:
    """O som do arquivo em mono, TAXA Hz, float32 (no máximo `duracao_maxima` segundos)."""
    processo = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(caminho),
                               "-t", str(duracao_maxima), "-vn", "-ac", "1", "-ar", str(TAXA), "-f", "f32le",
                               "pipe:1"], capture_output=True, check=False)
    if processo.returncode != 0:
        raise RuntimeError(f"O FFmpeg não leu o som: {processo.stderr.decode(errors='replace')[-300:]}")
    return np.frombuffer(processo.stdout, dtype=np.float32)


def marcar_batidas_com_erro(db, job: dict, mensagem: str):
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.batidas.update_one({"midia_id": ObjectId(midia_id)},
                              {"$set": {"status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora()}})


def executar_batidas(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi apagada antes da análise.")
    if not midia.get("audio"):
        raise ErroDefinitivo(f'"{midia["nome"]}" não tem som.')
    original = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia_id, midia["original"]))
    if not original.is_file():
        raise ErroDefinitivo("O arquivo da mídia não está mais no armazenamento.")
    reportar(10, "Lendo o som")
    amostras = decodificar(original)
    reportar(50, "Procurando as batidas")
    resultado = analisar(amostras)
    db.batidas.update_one({"midia_id": midia_id}, {"$set": {**resultado, "status": STATUS_PRONTO, "erro": None,
                                                            "atualizado_em": agora()}})
    logging.info(f"Batidas de {midia['nome']}: {resultado['bpm']} BPM, {len(resultado['batidas'])} batidas.")
    reportar(100, "Batidas prontas")
    return {"midia_id": str(midia_id), "bpm": resultado["bpm"], "batidas": len(resultado["batidas"])}
