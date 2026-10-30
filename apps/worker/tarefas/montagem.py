# -----------------------------------------------
# TakeOne worker — a montagem dos cortes do Clipar (ADR 0004, 14.9)
#
# Roda o montador (apps/web/src/lib/clipar/montador/principal.ts, empacotado num arquivo só na imagem do worker)
# pelo Deno, com a rede presa à API: é o mesmo código do "Montar e abrir no editor", sem aba aberta. Ele fala com a
# API por uma chave interna, temporária, do dono do pedido, criada aqui e apagada no fim. Cada linha que ele conta
# vira o estado da saída do corte na clipagem (core/modelos/saida_dos_cortes.py).
#
# Num worker só da montagem (o recurso "montagem"): ela espera jobs de CPU (o rosto, as animações, os sons) e, no
# worker de CPU, esperaria a si mesma.
# -----------------------------------------------
import json
import logging
import os
import queue
import subprocess
import threading
import time
from datetime import timedelta
from urllib.parse import urlparse

from bson import ObjectId

from core.modelos.chave import montar_chave_interna
from core.modelos.job import ErroDefinitivo
from core.modelos.saida_dos_cortes import EM_ANDAMENTO, ERRO, campos_do_evento, pendentes_do_job
from core.utils.mongo import agora

MONTADOR = os.environ.get("MONTADOR", "/app/montador/montador.mjs")
API_INTERNA = os.environ.get("API_INTERNA", "http://api:8000")
DENO = os.environ.get("DENO", "deno")
# A chave vale o bastante para a montagem mais longa (as esperas das mídias novas têm limite)
VALIDADE_DA_CHAVE = timedelta(hours=3)
# Sem nenhuma linha por este tempo, o montador travou (as esperas dele contam a etapa a cada passo)
SILENCIO_MAXIMO_S = 20 * 60
LINHAS_DO_ERRO = 20


def _host_da_api() -> str:
    url = urlparse(API_INTERNA)
    return f"{url.hostname}:{url.port or (443 if url.scheme == 'https' else 80)}"


# As únicas variáveis que o pacote lê (os limites do polygon-clipping, ao carregar; sem elas, ele usa os padrões)
VARIAVEIS_DO_MONTADOR = "POLYGON_CLIPPING_MAX_QUEUE_SIZE,POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS"


def _comando() -> list[str]:
    """O Deno com a rede presa à API e nada mais (sem disco, sem outras variáveis de ambiente, sem perguntas)."""
    return [DENO, "run", "--quiet", "--no-prompt", f"--allow-net={_host_da_api()}",
            f"--allow-env={VARIAVEIS_DO_MONTADOR}", MONTADOR]


def _ler(fluxo, fila: queue.Queue):
    for linha in fluxo:
        fila.put(linha)
    fila.put(None)


def _guardar(db, clipagem_id, corte_id: str, campos: dict):
    if not campos:
        return
    db.clipagens.update_one({"_id": clipagem_id, "cortes.id": corte_id},
                            {"$set": {**{f"cortes.$.saida.{chave}": valor for chave, valor in campos.items()},
                                      "atualizado_em": agora()}})


