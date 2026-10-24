# As fontes que o espaço envia para o editor de imagem: lidas (família, peso, itálico, eixos), listadas como família do
# catálogo, servidas só ao espaço e protegidas enquanto um texto usa a última da família.
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.fontes import PASTA_DAS_FONTES
from core.utils.fonte_enviada import ErroFonte, ler_fonte
from tests.integracao.test_api import cadastrar
from tests.integracao.test_projeto_imagem import camada, clipe, salvar


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def enviar(cliente, dados: bytes, nome: str):
    cabecalhos = {"Content-Type": "application/octet-stream"}
    return cliente.post(f"/api/fontes/espaco?nome={nome}", content=dados, headers=cabecalhos)


def test_ler_fonte():
    inter = ler_fonte((PASTA_DAS_FONTES / "Inter[opsz,wght].ttf").read_bytes())
    assert inter["familia"] == "Inter" and inter["eixos"] == ["opsz", "wght"] and inter["italico"] is False
    caveat = ler_fonte((PASTA_DAS_FONTES / "Caveat[wght].ttf").read_bytes())
    assert caveat["familia"] == "Caveat" and caveat["peso"] == 400
    with pytest.raises(ErroFonte):
        ler_fonte(b"isto nao e uma fonte de verdade")


def test_enviar_listar_baixar_e_excluir(cliente, db_limpo):
    cadastrar(cliente)
    dados = (PASTA_DAS_FONTES / "Caveat[wght].ttf").read_bytes()
    resposta = enviar(cliente, dados, "Minha Letra.ttf")
    assert resposta.status_code == 201, resposta.text
    fonte = resposta.json()
    assert fonte["familia_id"] == "espaco-caveat" and fonte["eixos"] == ["wght"]
    familias = cliente.get("/api/fontes/espaco").json()
    assert [(f["id"], f["categoria"], [e["arquivo"] for e in f["estilos"]]) for f in familias] == [
        ("espaco-caveat", "espaco", [f"espaco/{fonte['id']}"])
    ]
    arquivo = cliente.get(f"/api/fontes/espaco/arquivo/{fonte['id']}")
    assert arquivo.status_code == 200 and arquivo.content == dados
    # Extensão errada e arquivo que não é fonte
    assert enviar(cliente, dados, "fonte.woff2").status_code == 422
    assert enviar(cliente, b"nada", "falsa.ttf").status_code == 422
    # Um texto usa a família: a última fonte dela não sai
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 400, "altura": 300}}).json()
    estilo = {"familia": "espaco-caveat", "peso": 400, "italico": False, "tamanho": 30, "cor": "#000000"}
    texto = {"paragrafos": [{"trechos": [{"texto": "Oi", "estilo": {}}], "estilo": {}}], "estilo": estilo,
             "paragrafo": {"alinhamento": "esquerda"}, "caixa": {"largura": 50, "altura": 40},
             "origem": {"x": 2, "y": 30}}
    com_texto = {**clipe(None, 0, 5, id_="t1"), "midia_id": None, "texto_rico": texto}
    faixas = [camada("video", com_texto), {**projeto["faixas"][0], "clipes": []}]
    assert salvar(cliente, projeto, faixas).status_code == 200
    recusado = cliente.delete(f"/api/fontes/espaco/{fonte['id']}")
    assert recusado.status_code == 409 and "Caveat" in recusado.json()["detail"]
    # Com outra fonte da mesma família, a primeira pode sair
    outra = enviar(cliente, dados, "Minha Letra 2.ttf").json()
    assert cliente.delete(f"/api/fontes/espaco/{fonte['id']}").status_code == 204
    assert cliente.get(f"/api/fontes/espaco/arquivo/{fonte['id']}").status_code == 404
    assert [e["id"] for e in cliente.get("/api/fontes/espaco").json()[0]["estilos"]] == [outra["id"]]
