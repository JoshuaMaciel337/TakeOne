# As automações do Clipar (14.9): a esteira do vídeo aos cortes exportados, o horário, parar, e o monitor do canal
# (o feed e o yt-dlp trocados por falsos)
from datetime import timedelta

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from api.rotas import automacoes as rotas
from core.modelos import automacao as a
from core.modelos.exportacao import montar_exportacao
from core.utils import esteiras
from core.utils.fila import pegar_proximo_job
from core.utils.mongo import agora
from tests.integracao.test_api import cadastrar
from tests.integracao.test_clipagens_api import criar_video
from tests.test_automacao import FEED
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _avancar(db):
    """Uma volta do laço, sem esperar a próxima vez de cada esteira."""
    db.esteiras.update_many({}, {"$set": {"proxima_volta": agora() - timedelta(seconds=1)}})
    esteiras.avancar_esteiras(db)
    return {str(doc["_id"]): doc for doc in db.esteiras.find({})}


def test_a_esteira_vai_do_video_aos_cortes_exportados(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo, duracao=300)
    resposta = cliente.post("/api/esteiras", json={"midia_id": str(video), "quantos": 2,
                                                   "opcoes": {"faixa": "medio", "inicio": 50}})
    assert resposta.status_code == 201
    esteira = resposta.json()
    assert esteira["status"] == "importando" and esteira["origem"] == "envio" and esteira["quantos"] == 2
    # O mesmo vídeo não entra em duas esteiras ao mesmo tempo; o link e o vídeo juntos não valem
    assert cliente.post("/api/esteiras", json={"midia_id": str(video)}).status_code == 409
    assert cliente.post("/api/esteiras", json={"midia_id": str(video), "url": "youtu.be/x"}).status_code == 422

    # O vídeo está pronto: a clipagem começa, com as opções da esteira (sem o trecho)
    doc = _avancar(db_limpo)[esteira["id"]]
    assert doc["status"] == a.PROCURANDO
    clipagem = db_limpo.clipagens.find_one({"_id": doc["clipagem_id"]})
    assert clipagem["opcoes"]["inicio"] == 0 and clipagem["opcoes"]["faixa"] == "medio"
    assert _avancar(db_limpo)[esteira["id"]]["status"] == a.PROCURANDO
    job = pegar_proximo_job(db_limpo, ["clipagem"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido"

    # Os cortes achados: o melhor vai para o worker da montagem, com a esteira no pedido
    doc = _avancar(db_limpo)[esteira["id"]]
    assert doc["status"] == a.MONTANDO and doc["cortes"]
    montagem = db_limpo.jobs.find_one({"tipo": "montagem"})
    assert montagem["entrada"]["esteira_id"] == esteira["id"] and montagem["entrada"]["cortes"] == doc["cortes"]
    assert _avancar(db_limpo)[esteira["id"]]["status"] == a.MONTANDO

    # O montador exportou: enquanto o render anda, a esteira espera; com o vídeo pronto, ela acaba
    usuario = db_limpo.usuarios.find_one({})
    projeto = {"_id": ObjectId(), "nome": "Corte", "proporcao": "9:16", "taxa": {"num": 30, "den": 1},
               "fundo": {"cor": "#000000"}, "faixas": [], "duracao": 10, "versao": 1}
    exportacao = montar_exportacao(usuario["organizacao_id"], usuario["_id"], projeto, "1080p")
    exportacao_id = db_limpo.exportacoes.insert_one(exportacao).inserted_id
    db_limpo.clipagens.update_one({"_id": clipagem["_id"]}, {"$set": {
        "cortes.$[c].saida.status": "exportado", "cortes.$[c].saida.exportacao_id": str(exportacao_id)}},
        array_filters=[{"c.id": {"$in": doc["cortes"]}}])
    assert _avancar(db_limpo)[esteira["id"]]["status"] == a.MONTANDO
    db_limpo.exportacoes.update_one({"_id": exportacao_id}, {"$set": {"status": "pronta"}})
    doc = _avancar(db_limpo)[esteira["id"]]
    assert doc["status"] == a.PRONTA and doc["videos"] == len(doc["cortes"])
    lista = cliente.get("/api/esteiras").json()
    assert lista[0]["id"] == esteira["id"] and lista[0]["clipagem_id"] == str(clipagem["_id"])
    # A que acabou sai da lista ao parar
    assert cliente.delete(f"/api/esteiras/{esteira['id']}").status_code == 204
    assert cliente.get("/api/esteiras").json() == []


def test_horario_espera_e_parar_e_o_video_com_erro(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo, duracao=300)
    daqui_a_pouco = (agora() + timedelta(hours=2)).strftime("%H:%M")
    esteira = cliente.post("/api/esteiras", json={"midia_id": str(video), "horario": daqui_a_pouco}).json()
    doc = _avancar(db_limpo)[esteira["id"]]
    assert doc["status"] == a.ESPERANDO_HORARIO and doc["comecar_em"] > agora()
    assert _avancar(db_limpo)[esteira["id"]]["status"] == a.ESPERANDO_HORARIO
    # Chegou a hora
    db_limpo.esteiras.update_one({"_id": doc["_id"]}, {"$set": {"comecar_em": agora() - timedelta(minutes=1)}})
    assert _avancar(db_limpo)[esteira["id"]]["status"] == a.PROCURANDO
    # Parar a que anda: ela fica cancelada e o laço não mexe mais nela
    assert cliente.delete(f"/api/esteiras/{esteira['id']}").status_code == 204
    assert _avancar(db_limpo)[esteira["id"]]["status"] == a.CANCELADA

    # O vídeo que não entrou (o download falhou) e o curto demais
    quebrado = criar_video(db_limpo, status="erro", erro="Vídeo privado")
    curto = criar_video(db_limpo, duracao=40)
    e1 = cliente.post("/api/esteiras", json={"midia_id": str(quebrado)}).json()
    e2 = cliente.post("/api/esteiras", json={"midia_id": str(curto)}).json()
    docs = _avancar(db_limpo)
    assert docs[e1["id"]]["status"] == a.ERRO and "Vídeo privado" in docs[e1["id"]]["erro"]
    assert docs[e2["id"]]["status"] == a.ERRO and "1 minuto" in docs[e2["id"]]["erro"]


def test_esteira_pelo_link_importa_o_video(cliente, db_limpo):
    cadastrar(cliente)
    esteira = cliente.post("/api/esteiras", json={"url": "https://youtu.be/AAAAAAAAAAA", "titulo": "Palestra"}).json()
    assert esteira["origem"] == "link" and esteira["titulo"] == "Palestra"
    midia = db_limpo.midias.find_one({"_id": ObjectId(esteira["midia_id"])})
    assert midia["importacao"]["id"] == "AAAAAAAAAAA" and db_limpo.jobs.count_documents({"tipo": "importar_link"}) == 1
    # Ainda baixando: espera
    assert _avancar(db_limpo)[esteira["id"]]["status"] == a.IMPORTANDO
    assert cliente.post("/api/esteiras", json={"url": "https://exemplo.com/video"}).status_code == 422


def test_canal_acompanhado_vira_esteiras_nos_videos_novos(cliente, db_limpo, monkeypatch):
    cadastrar(cliente)
    monkeypatch.setattr(rotas, "resolver_canal", lambda handle: ("UC1234567890123456789012", "Meu Canal"))
    resposta = cliente.post("/api/automacoes", json={"canal": "https://www.youtube.com/@MeuCanal", "quantos": 2,
                                                     "horario": "03:00", "duracao_minima": 5})
    assert resposta.status_code == 201
    automacao = resposta.json()
    assert automacao["canal"] == {"id": "UC1234567890123456789012", "handle": "@meucanal", "nome": "Meu Canal"}
    assert cliente.post("/api/automacoes", json={"canal": "@MeuCanal"}).status_code == 409
    assert cliente.post("/api/automacoes", json={"canal": "x y"}).status_code == 422

    feed = {"texto": FEED}
    duracoes = {"AAAAAAAAAAA": 1200, "BBBBBBBBBBB": 1500, "CCCCCCCCCCC": 60, "DDDDDDDDDDD": 900}
    ao_vivo = {"DDDDDDDDDDD"}
    monkeypatch.setattr(esteiras, "baixar_feed", lambda canal_id: feed["texto"])
    monkeypatch.setattr(esteiras, "ler_metadados", lambda url, origem: {
        "title": f"Vídeo {url[-11:]}", "duration": duracoes[url[-11:]], "channel_id": "UC1234567890123456789012",
        "live_status": "is_live" if url[-11:] in ao_vivo else "was_live"})

    def volta():
        db_limpo.automacoes.update_many({}, {"$set": {"proxima_verificacao": agora() - timedelta(seconds=1)}})
        return esteiras.verificar_automacoes(db_limpo)

    # Primeira volta: o que já está no feed fica como visto
    assert volta() == 0
    assert db_limpo.automacoes.find_one({})["canal"]["vistos"] == ["AAAAAAAAAAA", "BBBBBBBBBBB"]
    # Três vídeos novos: um curto (fica de fora), um ao vivo (espera) e um bom (vira esteira)
    feed["texto"] = FEED.replace("<feed", "<feed").replace(" <entry>", """ <entry><yt:videoId>CCCCCCCCCCC</yt:videoId>
<title>Short</title><published>2026-10-30T13:00:00+00:00</published></entry>
 <entry><yt:videoId>DDDDDDDDDDD</yt:videoId><title>Live</title><published>2026-10-30T14:00:00+00:00</published></entry>
 <entry><yt:videoId>EEEEEEEEEEE</yt:videoId><title>Bom</title><published>2026-10-30T15:00:00+00:00</published></entry>
 <entry>""", 1)
    duracoes["EEEEEEEEEEE"] = 1800
    assert volta() == 1
    esteira = db_limpo.esteiras.find_one({})
    assert esteira["origem"] == "canal" and esteira["automacao_id"] == ObjectId(automacao["id"])
    assert esteira["quantos"] == 2 and esteira["horario"] == "03:00" and esteira["titulo"] == "Vídeo EEEEEEEEEEE"
    assert db_limpo.midias.find_one({"_id": esteira["midia_id"]})["importacao"]["id"] == "EEEEEEEEEEE"
    vistos = db_limpo.automacoes.find_one({})["canal"]["vistos"]
    assert "CCCCCCCCCCC" in vistos and "DDDDDDDDDDD" not in vistos
    # A live acabou: na volta seguinte, ela entra; o vídeo bom não entra de novo
    ao_vivo.clear()
    assert volta() == 1 and db_limpo.esteiras.count_documents({}) == 2

    # Desligada, ela não olha o canal; o erro do canal fica nela
    caminho = f"/api/automacoes/{automacao['id']}"
    assert cliente.patch(caminho, json={"ativa": False, "horario": ""}).json()["horario"] is None
    assert volta() == 0
    cliente.patch(caminho, json={"ativa": True})
    monkeypatch.setattr(esteiras, "baixar_feed", lambda canal_id: (_ for _ in ()).throw(OSError("sem internet")))
    volta()
    assert cliente.get("/api/automacoes").json()[0]["ultimo_erro"] == "sem internet"
    assert cliente.delete(caminho).status_code == 204 and cliente.get("/api/automacoes").json() == []
