# Levar a edição para outro editor: o XML sozinho e o ZIP com as mídias originais
import io
import zipfile

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from api.rotas.intercambio import nome_de_arquivo
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import SEGUNDO, criar_midia


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _gerar(caminho):
    caminho.write_bytes(b"conteudo do video " * 100)


def _projeto(cliente, db, ids):
    for midia_id in ids:
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {"nome": "Viagem: praia/2026"}})
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    clipes = [{"id": f"c{i}", "midia_id": m, "inicio": i * 2 * SEGUNDO, "duracao": 2 * SEGUNDO, "entrada": 0,
               "velocidade": 1, "volume": 1} for i, m in enumerate(ids)]
    corpo = {"versao": projeto["versao"], "nome": "Férias", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": clipes}]}
    assert cliente.put(f"/api/projetos/{projeto['id']}", json=corpo).status_code == 200
    return projeto["id"]


def test_xml_e_zip_com_as_midias(cliente, db_limpo):
    cadastrar(cliente)
    ids = [criar_midia(db_limpo, cliente, duracao=4.0, gerar=_gerar) for _ in range(2)]
    projeto_id = _projeto(cliente, db_limpo, ids)

    xml = cliente.get(f"/api/projetos/{projeto_id}/intercambio.xml")
    assert xml.status_code == 200 and xml.headers["content-type"].startswith("application/xml")
    assert "F%C3%A9rias.xml" in xml.headers["content-disposition"]
    # Duas mídias com o mesmo nome: os arquivos não se sobrescrevem
    assert "Viagem praia2026.mp4" in xml.text and "Viagem praia2026 (2).mp4" in xml.text

    pacote = cliente.get(f"/api/projetos/{projeto_id}/intercambio.zip")
    assert pacote.status_code == 200 and pacote.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(pacote.content)) as arquivo:
        nomes = sorted(arquivo.namelist())
        assert nomes == ["Férias.xml", "midias/Viagem praia2026 (2).mp4", "midias/Viagem praia2026.mp4"]
        assert arquivo.read("midias/Viagem praia2026.mp4") == b"conteudo do video " * 100
        assert all(info.compress_type == zipfile.ZIP_STORED for info in arquivo.infolist())
        assert arquivo.testzip() is None


def test_projeto_de_outro_espaco_nao_sai(cliente, db_limpo):
    cadastrar(cliente)
    projeto_id = _projeto(cliente, db_limpo, [criar_midia(db_limpo, cliente, duracao=4.0, gerar=_gerar)])
    cliente.cookies.clear()
    cadastrar(cliente)
    assert cliente.get(f"/api/projetos/{projeto_id}/intercambio.xml").status_code == 404
    assert cliente.get(f"/api/projetos/{projeto_id}/intercambio.zip").status_code == 404
    vazio = cliente.post("/api/projetos", json={"proporcao": "9:16"}).json()
    assert cliente.get(f"/api/projetos/{vazio['id']}/intercambio.zip").status_code == 409


def test_nome_de_arquivo():
    assert nome_de_arquivo('a/b\\c:d*e?f"g<h>i|j') == "abcdefghij"
    assert nome_de_arquivo("  ...  ") == "midia"
    assert nome_de_arquivo("Ação & reação") == "Ação & reação"
