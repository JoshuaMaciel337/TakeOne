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
        assert 24 <= corte["duracao"] <= 72 and corte["texto"] and 0 <= corte["medidas"]["ritmo"] <= 1
        assert corte["parecidos"] == []
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
    # O editor acha o corte pelo projeto montado
    pelo_projeto = cliente.get(f"/api/clipagens?projeto_id={projeto['id']}").json()
    assert [c["id"] for c in pelo_projeto] == [clipagem["id"]] and pelo_projeto[0]["cortes"][0]["projeto_id"]
    assert cliente.get(f"/api/clipagens?projeto_id={ObjectId()}").json() == []
    assert cliente.put(caminho, json={"projeto_id": str(ObjectId())}).status_code == 404
    assert cliente.put(caminho, json={"projeto_id": None}).json()["cortes"][0]["projeto_id"] is None



def _pronta(cliente, db, **opcoes):
    video = criar_video(db, duracao=300)
    clipagem = cliente.post("/api/clipagens", json={"midia_id": str(video), "opcoes": opcoes}).json()
    job = pegar_proximo_job(db, ["clipagem"], "w-teste")
    assert processar_job(db, job, "w-teste") == "concluido"
    return cliente.get(f"/api/clipagens/{clipagem['id']}").json()


def test_capa_do_corte_num_quadro_ou_numa_imagem(cliente, db_limpo):
    cadastrar(cliente)
    clipagem = _pronta(cliente, db_limpo, faixa="medio", maximo=1)
    caminho = f"/api/clipagens/{clipagem['id']}/cortes/{clipagem['cortes'][0]['id']}/capa"
    projeto = cliente.post("/api/projetos", json={"nome": "Corte", "proporcao": "9:16"}).json()
    organizacao = db_limpo.projetos.find_one({"_id": ObjectId(projeto["id"])})["organizacao_id"]
    # O quadro é uma exportação em PNG do espaço; um vídeo exportado não serve
    quadro = {"_id": ObjectId(), "organizacao_id": organizacao, "formato": "png"}
    video = {"_id": ObjectId(), "organizacao_id": organizacao, "formato": "mp4"}
    db_limpo.exportacoes.insert_many([quadro, video])
    capa = {"tipo": "quadro", "exportacao_id": str(quadro["_id"]), "segundos": 4.5}
    assert cliente.put(caminho, json={"capa": capa}).json()["cortes"][0]["capa"] == capa
    assert cliente.put(caminho, json={"capa": {**capa, "exportacao_id": str(video["_id"])}}).status_code == 404
    # A imagem é uma imagem da biblioteca do espaço
    imagem = montar_midia(organizacao, ObjectId(), "foto.png", 10, "image/png")
    imagem["imagem"] = True
    imagem_id = db_limpo.midias.insert_one(imagem).inserted_id
    com_imagem = cliente.put(caminho, json={"capa": {"tipo": "imagem", "midia_id": str(imagem_id)}}).json()
    assert com_imagem["cortes"][0]["capa"] == {"tipo": "imagem", "midia_id": str(imagem_id)}
    outra = montar_midia(ObjectId(), ObjectId(), "foto.png", 10, "image/png")
    outra["imagem"] = True
    outra_id = db_limpo.midias.insert_one(outra).inserted_id
    assert cliente.put(caminho, json={"capa": {"tipo": "imagem", "midia_id": str(outra_id)}}).status_code == 404
    assert cliente.put(caminho, json={"capa": None}).json()["cortes"][0]["capa"] is None


