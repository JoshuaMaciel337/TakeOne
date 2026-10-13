# Projetos: criar, salvar com versão, conferir a linha do tempo e isolar por espaço
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import montar_midia
from core.utils.tempo import segundos_para_ticks
from tests.integracao.test_api import cadastrar

SEGUNDO = segundos_para_ticks(1)


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def criar_midia(db, cliente, duracao=10.0, video=True, audio=True) -> str:
    organizacao_id = ObjectId(cliente.get("/api/auth/eu").json()["organizacao"]["id"])
    midia = montar_midia(organizacao_id, ObjectId(), "clipe.mp4", 1000, "video/mp4")
    midia.update({
        "status": "pronta",
        "duracao": duracao,
        "video": {"codec": "h264", "largura": 1920, "altura": 1080, "fps": 30, "rotacao": 0} if video else None,
        "audio": {"codec": "aac", "canais": 2, "taxa": 48000} if audio else None,
    })
    return str(db.midias.insert_one(midia).inserted_id)


def clipe(midia_id, inicio, duracao, entrada=0, id_=None):
    return {"id": id_ or f"c{inicio}-{duracao}", "midia_id": midia_id, "inicio": inicio * SEGUNDO,
            "duracao": duracao * SEGUNDO, "entrada": entrada * SEGUNDO, "velocidade": 1, "volume": 1}


def salvar(cliente, projeto, faixas, **campos):
    corpo = {"versao": projeto["versao"], "nome": projeto["nome"], "proporcao": projeto["proporcao"],
             "taxa": projeto["taxa"], "fundo": projeto["fundo"], "faixas": faixas, **campos}
    return cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)


def principal_com(projeto, clipes):
    return [{**projeto["faixas"][0], "clipes": clipes}]


def test_criar_abrir_e_listar(cliente):
    cadastrar(cliente)
    criado = cliente.post("/api/projetos", json={"proporcao": "16:9"})
    assert criado.status_code == 201
    projeto = criado.json()
    assert (projeto["nome"], projeto["proporcao"], projeto["versao"], projeto["duracao"]) == (
        "Projeto sem título", "16:9", 1, 0)
    assert [f["tipo"] for f in projeto["faixas"]] == ["principal"]
    assert cliente.get(f"/api/projetos/{projeto['id']}").json()["id"] == projeto["id"]
    assert [p["id"] for p in cliente.get("/api/projetos").json()] == [projeto["id"]]


def test_salvar_sobe_a_versao_e_recusa_versao_velha(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente)
    projeto = cliente.post("/api/projetos", json={}).json()

    salvo = salvar(cliente, projeto, principal_com(projeto, [clipe(midia_id, 0, 4), clipe(midia_id, 4, 3, entrada=5)]),
                   nome="Meu vídeo")
    assert salvo.status_code == 200, salvo.json()
    corpo = salvo.json()
    assert (corpo["versao"], corpo["nome"], corpo["duracao"]) == (2, "Meu vídeo", 7 * SEGUNDO)
    resumo = cliente.get("/api/projetos").json()[0]
    assert resumo["capa_midia_id"] == midia_id

    # Outra aba ainda com a versão 1
    velho = salvar(cliente, projeto, principal_com(projeto, []))
    assert velho.status_code == 409


def test_linha_do_tempo_invalida_nao_salva(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, duracao=5.0)
    so_audio = criar_midia(db_limpo, cliente, video=False)
    projeto = cliente.post("/api/projetos", json={}).json()

    casos = {
        "espaço vazio": principal_com(projeto, [clipe(midia_id, 1, 2)]),
        "por cima": principal_com(projeto, [clipe(midia_id, 0, 3), clipe(midia_id, 2, 2)]),
        "passa do fim": principal_com(projeto, [clipe(midia_id, 0, 4, entrada=2)]),
        "sem imagem": principal_com(projeto, [clipe(so_audio, 0, 2)]),
        "mídia de outro lugar": principal_com(projeto, [clipe(str(ObjectId()), 0, 2)]),
        "duas principais": principal_com(projeto, []) + [{**projeto["faixas"][0], "id": "outra"}],
    }
    for nome, faixas in casos.items():
        resposta = salvar(cliente, projeto, faixas)
        assert resposta.status_code == 422, nome

    # Faixa de áudio pode ter espaço vazio; a principal continua sem
    audio = {"id": "a1", "tipo": "audio", "oculta": False, "muda": False, "travada": False,
             "clipes": [clipe(so_audio, 3, 2)]}
    assert salvar(cliente, projeto, principal_com(projeto, [clipe(midia_id, 0, 5)]) + [audio]).status_code == 200


