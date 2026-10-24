# Fotos com IA pela API e pelo worker: ampliar, expandir e a foto em 3D criam mídias novas que passam pela ingestão
# (sem os modelos no CI, as contas simuladas de core/utils/foto_ia.py)
import shutil

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import organizacao_de
from tests.integracao.test_imagens import enviar_imagem
from tests.integracao.test_objetos import _foto, _processar

TEM_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _pronta(cliente, db, tipo: str, midia_id: str) -> dict:
    _processar(db, tipo)
    _processar(db, "ingestao")
    midia = cliente.get(f"/api/midias/{midia_id}").json()
    assert midia["status"] == "pronta", midia
    return midia


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_ampliar_e_expandir_criam_fotos_novas(cliente, db_limpo):
    cadastrar(cliente)
    foto_id = str(enviar_imagem(db_limpo, organizacao_de(cliente), "Foto.jpg", _foto))
    ampliada = cliente.post(f"/api/midias/{foto_id}/ampliar", json={"fator": 2})
    assert ampliada.status_code == 201, ampliada.text
    assert ampliada.json()["nome"] == "Foto (ampliada 2×)" and ampliada.json()["status"] == "processando"
    midia = _pronta(cliente, db_limpo, "ampliar", ampliada.json()["id"])
    assert (midia["video"]["largura"], midia["video"]["altura"]) == (1600, 1200)

    expandida = cliente.post(f"/api/midias/{foto_id}/expandir", json={"proporcao": "1:1"})
    assert expandida.status_code == 201, expandida.text
    midia = _pronta(cliente, db_limpo, "expandir", expandida.json()["id"])
    assert (midia["video"]["largura"], midia["video"]["altura"]) == (800, 800)
    # A foto de origem não mudou
    assert cliente.get(f"/api/midias/{foto_id}").json()["video"]["largura"] == 800


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_foto_em_3d_vira_um_video(cliente, db_limpo):
    cadastrar(cliente)
    foto_id = str(enviar_imagem(db_limpo, organizacao_de(cliente), "Foto.jpg", _foto))
    pedido = cliente.post(f"/api/midias/{foto_id}/foto-3d", json={"movimento": "lado", "duracao": 2})
    assert pedido.status_code == 201, pedido.text
    midia = _pronta(cliente, db_limpo, "foto_3d", pedido.json()["id"])
    assert not midia.get("imagem") and abs(midia["duracao"] - 2) < 0.1
    assert (midia["video"]["largura"], midia["video"]["altura"]) == (800, 600)


def _grande(caminho):
    Image.new("RGB", (4096, 2304), (10, 20, 30)).save(caminho, "PNG")


def test_pedidos_que_nao_servem(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    foto_id = str(enviar_imagem(db_limpo, organizacao, "Foto.jpg", _foto))
    # 800 × 600 já é 4:3; e 16:9 → 9:16 inventaria mais que o dobro da foto
    assert "já está" in cliente.post(f"/api/midias/{foto_id}/expandir", json={"proporcao": "4:3"}).json()["detail"]
    assert cliente.post(f"/api/midias/{foto_id}/expandir", json={"proporcao": "5:1"}).status_code == 422
    assert cliente.post(f"/api/midias/{foto_id}/expandir", json={"proporcao": "16/9"}).status_code == 422
    assert cliente.post(f"/api/midias/{foto_id}/ampliar", json={"fator": 3}).status_code == 422
    assert cliente.post(f"/api/midias/{foto_id}/foto-3d", json={"duracao": 30}).status_code == 422
    grande_id = str(enviar_imagem(db_limpo, organizacao, "Grande.png", _grande))
    assert cliente.post(f"/api/midias/{grande_id}/ampliar", json={"fator": 2}).status_code == 409
    assert "dobro" in cliente.post(f"/api/midias/{grande_id}/expandir", json={"proporcao": "9:16"}).json()["detail"]


def test_profundidade_da_foto_e_guardada_uma_vez(cliente, db_limpo):
    import numpy as np

    from core.modelos.midia import chave_arquivo
    from core.utils import storage

    cadastrar(cliente)
    foto_id = str(enviar_imagem(db_limpo, organizacao_de(cliente), "Foto.jpg", _foto))
    resposta = cliente.post(f"/api/midias/{foto_id}/profundidade")
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["arquivo"] == "profundidade.png" and resposta.json()["job_id"]
    # Pedir de novo enquanto mede devolve o mesmo job
    assert cliente.post(f"/api/midias/{foto_id}/profundidade").json()["job_id"] == resposta.json()["job_id"]
    _processar(db_limpo, "profundidade")
    assert cliente.post(f"/api/midias/{foto_id}/profundidade").json()["job_id"] is None
    servida = cliente.get(f"/api/midias/{foto_id}/arquivos/profundidade.png")
    assert servida.status_code == 200
    from bson import ObjectId

    caminho = storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(foto_id), "profundidade.png"))
    cinza = np.asarray(Image.open(caminho))
    # No modo simulado, o chão perto (claro, embaixo) e o céu longe (escuro, em cima)
    assert cinza.ndim == 2 and cinza[0].mean() < 20 and cinza[-1].mean() > 235
