# O Clipar (14.2 e 14.3): pedir os cortes, esperar a transcrição, achar os cortes (modo simulado) e avaliar
from datetime import datetime

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import montar_midia
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from worker.worker_principal import processar_job

FRASE = ("Hoje eu vou contar como um pequeno hábito mudou a minha vida inteira. Eu guardava dez reais por dia "
         "e em um ano tinha o suficiente para recomeçar. O segredo não é a força de vontade, é o ambiente.")


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _organizacao(db):
    return db.usuarios.find_one({})["organizacao_id"]


def criar_video(db, duracao=300.0, transcrito=True, **extra) -> ObjectId:
    """Uma mídia pronta (sem arquivos: o modo simulado só lê a transcrição) e, se pedido, a fala dela."""
    organizacao = _organizacao(db)
    midia = montar_midia(organizacao, None, "palestra.mp4", 1000)
    midia.update({"status": "pronta", "nome": "Palestra", "duracao": duracao, "audio": {"codec": "aac"},
                  "video": {"largura": 1280, "altura": 720}, **extra})
    midia_id = db.midias.insert_one(midia).inserted_id
    if transcrito:
        palavras, t = [], 0.0
        while t < duracao - 1:
            for palavra in FRASE.split():
                palavras.append({"texto": palavra, "inicio": round(t, 2), "fim": round(t + 0.3, 2)})
                t += 0.38
            t += 0.9
        db.transcricoes.insert_one({"organizacao_id": organizacao, "midia_id": midia_id, "status": "pronta",
                                    "idioma": "pt", "palavras": [p for p in palavras if p["fim"] < duracao]})
    return midia_id


def test_pedido_confere_o_video_e_as_opcoes(cliente, db_limpo):
    cadastrar(cliente)
    curto = criar_video(db_limpo, duracao=40)
    preparando = criar_video(db_limpo, status="processando")
    sem_som = criar_video(db_limpo, audio=None)
    video = criar_video(db_limpo)
    assert cliente.post("/api/clipagens", json={"midia_id": str(curto)}).status_code == 409
    assert cliente.post("/api/clipagens", json={"midia_id": str(preparando)}).status_code == 409
    assert cliente.post("/api/clipagens", json={"midia_id": str(sem_som)}).status_code == 409
    assert cliente.post("/api/clipagens", json={"midia_id": "x"}).status_code == 404
    trecho_curto = {"midia_id": str(video), "opcoes": {"inicio": 100, "fim": 130}}
    assert cliente.post("/api/clipagens", json=trecho_curto).status_code == 422
    invertido = {"midia_id": str(video), "opcoes": {"inicio": 100, "fim": 50}}
    assert cliente.post("/api/clipagens", json=invertido).status_code == 422
    faixa_errada = {"midia_id": str(video), "opcoes": {"faixa": "nenhuma"}}
    assert cliente.post("/api/clipagens", json=faixa_errada).status_code == 422
    assert cliente.get("/api/clipagens/fila").json() == {"na_frente": 0}
    cliente.post("/api/clipagens", json={"midia_id": str(video)})
    assert cliente.get("/api/clipagens/fila").json() == {"na_frente": 1}
    estrategias = cliente.get("/api/clipagens/estrategias").json()
    assert {e["id"] for e in estrategias} >= {"ganchos", "historias", "pregacao"}


