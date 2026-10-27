# Importar pelo link: só os sites conhecidos, pela forma do endereço, viram a url canônica do vídeo
import pytest

from core.modelos.importacao import (
    DURACAO_MAXIMA,
    dados_do_video,
    extratores,
    ler_link,
    montar_importacao,
    problema_do_video,
)


@pytest.mark.parametrize(("url", "origem", "identificador", "canonica"), [
    ("https://www.youtube.com/watch?v=EDwQxx8wiik&pp=abc", "youtube", "EDwQxx8wiik",
     "https://www.youtube.com/watch?v=EDwQxx8wiik"),
    ("youtu.be/EDwQxx8wiik?t=30", "youtube", "EDwQxx8wiik", "https://www.youtube.com/watch?v=EDwQxx8wiik"),
    ("https://m.youtube.com/shorts/EDwQxx8wiik", "youtube", "EDwQxx8wiik", "https://www.youtube.com/watch?v=EDwQxx8wiik"),
    ("https://www.youtube.com/live/EDwQxx8wiik", "youtube", "EDwQxx8wiik", "https://www.youtube.com/watch?v=EDwQxx8wiik"),
    ("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view?usp=sharing", "drive",
     "1AbCdEfGhIjKlMnOpQrStUvWx", "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view"),
    ("https://vimeo.com/76979871", "vimeo", "76979871", "https://vimeo.com/76979871"),
    ("https://player.vimeo.com/video/76979871", "vimeo", "76979871", "https://vimeo.com/76979871"),
    ("https://www.twitch.tv/videos/2245678901", "twitch", "2245678901", "https://www.twitch.tv/videos/2245678901"),
    ("https://www.twitch.tv/canal/clip/FunnyClip-abc_123", "twitch", "FunnyClip-abc_123",
     "https://clips.twitch.tv/FunnyClip-abc_123"),
    ("https://www.tiktok.com/@pessoa.legal/video/7300000000000000000", "tiktok", "7300000000000000000",
     "https://www.tiktok.com/@pessoa.legal/video/7300000000000000000"),
    ("https://www.instagram.com/reel/C9abcDEF123/?igsh=x", "instagram", "C9abcDEF123",
     "https://www.instagram.com/reel/C9abcDEF123/"),
])
def test_links_aceitos_viram_a_url_canonica(url, origem, identificador, canonica):
    assert ler_link(url) == {"origem": origem, "id": identificador, "url": canonica}


@pytest.mark.parametrize("url", [
    "",
    "http://localhost:8010/api/midias",
    "http://mongo:27017/",
    "http://127.0.0.1/video.mp4",
    "http://169.254.169.254/latest/meta-data/",
    "https://www.youtube.com.atacante.com/watch?v=EDwQxx8wiik",
    "https://www.youtube.com:8443/watch?v=EDwQxx8wiik",
    "https://www.youtube.com/watch?v=curto",
    "https://www.youtube.com/@canal",
    "https://exemplo.com/video.mp4",
    "file:///etc/passwd",
    "https://vimeo.com/canal/abc",
    "https://www.youtube.com/watch?v=EDwQxx8wiik com espaço",
])
def test_links_de_fora_ou_internos_sao_recusados(url):
    assert ler_link(url) is None


def test_o_generico_nunca_entra_nos_extratores():
    for origem in ("youtube", "drive", "vimeo", "twitch", "tiktok", "instagram"):
        assert "generic" not in [nome.lower() for nome in extratores(origem)]


def test_dados_do_video_ficam_so_com_os_campos_conhecidos():
    link = ler_link("https://youtu.be/EDwQxx8wiik")
    metadados = {"title": "  O poder   dos mini-hábitos ", "channel": "TEDx Talks", "duration": 602,
                 "thumbnail": "http://inseguro/miniatura.jpg",
                 "thumbnails": [{"url": "https://i.ytimg.com/a.jpg"}, {"url": "https://i.ytimg.com/b.jpg"}],
                 "upload_date": "20180214", "formats": [{"url": "https://..."}], "live_status": "not_live"}
    dados = dados_do_video(link, metadados)
    assert dados == {**link, "site": "YouTube", "titulo": "O poder dos mini-hábitos", "canal": "TEDx Talks",
                     "duracao": 602.0, "miniatura": "https://i.ytimg.com/b.jpg", "data": "2018-02-14",
                     "ao_vivo": False}
    assert problema_do_video(dados) is None
    assert "horas" in problema_do_video({**dados, "duracao": DURACAO_MAXIMA + 1})
    assert dados_do_video(link, {"live_status": "is_live"})["ao_vivo"] is True


def test_importacao_nasce_processando_com_o_job_no_lugar_da_ingestao():
    link = ler_link("https://youtu.be/EDwQxx8wiik")
    midia, job = montar_importacao("org", "usuario", link, {"titulo": "Mini-hábitos", "duracao": 602.0})
    assert midia["status"] == "processando" and midia["nome"] == "Mini-hábitos"
    assert midia["importacao"] == {**link, "titulo": "Mini-hábitos", "duracao": 602.0}
    assert job["tipo"] == "importar_link" and job["entrada"]["url"] == link["url"]
    sem_dados, _ = montar_importacao("org", "usuario", link)
    assert sem_dados["nome"] == "Importando do YouTube"
