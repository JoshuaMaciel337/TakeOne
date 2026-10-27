# Importar pelo link (Clipar, 14.1): os dados antes, a mídia processando, o download simulado e a ingestão
import subprocess
from datetime import datetime

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.utils.fila import pegar_proximo_job
from core.utils.link import ErroImportacao
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import TEM_FFMPEG
from worker.worker_principal import processar_job

LINK = "https://www.youtube.com/watch?v=EDwQxx8wiik&pp=xyz"
METADADOS = {"title": "O poder dos mini-hábitos | TEDxSantos", "channel": "TEDx Talks", "duration": 4.0,
             "thumbnail": "https://i.ytimg.com/vi/EDwQxx8wiik/maxresdefault.jpg", "upload_date": "20180214"}


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


@pytest.fixture
def site(monkeypatch):
    """O yt-dlp simulado: o que o site devolveria para o link (os testes não saem para a internet)."""
    estado = {"metadados": dict(METADADOS), "erro": None, "pedidos": []}

    def ler(url, origem):
        estado["pedidos"].append((url, origem))
        if estado["erro"]:
            raise ErroImportacao(estado["erro"])
        return dict(estado["metadados"])

    def baixar(url, origem, pasta, reportar):
        reportar(50, "Baixando o vídeo")
        destino = pasta / "original.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error",
                        "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=4",
                        "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
                        "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-y", str(destino)],
                       check=True)
        return destino

    monkeypatch.setattr("api.rotas.midias.ler_metadados", ler)
    monkeypatch.setattr("worker.tarefas.importacao.ler_metadados", ler)
    monkeypatch.setattr("worker.tarefas.importacao.baixar", baixar)
    return estado


def test_dados_do_link_antes_de_importar(cliente, site):
    cadastrar(cliente)
    resposta = cliente.post("/api/midias/link/dados", json={"url": LINK})
    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()
    assert dados["origem"] == "youtube" and dados["url"] == "https://www.youtube.com/watch?v=EDwQxx8wiik"
    assert dados["titulo"] == METADADOS["title"] and dados["duracao"] == 4.0 and dados["problema"] is None
    assert site["pedidos"] == [("https://www.youtube.com/watch?v=EDwQxx8wiik", "youtube")]
    # Site que não entra e endereço interno: nem chegam ao yt-dlp
    for url in ("https://exemplo.com/video.mp4", "http://mongo:27017/"):
        recusa = cliente.post("/api/midias/link/dados", json={"url": url})
        assert recusa.status_code == 422 and "YouTube" in recusa.json()["detail"]
    assert len(site["pedidos"]) == 1
    site["erro"] = "ERROR: [youtube] EDwQxx8wiik: Private video. Sign in if you've been granted access"
    privado = cliente.post("/api/midias/link/dados", json={"url": LINK})
    assert privado.status_code == 422 and "privado" in privado.json()["detail"]
    site["erro"], site["metadados"]["duration"] = None, 5 * 3600
    longo = cliente.post("/api/midias/link/dados", json={"url": LINK}).json()
    assert "horas" in longo["problema"]


def test_precisa_estar_logado(cliente, site):
    assert cliente.post("/api/midias/link/dados", json={"url": LINK}).status_code == 401
    assert cliente.post("/api/midias/link", json={"url": LINK}).status_code == 401


def test_importar_cria_a_midia_processando_e_nao_repete(cliente, db_limpo, site):
    cadastrar(cliente)
    midia = cliente.post("/api/midias/link", json={"url": LINK, "titulo": "Mini-hábitos"}).json()
    assert midia["status"] == "processando" and midia["nome"] == "Mini-hábitos"
    assert midia["importacao"]["origem"] == "youtube" and midia["importacao"]["id"] == "EDwQxx8wiik"
    job = db_limpo.jobs.find_one({"tipo": "importar_link"})
    assert job["recurso"] == "cpu" and job["entrada"]["midia_id"] == midia["id"]
    # O mesmo vídeo de novo (por outro formato do link) volta como está, sem outro download
    de_novo = cliente.post("/api/midias/link", json={"url": "youtu.be/EDwQxx8wiik"}).json()
    assert de_novo["id"] == midia["id"] and db_limpo.jobs.count_documents({"tipo": "importar_link"}) == 1
    assert cliente.post("/api/midias/link", json={"url": "https://exemplo.com/x"}).status_code == 422


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_importacao_baixa_e_passa_pela_ingestao(cliente, db_limpo, site):
    cadastrar(cliente)
    midia = cliente.post("/api/midias/link", json={"url": LINK}).json()
    job = pegar_proximo_job(db_limpo, ["importar_link"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    pronta = cliente.get(f"/api/midias/{midia['id']}").json()
    assert pronta["status"] == "pronta" and pronta["video"] and pronta["audio"]
    assert pronta["nome"] == METADADOS["title"] and pronta["importacao"]["canal"] == "TEDx Talks"
    assert 3.5 < pronta["duracao"] < 4.5


def test_live_no_ar_espera_e_video_privado_vira_erro(cliente, db_limpo, site):
    cadastrar(cliente)
    midia = cliente.post("/api/midias/link", json={"url": LINK}).json()
    site["metadados"]["live_status"] = "is_live"
    job = pegar_proximo_job(db_limpo, ["importar_link"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido"
    outro = db_limpo.jobs.find_one({"tipo": "importar_link", "_id": {"$ne": job["_id"]}})
    assert outro["entrada"]["esperas"] == 1 and outro["disponivel_em"] > datetime.now(outro["disponivel_em"].tzinfo)
    assert db_limpo.midias.find_one({"_id": ObjectId(midia["id"])})["job_ingestao_id"] == outro["_id"]

    privada = cliente.post("/api/midias/link", json={"url": "https://vimeo.com/76979871"}).json()
    site["erro"] = "ERROR: [vimeo] 76979871: This video is private"
    db_limpo.jobs.update_many({"_id": outro["_id"]}, {"$set": {"status": "concluido"}})
    job = pegar_proximo_job(db_limpo, ["importar_link"], "w-teste")
    assert job["entrada"]["midia_id"] == privada["id"]
    assert processar_job(db_limpo, job, "w-teste") == "erro"
    falhou = cliente.get(f"/api/midias/{privada['id']}").json()
    assert falhou["status"] == "erro" and "privado" in falhou["erro"]
