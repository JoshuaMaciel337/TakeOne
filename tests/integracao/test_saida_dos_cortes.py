# A saída dos cortes do Clipar (14.9): exportar vários de uma vez pelo worker da montagem (com um montador falso no
# lugar do Deno), a chave interna temporária e o pacote ZIP com o vídeo, as legendas, o XML e a capa
import io
import json
import sys
import zipfile
from datetime import timedelta

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.chave import montar_chave_interna
from core.modelos.exportacao import chave_exportacao, montar_exportacao
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from core.utils.tempo import TICKS_POR_SEGUNDO
from tests.integracao.test_api import cadastrar
from tests.integracao.test_clipagens_api import _pronta
from worker.tarefas import montagem
from worker.worker_principal import processar_job

S = TICKS_POR_SEGUNDO


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


# O montador falso: lê o pedido como o de verdade, guarda o que recebeu e conta os eventos pedidos pelo teste
MONTADOR_FALSO = """
import json, sys
pedido = json.loads(sys.stdin.read())
eventos = json.loads(open(sys.argv[1], encoding="utf-8").read())
open(sys.argv[2], "w", encoding="utf-8").write(json.dumps(pedido))
for evento in eventos:
    print(json.dumps(evento), flush=True)
sys.exit(int(sys.argv[3]))
"""


def _montador(monkeypatch, tmp_path, eventos: list[dict], codigo: int = 0):
    script = tmp_path / "montador.py"
    script.write_text(MONTADOR_FALSO, encoding="utf-8")
    (tmp_path / "eventos.json").write_text(json.dumps(eventos), encoding="utf-8")
    monkeypatch.setattr(montagem, "MONTADOR", str(script))
    monkeypatch.setattr(montagem, "_comando", lambda: [sys.executable, str(script), str(tmp_path / "eventos.json"),
                                                       str(tmp_path / "pedido.json"), str(codigo)])
    return tmp_path / "pedido.json"


def _com_cortes(cliente, db, quantos: int) -> dict:
    """Uma clipagem pronta com `quantos` cortes (o modo simulado acha um; os outros são cópias dele)."""
    clipagem = _pronta(cliente, db, faixa="medio", maximo=1)
    for _ in range(quantos - 1):
        clipagem = cliente.post(f"/api/clipagens/{clipagem['id']}/cortes/{clipagem['cortes'][0]['id']}/copia").json()
    return clipagem