def test_acha_os_cortes_e_guarda_a_avaliacao(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo, duracao=300)
    pedido = {"midia_id": str(video), "opcoes": {"estrategia": "ideia", "faixa": "medio", "inicio": 10, "fim": 290,
                                                  "instrucoes": "  frases   fortes  ", "maximo": 4,
                                                  "edicao": "legenda amarela, sem título"}}
    clipagem = cliente.post("/api/clipagens", json=pedido).json()
    assert clipagem["status"] == "processando" and clipagem["opcoes"]["instrucoes"] == "frases fortes"
    assert clipagem["andamento"]["etapa"] == "cortes"
    job = pegar_proximo_job(db_limpo, ["clipagem"], "w-teste")
    assert job["recurso"] == "gpu"
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    pronta = cliente.get(f"/api/clipagens/{clipagem['id']}").json()
    assert pronta["status"] == "pronta" and pronta["andamento"] is None
    # O "Como quer a edição" vira o plano que a montagem de todos os cortes segue
    assert pronta["plano_da_edicao"]["legenda"]["cor"] == "amarelo"
    assert pronta["plano_da_edicao"]["titulo"]["acao"] == "tirar"
    cortes = pronta["cortes"]
    assert 1 <= len(cortes) <= 4 and pronta["total_de_cortes"] == len(cortes)
    assert [c["nota"] for c in cortes] == sorted((c["nota"] for c in cortes), reverse=True)
    for corte in cortes:
        assert 10 <= corte["trechos"][0]["inicio"] and corte["trechos"][-1]["fim"] <= 290
        assert 24 <= corte["duracao"] <= 72 and "texto" not in corte and 0 <= corte["medidas"]["ritmo"] <= 1
        # A ênfase é o começo de palavras da fala, dentro do corte
        assert all(corte["trechos"][0]["inicio"] <= t <= corte["trechos"][-1]["fim"] for t in corte["enfase"])
    assert any(corte["enfase"] for corte in cortes)
    lista = cliente.get("/api/clipagens").json()
    assert len(lista) == 1 and lista[0]["cortes"] == [] and lista[0]["total_de_cortes"] == len(cortes)
    assert cliente.get(f"/api/clipagens?midia_id={video}").json()[0]["id"] == clipagem["id"]

    avaliado = cliente.put(f"/api/clipagens/{clipagem['id']}/cortes/{cortes[0]['id']}/avaliacao",
                           json={"avaliacao": "gostei"}).json()
    assert avaliado["cortes"][0]["avaliacao"] == "gostei"
    inexistente = cliente.put(f"/api/clipagens/{clipagem['id']}/cortes/c99/avaliacao", json={"avaliacao": None})
    assert inexistente.status_code == 404

    projeto = cliente.post("/api/projetos", json={"proporcao": "9:16"}).json()
    caminho = f"/api/clipagens/{clipagem['id']}/cortes/{cortes[0]['id']}/projeto"
    ligado = cliente.put(caminho, json={"projeto_id": projeto["id"]}).json()
    assert ligado["cortes"][0]["projeto_id"] == projeto["id"]
    assert cliente.put(caminho, json={"projeto_id": str(ObjectId())}).status_code == 404
    assert cliente.put(caminho, json={"projeto_id": None}).json()["cortes"][0]["projeto_id"] is None


