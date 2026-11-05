# O álbum de fotos (onda 16) de ponta a ponta: criar, enviar fotos pelo tus com a pasta, a ingestão, a grade, as
# notas, tirar fotos (a usada num projeto vai para a biblioteca) e excluir o álbum
import base64
import io

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_uploads import PEDACO, TUS, entrar
from worker.worker_principal import processar_job

SEGUNDO = 254_016_000_000


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        entrar(cliente)
        yield cliente


def _b64(texto: str) -> str:
    return base64.b64encode(texto.encode()).decode()


def _jpeg(cor) -> bytes:
    saida = io.BytesIO()
    Image.new("RGB", (64, 48), cor).save(saida, "JPEG")
    return saida.getvalue()


def enviar_foto(cliente, album_id: str, caminho: str, conteudo: bytes, tipo="image/jpeg"):
    nome = caminho.rsplit("/", 1)[-1]
    metadados = f"filename {_b64(nome)},filetype {_b64(tipo)},album {_b64(album_id)},caminho {_b64(caminho)}"
    criado = cliente.post("/api/uploads", headers={**TUS, "Upload-Length": str(len(conteudo)),
                                                   "Upload-Metadata": metadados})
    if criado.status_code != 201:
        return criado
    local = criado.headers["Location"]
    assert cliente.patch(local, headers={**PEDACO, "Upload-Offset": "0"}, content=conteudo).status_code == 204
    return local.rsplit("/", 1)[1]


def ingerir_tudo(db):
    while job := pegar_proximo_job(db, ["ingestao"], "w-teste"):
        assert job["entrada"].get("album_id"), "a ingestão de foto de álbum leva o álbum (a biblioteca não recarrega)"
        assert processar_job(db, job, "w-teste") == "concluido", db.jobs.find_one({"_id": job["_id"]})["erro"]


def test_album_do_envio_a_exclusao(cliente, db_limpo):
    album = cliente.post("/api/albuns", json={"nome": "  Casamento   Ana e Leo ", "genero": "casamento"})
    assert album.status_code == 201, album.text
    album = album.json()
    assert album["nome"] == "Casamento Ana e Leo" and album["fotos"] == 0
    assert cliente.post("/api/albuns", json={"nome": "X", "genero": "festa_junina"}).status_code == 422

    ids = [enviar_foto(cliente, album["id"], f"Ana e Leo/Cerimônia/IMG_{i}.jpg", _jpeg((40 * i, 90, 120)))
           for i in range(3)]
    ids.append(enviar_foto(cliente, album["id"], "IMG_solta.jpg", _jpeg((10, 10, 10))))
    # O álbum só aceita fotos, e de um álbum do próprio espaço
    video = enviar_foto(cliente, album["id"], "clipe.mp4", b"0" * 100, "video/mp4")
    assert video.status_code == 415
    sumido = enviar_foto(cliente, str(ObjectId()), "IMG_x.jpg", _jpeg((0, 0, 0)))
    assert sumido.status_code == 404

    # As fotos do álbum não aparecem na lista da biblioteca
    assert cliente.get("/api/midias").json() == []
    ingerir_tudo(db_limpo)

    fotos = cliente.get(f"/api/albuns/{album['id']}/fotos").json()
    assert sorted(f["midia_id"] for f in fotos) == sorted(ids)
    pastas = {f["midia_id"]: f["pasta"] for f in fotos}
    assert pastas[ids[0]] == "Ana e Leo/Cerimônia" and pastas[ids[3]] == ""
    assert all(f["status"] == "pronta" and (f["largura"], f["altura"]) == (64, 48) and f["do_album"] for f in fotos)
    resumo = cliente.get(f"/api/albuns/{album['id']}").json()
    assert (resumo["fotos"], resumo["prontas"]) == (4, 4) and resumo["capa_midia_id"] in ids

    # Notas, cores e marcações em várias fotos de uma vez
    mudou = cliente.patch(f"/api/albuns/{album['id']}/fotos",
                          json={"midia_ids": ids[:2], "nota": 5, "cor": "verde", "marcacao": "escolhida"})
    assert mudou.status_code == 204
    assert cliente.patch(f"/api/albuns/{album['id']}/fotos",
                         json={"midia_ids": ids[1:2], "tirar_cor": True}).status_code == 204
    assert cliente.patch(f"/api/albuns/{album['id']}/fotos", json={"midia_ids": ids[:1]}).status_code == 422
    assert cliente.patch(f"/api/albuns/{album['id']}/fotos",
                         json={"midia_ids": ids[:1], "nota": 9}).status_code == 422
    fotos = {f["midia_id"]: f for f in cliente.get(f"/api/albuns/{album['id']}/fotos").json()}
    assert (fotos[ids[0]]["nota"], fotos[ids[0]]["cor"], fotos[ids[0]]["marcacao"]) == (5, "verde", "escolhida")
    assert (fotos[ids[1]]["cor"], fotos[ids[1]]["marcacao"]) == (None, "escolhida")
    assert cliente.get(f"/api/albuns/{album['id']}").json()["escolhidas"] == 2

    # Renomear e mudar o tipo
    mudado = cliente.patch(f"/api/albuns/{album['id']}", json={"nome": "Ana & Leo", "genero": "evento"}).json()
    assert (mudado["nome"], mudado["genero"]) == ("Ana & Leo", "evento")

    # A foto usada num projeto não sai do disco: volta para a biblioteca
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    clipe = {"id": "c1", "midia_id": ids[2], "inicio": 0, "duracao": 5 * SEGUNDO, "entrada": 0, "velocidade": 1,
             "volume": 1}
    corpo = {"versao": projeto["versao"], "nome": "Com a foto", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": [clipe]}]}
    assert cliente.put(f"/api/projetos/{projeto['id']}", json=corpo).status_code == 200
    tirou = cliente.post(f"/api/albuns/{album['id']}/fotos/remover", json={"midia_ids": ids[2:4]}).json()
    assert tirou == {"apagadas": 1, "na_biblioteca": 1}
    assert [m["id"] for m in cliente.get("/api/midias").json()] == [ids[2]]
    assert cliente.get(f"/api/midias/{ids[3]}").status_code == 404

    # Uma imagem da biblioteca entra no álbum sem cópia, e só sai do álbum
    posta = cliente.post(f"/api/albuns/{album['id']}/fotos", json={"midia_ids": [ids[2]]})
    assert posta.status_code == 201 and posta.json()[0]["do_album"] is False
    assert cliente.post(f"/api/albuns/{album['id']}/fotos", json={"midia_ids": [ids[2]]}).status_code == 422

    # Excluir o álbum apaga as fotos dele e deixa a da biblioteca
    assert cliente.delete(f"/api/albuns/{album['id']}").json() == {"apagadas": 2, "na_biblioteca": 0}
    assert cliente.get(f"/api/albuns/{album['id']}").status_code == 404
    assert [m["id"] for m in cliente.get("/api/midias").json()] == [ids[2]]
    assert db_limpo.album_fotos.count_documents({}) == 0
    assert cliente.get("/api/albuns").json() == []


def test_album_de_outro_espaco(cliente, db_limpo):
    album = cliente.post("/api/albuns", json={"nome": "Meu"}).json()
    with TestClient(app) as outro:
        entrar(outro, "Outro espaço")
        assert outro.get(f"/api/albuns/{album['id']}").status_code == 404
        assert outro.get("/api/albuns").json() == []
        assert enviar_foto(outro, album["id"], "IMG.jpg", _jpeg((0, 0, 0))).status_code == 404