def _video_pronto(db, organizacao, usuario_id, legendas=True) -> ObjectId:
    """Um projeto com uma legenda e a exportação pronta dele, com o MP4 no armazenamento."""
    faixas = [{"id": "p", "tipo": "principal", "clipes": []}]
    if legendas:
        faixas.append({"id": "l", "tipo": "legenda", "clipes": [
            {"id": "c2", "inicio": 2 * S, "duracao": S, "midia_id": None, "texto": {"conteudo": "Segunda"}},
            {"id": "c1", "inicio": S // 2, "duracao": S, "midia_id": None, "texto": {"conteudo": "Primeira linha"}},
        ]})
    projeto = {"organizacao_id": organizacao, "nome": "Corte", "proporcao": "9:16", "taxa": {"num": 30, "den": 1},
               "faixas": faixas, "fundo": {"cor": "#000000"}, "duracao": 4 * S, "versao": 1}
    projeto["_id"] = db.projetos.insert_one(projeto).inserted_id
    exportacao = montar_exportacao(organizacao, usuario_id, projeto, "1080p")
    exportacao.update({"status": "pronta", "arquivos": ["video.mp4"]})
    exportacao["_id"] = db.exportacoes.insert_one(exportacao).inserted_id
    storage.salvar_bytes(chave_exportacao(organizacao, exportacao["_id"], "video.mp4"), b"mp4 de teste")
    return exportacao["_id"]


def test_pedir_a_saida_poe_o_job_da_montagem_e_nao_repete(cliente, db_limpo):
    cadastrar(cliente)
    clipagem = _com_cortes(cliente, db_limpo, 3)
    ids = [corte["id"] for corte in clipagem["cortes"]][:2]
    caminho = f"/api/clipagens/{clipagem['id']}/saidas"
    resposta = cliente.post(caminho, json={"cortes": ids})
    assert resposta.status_code == 202
    saidas = {corte["id"]: corte.get("saida") for corte in resposta.json()["cortes"]}
    job = db_limpo.jobs.find_one({"tipo": "montagem"})
    assert job["recurso"] == "montagem" and job["entrada"]["cortes"] == ids and job["entrada"]["exportar"] is True
    for corte_id in ids:
        assert saidas[corte_id]["status"] == "na_fila" and saidas[corte_id]["job_id"] == str(job["_id"])
    # O terceiro não foi pedido
    assert len([saida for saida in saidas.values() if saida]) == 2
    # Os mesmos cortes não entram duas vezes, nem um que não existe, nem a lista vazia
    assert cliente.post(caminho, json={"cortes": ids[:1]}).status_code == 409
    assert cliente.post(caminho, json={"cortes": ["nenhum"]}).status_code == 404
    assert cliente.post(caminho, json={"cortes": []}).status_code == 422
    # A cópia de um corte na fila não leva a saída
    copia = cliente.post(f"/api/clipagens/{clipagem['id']}/cortes/{ids[0]}/copia").json()
    assert next(corte for corte in copia["cortes"] if corte.get("copia_de") == ids[0])["saida"] is None


def test_o_worker_roda_o_montador_e_guarda_a_saida_de_cada_corte(cliente, db_limpo, monkeypatch, tmp_path):
    cadastrar(cliente)
    clipagem = _com_cortes(cliente, db_limpo, 3)
    a, b, c = [corte["id"] for corte in clipagem["cortes"]][:3]
    cliente.post(f"/api/clipagens/{clipagem['id']}/saidas", json={"cortes": [a, b, c], "resolucao": "720p"})
    usuario = db_limpo.usuarios.find_one({})
    exportacao_id = _video_pronto(db_limpo, usuario["organizacao_id"], usuario["_id"])
    eventos = [
        {"evento": "etapa", "corte": a, "texto": "Montando o corte"},
        {"evento": "montado", "corte": a, "projeto_id": "p1"},
        {"evento": "exportado", "corte": a, "exportacao_id": str(exportacao_id)},
        {"evento": "erro", "corte": b, "mensagem": "O vídeo do corte não tem imagem."},
        {"evento": "etapa", "corte": "de outra clipagem", "texto": "?"},
        # c não chega: o montador parou antes dele
    ]
    pedido = _montador(monkeypatch, tmp_path, eventos)
    job = pegar_proximo_job(db_limpo, ["montagem"], "w-montagem")
    assert processar_job(db_limpo, job, "w-montagem") == "concluido"

    recebido = json.loads(pedido.read_text(encoding="utf-8"))
    assert recebido["cortes"] == [a, b, c] and recebido["resolucao"] == "720p" and recebido["exportar"] is True
    assert recebido["chave"].startswith("to_") and recebido["endereco"] == montagem.API_INTERNA
    # A chave temporária some no fim
    assert db_limpo.chaves_de_acesso.count_documents({}) == 0

    cortes = {corte["id"]: corte for corte in cliente.get(f"/api/clipagens/{clipagem['id']}").json()["cortes"]}
    assert cortes[a]["saida"]["status"] == "exportado"
    assert cortes[a]["saida"]["exportacao"]["status"] == "pronta"
    assert cortes[a]["saida"]["exportacao"]["arquivos"] == ["video.mp4"]
    assert cortes[b]["saida"] == {**cortes[b]["saida"], "status": "erro", "erro": "O vídeo do corte não tem imagem."}
    assert cortes[c]["saida"]["status"] == "erro" and cortes[c]["saida"]["erro"] == "A montagem parou no meio."
    # Depois da saída, o corte pode ser pedido de novo; a exportação apagada some do corte
    db_limpo.exportacoes.delete_one({"_id": exportacao_id})
    de_novo = cliente.post(f"/api/clipagens/{clipagem['id']}/saidas", json={"cortes": [a, b]}).json()
    assert all(corte["saida"]["status"] == "na_fila" for corte in de_novo["cortes"] if corte["id"] in (a, b))


def test_o_montador_que_cai_sem_nada_vira_erro_em_todos(cliente, db_limpo, monkeypatch, tmp_path):
    cadastrar(cliente)
    clipagem = _com_cortes(cliente, db_limpo, 2)
    ids = [corte["id"] for corte in clipagem["cortes"]][:2]
    cliente.post(f"/api/clipagens/{clipagem['id']}/saidas", json={"cortes": ids})
    _montador(monkeypatch, tmp_path, [], codigo=1)
    job = pegar_proximo_job(db_limpo, ["montagem"], "w-montagem")
    assert processar_job(db_limpo, job, "w-montagem") == "erro"
    cortes = cliente.get(f"/api/clipagens/{clipagem['id']}").json()["cortes"]
    assert all(corte["saida"]["status"] == "erro" for corte in cortes if corte["id"] in ids)
    assert db_limpo.chaves_de_acesso.count_documents({}) == 0


def test_pacote_leva_o_video_as_legendas_o_xml_e_a_capa(cliente, db_limpo):
    cadastrar(cliente)
    clipagem = _com_cortes(cliente, db_limpo, 3)
    a, b = [corte["id"] for corte in clipagem["cortes"]][:2]
    usuario = db_limpo.usuarios.find_one({})
    organizacao = usuario["organizacao_id"]
    exportacao_id = _video_pronto(db_limpo, organizacao, usuario["_id"])
    quadro = {"_id": ObjectId(), "organizacao_id": organizacao, "formato": "png"}
    db_limpo.exportacoes.insert_one(quadro)
    storage.salvar_bytes(chave_exportacao(organizacao, quadro["_id"], "quadro.png"), b"png de teste")
    db_limpo.clipagens.update_one({"_id": ObjectId(clipagem["id"]), "cortes.id": a}, {"$set": {
        "cortes.$.saida": {"status": "exportado", "exportacao_id": str(exportacao_id)},
        "cortes.$.capa": {"tipo": "quadro", "exportacao_id": str(quadro["_id"]), "segundos": 1.0},
        "cortes.$.titulo": "Um título: com dois-pontos?"}})

    caminho = f"/api/clipagens/{clipagem['id']}/pacote"
    # b não tem vídeo: só ele, o pacote não sai
    assert cliente.get(caminho, params={"cortes": b}).status_code == 409
    resposta = cliente.get(caminho, params={"cortes": f"{b},{a}"})
    assert resposta.status_code == 200 and "attachment" in resposta.headers["content-disposition"]
    pacote = zipfile.ZipFile(io.BytesIO(resposta.content))
    base = "01 Um título com dois-pontos"
    assert sorted(pacote.namelist()) == sorted(["LEIA-ME.txt", f"{base}.mp4", f"{base}.srt", f"{base}.vtt",
                                                f"{base}.xml", f"{base} - capa.png"])
    assert pacote.read(f"{base}.mp4") == b"mp4 de teste"
    assert pacote.read(f"{base}.srt").decode() == (
        "1\n00:00:00,500 --> 00:00:01,500\nPrimeira linha\n\n2\n00:00:02,000 --> 00:00:03,000\nSegunda\n")
    assert pacote.read(f"{base}.vtt").decode().startswith("WEBVTT\n\n00:00:00.500 --> 00:00:01.500\nPrimeira linha")
    assert pacote.read(f"{base}.xml").startswith(b"<?xml")
    assert pacote.read(f"{base} - capa.png") == b"png de teste"


def test_chave_interna_vence_e_nao_aparece_na_lista(cliente, db_limpo):
    cadastrar(cliente)
    usuario = db_limpo.usuarios.find_one({})
    valida, doc = montar_chave_interna(usuario["organizacao_id"], usuario["_id"], "Montagem", timedelta(hours=1))
    db_limpo.chaves_de_acesso.insert_one(doc)
    vencida, doc = montar_chave_interna(usuario["organizacao_id"], usuario["_id"], "Montagem", timedelta(hours=-1))
    db_limpo.chaves_de_acesso.insert_one(doc)
    assert cliente.get("/api/chaves").json() == []
    with TestClient(app) as sem_cookie:
        assert sem_cookie.get("/api/marca", headers={"Authorization": f"Bearer {valida}"}).status_code == 200
        assert sem_cookie.get("/api/marca", headers={"Authorization": f"Bearer {vencida}"}).status_code == 401