def test_transformacao_e_recorte_sao_salvos_e_conferidos(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente)
    projeto = cliente.post("/api/projetos", json={}).json()

    # Clipe gravado antes da fase 2, sem transformação nem recorte: volta com o padrão
    db_limpo.projetos.update_one({"_id": ObjectId(projeto["id"])},
                                 {"$set": {"faixas": principal_com(projeto, [clipe(midia_id, 0, 2)])}})
    antigo = cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]
    assert antigo["transformacao"] == {"x": 0, "y": 0, "escala": 1, "rotacao": 0, "opacidade": 1}
    assert antigo["recorte"] == {"x": 0, "y": 0, "largura": 1, "altura": 1}

    transformacao = {"x": 0.1, "y": -0.2, "escala": 1.5, "rotacao": -30, "opacidade": 0.5}
    recorte = {"x": 0.9, "y": 0, "largura": 0.1, "altura": 1}
    novo = {**clipe(midia_id, 0, 2), "transformacao": transformacao, "recorte": recorte}
    salvo = salvar(cliente, projeto, principal_com(projeto, [novo]))
    assert salvo.status_code == 200
    assert salvo.json()["faixas"][0]["clipes"][0]["transformacao"] == transformacao
    assert salvo.json()["faixas"][0]["clipes"][0]["recorte"] == recorte

    projeto = salvo.json()
    for invalido in ({"recorte": {"x": 0.5, "y": 0, "largura": 0.6, "altura": 1}},
                     {"transformacao": {**transformacao, "escala": 0}},
                     {"transformacao": {**transformacao, "rotacao": 270}},
                     {"fade_entrada": SEGUNDO, "fade_saida": 2 * SEGUNDO}):
        resposta = salvar(cliente, projeto, principal_com(projeto, [{**novo, **invalido}]))
        assert resposta.status_code == 422, invalido


def test_textos_ficam_na_faixa_de_texto(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente)
    projeto = cliente.post("/api/projetos", json={}).json()
    texto = {"id": "t1", "midia_id": None, "texto": {"conteudo": "Olá", "cor": "#ff6a3d"}, "inicio": 0,
             "duracao": 3 * SEGUNDO, "entrada": 0}
    faixa_texto = {"id": "ft", "tipo": "texto", "oculta": False, "muda": False, "travada": False, "clipes": [texto]}
    salvo = salvar(cliente, projeto, [faixa_texto, *principal_com(projeto, [clipe(midia_id, 0, 2)])])
    assert salvo.status_code == 200, salvo.text
    guardado = salvo.json()["faixas"][0]["clipes"][0]
    assert guardado["texto"]["conteudo"] == "Olá" and guardado["texto"]["fonte"] == "display"
    assert guardado["midia_id"] is None

    projeto = salvo.json()
    casos = {
        "texto na principal": principal_com(projeto, [{**texto, "inicio": 0}]),
        "mídia na faixa de texto": [{**faixa_texto, "clipes": [clipe(midia_id, 0, 2)]},
                                    *principal_com(projeto, [clipe(midia_id, 0, 2)])],
        "cor inválida": [{**faixa_texto, "clipes": [{**texto, "texto": {"conteudo": "x", "cor": "laranja"}}]},
                         *principal_com(projeto, [])],
    }
    for nome, faixas in casos.items():
        assert salvar(cliente, projeto, faixas).status_code == 422, nome


def test_imagem_do_texto(cliente):
    cadastrar(cliente)
    resposta = cliente.post("/api/textos/imagem", json={"texto": {"conteudo": "Olá"}, "lado_menor": 720})
    assert resposta.status_code == 200
    assert resposta.headers["content-type"] == "image/png" and resposta.content[1:4] == b"PNG"
    assert cliente.post("/api/textos/imagem", json={"texto": {"conteudo": "x", "tamanho": 5}}).status_code == 422


def test_midia_em_projeto_nao_pode_ser_excluida(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente)
    projeto = cliente.post("/api/projetos", json={}).json()
    assert salvar(cliente, projeto, principal_com(projeto, [clipe(midia_id, 0, 2)])).status_code == 200

    recusada = cliente.delete(f"/api/midias/{midia_id}")
    assert recusada.status_code == 409
    assert "1 projeto" in recusada.json()["detail"]

    assert cliente.delete(f"/api/projetos/{projeto['id']}").status_code == 204
    assert cliente.delete(f"/api/midias/{midia_id}").status_code == 204


def test_projetos_sao_separados_por_espaco(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={}).json()
    cliente.post("/api/auth/sair")
    cadastrar(cliente)
    assert cliente.get("/api/projetos").json() == []
    assert cliente.get(f"/api/projetos/{projeto['id']}").status_code == 404
    assert salvar(cliente, projeto, projeto["faixas"]).status_code == 404
    assert cliente.delete(f"/api/projetos/{projeto['id']}").status_code == 404
