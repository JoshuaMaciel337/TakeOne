# -----------------------------------------------
# TakeOne — a saída dos cortes do Clipar (ADR 0004, 14.9)
#
# Exportar vários cortes de uma vez: um job "montagem" (o worker da montagem, que roda o mesmo código TS do
# "Montar e abrir no editor" pelo Deno) monta cada corte que ainda não tem projeto e põe o vídeo na fila do render.
# Cada corte guarda o estado da saída (`saida`), que a lista mostra: na fila, montando (com a etapa), montado,
# exportado (com a exportação, que tem o andamento dela) ou erro. Funções puras.
# -----------------------------------------------
from datetime import datetime

from core.modelos.job import montar_job

NA_FILA = "na_fila"
MONTANDO = "montando"
MONTADO = "montado"
EXPORTADO = "exportado"
ERRO = "erro"
EM_ANDAMENTO = (NA_FILA, MONTANDO)
MAXIMO_POR_PEDIDO = 50
RESOLUCOES = ("720p", "1080p", "4k")


def cortes_ocupados(cortes: list[dict], ids: list[str]) -> list[str]:
    """Os cortes pedidos que já estão na fila ou montando (não entram duas vezes)."""
    pedidos = set(ids)
    return [corte["id"] for corte in cortes
            if corte.get("id") in pedidos and (corte.get("saida") or {}).get("status") in EM_ANDAMENTO]


def montar_pedido(organizacao_id, criado_por, clipagem_id, ids: list[str], exportar: bool = True,
                  resolucao: str = "1080p", esteira_id=None, momento: datetime | None = None) -> tuple[dict, dict]:
    """O job da montagem e a saída que cada corte pedido recebe (quem insere põe o id do job nela)."""
    entrada = {"clipagem_id": str(clipagem_id), "cortes": list(ids), "exportar": exportar, "resolucao": resolucao}
    if esteira_id is not None:
        entrada["esteira_id"] = str(esteira_id)
    job = montar_job("montagem", organizacao_id, entrada, criado_por=criado_por, momento=momento)
    saida = {"status": NA_FILA, "exportar": exportar, "etapa": None, "erro": None, "exportacao_id": None,
             "pedido_em": job["criado_em"]}
    return job, saida


def campos_do_evento(evento: dict) -> dict:
    """O que um evento do montador muda na saída do corte ($set em cortes.$.saida.*)."""
    tipo = evento.get("evento")
    if tipo == "etapa":
        return {"status": MONTANDO, "etapa": str(evento.get("texto") or "")[:120]}
    if tipo == "montado":
        return {"status": MONTADO, "etapa": None}
    if tipo == "exportado":
        return {"status": EXPORTADO, "etapa": None, "exportacao_id": evento.get("exportacao_id")}
    if tipo == "erro":
        return {"status": ERRO, "etapa": None, "erro": str(evento.get("mensagem") or "A montagem falhou.")[:300]}
    return {}


def pendentes_do_job(cortes: list[dict], job_id) -> list[str]:
    """Os cortes deste job que ainda faltam (numa nova tentativa, os que já saíram não saem de novo)."""
    return [corte["id"] for corte in cortes
            if (saida := corte.get("saida") or {}).get("job_id") == job_id and saida.get("status") in EM_ANDAMENTO]
