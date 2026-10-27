# -----------------------------------------------
# Tarefa "clipagem" — achar os cortes de um vídeo longo (o Clipar, ADR 0004, 14.3)
#
# Lê a transcrição da mídia (se ainda não há, pede uma e volta a olhar daqui a pouco, sem gastar as
# tentativas; com o .srt da pessoa, a fala dele), divide a fala em frases e em janelas, pergunta ao Qwen3 local
# por janela (core/modelos/cortes.py), confere, pontua com as medidas do vídeo, tira os repetidos, escolhe as
# palavras de ênfase de cada corte (com o modelo ainda carregado) e guarda a lista na clipagem. No modo
# simulado, sem o modelo, os cortes são previsíveis, para testar o fluxo.
# -----------------------------------------------
import logging
from collections.abc import Callable
from datetime import timedelta

from bson import ObjectId

from core.config import MODO_IA
from core.modelos.clipagem import (
    STATUS_ERRO,
    STATUS_PRONTA,
    cortes_simulados,
    enfase_dos_cortes,
    faixa_das_opcoes,
    instrucoes_da_estrategia,
    legendas_da_enfase,
    maximo_das_opcoes,
    palavras_do_trecho,
    pontuar,
)
from core.modelos.cortes import (
    conferir_cortes,
    esquema_da_janela,
    frases_da_fala,
    janelas_de_frases,
    juntar_cortes,
    montar_mensagens,
    tamanho_da_janela,
)
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.palavras_chave import ESQUEMA as ESQUEMA_DAS_CHAVES
from core.modelos.palavras_chave import MAXIMO_DE_LEGENDAS, conferir_escolhas, escolhas_simuladas
from core.modelos.palavras_chave import montar_mensagens as mensagens_das_chaves
from core.modelos.pedido_edicao import ESQUEMA as ESQUEMA_DO_PEDIDO
from core.modelos.pedido_edicao import conferir_plano, plano_simulado
from core.modelos.pedido_edicao import montar_mensagens as montar_mensagens_do_pedido
from core.modelos.transcricao import STATUS_PRONTA as TRANSCRICAO_PRONTA
from core.modelos.transcricao import montar_transcricao
from core.utils.mongo import agora

ESPERA_PELA_TRANSCRICAO_S = 15
MAXIMO_DE_ESPERAS = 240           # uma hora esperando a transcrição


def _esperar_a_transcricao(db, job: dict, clipagem: dict) -> dict:
    """A transcrição ainda não acabou: um job novo olha de novo daqui a pouco, sem gastar as tentativas."""
    esperas = int(job["entrada"].get("esperas") or 0)
    if esperas >= MAXIMO_DE_ESPERAS:
        raise ErroDefinitivo("A transcrição do vídeo passou de uma hora. Tente de novo mais tarde.")
    momento = agora()
    novo = montar_job("clipagem", job["organizacao_id"], {**job["entrada"], "esperas": esperas + 1},
                      criado_por=job.get("criado_por"), momento=momento)
    novo["disponivel_em"] = momento + timedelta(seconds=ESPERA_PELA_TRANSCRICAO_S)
    novo["mensagem"] = "Esperando a transcrição"
    novo_id = db.jobs.insert_one(novo).inserted_id
    db.clipagens.update_one({"_id": clipagem["_id"]}, {"$set": {"job_id": novo_id, "atualizado_em": momento}})
    return {"clipagem_id": str(clipagem["_id"]), "aguardando": True}


def _pedir_transcricao(db, job: dict, midia: dict, idioma: str):
    documento = montar_transcricao(midia["organizacao_id"], midia["_id"], idioma)
    transcricao = montar_job("transcricao", midia["organizacao_id"], {"midia_id": str(midia["_id"]), "idioma": idioma},
                             prioridade=1, criado_por=job.get("criado_por"))
    documento["job_id"] = db.jobs.insert_one(transcricao).inserted_id
    db.transcricoes.replace_one({"midia_id": midia["_id"]}, documento, upsert=True)


