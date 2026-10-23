# Objetos de uma foto: seleção com um clique e apagar ou recortar o que foi selecionado (sem os modelos no CI, as
# contas simuladas do worker; com eles, o MobileSAM e o LaMa)
import base64
import io

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from core.modelos.midia import chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from core.utils.objeto import apagar, caixa_do_lama, recortar
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import organizacao_de
from tests.integracao.test_imagens import enviar_imagem
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _foto(caminho):
    imagem = Image.new("RGB", (800, 600), (60, 120, 200))
    imagem.paste((240, 200, 40), (300, 200, 500, 400))
    imagem.save(caminho, "JPEG", quality=95)


def _processar(db, tipo):
    job = pegar_proximo_job(db, [tipo], "w-teste")
    assert job is not None
    assert processar_job(db, job, "w-teste") == "concluido", db.jobs.find_one({"_id": job["_id"]})["erro"]
    return db.jobs.find_one({"_id": job["_id"]})


def test_selecionar_e_recortar_e_apagar_o_objeto(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    foto_id = str(enviar_imagem(db_limpo, organizacao, "Foto.jpg", _foto))
    resposta = cliente.post(f"/api/midias/{foto_id}/selecao", json={"pontos": [{"x": 0.5, "y": 0.5}]})
    assert resposta.status_code == 200, resposta.text
    selecao = resposta.json()
    assert selecao["job_id"] and selecao["arquivo"].startswith("selecao_")
    job = _processar(db_limpo, "selecao")
    assert job["saida"]["arquivo"] == selecao["arquivo"]
    assert cliente.get(f"/api/midias/{foto_id}/arquivos/{selecao['arquivo']}").status_code == 200
    # Os mesmos pontos não pedem outro job
    de_novo = cliente.post(f"/api/midias/{foto_id}/selecao", json={"pontos": [{"x": 0.5, "y": 0.5}]}).json()
    assert de_novo == {"arquivo": selecao["arquivo"], "job_id": None}

    # Recortar: uma mídia nova, transparente fora do objeto
    nova = cliente.post(f"/api/midias/{foto_id}/objeto", json={"acao": "recortar", "selecao": selecao["arquivo"]})
    assert nova.status_code == 201, nova.text
    assert nova.json()["status"] == "processando" and nova.json()["nome"] == "Foto (objeto)"
    _processar(db_limpo, "objeto")
    _processar(db_limpo, "ingestao")
    recortada = cliente.get(f"/api/midias/{nova.json()['id']}").json()
    assert recortada["status"] == "pronta" and recortada["video"]["transparente"]

    # Apagar com o pincel: um PNG branco no meio
    pincel = Image.new("L", (800, 600), 0)
    pincel.paste(255, (280, 180, 520, 420))
    corpo = io.BytesIO()
    pincel.save(corpo, "PNG")
    pedido = {"acao": "apagar", "pincel": base64.b64encode(corpo.getvalue()).decode()}
    sem = cliente.post(f"/api/midias/{foto_id}/objeto", json=pedido).json()
    _processar(db_limpo, "objeto")
    _processar(db_limpo, "ingestao")
    doc = db_limpo.midias.find_one({"_id": ObjectId(sem["id"])})
    caminho = storage.caminho_local(chave_arquivo(organizacao, doc["_id"], "imagem.png"))
    with Image.open(caminho) as aberta:
        meio = np.asarray(aberta.convert("RGB"))[300, 400]
    # O amarelo do meio sumiu (virou o azul em volta, borrado ou refeito)
    assert meio[2] > meio[0], meio


def test_pedidos_que_nao_servem(cliente, db_limpo):
    cadastrar(cliente)
    foto_id = str(enviar_imagem(db_limpo, organizacao_de(cliente), "Foto.jpg", _foto))
    assert cliente.post(f"/api/midias/{foto_id}/objeto", json={"acao": "apagar"}).status_code == 422
    assert cliente.post(f"/api/midias/{foto_id}/objeto",
                        json={"acao": "apagar", "selecao": "selecao_000000000000.png"}).status_code == 409
    pincel_errado = {"acao": "apagar", "pincel": "isso não é png"}
    assert cliente.post(f"/api/midias/{foto_id}/objeto", json=pincel_errado).status_code == 422
    assert cliente.post(f"/api/midias/{foto_id}/selecao",
                        json={"pontos": [{"x": 0.5, "y": 0.5, "incluir": False}]}).status_code == 422


def test_contas_do_objeto():
    mascara = np.zeros((600, 800), dtype=bool)
    mascara[200:400, 300:500] = True
    x0, y0, x1, y1 = caixa_do_lama(mascara)
    assert x0 <= 300 and y0 <= 200 and x1 >= 500 and y1 >= 400 and (x1 - x0) == (y1 - y0)
    foto = Image.new("RGB", (800, 600), (10, 20, 30))
    recortado = recortar(foto, mascara)
    assert recortado.mode == "RGBA" and recortado.size == (208, 208)
    assert np.asarray(apagar(foto, np.zeros((600, 800), dtype=bool))).shape == (600, 800, 3)
