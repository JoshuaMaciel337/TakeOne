# LUTs importadas pela API: o .cube vira uma tabela do espaço, o clipe usa pelo id e o render aplica antes dos
# ajustes, na mesma LUT 3D da prévia.
import pytest
from fastapi.testclient import TestClient

from api.main import app
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import SEGUNDO, TEM_FFMPEG, _exportar, criar_midia, gerar_cor, quadro_do_video


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def cube_que_inverte() -> str:
    linhas = ['TITLE "Negativo"', "LUT_3D_SIZE 2"]
    for b in (0, 1):
        for g in (0, 1):
            for r in (0, 1):
                linhas.append(f"{1 - r} {1 - g} {1 - b}")
    return "\n".join(linhas) + "\n"


def importar(cliente, texto: str, nome: str = "negativo.cube"):
    return cliente.post(f"/api/luts?nome={nome}", content=texto.encode(), headers={"Content-Type": "text/plain"})


def test_importar_listar_baixar_e_excluir(cliente, db_limpo):
    cadastrar(cliente)
    resposta = importar(cliente, cube_que_inverte())
    assert resposta.status_code == 201, resposta.text
    lut = resposta.json()
    assert (lut["nome"], lut["tamanho"], lut["minimo"], lut["maximo"]) == ("negativo", 2, [0, 0, 0], [1, 1, 1])
    assert [item["id"] for item in cliente.get("/api/luts").json()] == [lut["id"]]
    dados = cliente.get(f"/api/luts/{lut['id']}/dados")
    assert dados.status_code == 200 and len(dados.content) == 8 * 3 * 4
    ruim = importar(cliente, "LUT_1D_SIZE 2\n0 0 0\n1 1 1\n", "curva.cube")
    assert ruim.status_code == 422 and "1D" in ruim.json()["detail"]
    assert cliente.delete(f"/api/luts/{lut['id']}").status_code == 204
    assert cliente.get("/api/luts").json() == []
    assert cliente.get(f"/api/luts/{lut['id']}/dados").status_code == 404


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_aplica_a_lut_e_ela_nao_sai_enquanto_e_usada(cliente, db_limpo):
    cadastrar(cliente)
    lut = importar(cliente, cube_que_inverte()).json()
    midia = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, audio=False,
                        gerar=gerar_cor("0x4080c0"))
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    base = {"midia_id": midia, "velocidade": 1, "volume": 1, "entrada": 0, "duracao": SEGUNDO}
    clipes = [{**base, "id": "sem", "inicio": 0},
              {**base, "id": "com", "inicio": SEGUNDO, "cor": {"lut": {"id": lut["id"], "intensidade": 1}}},
              {**base, "id": "meia", "inicio": 2 * SEGUNDO, "cor": {"lut": {"id": lut["id"], "intensidade": 0.5}}}]
    corpo = {"versao": projeto["versao"], "nome": "LUT", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": clipes}]}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert salvo.status_code == 200, salvo.text
    video = _exportar(cliente, db_limpo, projeto["id"])
    original = [int(c) for c in quadro_do_video(video, 0.5, 1280, 720)[360, 640]]
    invertido = [int(c) for c in quadro_do_video(video, 1.5, 1280, 720)[360, 640]]
    metade = [int(c) for c in quadro_do_video(video, 2.5, 1280, 720)[360, 640]]
    assert all(abs(a + b - 255) <= 6 for a, b in zip(original, invertido, strict=True)), (original, invertido)
    assert all(abs(c - 128) <= 6 for c in metade), metade

    usada = cliente.delete(f"/api/luts/{lut['id']}")
    assert usada.status_code == 409 and '"LUT"' in usada.json()["detail"]
