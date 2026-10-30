# As automações do Clipar (14.9): o horário, a escolha dos melhores cortes, o fim da esteira e o feed do canal
from datetime import UTC, datetime, timedelta

import pytest

from core.config import TZ
from core.modelos import automacao as a

FEED = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>Novo</title><published>2026-10-30T12:00:00+00:00</published></entry>
 <entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Velho</title><published>2026-10-01T12:00:00+00:00</published></entry>
 <entry><yt:videoId>curto</yt:videoId><title>Id inválido</title><published>2026-10-02T12:00:00+00:00</published></entry>
</feed>"""


def test_proximo_horario_em_sao_paulo():
    momento = datetime(2026, 10, 30, 21, 30, tzinfo=TZ)
    assert a.proximo_horario(None, momento) is None
    assert a.proximo_horario("25:00", momento) is None
    assert a.proximo_horario("23:00", momento) == datetime(2026, 10, 30, 23, 0, tzinfo=TZ)
    # Já passou hoje: amanhã; o minuto de agora vale agora
    assert a.proximo_horario("02:00", momento) == datetime(2026, 10, 31, 2, 0, tzinfo=TZ)
    assert a.proximo_horario("21:30", momento) == datetime(2026, 10, 30, 21, 30, tzinfo=TZ)
    # Um instante em outro fuso conta pelo relógio de São Paulo
    em_utc = datetime(2026, 10, 31, 2, 30, tzinfo=UTC)   # 23:30 do dia 30 em São Paulo
    assert a.proximo_horario("23:00", em_utc) == datetime(2026, 10, 31, 23, 0, tzinfo=TZ)


def test_os_melhores_cortes_sem_parecidos_nem_copias():
    cortes = [
        {"id": "a", "nota": 70, "trechos": [{"inicio": 0, "fim": 30}], "duracao": 30, "texto": "um dois três"},
        {"id": "b", "nota": 90, "trechos": [{"inicio": 5, "fim": 32}], "duracao": 27, "texto": "um dois três"},
        {"id": "c", "nota": 80, "trechos": [{"inicio": 100, "fim": 130}], "duracao": 30, "texto": "outra coisa aqui"},
        {"id": "d", "nota": 95, "trechos": [{"inicio": 200, "fim": 230}], "duracao": 30, "copia_de": "c", "texto": "x"},
        {"id": "e", "nota": None, "trechos": [{"inicio": 300, "fim": 330}], "duracao": 30, "texto": "parte dois"},
    ]
    # O a é parecido com o b (o mesmo trecho): fica o b, de nota maior
    assert a.cortes_escolhidos(cortes, 3) == ["b", "c"]
    assert a.cortes_escolhidos(cortes, 1) == ["b"]


def test_a_esteira_acaba_quando_nenhum_corte_anda():
    cortes = [{"id": "a", "saida": {"status": "exportado", "exportacao_id": "e1"}},
              {"id": "b", "saida": {"status": "erro"}},
              {"id": "c", "saida": {"status": "exportado", "exportacao_id": "e2"}}]
    assert a.situacao_dos_cortes(cortes, ["a", "b", "c"], {"e1": "pronta", "e2": "processando"}) == (True, 1, 1)
    assert a.situacao_dos_cortes(cortes, ["a", "b", "c"], {"e1": "pronta", "e2": "erro"}) == (False, 1, 2)
    # A exportação apagada e o corte que saiu da lista contam como erro
    assert a.situacao_dos_cortes(cortes, ["a", "sumiu"], {}) == (False, 0, 2)
    assert a.situacao_dos_cortes([{"id": "a", "saida": {"status": "montando"}}], ["a"], {}) == (True, 0, 0)


def test_esteira_nova_sem_o_trecho_e_com_o_limite_de_cortes():
    esteira = a.montar_esteira("org", "pessoa", "link", {"estrategia": "dicas", "inicio": 30, "fim": 90}, quantos=40)
    assert esteira["opcoes"] == {"estrategia": "dicas", "inicio": 0, "fim": None}
    assert esteira["quantos"] == a.QUANTOS_MAXIMO and esteira["status"] == a.IMPORTANDO


def test_canal_pelo_arroba_pelo_endereco_ou_pelo_id():
    assert a.normalizar_canal("@MeuCanal") == {"id": None, "handle": "@meucanal"}
    assert a.normalizar_canal("https://www.youtube.com/@MeuCanal/videos") == {"id": None, "handle": "@meucanal"}
    assert a.normalizar_canal("youtube.com/channel/UC1234567890123456789012") == {
        "id": "UC1234567890123456789012", "handle": None}
    with pytest.raises(ValueError):
        a.normalizar_canal("https://exemplo.com/x y")


def test_feed_do_canal_e_os_vistos():
    videos = a.ler_feed(FEED)
    assert [video["video_id"] for video in videos] == ["BBBBBBBBBBB", "AAAAAAAAAAA"]
    assert [video["video_id"] for video in a.videos_novos(videos, ["BBBBBBBBBBB"])] == ["AAAAAAAAAAA"]
    # Do mais antigo ao mais novo
    assert [video["video_id"] for video in a.videos_novos(videos, [])] == ["AAAAAAAAAAA", "BBBBBBBBBBB"]
    assert a.ler_feed("não é xml") == []
    vistos = []
    for n in range(a.MAXIMO_VISTOS + 5):
        vistos = a.lembrar_visto(vistos, f"v{n}")
    assert len(vistos) == a.MAXIMO_VISTOS and vistos[-1] == f"v{a.MAXIMO_VISTOS + 4}"
    assert a.lembrar_visto(["x", "y"], "x") == ["y", "x"]


def test_automacao_comeca_na_primeira_volta():
    doc = a.montar_automacao("org", "pessoa", {"id": "UC1", "handle": "@c"}, "Canal", {"inicio": 9},
                             momento=datetime(2026, 10, 30, tzinfo=TZ) - timedelta(days=1))
    assert doc["canal"]["primeira_volta"] is True and doc["opcoes"]["inicio"] == 0 and doc["ativa"] is True