def test_sem_transcricao_pede_uma_e_espera(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo, transcrito=False)
    clipagem = cliente.post("/api/clipagens", json={"midia_id": str(video)}).json()
    job = pegar_proximo_job(db_limpo, ["clipagem"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido"
    transcricao = db_limpo.jobs.find_one({"tipo": "transcricao"})
    assert transcricao["entrada"]["midia_id"] == str(video) and transcricao["prioridade"] == 1
    espera = db_limpo.jobs.find_one({"tipo": "clipagem", "_id": {"$ne": job["_id"]}})
    assert espera["entrada"]["esperas"] == 1 and espera["disponivel_em"] > datetime.now(espera["disponivel_em"].tzinfo)
    andamento = cliente.get(f"/api/clipagens/{clipagem['id']}").json()["andamento"]
    assert andamento["etapa"] == "transcricao" and andamento["mensagem"] == "Transcrição na fila"


def test_o_srt_da_pessoa_entra_no_lugar_da_transcricao(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo, transcrito=False)
    legendas = [{"inicio": 4.0 * i, "fim": 4.0 * i + 3.5, "texto": FRASE.split(".")[i % 3].strip() + "."}
                for i in range(60)]
    pedido = {"midia_id": str(video), "opcoes": {"faixa": "medio", "inicio": 20}, "legendas": legendas}
    clipagem = cliente.post("/api/clipagens", json=pedido).json()
    assert clipagem["fala"] == "legendas" and clipagem["andamento"]["etapa"] == "cortes"
    job = pegar_proximo_job(db_limpo, ["clipagem"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido"
    assert db_limpo.jobs.find_one({"tipo": "transcricao"}) is None
    pronta = cliente.get(f"/api/clipagens/{clipagem['id']}").json()
    assert pronta["status"] == "pronta" and pronta["cortes"]
    fala = cliente.get(f"/api/clipagens/{clipagem['id']}/fala?de=36&ate=44").json()
    assert fala[0]["texto"] == "Hoje" and fala[0]["inicio"] == 36 and fala[-1]["fim"] <= 44
    # As palavras ficam no tempo da legenda, na ordem, sem sobrepor
    assert all(a["fim"] <= b["inicio"] for a, b in zip(fala, fala[1:], strict=False))
    poucas = {"midia_id": str(video), "legendas": [{"inicio": 1, "fim": 2, "texto": "Oi"}]}
    assert cliente.post("/api/clipagens", json=poucas).status_code == 422


def test_a_fala_vem_da_transcricao_quando_nao_ha_srt(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo)
    clipagem = cliente.post("/api/clipagens", json={"midia_id": str(video)}).json()
    fala = cliente.get(f"/api/clipagens/{clipagem['id']}/fala?de=0&ate=5").json()
    assert [p["texto"] for p in fala][:3] == ["Hoje", "eu", "vou"]
    sem_fala = cliente.post("/api/clipagens", json={"midia_id": str(criar_video(db_limpo, transcrito=False))}).json()
    assert cliente.get(f"/api/clipagens/{sem_fala['id']}/fala").status_code == 409


def test_estrategias_do_espaco_ficam_nos_recursos(cliente, db_limpo):
    cadastrar(cliente)
    dados = {"instrucoes": "os momentos de oração; títulos em forma de pergunta", "faixa": "longo"}
    criada = cliente.post("/api/recursos", json={"tipo": "estrategia", "nome": "Culto", "dados": dados})
    assert criada.status_code == 201, criada.text
    assert cliente.get("/api/recursos?tipo=estrategia").json()[0]["dados"] == dados
    sem_texto = {"tipo": "estrategia", "nome": "Vazia", "dados": {"instrucoes": "", "faixa": "auto"}}
    assert cliente.post("/api/recursos", json=sem_texto).status_code == 422
    faixa_errada = {"tipo": "estrategia", "nome": "X", "dados": {"instrucoes": "algo bem escrito", "faixa": "z"}}
    assert cliente.post("/api/recursos", json=faixa_errada).status_code == 422


def test_excluir_para_o_job_e_excluir_o_video_leva_a_clipagem(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo)
    clipagem = cliente.post("/api/clipagens", json={"midia_id": str(video)}).json()
    assert cliente.delete(f"/api/clipagens/{clipagem['id']}").status_code == 204
    assert db_limpo.jobs.find_one({"tipo": "clipagem"})["status"] == "erro"
    assert cliente.get(f"/api/clipagens/{clipagem['id']}").status_code == 404
    outra = cliente.post("/api/clipagens", json={"midia_id": str(video)}).json()
    assert cliente.delete(f"/api/midias/{video}").status_code == 204
    assert cliente.get(f"/api/clipagens/{outra['id']}").status_code == 404


def test_clipagem_de_outro_espaco_nao_aparece(cliente, db_limpo):
    cadastrar(cliente)
    video = criar_video(db_limpo)
    clipagem = cliente.post("/api/clipagens", json={"midia_id": str(video)}).json()
    cliente.post("/api/auth/sair")
    cliente.cookies.clear()
    cadastrar(cliente)
    assert cliente.get(f"/api/clipagens/{clipagem['id']}").status_code == 404
    assert cliente.get("/api/clipagens").json() == []
    assert cliente.post("/api/clipagens", json={"midia_id": str(video)}).status_code == 404