def executar_montagem(db, job: dict, reportar) -> dict:
    entrada = job["entrada"]
    clipagem_id = ObjectId(entrada["clipagem_id"])
    clipagem = db.clipagens.find_one({"_id": clipagem_id}, {"organizacao_id": 1, "criado_por": 1, "cortes": 1})
    if clipagem is None:
        raise ErroDefinitivo("A clipagem foi excluída.")
    cortes = pendentes_do_job(clipagem.get("cortes") or [], str(job["_id"]))
    if not cortes:
        return {"cortes": 0}
    usuario_id = job.get("criado_por") or clipagem.get("criado_por")
    if usuario_id is None:
        raise ErroDefinitivo("O pedido não tem dono para falar com a API.")
    if not os.path.isfile(MONTADOR):
        raise ErroDefinitivo("O worker ainda não tem o montador. Reconstrua a imagem do worker.")

    chave, doc = montar_chave_interna(clipagem["organizacao_id"], usuario_id, "Montagem dos cortes",
                                      VALIDADE_DA_CHAVE)
    chave_id = db.chaves_de_acesso.insert_one(doc).inserted_id
    pedido = {"endereco": API_INTERNA, "chave": chave, "clipagem_id": str(clipagem_id), "cortes": cortes,
              "exportar": bool(entrada.get("exportar", True)), "resolucao": entrada.get("resolucao") or "1080p"}
    processo = subprocess.Popen(_comando(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8")
    saidas, erros = queue.Queue(), []
    threading.Thread(target=_ler, args=(processo.stdout, saidas), daemon=True).start()
    threading.Thread(target=lambda: erros.extend(processo.stderr), daemon=True).start()
    feitos, vez = set(), 0
    try:
        processo.stdin.write(json.dumps(pedido))
        processo.stdin.close()
        ultimo = time.monotonic()
        reportar(1, "Montando os cortes")
        while True:
            try:
                linha = saidas.get(timeout=15)
            except queue.Empty:
                if time.monotonic() - ultimo > SILENCIO_MAXIMO_S:
                    raise ErroDefinitivo("A montagem parou de responder.") from None
                reportar(int(100 * vez / len(cortes)), "Montando os cortes")
                continue
            if linha is None:
                break
            ultimo = time.monotonic()
            try:
                evento = json.loads(linha)
            except json.JSONDecodeError:
                continue
            corte_id = evento.get("corte")
            if corte_id not in cortes:
                continue
            vez = cortes.index(corte_id)
            _guardar(db, clipagem_id, corte_id, campos_do_evento(evento))
            if evento.get("evento") in ("exportado", "erro") or (evento.get("evento") == "montado"
                                                                and not pedido["exportar"]):
                feitos.add(corte_id)
            etapa = evento.get("texto") if evento.get("evento") == "etapa" else "Montando os cortes"
            reportar(int(100 * (len(feitos) + (0.5 if corte_id not in feitos else 0)) / len(cortes)),
                     f"Corte {vez + 1} de {len(cortes)}: {etapa}")
        processo.wait(timeout=30)
    finally:
        if processo.poll() is None:
            processo.kill()
            processo.wait()
        db.chaves_de_acesso.delete_one({"_id": chave_id})
    # O que não saiu (o montador parou antes do corte) fica com erro
    sobra = [corte_id for corte_id in cortes if corte_id not in feitos]
    if processo.returncode != 0 and len(sobra) == len(cortes):
        detalhe = "".join(erros[-LINHAS_DO_ERRO:]).strip()
        logging.error("[%s] [clipagem %s] O montador falhou: %s", clipagem["organizacao_id"], clipagem_id, detalhe)
        raise ErroDefinitivo("A montagem dos cortes falhou.")
    for corte_id in sobra:
        _guardar(db, clipagem_id, corte_id, {"status": ERRO, "etapa": None, "erro": "A montagem parou no meio."})
    reportar(100, "Cortes montados")
    logging.info("[%s] [clipagem %s] Montagem: %d de %d cortes saíram.", clipagem["organizacao_id"], clipagem_id,
                 len(cortes) - len(sobra), len(cortes))
    return {"cortes": len(cortes), "erros": len(sobra)}


def marcar_montagem_com_erro(db, job: dict, mensagem: str):
    """Os cortes deste job que ainda estavam na fila ou montando ficam com o erro."""
    clipagem_id = (job.get("entrada") or {}).get("clipagem_id")
    if not clipagem_id:
        return
    clipagem = db.clipagens.find_one({"_id": ObjectId(clipagem_id)}, {"cortes.id": 1, "cortes.saida": 1})
    for corte in (clipagem or {}).get("cortes") or []:
        saida = corte.get("saida") or {}
        if saida.get("job_id") == str(job["_id"]) and saida.get("status") in EM_ANDAMENTO:
            _guardar(db, ObjectId(clipagem_id), corte["id"], {"status": ERRO, "etapa": None, "erro": mensagem[:300]})
