# -----------------------------------------------
# TakeOne — a pasta monitorada do álbum (onda 16.10, docs/decisoes/0006-album-de-fotos.md)
#
# O fotógrafo descarrega o cartão numa pasta do Nitro e as fotos aparecem no álbum, já analisadas, escolhidas e no
# estilo dele. Uma thread do worker de CPU (onde a pasta das fotos está montada) olha os álbuns com a pasta ligada;
# cada álbum é reservado pela próxima volta (find_one_and_update), como as esteiras do Clipar, e cada volta só olha
# o banco e cria o que a etapa seguinte espera:
#   olhando    → há fotos novas na pasta: o job "importar_pasta" de sempre (que só traz as novas)
#   importando → a importação acabou: espera a ingestão das novas
#   preparando → nenhuma processando: o job "medir_album" (se a análise ou a escolha estão ligadas)
#   medindo    → a análise acabou: a escolha das melhores (core/modelos/escolha.py) e o estilo pessoal nas novas
# e volta a olhar. As fotos novas são as do álbum criadas desde que a importação começou (`desde`).
# -----------------------------------------------
import logging
import threading
from datetime import timedelta

from pymongo import UpdateOne

from core.modelos.escolha import escolha_no_album
from core.modelos.job import STATUS_CONCLUIDO, STATUS_ERRO, montar_job
from core.modelos.midia import STATUS_PROCESSANDO, STATUS_PRONTA
from core.utils.fotos_no_lugar import CaminhoInvalido, disponivel, fotos_da_pasta, relativo_de
from core.utils.mongo import agora

INTERVALO_DO_LACO_S = 10
# Cada álbum é olhado de minuto em minuto; nas etapas que esperam um job, a cada 10 s
OLHAR_A_PASTA = timedelta(seconds=60)
ESPERAR_UM_JOB = timedelta(seconds=10)
# Uma foto que ainda está sendo copiada para a pasta (o cartão descarregando) não entra: o arquivo precisa ficar
# parado este tempo
ARQUIVO_PARADO_S = 10


def _fotos_novas_na_pasta(db, album: dict, monitorar: dict) -> int:
    ja = {m["externo"] for m in db.midias.find({"album_id": album["_id"], "externo": {"$exists": True}},
                                               {"externo": 1})}
    limite = agora().timestamp() - ARQUIVO_PARADO_S
    return sum(1 for foto in fotos_da_pasta(monitorar.get("caminho", ""), bool(monitorar.get("subpastas", True)))
               if relativo_de(foto) not in ja and foto.stat().st_mtime <= limite)


def _situacao_do_job(db, job_id) -> str | None:
    job = db.jobs.find_one({"_id": job_id}, {"status": 1, "erro": 1}) if job_id else None
    return job["status"] if job else None


def _pedir(db, tipo: str, album: dict, monitorar: dict, entrada: dict):
    job = montar_job(tipo, album["organizacao_id"], entrada, criado_por=monitorar.get("por"))
    return db.jobs.insert_one(job).inserted_id


def _escolher_e_estilizar(db, album: dict, monitorar: dict) -> None:
    """A escolha das melhores no álbum inteiro (com as opções da última escolha feita na página) e o estilo pessoal
    só nas fotos novas."""
    novas = [f["midia_id"] for f in db.album_fotos.find(
        {"album_id": album["_id"], "criado_em": {"$gte": monitorar["desde"]}}, {"midia_id": 1})]
    if monitorar.get("escolher"):
        registros = {f["midia_id"]: f for f in db.album_fotos.find({"album_id": album["_id"]})}
        midias = {m["_id"]: m for m in db.midias.find({"_id": {"$in": list(registros)}, "status": STATUS_PRONTA},
                                                      {"exif": 1, "enviado_em": 1})}
        medidas = {m["midia_id"]: m for m in db.fotos_medidas.find({"midia_id": {"$in": list(midias)}},
                                                                   {"pessoas": 0})}
        if medidas:
            opcoes = album.get("escolha_opcoes") or {}
            gravacoes, _ = escolha_no_album(registros, midias, medidas, opcoes, album["genero"], agora())
            db.album_fotos.bulk_write([UpdateOne({"album_id": album["_id"], "midia_id": mid}, {"$set": campos})
                                       for mid, campos in gravacoes], ordered=False)
    if monitorar.get("estilo_pessoal_id") and novas:
        estilo = db.estilos_pessoais.find_one({"_id": monitorar["estilo_pessoal_id"]}, {"pares": 1})
        prontas = [m["_id"] for m in db.midias.find({"_id": {"$in": novas}, "status": STATUS_PRONTA}, {"_id": 1})]
        if estilo and estilo.get("pares") and prontas:
            _pedir(db, "aplicar_estilo_pessoal", album, monitorar,
                   {"estilo_id": str(estilo["_id"]), "album_id": str(album["_id"]),
                    "midia_ids": [str(m) for m in prontas], "intensidade": monitorar.get("intensidade", 1.0)})


