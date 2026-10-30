# -----------------------------------------------
# TakeOne — o laço das automações do Clipar (ADR 0004, 14.9): avança as esteiras e olha os canais
#
# Roda numa thread do worker da montagem (worker_principal), a cada 15 s. Cada esteira e cada canal é reservado por
# vez (a próxima volta já fica marcada, com find_one_and_update), então dois workers nunca mexem no mesmo. Cada
# passo só olha o banco e cria o que o passo seguinte espera: a importação, a clipagem e o job da montagem são os
# de sempre (a página e a esteira dão no mesmo).
# -----------------------------------------------
import logging
import threading
import urllib.request
from datetime import timedelta

from bson import ObjectId

from core.modelos import automacao as a
from core.modelos.clipagem import DURACAO_MINIMA, montar_clipagem
from core.modelos.importacao import DURACAO_MAXIMA, dados_do_video, ler_link, montar_importacao, precisa_esperar
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.saida_dos_cortes import cortes_ocupados, montar_pedido
from core.utils.link import ErroImportacao, ler_metadados, resolver_canal
from core.utils.mongo import agora

INTERVALO_DO_LACO_S = 15
TAMANHO_MAXIMO_DO_FEED = 2 * 1024 * 1024


# -----------------------------------------------
# AS ESTEIRAS
# -----------------------------------------------
def criar_importacao(db, organizacao_id, criado_por, link: dict, dados: dict | None = None) -> dict:
    """A mídia nova e o job que baixa o vídeo (o mesmo que a API cria pelo link colado)."""
    midia, job = montar_importacao(organizacao_id, criado_por, link, dados)
    midia["_id"] = db.midias.insert_one(midia).inserted_id
    job["entrada"]["midia_id"] = str(midia["_id"])
    job["_id"] = db.jobs.insert_one(job).inserted_id
    db.midias.update_one({"_id": midia["_id"]}, {"$set": {"job_ingestao_id": job["_id"]}})
    return midia


def _mudar(db, esteira: dict, **campos):
    db.esteiras.update_one({"_id": esteira["_id"]}, {"$set": {**campos, "atualizado_em": agora()}})


def _falhar(db, esteira: dict, mensagem: str):
    logging.warning("[%s] [esteira %s] %s", esteira["organizacao_id"], esteira["_id"], mensagem)
    _mudar(db, esteira, status=a.ERRO, erro=mensagem[:300], concluida_em=agora())


def _procurar(db, esteira: dict, midia: dict):
    """A clipagem com as opções da esteira (a da página de opções, sem a página)."""
    clipagem = montar_clipagem(esteira["organizacao_id"], esteira["criado_por"], midia, esteira["opcoes"])
    clipagem["_id"] = db.clipagens.insert_one(clipagem).inserted_id
    job = montar_job("clipagem", esteira["organizacao_id"],
                     {"clipagem_id": str(clipagem["_id"]), "midia_id": str(midia["_id"])},
                     criado_por=esteira["criado_por"])
    job_id = db.jobs.insert_one(job).inserted_id
    db.clipagens.update_one({"_id": clipagem["_id"]}, {"$set": {"job_id": job_id}})
    _mudar(db, esteira, status=a.PROCURANDO, clipagem_id=clipagem["_id"])
    logging.info("[%s] [esteira %s] Procurando os cortes de %s.", esteira["organizacao_id"], esteira["_id"],
                 midia.get("nome"))


def _montar(db, esteira: dict, clipagem: dict):
    """Os melhores cortes vão para o worker da montagem, que monta e exporta."""
    ids = a.cortes_escolhidos(clipagem.get("cortes") or [], esteira["quantos"])
    ids = [corte_id for corte_id in ids if corte_id not in cortes_ocupados(clipagem.get("cortes") or [], ids)]
    if not ids:
        _mudar(db, esteira, status=a.PRONTA, videos=0, concluida_em=agora(),
               erro="O Clipar não achou cortes neste vídeo.")
        return
    job, saida = montar_pedido(esteira["organizacao_id"], esteira["criado_por"], clipagem["_id"], ids, True,
                               esteira["resolucao"], esteira_id=esteira["_id"])
    job["_id"] = db.jobs.insert_one(job).inserted_id
    db.clipagens.update_one({"_id": clipagem["_id"]},
                            {"$set": {"cortes.$[c].saida": {**saida, "job_id": str(job["_id"])},
                                      "atualizado_em": agora()}},
                            array_filters=[{"c.id": {"$in": ids}}])
    _mudar(db, esteira, status=a.MONTANDO, cortes=ids)


