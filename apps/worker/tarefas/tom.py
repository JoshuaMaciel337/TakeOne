# -----------------------------------------------
# Tarefa "tom" — muda o tom da voz de uma mídia sem mudar a velocidade
#
# O som (o original ou a voz limpa) passa por asetrate (que muda o tom e a velocidade juntos) e por
# atempo (que devolve a velocidade sem mexer no tom). O resultado é um m4a do tamanho exato da mídia,
# como a voz limpa: a prévia toca ele e o render usa o mesmo arquivo, então o som é igual nos dois.
# -----------------------------------------------
import logging
from collections.abc import Callable

from bson import ObjectId

from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_VOZ_LIMPA, arquivo_do_tom, chave_arquivo, chave_do_tom
from core.utils import storage
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg
from core.utils.mongo import agora

TAXA = 48000


def marcar_tom_com_erro(db, job: dict, mensagem: str):
    """Chamado quando a mudança de tom falha de vez: a aba Áudio mostra o erro."""
    entrada = job.get("entrada") or {}
    if entrada.get("midia_id"):
        chave = chave_do_tom(entrada.get("semitons", 0), entrada.get("limpa", False))
        db.midias.update_one({"_id": ObjectId(entrada["midia_id"])}, {"$set": {
            f"tons.{chave}": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def filtro_do_tom(semitons: int, duracao: float) -> str:
    """Muda o tom em `semitons` (12 é uma oitava) e devolve a velocidade, na duração exata da mídia."""
    fator = 2 ** (semitons / 12)
    return (f"aresample={TAXA},asetrate={round(TAXA * fator)},aresample={TAXA},atempo={1 / fator:.6f},"
            f"apad,atrim=0:{duracao:.6f}")


def executar_tom(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    semitons, limpa = int(entrada["semitons"]), bool(entrada.get("limpa"))
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes da mudança de tom.")
    if not midia.get("audio"):
        raise ErroDefinitivo("Esta mídia não tem áudio.")
    organizacao_id = midia["organizacao_id"]
    # Com a voz limpa ligada no clipe, o tom muda na voz limpa
    nome_da_fonte = ARQUIVO_VOZ_LIMPA if limpa else midia["original"]
    fonte = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, nome_da_fonte))
    if not fonte.is_file():
        falta = "A voz limpa ainda não está pronta." if limpa else "O arquivo original não foi encontrado."
        raise ErroDefinitivo(falta)
    duracao = float(midia.get("duracao") or 0)
    nome = arquivo_do_tom(semitons, limpa)
    destino = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, nome))
    parcial = destino.with_name(nome.replace(".m4a", ".parcial.m4a"))
    reportar(5, "Mudando o tom da voz")
    try:
        executar_ffmpeg(["-i", str(fonte), "-vn", "-af", filtro_do_tom(semitons, duracao), "-ac", "2", "-c:a", "aac",
                         "-b:a", "192k", "-movflags", "+faststart", str(parcial)],
                        duracao or None, lambda f: reportar(5 + int(f * 90), "Mudando o tom da voz"))
    except ErroFFmpeg:
        parcial.unlink(missing_ok=True)
        raise
    parcial.replace(destino)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {f"tons.{chave_do_tom(semitons, limpa)}": {"status": "pronta", "erro": None}, "atualizado_em": agora()},
        "$addToSet": {"arquivos": nome},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Tom {semitons:+d} pronto{' (voz limpa)' if limpa else ''}.")
    reportar(100, "Tom pronto")
    return {"midia_id": str(midia_id), "arquivo": nome}
