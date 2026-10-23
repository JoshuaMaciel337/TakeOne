# Contorno e sombra no render: um logo (um quadrado verde num PNG transparente) ganha o contorno branco em volta
# e a sombra embaixo, no lugar que a conta manda.
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import FUNDO, TEM_FFMPEG, organizacao_de, quadro_do_video
from tests.integracao.test_imagens import SEGUNDO, _exportar, enviar_imagem


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _perto(cor, esperada, tolerancia=40):
    return max(abs(int(a) - b) for a, b in zip(cor, esperada, strict=True)) <= tolerancia


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_contorno_e_sombra_em_volta_do_logo(cliente, db_limpo):
    cadastrar(cliente)

    def logo(caminho):
        imagem = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
        imagem.paste((0, 255, 0, 255), (100, 100, 300, 300))
        imagem.save(caminho, "PNG")

    midia_id = enviar_imagem(db_limpo, organizacao_de(cliente), "logo.png", logo)
    # A imagem cabe no quadro de 720: o quadrado vai de 180 a 540. O contorno tem 5% de 720 (36 px); a sombra,
    # 10% para baixo (72 px), quase sem desfoque e quase preta
    clipe = {"id": "l1", "midia_id": str(midia_id), "inicio": 0, "duracao": 2 * SEGUNDO, "entrada": 0,
             "velocidade": 1, "volume": 1, "contorno": {"cor": "#ffffff", "largura": 0.05},
             "sombra": {"cor": "#000000", "opacidade": 1, "desfoque": 0.004, "distancia": 0.1, "angulo": 90}}
    video = _exportar(cliente, db_limpo, lambda p: [{**p["faixas"][0], "clipes": [clipe]}], 2.0, proporcao="1:1")
    quadro = quadro_do_video(video, 1.0, 720, 720)
    def cor(x, y):
        return tuple(int(c) for c in quadro[y, x])

    assert _perto(cor(360, 360), (0, 255, 0)), "o quadrado no meio"
    for ponto in ((558, 360), (162, 360), (360, 162)):
        assert _perto(cor(*ponto), (255, 255, 255)), ("contorno", ponto, cor(*ponto))
    for ponto in ((600, 300), (120, 300), (360, 110)):
        assert _perto(cor(*ponto), FUNDO), ("fundo", ponto, cor(*ponto))
    # Embaixo: o contorno (até 576) e, depois dele, a sombra do conjunto, até 576 + 72
    assert _perto(cor(360, 600), (0, 0, 0)) and _perto(cor(360, 640), (0, 0, 0)), (cor(360, 600), cor(360, 640))
    assert _perto(cor(360, 665), FUNDO), cor(360, 665)