def avancar(db, esteira: dict):
    """Um passo da esteira: o que ela esperava aconteceu? Então cria o que vem depois."""
    status = esteira["status"]
    if status in (a.IMPORTANDO, a.ESPERANDO_HORARIO):
        midia = db.midias.find_one({"_id": esteira["midia_id"]})
        if midia is None:
            return _falhar(db, esteira, "O vídeo saiu da biblioteca.")
        if midia["status"] == "erro":
            return _falhar(db, esteira, f"O vídeo não entrou: {midia.get('erro') or 'erro na importação'}")
        if midia["status"] != "pronta":
            return None
        if status == a.IMPORTANDO:
            if midia.get("imagem") or not midia.get("audio"):
                return _falhar(db, esteira, "O Clipar procura os cortes pela fala, e o vídeo não tem som.")
            if float(midia.get("duracao") or 0) < DURACAO_MINIMA:
                return _falhar(db, esteira, "O vídeo tem menos de 1 minuto: ele já é um corte.")
            inicio = a.proximo_horario(esteira.get("horario"), agora())
            if inicio and inicio > agora():
                _mudar(db, esteira, status=a.ESPERANDO_HORARIO, titulo=midia.get("nome") or esteira["titulo"],
                       comecar_em=inicio)
                return None
        elif esteira.get("comecar_em") and esteira["comecar_em"] > agora():
            return None
        _mudar(db, esteira, titulo=midia.get("nome") or esteira["titulo"])
        return _procurar(db, esteira, midia)

    clipagem = db.clipagens.find_one({"_id": esteira.get("clipagem_id")}, {"palavras": 0})
    if clipagem is None:
        return _falhar(db, esteira, "A clipagem foi excluída.")
    if status == a.PROCURANDO:
        if clipagem["status"] == "erro":
            return _falhar(db, esteira, f"A busca dos cortes falhou: {clipagem.get('erro') or 'erro'}")
        if clipagem["status"] == "pronta":
            return _montar(db, esteira, clipagem)
        return None
    if status == a.MONTANDO:
        ids_das_exportacoes = [corte["saida"]["exportacao_id"] for corte in clipagem.get("cortes") or []
                               if corte.get("id") in esteira["cortes"]
                               and (corte.get("saida") or {}).get("exportacao_id")]
        exportacoes = {str(doc["_id"]): doc["status"]
                       for doc in db.exportacoes.find({"_id": {"$in": [_oid(i) for i in ids_das_exportacoes]}},
                                                      {"status": 1})}
        andando, videos, erros = a.situacao_dos_cortes(clipagem.get("cortes") or [], esteira["cortes"], exportacoes)
        if andando:
            return None
        if not videos:
            return _falhar(db, esteira, "Nenhum corte saiu: veja os erros na lista de cortes.")
        _mudar(db, esteira, status=a.PRONTA, videos=videos, cortes_com_erro=erros, concluida_em=agora())
        logging.info("[%s] [esteira %s] Pronta: %d vídeos.", esteira["organizacao_id"], esteira["_id"], videos)
    return None


def _oid(valor):
    return ObjectId(valor) if ObjectId.is_valid(valor) else valor


def avancar_esteiras(db) -> int:
    """Cada esteira que chegou a vez, uma por vez. Devolve quantas foram olhadas."""
    olhadas = 0
    while (esteira := db.esteiras.find_one_and_update(
            {"status": {"$in": list(a.ATIVAS)}, "proxima_volta": {"$lte": agora()}},
            {"$set": {"proxima_volta": agora() + a.INTERVALO_DA_ESTEIRA}},
            sort=[("proxima_volta", 1)])) is not None:
        olhadas += 1
        try:
            avancar(db, esteira)
        except Exception as erro:  # Um defeito numa esteira não para as outras; ela tenta de novo na volta seguinte
            logging.exception("[esteira %s] Falha ao avançar: %s", esteira["_id"], erro)
    return olhadas


# -----------------------------------------------
# OS CANAIS
# -----------------------------------------------
def baixar_feed(canal_id: str) -> str:
    with urllib.request.urlopen(a.FEED_CANAL.format(canal_id), timeout=30) as resposta:
        return resposta.read(TAMANHO_MAXIMO_DO_FEED).decode("utf-8", "replace")


