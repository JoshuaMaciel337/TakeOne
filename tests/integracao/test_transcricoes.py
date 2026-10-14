# Transcrição da fala: pedir, processar (modo simulado, sem GPU), ler e apagar junto com a mídia
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import ARQUIVO_AUDIO_ANALISE, chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia, organizacao_de
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def midia_com_fala(db, cliente, duracao=12.0, audio=True) -> str:
    midia_id = criar_midia(db, cliente, duracao=duracao, audio=audio)
    if audio:
        chave = chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_AUDIO_ANALISE)
        caminho = storage.caminho_local(chave)
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_bytes(b"RIFF")   # o modo simulado não ouve o arquivo, só confere que existe
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$push": {"arquivos": ARQUIVO_AUDIO_ANALISE}})
    return midia_id


def test_pedir_processar_e_ler_a_transcricao(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = midia_com_fala(db_limpo, cliente)
    assert cliente.get(f"/api/midias/{midia_id}/transcricao").status_code == 404

    pedida = cliente.post(f"/api/midias/{midia_id}/transcricao", json={"idioma": "pt"})
    assert pedida.status_code == 200, pedida.text
    assert pedida.json()["status"] == "processando"
    assert pedida.json()["processamento"]["status"] == "pendente"
    # Pedir de novo enquanto está na fila não cria outro job
    assert cliente.post(f"/api/midias/{midia_id}/transcricao", json={"idioma": "pt"}).status_code == 200
    assert db_limpo.jobs.count_documents({"tipo": "transcricao"}) == 1

    job = pegar_proximo_job(db_limpo, ["transcricao"], "w-teste")
    assert job["recurso"] == "gpu"
    assert processar_job(db_limpo, job, "w-teste") == "concluido"

    pronta = cliente.get(f"/api/midias/{midia_id}/transcricao").json()
    assert (pronta["status"], pronta["idioma"]) == ("pronta", "pt")
    palavras = pronta["palavras"]
    assert len(palavras) > 10 and all(p["inicio"] < p["fim"] <= 12 for p in palavras)
    assert all(a["fim"] <= b["inicio"] for a, b in zip(palavras, palavras[1:], strict=False))

    # Já transcrita: "auto" e o mesmo idioma devolvem a pronta; outro idioma transcreve de novo
    assert cliente.post(f"/api/midias/{midia_id}/transcricao", json={}).json()["status"] == "pronta"
    assert cliente.post(f"/api/midias/{midia_id}/transcricao", json={"idioma": "en"}).json()["status"] == "processando"
    assert db_limpo.jobs.count_documents({"tipo": "transcricao"}) == 2


def test_transcricao_recusada_e_isolada(cliente, db_limpo):
    cadastrar(cliente)
    sem_audio = midia_com_fala(db_limpo, cliente, audio=False)
    assert cliente.post(f"/api/midias/{sem_audio}/transcricao", json={}).status_code == 409

    # Excluir a mídia leva a transcrição junto e cancela o job
    apagada = midia_com_fala(db_limpo, cliente)
    cliente.post(f"/api/midias/{apagada}/transcricao", json={})
    assert cliente.delete(f"/api/midias/{apagada}").status_code == 204
    assert db_limpo.transcricoes.count_documents({}) == 0
    assert db_limpo.jobs.find_one({"tipo": "transcricao"})["status"] == "erro"

    # A de outro espaço não aparece. (Depois de outro TestClient, o primeiro não é mais usado.)
    midia_id = midia_com_fala(db_limpo, cliente)
    cliente.post(f"/api/midias/{midia_id}/transcricao", json={})
    with TestClient(app) as outro:
        cadastrar(outro)
        assert outro.get(f"/api/midias/{midia_id}/transcricao").status_code == 404
        assert outro.post(f"/api/midias/{midia_id}/transcricao", json={}).status_code == 404


def test_falha_definitiva_aparece_na_transcricao(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = midia_com_fala(db_limpo, cliente)
    cliente.post(f"/api/midias/{midia_id}/transcricao", json={})
    # Sem o áudio de análise o worker desiste de vez, e a transcrição mostra o motivo
    storage.caminho_local(chave_arquivo(organizacao_de(cliente), ObjectId(midia_id), ARQUIVO_AUDIO_ANALISE)).unlink()
    job = pegar_proximo_job(db_limpo, ["transcricao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "erro"
    vista = cliente.get(f"/api/midias/{midia_id}/transcricao").json()
    assert vista["status"] == "erro" and "áudio de análise" in vista["erro"]
