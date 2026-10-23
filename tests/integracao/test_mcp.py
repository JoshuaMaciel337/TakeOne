# Chaves de acesso e o servidor MCP: a chave é criada com a sessão, entra pelo Authorization e o servidor
# MCP monta um projeto pelas ferramentas, falando com a própria API.
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from api.main import app
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import criar_midia

mcp = pytest.importorskip("mcp")


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _chamar(servidor, ferramenta: str, argumentos: dict):
    """O resultado de uma ferramenta, já como dado (o FastMCP devolve o conteúdo e, às vezes, o estruturado)."""
    # Num thread próprio, como o processo do servidor: o cliente de teste da API não roda dentro de outro laço
    with ThreadPoolExecutor(1) as executor:
        resultado = executor.submit(asyncio.run, servidor.call_tool(ferramenta, argumentos)).result()
    if isinstance(resultado, tuple):
        conteudo, estruturado = resultado
        if isinstance(estruturado, dict):
            return estruturado.get("result", estruturado)
        resultado = conteudo
    textos = [bloco.text for bloco in resultado]
    dados = [json.loads(t) for t in textos]
    return dados[0] if len(dados) == 1 else dados


def test_chave_criada_entra_pelo_authorization_e_apagada_nao(cliente, db_limpo):
    cadastrar(cliente)
    criada = cliente.post("/api/chaves", json={"nome": "Assistente"})
    assert criada.status_code == 201, criada.text
    chave = criada.json()["chave"]
    assert chave.startswith("to_") and criada.json()["inicio"] == chave[:7]
    assert "chave" not in cliente.get("/api/chaves").json()[0]
    assert db_limpo.chaves_de_acesso.find_one({})["hash"] != chave, "o banco guarda só o hash"
    # Sem o cookie da sessão, só a chave abre (um cliente só: um segundo abriria o banco noutro laço de eventos)
    sessao = dict(cliente.cookies)
    cliente.cookies.clear()
    assert cliente.get("/api/projetos").status_code == 401
    cabecalho = {"Authorization": f"Bearer {chave}"}
    assert cliente.get("/api/projetos", headers=cabecalho).status_code == 200
    # Uma chave não cria outra
    assert cliente.post("/api/chaves", json={"nome": "x"}, headers=cabecalho).status_code == 403
    for nome, valor in sessao.items():
        cliente.cookies.set(nome, valor)
    assert cliente.delete(f"/api/chaves/{criada.json()['id']}").status_code == 204
    cliente.cookies.clear()
    assert cliente.get("/api/projetos", headers=cabecalho).status_code == 401
    assert cliente.get("/api/projetos", headers={"Authorization": "Bearer to_inventada"}).status_code == 401


def test_servidor_mcp_monta_um_projeto(cliente, db_limpo):
    from servidor_mcp.servidor import TakeOne, criar_servidor

    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, duracao=8.0)
    chave = cliente.post("/api/chaves", json={"nome": "MCP"}).json()["chave"]
    # O mesmo cliente: o Authorization com a chave vale antes do cookie da sessão
    servidor = criar_servidor(TakeOne("", chave, http=cliente))
    nomes = {ferramenta.name for ferramenta in asyncio.run(servidor.list_tools())}
    assert {"listar_projetos", "criar_projeto", "adicionar_midia", "adicionar_texto", "exportar"} <= nomes
    projeto = _chamar(servidor, "criar_projeto", {"nome": "Pelo assistente", "proporcao": "16:9"})
    assert projeto["nome"] == "Pelo assistente"
    midias = _chamar(servidor, "listar_midias", {})
    assert midias["id"] == midia_id if isinstance(midias, dict) else midias[0]["id"] == midia_id
    primeiro = _chamar(servidor, "adicionar_midia", {"projeto_id": projeto["id"], "midia_id": midia_id,
                                                     "entrada_s": 2, "duracao_s": 3})
    segundo = _chamar(servidor, "adicionar_midia", {"projeto_id": projeto["id"], "midia_id": midia_id})
    assert (primeiro["inicio_s"], segundo["inicio_s"], segundo["duracao_s"]) == (0, 3, 8)
    _chamar(servidor, "adicionar_texto", {"projeto_id": projeto["id"], "texto": "Olá", "inicio_s": 1})
    visto = _chamar(servidor, "ver_projeto", {"projeto_id": projeto["id"]})
    assert visto["duracao_s"] == 11
    assert [f["tipo"] for f in visto["faixas"]] == ["texto", "principal"]
    assert visto["faixas"][0]["clipes"][0]["texto"] == "Olá"
    exportacao = _chamar(servidor, "exportar", {"projeto_id": projeto["id"], "resolucao": "720p"})
    situacao = _chamar(servidor, "ver_exportacao", {"exportacao_id": exportacao["exportacao_id"]})
    assert situacao["status"] == "processando"
    with pytest.raises(Exception, match="proporções"):
        _chamar(servidor, "criar_projeto", {"nome": "x", "proporcao": "3:2"})