def test_copia_parte_dois_e_apagar(cliente, db_limpo):
    cadastrar(cliente)
    clipagem = _pronta(cliente, db_limpo, faixa="medio", maximo=3)
    caminho = f"/api/clipagens/{clipagem['id']}/cortes"
    # A ordem do vídeo: a parte 2 do primeiro corte cai antes do segundo
    primeiro = min(clipagem["cortes"], key=lambda corte: corte["trechos"][0]["inicio"])
    cliente.put(f"{caminho}/{primeiro['id']}/avaliacao", json={"avaliacao": "gostei"})

    copia = cliente.post(f"{caminho}/{primeiro['id']}/copia")
    assert copia.status_code == 201
    cortes = copia.json()["cortes"]
    posicao = [corte["id"] for corte in cortes].index(primeiro["id"])
    nova = cortes[posicao + 1]
    assert nova["copia_de"] == primeiro["id"] and nova["titulo"].endswith("(cópia)")
    assert nova["trechos"] == primeiro["trechos"] and nova["avaliacao"] is None and nova["projeto_id"] is None
    # A cópia não é "parecida" com o original: é o mesmo de propósito
    assert nova["parecidos"] == [] and len({corte["id"] for corte in cortes}) == len(cortes)

    parte = cliente.post(f"{caminho}/{primeiro['id']}/continuacao")
    assert parte.status_code == 201
    cortes = parte.json()["cortes"]
    dois = cortes[[corte["id"] for corte in cortes].index(primeiro["id"]) + 1]
    assert dois["parte_de"] == primeiro["id"] and dois["titulo"].endswith("(parte 2)") and dois["nota"] is None
    assert dois["trechos"][0]["inicio"] >= primeiro["trechos"][-1]["fim"] - 0.05
    assert 24 <= dois["duracao"] <= 72 and dois["texto"] and 0 <= dois["medidas"]["ritmo"] <= 1
    tres = cliente.post(f"{caminho}/{dois['id']}/continuacao").json()["cortes"]
    assert any(corte["titulo"].endswith("(parte 3)") for corte in tres)

    # O último corte possível: a fala acaba logo depois
    ultimo = {"id": "c90", "trechos": [{"inicio": 250.0, "fim": 299.5}], "duracao": 49.5, "titulo": "Fim",
              "foco": [], "resumo": "", "categoria": "dica", "notas": None, "motivos": None, "nota": None,
              "texto": "fim", "propaganda": False}
    db_limpo.clipagens.update_one({"_id": ObjectId(clipagem["id"])}, {"$push": {"cortes": ultimo}})
    assert cliente.post(f"{caminho}/c90/continuacao").status_code == 409
    # Um corte que divide metade do tempo com outro ganha o aviso, nos dois
    vizinho = {**ultimo, "id": "c91", "trechos": [{"inicio": 230.0, "fim": 280.0}], "duracao": 50.0}
    db_limpo.clipagens.update_one({"_id": ObjectId(clipagem["id"])}, {"$push": {"cortes": vizinho}})
    lista = {corte["id"]: corte for corte in cliente.get(f"/api/clipagens/{clipagem['id']}").json()["cortes"]}
    assert "c91" in lista["c90"]["parecidos"] and "c90" in lista["c91"]["parecidos"]

    apagado = cliente.delete(f"{caminho}/{nova['id']}")
    assert apagado.status_code == 200 and nova["id"] not in {corte["id"] for corte in apagado.json()["cortes"]}
    assert cliente.delete(f"{caminho}/{nova['id']}").status_code == 404
    assert cliente.post(f"{caminho}/c99/copia").status_code == 404


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


def test_modelo_de_corte_na_clipagem_no_corte_e_no_espaco(cliente, db_limpo):
    cadastrar(cliente)
    receita = {"legenda": "caixa", "posicao": "meio", "zooms": False, "logo": True,
               "chamada": {"modelo": "chamada_comente", "texto": "QUERO"}}
    modelo = {"id": "conversa", "nome": "Conversa", "receita": receita}
    clipagem = _pronta(cliente, db_limpo, faixa="medio", maximo=2, modelo_corte=modelo)
    guardado = clipagem["opcoes"]["modelo_corte"]
    # A receita chega completa: o que faltou vem do padrão
    assert guardado["receita"]["legenda"] == "caixa" and guardado["receita"]["titulo"] is True
    assert guardado["receita"]["chamada"] == {"modelo": "chamada_comente", "texto": "QUERO"}
    estragado = {"midia_id": str(criar_video(db_limpo)),
                 "opcoes": {"modelo_corte": {"id": "x", "nome": "X", "receita": {"legenda": "gigante"}}}}
    assert cliente.post("/api/clipagens", json=estragado).status_code == 422

    corte = clipagem["cortes"][0]
    caminho = f"/api/clipagens/{clipagem['id']}/cortes/{corte['id']}/modelo"
    so_dele = {"id": "minimalista", "nome": "Minimalista", "receita": {"titulo": False, "legenda_animada": "pulando"}}
    mudado = cliente.put(caminho, json={"modelo_corte": so_dele}).json()["cortes"][0]
    assert mudado["modelo_corte"]["id"] == "minimalista" and mudado["modelo_corte"]["receita"]["titulo"] is False
    assert cliente.put(caminho, json={"modelo_corte": {**so_dele, "receita": {"legenda_animada": "nao"}}}).status_code \
        == 422
    assert cliente.put(caminho, json={"modelo_corte": None}).json()["cortes"][0]["modelo_corte"] is None
    # A retenção (14.8): a barra, o quadro do original e os vídeos de distração (ids da biblioteca)
    retencao = {"barra": "baixo", "quadro_original": "sorteado", "distracao": ["a" * 24]}
    com_retencao = cliente.put(caminho, json={"modelo_corte": {**so_dele, "receita": retencao}}).json()["cortes"][0]
    assert {chave: com_retencao["modelo_corte"]["receita"][chave] for chave in retencao} == retencao
    estragadas = ({"barra": "meio"}, {"quadro_original": "agora"}, {"distracao": ["x"]}, {"distracao": ["a" * 24] * 11})
    for estragada in estragadas:
        assert cliente.put(caminho, json={"modelo_corte": {**so_dele, "receita": estragada}}).status_code == 422

    # O modelo guardado no espaço
    meu = {"tipo": "modelo_corte", "nome": "Meu jeito", "dados": {"receita": receita}}
    salvo = cliente.post("/api/recursos", json=meu)
    assert salvo.status_code == 201 and salvo.json()["dados"]["receita"]["posicao"] == "meio"
    ruim = {"tipo": "modelo_corte", "nome": "Ruim", "dados": {"receita": {"musica": {"midia_id": "curto"}}}}
    assert cliente.post("/api/recursos", json=ruim).status_code == 422
    assert [r["nome"] for r in cliente.get("/api/recursos?tipo=modelo_corte").json()] == ["Meu jeito"]
