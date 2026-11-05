# O álbum de fotos (onda 16) de ponta a ponta: criar, enviar fotos pelo tus com a pasta, a ingestão, a grade, as
# notas, tirar fotos (a usada num projeto vai para a biblioteca) e excluir o álbum
import base64
import io

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from PIL import Image, ImageFilter

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


def test_raw_no_album_pela_previa_de_dentro(cliente, db_limpo):
    from tests.test_raw import _jpeg, _tiff_do_exif

    album = cliente.post("/api/albuns", json={"nome": "RAW"}).json()
    conteudo = _tiff_do_exif(orientacao=6, data="2026:05:10 11:00:00") + b"\x00" * 500 + _jpeg(600, 400, (200, 0, 0))
    midia_id = enviar_foto(cliente, album["id"], "Ensaio/IMG_9999.CR2", conteudo, "image/x-canon-cr2")
    ingerir_tudo(db_limpo)
    foto = cliente.get(f"/api/albuns/{album['id']}/fotos").json()[0]
    assert foto["midia_id"] == midia_id and foto["status"] == "pronta"
    assert (foto["largura"], foto["altura"]) == (400, 600) and foto["exif"]["data"] == "2026-05-10T11:00:00"


def test_importar_pasta_do_computador_sem_copiar(cliente, db_limpo, tmp_path, monkeypatch):
    from core.utils import fotos_no_lugar

    fotos = tmp_path / "fotos"
    (fotos / "Casamento" / "Festa").mkdir(parents=True)
    (fotos / "Casamento" / "IMG_1.jpg").write_bytes(_jpeg((200, 10, 10)))
    (fotos / "Casamento" / "Festa" / "IMG_2.jpg").write_bytes(_jpeg((10, 200, 10)))
    (fotos / "Casamento" / "Festa" / "notas.txt").write_text("não é foto")
    (fotos / "Casamento" / ".oculta").mkdir()
    (fotos / "Casamento" / ".oculta" / "IMG_3.jpg").write_bytes(_jpeg((0, 0, 0)))
    album = cliente.post("/api/albuns", json={"nome": "No lugar"}).json()

    # Sem a pasta montada, a rota diz que não há; com ela, lista as pastas
    monkeypatch.setattr(fotos_no_lugar, "PASTA_DAS_FOTOS", tmp_path / "nao-existe")
    assert cliente.get("/api/albuns/pasta-do-computador").json()["disponivel"] is False
    assert cliente.post(f"/api/albuns/{album['id']}/importar", json={"caminho": ""}).status_code == 409
    monkeypatch.setattr(fotos_no_lugar, "PASTA_DAS_FOTOS", fotos)
    raiz = cliente.get("/api/albuns/pasta-do-computador").json()
    assert raiz == {"disponivel": True, "caminho": "", "fotos": 0,
                    "pastas": [{"nome": "Casamento", "caminho": "Casamento", "fotos": 1}]}
    dentro = cliente.get("/api/albuns/pasta-do-computador", params={"caminho": "Casamento"}).json()
    assert dentro["pastas"] == [{"nome": "Festa", "caminho": "Casamento/Festa", "fotos": 1}] and dentro["fotos"] == 1
    for fora in ("../", "Casamento/../../etc"):
        assert cliente.get("/api/albuns/pasta-do-computador", params={"caminho": fora}).status_code == 404

    pedido = cliente.post(f"/api/albuns/{album['id']}/importar", json={"caminho": "Casamento", "subpastas": True})
    assert pedido.status_code == 202
    job = pegar_proximo_job(db_limpo, ["importar_pasta"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido"
    saida = db_limpo.jobs.find_one({"_id": job["_id"]})["saida"]
    assert saida == {"album_id": album["id"], "novas": 2, "ja_estavam": 0}
    ingerir_tudo(db_limpo)
    lista = cliente.get(f"/api/albuns/{album['id']}/fotos").json()
    assert sorted((f["pasta"], f["nome"], f["status"]) for f in lista) == [
        ("Casamento", "IMG_1", "pronta"), ("Casamento/Festa", "IMG_2", "pronta")]
    # Nada foi copiado: o original é o arquivo da pasta, e o download o devolve
    midia = db_limpo.midias.find_one({"_id": ObjectId(lista[0]["midia_id"])})
    assert midia["externo"].startswith("Casamento/") and "original.jpg" not in midia["arquivos"]
    baixado = cliente.get(f"/api/midias/{midia['_id']}/original")
    assert baixado.status_code == 200 and baixado.content == (fotos / midia["externo"]).read_bytes()

    # Importar de novo traz só as novas; tirar do álbum não apaga o arquivo da pasta
    (fotos / "Casamento" / "IMG_4.jpg").write_bytes(_jpeg((0, 0, 200)))
    cliente.post(f"/api/albuns/{album['id']}/importar", json={"caminho": "Casamento"})
    job = pegar_proximo_job(db_limpo, ["importar_pasta"], "w-teste")
    processar_job(db_limpo, job, "w-teste")
    assert db_limpo.jobs.find_one({"_id": job["_id"]})["saida"]["novas"] == 1
    ingerir_tudo(db_limpo)
    assert cliente.delete(f"/api/albuns/{album['id']}").json()["apagadas"] == 3
    assert (fotos / "Casamento" / "IMG_1.jpg").is_file() and (fotos / "Casamento" / "Festa" / "IMG_2.jpg").is_file()


def test_analisar_mede_as_fotos_que_faltam(cliente, db_limpo):
    album = cliente.post("/api/albuns", json={"nome": "Medidas"}).json()
    ids = [enviar_foto(cliente, album["id"], f"IMG_{i}.jpg", _jpeg((60 * i, 90, 30))) for i in range(3)]
    ingerir_tudo(db_limpo)
    assert all(f["medidas"] is None for f in cliente.get(f"/api/albuns/{album['id']}/fotos").json())
    primeiro = cliente.post(f"/api/albuns/{album['id']}/analisar")
    assert primeiro.status_code == 202
    # Pedir de novo com a análise na fila devolve a mesma
    assert cliente.post(f"/api/albuns/{album['id']}/analisar").json() == primeiro.json()
    job = pegar_proximo_job(db_limpo, ["medir_album"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido"
    assert db_limpo.jobs.find_one({"_id": job["_id"]})["saida"]["medidas"] == 3
    fotos = cliente.get(f"/api/albuns/{album['id']}/fotos").json()
    for foto in fotos:
        assert set(foto["medidas"]) >= {"foco", "exposicao", "rostos"} and "vetor" not in foto["medidas"]
    assert len(db_limpo.fotos_medidas.find_one({"midia_id": ObjectId(ids[0])})["vetor"]) == 384 * 2
    # Uma foto nova depois: a próxima análise mede só ela
    enviar_foto(cliente, album["id"], "IMG_nova.jpg", _jpeg((5, 5, 200)))
    ingerir_tudo(db_limpo)
    cliente.post(f"/api/albuns/{album['id']}/analisar")
    job = pegar_proximo_job(db_limpo, ["medir_album"], "w-teste")
    processar_job(db_limpo, job, "w-teste")
    assert db_limpo.jobs.find_one({"_id": job["_id"]})["saida"] == {"album_id": album["id"], "medidas": 1, "falhas": 0,
                                                                     "ja_estavam": 3, "pessoas": 0}
    # Tirar a foto do álbum leva as medidas junto
    cliente.post(f"/api/albuns/{album['id']}/fotos/remover", json={"midia_ids": [ids[0]]})
    assert db_limpo.fotos_medidas.count_documents({"midia_id": ObjectId(ids[0])}) == 0


def test_escolher_as_melhores_sem_passar_por_cima_do_que_foi_feito_a_mao(cliente, db_limpo):
    album = cliente.post("/api/albuns", json={"nome": "Escolha", "genero": "produto"}).json()
    assert cliente.post(f"/api/albuns/{album['id']}/escolher", json={}).status_code == 409

    def foto_com_bordas(semente: int, borrar: float = 0) -> bytes:
        sorteio = np.random.default_rng(semente)
        imagem = Image.fromarray(sorteio.integers(0, 255, (96, 128, 3), dtype=np.uint8)).resize((512, 384))
        if borrar:
            imagem = imagem.filter(ImageFilter.GaussianBlur(borrar))
        saida = io.BytesIO()
        imagem.save(saida, "JPEG", quality=92)
        return saida.getvalue()

    ids = [enviar_foto(cliente, album["id"], f"IMG_{i}.jpg", foto_com_bordas(i)) for i in range(5)]
    borrada = enviar_foto(cliente, album["id"], "IMG_borrada.jpg", foto_com_bordas(9, borrar=6))
    ingerir_tudo(db_limpo)
    cliente.post(f"/api/albuns/{album['id']}/analisar")
    processar_job(db_limpo, pegar_proximo_job(db_limpo, ["medir_album"], "w-teste"), "w-teste")
    # A pessoa já rejeitou uma foto à mão: a escolha não muda a marcação dela
    cliente.patch(f"/api/albuns/{album['id']}/fotos", json={"midia_ids": [ids[0]], "marcacao": "rejeitada"})

    resposta = cliente.post(f"/api/albuns/{album['id']}/escolher", json={"quantas": "muitas"})
    assert resposta.status_code == 200, resposta.text
    saida = resposta.json()
    assert saida["sem_analise"] == 0 and sum(saida["categorias"].values()) == 6
    fotos = {f["midia_id"]: f for f in cliente.get(f"/api/albuns/{album['id']}/fotos").json()}
    assert fotos[borrada]["categoria"] == "desfocada" and fotos[borrada]["nota"] == 1
    assert fotos[ids[0]]["marcacao"] == "rejeitada" and fotos[ids[0]]["categoria"]
    escolhidas = [f for f in fotos.values() if f["categoria"] in ("escolhida", "destaque")]
    assert escolhidas
    assert all(f["marcacao"] == "escolhida" and f["nota"] >= 4 for f in escolhidas if f["midia_id"] != ids[0])
    assert all(f["motivo"] and 0 <= f["nota_ia"] <= 100 for f in fotos.values())
    assert cliente.get(f"/api/albuns/{album['id']}").json()["escolha_opcoes"]["quantas"] == "muitas"

    # Assistido: só as categorias, sem mexer nas estrelas
    cliente.patch(f"/api/albuns/{album['id']}/fotos", json={"midia_ids": [ids[1]], "nota": 0})
    db_limpo.album_fotos.update_one({"midia_id": ObjectId(ids[1])}, {"$set": {"origem": "ia"}})
    cliente.post(f"/api/albuns/{album['id']}/escolher", json={"aplicar": False})
    assert {f["midia_id"]: f for f in cliente.get(f"/api/albuns/{album['id']}/fotos").json()}[ids[1]]["nota"] == 0


def test_album_de_outro_espaco(cliente, db_limpo):
    album = cliente.post("/api/albuns", json={"nome": "Meu"}).json()
    with TestClient(app) as outro:
        entrar(outro, "Outro espaço")
        assert outro.get(f"/api/albuns/{album['id']}").status_code == 404
        assert outro.get("/api/albuns").json() == []
        assert enviar_foto(outro, album["id"], "IMG.jpg", _jpeg((0, 0, 0))).status_code == 404


def test_pessoas_juntam_os_rostos_e_guardam_o_nome(cliente, db_limpo):
    from bson import Binary

    from worker.tarefas.medir_album import atualizar_pessoas

    album = cliente.post("/api/albuns", json={"nome": "Pessoas"}).json()
    ids = [enviar_foto(cliente, album["id"], f"IMG_{i}.jpg", _jpeg((40 * i, 90, 30))) for i in range(4)]
    ingerir_tudo(db_limpo)
    base = [np.random.default_rng(s).normal(0, 1, 128) for s in (1, 2)]

    def medir(midia: str, pessoas: list[int]):
        vetores = np.stack([base[p] + np.random.default_rng(len(midia) + p).normal(0, 0.05, 128) for p in pessoas])
        rostos = [{"caixa": [0.1 + 0.4 * k, 0.1, 0.2, 0.3]} for k in range(len(pessoas))]
        db_limpo.fotos_medidas.insert_one({"midia_id": ObjectId(midia), "rostos": rostos,
                                           "pessoas": Binary(vetores.astype(np.float16).tobytes())})

    # Ana nas quatro fotos, Leo em duas
    for i, midia in enumerate(ids):
        medir(midia, [0, 1] if i < 2 else [0])
    album_id = ObjectId(album["id"])
    assert atualizar_pessoas(db_limpo, album_id) == 2
    pessoas = cliente.get(f"/api/albuns/{album['id']}/pessoas").json()
    assert [p["fotos"] for p in pessoas] == [4, 2]
    ana, leo = pessoas[0]["numero"], pessoas[1]["numero"]
    fotos = {f["midia_id"]: f["pessoas"] for f in cliente.get(f"/api/albuns/{album['id']}/fotos").json()}
    assert sorted(fotos[ids[0]]) == sorted([ana, leo]) and fotos[ids[3]] == [ana]
    assert cliente.patch(f"/api/albuns/{album['id']}/pessoas/{leo}", json={"nome": " Leo "}).json()["nome"] == "Leo"
    assert cliente.patch(f"/api/albuns/{album['id']}/pessoas/99", json={"nome": "x"}).status_code == 404
    # Analisar de novo guarda o número e o nome
    atualizar_pessoas(db_limpo, album_id)
    de_novo = {p["numero"]: p["nome"] for p in cliente.get(f"/api/albuns/{album['id']}/pessoas").json()}
    assert de_novo[leo] == "Leo"
    cliente.delete(f"/api/albuns/{album['id']}")
    assert db_limpo.album_pessoas.count_documents({"album_id": album_id}) == 0


def test_editar_as_fotos_desenha_a_capa_e_a_copia_leve(cliente, db_limpo):
    album = cliente.post("/api/albuns", json={"nome": "Edição"}).json()
    ids = [enviar_foto(cliente, album["id"], f"IMG_{i}.jpg", _jpeg((90, 90, 90))) for i in range(2)]
    ingerir_tudo(db_limpo)
    caminho = f"/api/albuns/{album['id']}/edicoes"
    assert cliente.put(caminho, json={"edicoes": [{"midia_id": str(ObjectId()), "edicao": None}]}).status_code == 404
    pedido = cliente.put(caminho, json={"edicoes": [
        {"midia_id": ids[0], "edicao": {"cor": {"exposicao": 1}}},
        {"midia_id": ids[1], "edicao": {"giro": 5, "auto": {"proporcao": "1:1"}}}]})
    assert pedido.status_code == 202
    # Pedir de novo com a edição na fila devolve o mesmo job
    assert cliente.put(caminho, json={"edicoes": [{"midia_id": ids[0], "edicao": {"cor": {"exposicao": 1}}}]}).json() \
        == pedido.json()
    job = pegar_proximo_job(db_limpo, ["editar_album"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido"
    fotos = {f["midia_id"]: f for f in cliente.get(f"/api/albuns/{album['id']}/fotos").json()}
    clara = fotos[ids[0]]["edicao"]
    assert clara["versao"] == 2 and clara["gerada"] == 2
    capa = cliente.get(f"/api/midias/{ids[0]}/arquivos/album_{album['id']}_2_capa.jpg")
    assert capa.status_code == 200 and Image.open(io.BytesIO(capa.content)).getpixel((5, 5))[0] > 115
    # O recorte automático quadrado saiu, e o desenho é quadrado
    quadrada = fotos[ids[1]]["edicao"]
    assert quadrada["recorte"]["largura"] < 1 and "auto" not in quadrada and quadrada["largura"] == quadrada["altura"]
    # Uma edição nova apaga a versão de antes; tirar a edição apaga tudo
    cliente.put(caminho, json={"edicoes": [{"midia_id": ids[0], "edicao": {"cor": {"exposicao": -1}}}]})
    processar_job(db_limpo, pegar_proximo_job(db_limpo, ["editar_album"], "w-teste"), "w-teste")
    assert cliente.get(f"/api/midias/{ids[0]}/arquivos/album_{album['id']}_2_capa.jpg").status_code == 404
    assert cliente.get(f"/api/midias/{ids[0]}/arquivos/album_{album['id']}_3_capa.jpg").status_code == 200
    cliente.put(caminho, json={"edicoes": [{"midia_id": ids[0], "edicao": None}]})
    processar_job(db_limpo, pegar_proximo_job(db_limpo, ["editar_album"], "w-teste"), "w-teste")
    assert cliente.get(f"/api/midias/{ids[0]}/arquivos/album_{album['id']}_3_capa.jpg").status_code == 404
    assert cliente.get(f"/api/albuns/{album['id']}/fotos").json()[0]["edicao"] is None
