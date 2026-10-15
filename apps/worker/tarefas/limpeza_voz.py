# -----------------------------------------------
# Tarefa "limpeza_voz" — tira o ruído de fundo da fala de uma mídia
#
# DeepFilterNet3 pelo binário do próprio projeto (deep-filter, MIT ou Apache-2.0, sem PyTorch), na
# CPU: uns 6 vezes mais rápido que o tempo real no Nitro. Com -D ele compensa o atraso do filtro, e a
# voz limpa sai no mesmo tempo do original (medido: 0 ms de diferença). O resultado é um m4a do
# tamanho exato da mídia, que a prévia toca e o render usa no lugar do som original do clipe.
# -----------------------------------------------
import logging
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.config import DEEP_FILTER
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_VOZ_LIMPA, chave_arquivo
from core.utils import storage
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg
from core.utils.mongo import agora

TAXA_DO_FILTRO = 48000   # o DeepFilterNet trabalha em 48 kHz, mono
# Uma hora de áudio leva uns 10 minutos; mais que isso é travamento
TIMEOUT_POR_SEGUNDO_DE_AUDIO = 1.0
TIMEOUT_MINIMO = 120


def marcar_voz_com_erro(db, job: dict, mensagem: str):
    """Chamado quando a limpeza falha de vez: a aba Áudio mostra o erro."""
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {
            "voz_limpa": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def executar_limpeza_voz(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes da limpeza da voz.")
    if not midia.get("audio"):
        raise ErroDefinitivo("Esta mídia não tem áudio para limpar.")
    organizacao_id = midia["organizacao_id"]
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    if not original.is_file():
        raise ErroDefinitivo("O arquivo original desta mídia não foi encontrado no servidor.")
    duracao = float(midia.get("duracao") or 0)
    destino = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_VOZ_LIMPA))
    parcial = destino.with_name("voz_limpa.parcial.m4a")
    rotulo = f"[{organizacao_id}] [midia {midia_id}]"

    with tempfile.TemporaryDirectory(prefix="takeone-voz-") as pasta:
        bruto = Path(pasta) / "voz.wav"
        reportar(3, "Separando o áudio")
        executar_ffmpeg(["-i", str(original), "-vn", "-ac", "1", "-ar", str(TAXA_DO_FILTRO), "-c:a", "pcm_s16le",
                         str(bruto)], duracao or None, lambda f: reportar(3 + int(f * 7), "Separando o áudio"))
        reportar(10, "Tirando o ruído da voz")
        saida = Path(pasta) / "limpo"
        try:
            limite = max(TIMEOUT_MINIMO, duracao * TIMEOUT_POR_SEGUNDO_DE_AUDIO)
            resultado = subprocess.run([DEEP_FILTER, "-D", "-o", str(saida), str(bruto)],
                                       capture_output=True, text=True, timeout=limite)
        except FileNotFoundError as erro:
            raise ErroDefinitivo("O filtro de voz (deep-filter) não está instalado no worker.") from erro
        limpo = saida / bruto.name
        if resultado.returncode != 0 or not limpo.is_file():
            raise RuntimeError(f"O filtro de voz falhou: {(resultado.stderr or '').strip()[-400:]}")
        reportar(85, "Gravando a voz limpa")
        try:
            # O filtro corta uns 30 ms do fim: completa com silêncio até a duração exata da mídia
            executar_ffmpeg(["-i", str(limpo), "-af", f"apad,atrim=0:{duracao:.6f}", "-ac", "2", "-c:a", "aac",
                             "-b:a", "192k", "-movflags", "+faststart", str(parcial)])
        except ErroFFmpeg:
            parcial.unlink(missing_ok=True)
            raise
    parcial.replace(destino)

    db.midias.update_one({"_id": midia_id}, {
        "$set": {"voz_limpa": {"status": "pronta", "erro": None}, "atualizado_em": agora()},
        "$addToSet": {"arquivos": ARQUIVO_VOZ_LIMPA},
    })
    logging.info(f"{rotulo} Voz limpa pronta ({duracao:.0f} s de áudio).")
    reportar(100, "Voz limpa pronta")
    return {"midia_id": str(midia_id)}
