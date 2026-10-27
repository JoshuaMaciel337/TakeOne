# O banco da Pixabay (Clipar, 14.12f): a busca guardada 24 h, o importar só pelo id e o download só da Pixabay.
# A Pixabay de verdade não é chamada: `pedir` e o download são trocados por respostas de mentira.
import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.utils import pixabay
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from worker.worker_principal import processar_job

IMAGEM = {"id": 101, "pageURL": "https://pixabay.com/photos/biblia-101/", "tags": "bíblia, leitura, fé",
          "previewURL": "https://cdn.pixabay.com/photo/a_150.jpg", "webformatURL": "https://pixabay.com/get/a_640.jpg",
          "largeImageURL": "https://pixabay.com/get/a_1280.jpg", "imageWidth": 4000, "imageHeight": 3000,
          "user": "fotografa"}
VIDEO = {"id": 202, "pageURL": "https://pixabay.com/videos/202/", "tags": "céu, nuvens", "duration": 12,
         "user": "cineasta",
         "videos": {"large": {"url": "https://cdn.pixabay.com/video/202_large.mp4", "width": 1920, "height": 1080,
                              "thumbnail": "https://cdn.pixabay.com/video/202_large.jpg"},
                    "medium": {"url": "https://cdn.pixabay.com/video/202_medium.mp4", "width": 1280, "height": 720},
                    "tiny": {"url": "https://cdn.pixabay.com/video/202_tiny.mp4", "width": 640, "height": 360,
                             "thumbnail": "https://cdn.pixabay.com/video/202_tiny.jpg"}}}


def test_resumo_dos_resultados_e_os_enderecos_permitidos():
    imagem = pixabay.resumir("imagem", IMAGEM)
    assert imagem["arquivo"].endswith("a_1280.jpg") and imagem["previa"].endswith("a_640.jpg")
    assert (imagem["usuario"], imagem["largura"]) == ("fotografa", 4000)
    video = pixabay.resumir("video", VIDEO)
    assert video["arquivo"].endswith("202_large.mp4") and video["video_previa"].endswith("202_tiny.mp4")
    # O 4K fica de fora: sobra o maior até 1920 de largura
    quatro_k = {**VIDEO, "videos": {"large": {"url": "https://cdn.pixabay.com/4k.mp4", "width": 3840},
                                    "medium": VIDEO["videos"]["medium"]}}
    assert pixabay.resumir("video", quatro_k)["arquivo"].endswith("202_medium.mp4")
    assert pixabay.endereco_permitido("https://cdn.pixabay.com/x.mp4")
    for ruim in ("http://cdn.pixabay.com/x.mp4", "https://pixabay.com.evil.com/x", "https://localhost/x",
                 "file:///etc/passwd", ""):
        assert not pixabay.endereco_permitido(ruim), ruim
    assert pixabay.parametros("imagem", "  lendo   a bíblia ", 2, "vertical") == {
        "lang": "pt", "safesearch": "true", "per_page": 24, "page": 2, "q": "lendo a bíblia", "image_type": "photo",
        "orientation": "vertical"}
    assert pixabay.parametros("video", item_id=202) == {"id": 202}


@pytest.fixture
def cliente(db_limpo, monkeypatch):
    pedidos = []

    def pedir(tipo, params):
        pedidos.append((tipo, params))
        if "id" in params:
            return {"totalHits": 1, "hits": [IMAGEM if tipo == "imagem" else VIDEO]}
        return {"totalHits": 2, "hits": [IMAGEM if tipo == "imagem" else VIDEO, {"id": 9}]}

    monkeypatch.setattr(pixabay, "pedir", pedir)
    with TestClient(app) as cliente:
        cliente.pedidos = pedidos
        yield cliente


def test_busca_guardada_e_com_a_fonte(cliente):
    cadastrar(cliente)
    resposta = cliente.get("/api/pixabay/buscar", params={"tipo": "imagem", "q": "bíblia"}).json()
    assert resposta["fonte"]["nome"] == "Pixabay" and resposta["total"] == 2
    assert [item["id"] for item in resposta["itens"]] == [101], "o resultado sem arquivo fica de fora"
    cliente.get("/api/pixabay/buscar", params={"tipo": "imagem", "q": "bíblia"})
    assert len(cliente.pedidos) == 1, "a mesma busca vem do cache"
    cliente.get("/api/pixabay/buscar", params={"tipo": "video", "q": "bíblia"})
    assert len(cliente.pedidos) == 2
    assert cliente.get("/api/pixabay/buscar", params={"tipo": "audio"}).status_code == 422


def _gerar_video(destino):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(destino)], check=True)


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg não instalado")
def test_importar_baixa_so_da_pixabay_e_entra_na_biblioteca_com_o_credito(cliente, db_limpo, monkeypatch):
    cadastrar(cliente)
    baixados = []

    def baixar(url, destino, tipo, reportar=lambda *_: None):
        assert pixabay.endereco_permitido(url)
        baixados.append(url)
        _gerar_video(destino)
        return destino.stat().st_size

    monkeypatch.setattr(pixabay, "baixar", baixar)
    midia = cliente.post("/api/pixabay/importar", json={"tipo": "video", "id": 202}).json()
    assert midia["status"] == "processando" and midia["pixabay"]["usuario"] == "cineasta"
    assert midia["nome"] == "Pixabay · céu, nuvens"
    assert cliente.post("/api/pixabay/importar", json={"tipo": "video", "id": 202}).json()["id"] == midia["id"]
    for tipo in ("pixabay", "ingestao"):
        job = pegar_proximo_job(db_limpo, [tipo], "w-teste")
        assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})
    assert baixados == ["https://cdn.pixabay.com/video/202_large.mp4"]
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta" and vista["video"]["largura"] == 640
    assert vista["pixabay"]["pagina"] == "https://pixabay.com/videos/202/"


def test_sem_a_chave_a_busca_explica(db_limpo, monkeypatch):
    monkeypatch.setattr(pixabay, "PIXABAY_CHAVE", "")
    with TestClient(app) as cliente:
        cadastrar(cliente)
        assert cliente.get("/api/pixabay/estado").json()["ligada"] is False
        resposta = cliente.get("/api/pixabay/buscar", params={"tipo": "imagem", "q": "nada"})
        assert resposta.status_code == 503 and "chave" in resposta.json()["detail"]