def executar_clipagem(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    clipagem_id = ObjectId(job["entrada"]["clipagem_id"])
    clipagem = db.clipagens.find_one({"_id": clipagem_id})
    if clipagem is None:
        raise ErroDefinitivo("A clipagem foi excluída.")
    midia = db.midias.find_one({"_id": clipagem["midia_id"], "organizacao_id": clipagem["organizacao_id"]})
    if midia is None:
        raise ErroDefinitivo("O vídeo da clipagem foi excluído.")
    opcoes = clipagem["opcoes"]
    idioma = opcoes.get("idioma") or "auto"

    if clipagem.get("palavras"):
        # O .srt da pessoa: a API já cortou no trecho
        palavras = clipagem["palavras"]
    else:
        transcricao = db.transcricoes.find_one({"midia_id": midia["_id"]})
        primeira_vez = not job["entrada"].get("esperas")
        if transcricao is None or (transcricao["status"] == STATUS_ERRO and primeira_vez):
            _pedir_transcricao(db, job, midia, idioma)
            return _esperar_a_transcricao(db, job, clipagem)
        if transcricao["status"] == STATUS_ERRO:
            raise ErroDefinitivo(f"A transcrição falhou: {transcricao.get('erro') or 'sem motivo'}")
        if transcricao["status"] != TRANSCRICAO_PRONTA:
            return _esperar_a_transcricao(db, job, clipagem)
        palavras = palavras_do_trecho(transcricao.get("palavras") or [], opcoes.get("inicio"), opcoes.get("fim"))
    if len(palavras) < 20:
        raise ErroDefinitivo("O vídeo quase não tem fala no trecho escolhido: não há o que cortar pela fala.")
    faixa = faixa_das_opcoes(opcoes)
    duracao = (palavras[-1]["fim"] - palavras[0]["inicio"])
    frases = frases_da_fala(palavras)
    if MODO_IA != "real":
        candidatos = cortes_simulados(palavras, faixa)
    else:
        from worker.tarefas.llm import conversar

        janelas = janelas_de_frases(frases, *tamanho_da_janela(faixa))
        estrategia = instrucoes_da_estrategia(opcoes)
        candidatos = []
        for indice, janela in enumerate(janelas):
            mensagens = montar_mensagens(janela, faixa, estrategia, opcoes.get("momentos") or "",
                                         opcoes.get("genero") or "")
            progresso = 10 + int(80 * indice / max(1, len(janelas)))
            try:
                esquema = esquema_da_janela(janela[0]["n"], janela[-1]["n"])
                bruto = conversar(mensagens, esquema, reportar, f"Lendo a fala ({indice + 1} de {len(janelas)})",
                                  temperatura=0.3, primeiro=indice == 0, ultimo=False, progresso=progresso)
            except RuntimeError as erro:
                # Uma janela que falha não derruba as outras; se todas falharem, a clipagem falha
                logging.warning(f"[clipagem {clipagem_id}] A janela {indice + 1} falhou: {erro}")
                continue
            aceitos = conferir_cortes(bruto, frases, faixa)
            logging.info(f"[clipagem {clipagem_id}] Janela {indice + 1}: {len((bruto or {}).get('cortes') or [])} "
                         f"propostos, {len(aceitos)} aceitos.")
            candidatos.extend(aceitos)
    reportar(92, "Escolhendo os melhores")
    pontuados = [pontuar(corte, palavras) for corte in candidatos]
    cortes = juntar_cortes(pontuados, maximo_das_opcoes(opcoes, duracao))
    if not cortes:
        raise ErroDefinitivo("Nenhum corte se sustentou nesse vídeo. Tente outra estratégia ou outra duração.")
    plano = _plano_da_edicao(opcoes, reportar, clipagem_id)
    cortes = _com_a_enfase(cortes, frases, palavras, reportar, clipagem_id)
    resultado = db.clipagens.update_one({"_id": clipagem_id}, {"$set": {
        "status": STATUS_PRONTA, "cortes": cortes, "erro": None, "atualizado_em": agora(),
        "modelo": "simulado" if MODO_IA != "real" else "qwen3", "plano_da_edicao": plano,
    }})
    if resultado.matched_count == 0:
        raise ErroDefinitivo("A clipagem foi excluída enquanto os cortes eram escolhidos.")
    logging.info(f"[{clipagem['organizacao_id']}] [clipagem {clipagem_id}] {len(cortes)} cortes de "
                 f"{len(candidatos)} candidatos.")
    reportar(100, "Cortes prontos")
    return {"clipagem_id": str(clipagem_id), "cortes": len(cortes)}


def _plano_da_edicao(opcoes: dict, reportar, clipagem_id) -> dict | None:
    """Como a pessoa quer a edição, em plano (core/modelos/pedido_edicao.py), para a montagem de todos os cortes.
    Sem frases: o que é de um corte só (cortar frases, zoom numa frase) fica para o editor."""
    pedido = str(opcoes.get("edicao") or "").strip()
    if not pedido:
        return None
    if MODO_IA != "real":
        return plano_simulado(pedido, [])
    from worker.tarefas.llm import conversar

    try:
        bruto = conversar(montar_mensagens_do_pedido(pedido, []), ESQUEMA_DO_PEDIDO, reportar,
                          "Lendo como você quer a edição", temperatura=0.1, primeiro=False, ultimo=False,
                          progresso=93)
    except RuntimeError as erro:
        logging.warning(f"[clipagem {clipagem_id}] O pedido de edição falhou: {erro}")
        return None
    return conferir_plano(bruto, [])


def _com_a_enfase(cortes: list[dict], frases: list[dict], palavras: list[dict], reportar, clipagem_id) -> list[dict]:
    """As palavras de ênfase de cada corte, com o modelo ainda na placa (o último pedido o solta). Se falhar, os
    cortes ficam sem: a montagem só não pinta palavras."""
    legendas = legendas_da_enfase(cortes, frases, palavras)
    if MODO_IA != "real":
        return enfase_dos_cortes(cortes, frases, palavras, escolhas_simuladas(legendas))
    from worker.tarefas.llm import conversar

    # Um pedido por corte: numa lista com as frases de todos, o modelo escolhia nas primeiras e parava
    lotes = []
    for corte in cortes:
        do_corte = [legenda for legenda in legendas if legenda["id"].startswith(f"{corte['id']}:")]
        lotes.extend(do_corte[i:i + MAXIMO_DE_LEGENDAS] for i in range(0, len(do_corte), MAXIMO_DE_LEGENDAS))
    chaves: dict[str, list[int]] = {}
    for n, lote in enumerate(lotes):
        try:
            bruto = conversar(mensagens_das_chaves(lote), ESQUEMA_DAS_CHAVES, reportar, "Escolhendo as palavras fortes",
                              primeiro=False, ultimo=n == len(lotes) - 1, progresso=94)
        except RuntimeError as erro:
            logging.warning(f"[clipagem {clipagem_id}] As palavras de ênfase falharam: {erro}")
            continue
        chaves.update(conferir_escolhas(bruto, lote))
    return enfase_dos_cortes(cortes, frases, palavras, chaves)


def marcar_clipagem_com_erro(db, job: dict, mensagem: str):
    clipagem_id = (job.get("entrada") or {}).get("clipagem_id")
    if clipagem_id:
        db.clipagens.update_one({"_id": ObjectId(clipagem_id)}, {"$set": {
            "status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora()}})