def verificar_canal(db, automacao: dict) -> int:
    """Lê o feed e põe uma esteira em cada vídeo novo. Devolve quantas começaram. Na primeira volta, o que já está
    no feed só fica como visto."""
    canal = automacao["canal"]
    canal_id = canal.get("id") or resolver_canal(canal["handle"])[0]
    vistos = list(canal.get("vistos") or [])
    primeira_volta = bool(canal.get("primeira_volta"))
    criadas = 0
    for video in a.videos_novos(a.ler_feed(baixar_feed(canal_id)), vistos):
        if primeira_volta:
            vistos = a.lembrar_visto(vistos, video["video_id"])
            continue
        link = ler_link(f"https://www.youtube.com/watch?v={video['video_id']}")
        try:
            metadados = ler_metadados(link["url"], "youtube")
        except ErroImportacao as erro:
            logging.warning("[%s] Canal: o vídeo %s não abriu: %s", automacao["organizacao_id"], video["video_id"],
                            erro)
            vistos = a.lembrar_visto(vistos, video["video_id"])
            continue
        if precisa_esperar(metadados):
            continue   # a live está agendada ou no ar: fica para a próxima volta
        vistos = a.lembrar_visto(vistos, video["video_id"])
        duracao = float(metadados.get("duration") or 0)
        if duracao < automacao["duracao_minima"] * 60 or duracao > DURACAO_MAXIMA:
            continue
        if metadados.get("channel_id") and metadados["channel_id"] != canal_id:
            continue
        existente = db.midias.find_one({"organizacao_id": automacao["organizacao_id"],
                                        "importacao.origem": "youtube", "importacao.id": video["video_id"],
                                        "status": {"$ne": "erro"}}, {"_id": 1})
        if existente:
            continue
        dados = dados_do_video(link, metadados)
        midia = criar_importacao(db, automacao["organizacao_id"], automacao["criado_por"], link, dados)
        esteira = a.montar_esteira(automacao["organizacao_id"], automacao["criado_por"], "canal", automacao["opcoes"],
                                   automacao["quantos"], automacao["resolucao"], automacao.get("horario"),
                                   midia_id=midia["_id"], titulo=dados["titulo"], automacao_id=automacao["_id"])
        db.esteiras.insert_one(esteira)
        criadas += 1
        logging.info("[%s] Canal %s: vídeo novo %s, esteira na fila.", automacao["organizacao_id"],
                     canal.get("handle") or canal_id, video["video_id"])
    db.automacoes.update_one({"_id": automacao["_id"]}, {"$set": {
        "canal.id": canal_id, "canal.vistos": vistos, "canal.primeira_volta": False,
        "ultima_verificacao": agora(), "ultimo_erro": None, "atualizado_em": agora()}})
    return criadas


def verificar_automacoes(db) -> int:
    """Cada canal que chegou a vez. Um erro num canal fica registrado nele e não para os outros."""
    criadas = 0
    while (automacao := db.automacoes.find_one_and_update(
            {"ativa": True, "tipo": "canal", "proxima_verificacao": {"$lte": agora()}},
            {"$set": {"proxima_verificacao": agora() + a.INTERVALO_DO_CANAL}})) is not None:
        try:
            criadas += verificar_canal(db, automacao)
        except (OSError, ErroImportacao, ErroDefinitivo, ValueError, KeyError) as erro:
            logging.warning("[%s] Canal falhou: %s", automacao["organizacao_id"], erro)
            db.automacoes.update_one({"_id": automacao["_id"]}, {"$set": {
                "ultima_verificacao": agora(),
                "ultimo_erro": str(erro)[:300] or "Não foi possível ler o canal."}})
    return criadas


def laco_das_automacoes(db, parar: threading.Event, intervalo: timedelta = timedelta(seconds=INTERVALO_DO_LACO_S)):
    """A thread do worker da montagem: avança as esteiras e olha os canais até o worker parar."""
    while not parar.wait(intervalo.total_seconds()):
        try:
            avancar_esteiras(db)
            verificar_automacoes(db)
        except Exception as erro:  # O banco caiu: a próxima volta tenta de novo
            logging.error("Laço das automações: %s", erro)