def avancar(db, album: dict) -> dict:
    """Uma volta da pasta monitorada de um álbum; devolve os campos que mudaram (para os testes)."""
    monitorar = album["monitorar"]
    etapa = monitorar.get("etapa") or "olhando"
    mudar: dict = {}
    if etapa == "olhando":
        mudar["ultima_volta"] = agora()
        if not disponivel():
            mudar["erro"] = "A pasta das fotos não está montada no servidor."
        else:
            try:
                novas = _fotos_novas_na_pasta(db, album, monitorar)
            except CaminhoInvalido as erro:
                novas, mudar["erro"] = 0, str(erro)
            else:
                mudar["erro"] = None
            if novas:
                job_id = _pedir(db, "importar_pasta", album, monitorar,
                                {"album_id": str(album["_id"]), "caminho": monitorar.get("caminho", ""),
                                 "subpastas": bool(monitorar.get("subpastas", True)),
                                 "parados_ate": agora().timestamp() - ARQUIVO_PARADO_S})
                mudar.update({"etapa": "importando", "job_id": job_id, "desde": agora(), "ultimas_novas": novas})
    elif etapa == "importando":
        situacao = _situacao_do_job(db, monitorar.get("job_id"))
        if situacao == STATUS_CONCLUIDO:
            mudar["etapa"] = "preparando"
        elif situacao in (STATUS_ERRO, None):
            job = db.jobs.find_one({"_id": monitorar.get("job_id")}, {"erro": 1}) or {}
            mudar.update({"etapa": "olhando", "erro": job.get("erro") or "A importação falhou."})
    elif etapa == "preparando":
        processando = db.midias.count_documents({"album_id": album["_id"], "status": STATUS_PROCESSANDO})
        if not processando:
            if monitorar.get("analisar") or monitorar.get("escolher"):
                mudar.update({"etapa": "medindo",
                              "job_id": _pedir(db, "medir_album", album, monitorar, {"album_id": str(album["_id"])})})
            else:
                _escolher_e_estilizar(db, album, monitorar)
                mudar["etapa"] = "olhando"
    elif etapa == "medindo":
        situacao = _situacao_do_job(db, monitorar.get("job_id"))
        if situacao in (STATUS_CONCLUIDO, STATUS_ERRO, None):
            _escolher_e_estilizar(db, album, monitorar)
            mudar["etapa"] = "olhando"
    if mudar:
        espera = OLHAR_A_PASTA if mudar.get("etapa", etapa) == "olhando" else ESPERAR_UM_JOB
        db.albuns.update_one({"_id": album["_id"], "monitorar.ligado_em": monitorar["ligado_em"]},
                             {"$set": {**{f"monitorar.{c}": v for c, v in mudar.items()},
                                       "monitorar.proxima_volta": agora() + espera}})
    return mudar


def avancar_pastas(db) -> int:
    """Uma volta em todos os álbuns com a pasta ligada que já podem ser olhados."""
    olhados = 0
    while (album := db.albuns.find_one_and_update(
            {"monitorar.proxima_volta": {"$lte": agora()}},
            {"$set": {"monitorar.proxima_volta": agora() + ESPERAR_UM_JOB}},
            sort=[("monitorar.proxima_volta", 1)])) is not None:
        olhados += 1
        try:
            avancar(db, album)
        except Exception as erro:  # Um defeito num álbum não para os outros; ele tenta de novo na volta seguinte
            logging.exception("[album %s] Falha na pasta monitorada: %s", album["_id"], erro)
    return olhados


def laco_das_pastas(db, parar: threading.Event, intervalo: timedelta = timedelta(seconds=INTERVALO_DO_LACO_S)):
    """A thread do worker de CPU: olha as pastas monitoradas até o worker parar."""
    while not parar.wait(intervalo.total_seconds()):
        try:
            avancar_pastas(db)
        except Exception as erro:  # O banco caiu: a próxima volta tenta de novo
            logging.error("Laço das pastas monitoradas: %s", erro)
