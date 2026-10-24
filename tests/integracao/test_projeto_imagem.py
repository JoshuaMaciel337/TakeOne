# Projeto de imagem: o tamanho em pixels, camadas em qualquer ordem, fundo transparente e o que não vale nele
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import arquivo_publico
from core.modelos.projeto import proporcao_mais_perto
from tests.integracao.test_api import cadastrar
from tests.integracao.test_projetos import SEGUNDO, clipe, criar_midia, salvar


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def camada(tipo, clipe_):
    return {"id": f"f-{clipe_['id']}", "tipo": tipo, "oculta": False, "muda": False, "travada": False,
            "clipes": [clipe_]}


def test_criar_salvar_e_abrir_um_projeto_de_imagem(cliente, db_limpo):
    cadastrar(cliente)
    criado = cliente.post("/api/projetos", json={"tamanho": {"largura": 1080, "altura": 1350}})
    assert criado.status_code == 201, criado.text
    projeto = criado.json()
    assert projeto["tipo"] == "imagem" and projeto["tamanho"] == {"largura": 1080, "altura": 1350}
    assert projeto["proporcao"] == "4:5" and projeto["nome"] == "Imagem sem título"
    assert projeto["fundo"]["cor"] == "#ffffff", "a imagem nasce branca"

    foto = criar_midia(db_limpo, cliente)
    fundo = criar_midia(db_limpo, cliente)
    titulo = {**clipe(None, 0, 5, id_="titulo"), "midia_id": None, "texto": {"conteudo": "Promoção", "cor": "#ffffff"}}
    # De cima para baixo: a foto por cima do título, e o fundo embaixo de tudo (o vídeo não deixa)
    faixas = [camada("video", clipe(foto, 0, 5, id_="foto")), camada("texto", titulo),
              camada("video", clipe(fundo, 0, 5, id_="fundo")), {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas, fundo={"cor": "#ffffff", "transparente": True},
                   tamanho={"largura": 1080, "altura": 1920})
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert [f["tipo"] for f in aberto["faixas"]] == ["video", "texto", "video", "principal"]
    assert aberto["tamanho"] == {"largura": 1080, "altura": 1920} and aberto["proporcao"] == "9:16"
    assert aberto["fundo"] == {"cor": "#ffffff", "transparente": True}
    resumo = next(p for p in cliente.get("/api/projetos").json() if p["id"] == projeto["id"])
    assert resumo["tipo"] == "imagem" and resumo["capa_midia_id"] == fundo, "a capa é a camada de baixo"
    assert resumo["duracao"] == 5 * SEGUNDO

    # O que é de vídeo não vale na imagem
    assert cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).status_code == 422
    assert cliente.get(f"/api/projetos/{projeto['id']}/intercambio.xml").status_code == 422


def test_resolucao_da_imagem(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    assert "resolucao" not in projeto["tamanho"]
    salvo = salvar(cliente, projeto, projeto["faixas"], tamanho={"largura": 1600, "altura": 1200, "resolucao": 300})
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert aberto["tamanho"] == {"largura": 1600, "altura": 1200, "resolucao": 300}
    zero = {"largura": 1600, "altura": 1200, "resolucao": 0}
    assert salvar(cliente, aberto, aberto["faixas"], tamanho=zero).status_code == 422


def test_camada_vetorial(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    vetor = {
        "caixa": {"largura": 124, "altura": 74},
        "subcaminhos": [{"nos": [{"x": 12, "y": 12}, {"x": 112, "y": 12, "sx": 120, "sy": 12},
                                 {"x": 112, "y": 62, "ex": 112, "ey": 50}], "fechado": True, "operacao": "somar"},
                        {"nos": [{"x": 30, "y": 30}, {"x": 40, "y": 30}, {"x": 40, "y": 40}], "fechado": True,
                         "operacao": "subtrair"}],
        "preenchimento": {"tipo": "degrade", "forma": "radial", "angulo": 90, "escala": 1, "inverter": False,
                          "degrade": {"nome": "", "tipo": "solido", "cores": [
                              {"posicao": 0, "cor": "#ff0000", "meio": 0.5},
                              {"posicao": 1, "cor": "#0000ff", "meio": 0.5}],
                              "opacidades": [{"posicao": 0, "opacidade": 1, "meio": 0.5}],
                              "suavidade": 1, "aspereza": 0.5, "semente": 1}},
        "traco": {"tinta": {"tipo": "cor", "cor": "#000000"}, "largura": 10, "alinhamento": "fora", "tipo": "tracejado",
                  "pontas": "redonda", "cantos": "redondo", "mitra": 4},
        "forma": {"tipo": "retangulo", "largura": 100, "altura": 50, "raios": [0, 4, 8, 0]},
        "margem": 12,
    }
    forma = {**clipe(None, 0, 5, id_="forma"), "midia_id": None, "vetor": vetor}
    faixas = [camada("video", forma), {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    guardado = aberto["faixas"][0]["clipes"][0]["vetor"]
    assert guardado == vetor, "as alças que faltam continuam faltando"

    # Sem a tinta inteira, numa faixa de texto, ou no projeto de vídeo, não vale
    incompleta = {**vetor, "preenchimento": {"tipo": "cor"}}
    assert salvar(cliente, aberto, [camada("video", {**forma, "vetor": incompleta}), faixas[1]]).status_code == 422
    assert salvar(cliente, aberto, [camada("texto", forma), faixas[1]]).status_code == 422
    video = cliente.post("/api/projetos", json={"nome": "Vídeo", "proporcao": "16:9"}).json()
    assert salvar(cliente, video, [camada("video", forma), *video["faixas"]]).status_code == 422


def test_texto_rico(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    estilo = {"familia": "inter", "peso": 400, "italico": False, "tamanho": 48, "cor": "#000000", "entrelinha": None,
              "tracking": 0, "kerning": "metrica", "kern": 0, "escalaH": 1, "escalaV": 1, "linhaDeBase": 0,
              "negritoFalso": False, "italicoFalso": False, "caixa": "normal", "posicao": "normal", "sublinhado": False,
              "tachado": False, "ligaduras": True, "alternativos": False, "fracoes": False, "ordinais": False,
              "eixos": {}, "suavizacao": "nitida"}
    texto = {"paragrafos": [{"trechos": [{"texto": "Olá ", "estilo": {}},
                                         {"texto": "mundo", "estilo": {"cor": "#ff0000", "entrelinha": None}}],
                             "estilo": {"alinhamento": "centro"}}],
             "estilo": estilo, "paragrafo": {"alinhamento": "esquerda", "recuoInicio": 0, "recuoFim": 0,
                                             "recuoPrimeira": 0, "espacoAntes": 0, "espacoDepois": 0,
                                             "hifenizar": False},
             "modo": "ponto", "orientacao": "horizontal", "caixa": {"largura": 230, "altura": 70},
             "origem": {"x": 6, "y": 52}}
    camada_ = {**clipe(None, 0, 5, id_="t1"), "midia_id": None, "texto_rico": texto}
    faixas = [camada("video", camada_), {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    guardado = cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]["texto_rico"]
    assert guardado == texto, "o estilo do trecho guarda só o que veio (com o null que veio)"
    # Sem a fonte no estilo de base, ou numa faixa de texto, não vale
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    sem_fonte = {**texto, "estilo": {k: v for k, v in estilo.items() if k != "familia"}}
    sem_fonte_camada = camada("video", {**camada_, "texto_rico": sem_fonte})
    assert salvar(cliente, aberto, [sem_fonte_camada, faixas[1]]).status_code == 422
    assert salvar(cliente, aberto, [camada("texto", camada_), faixas[1]]).status_code == 422
    # Deformado e num caminho: os campos voltam como foram
    caminho = {"tipo": "linha", "nos": [{"x": 0, "y": 0}, {"x": 100, "y": 0, "ex": 50, "ey": -40}], "fechado": False,
               "inicio": 0.1, "inverter": False}
    deformado = {**texto, "deformar": {"estilo": "arco", "vertical": False, "curvatura": 50, "distorcaoH": 0,
                                        "distorcaoV": -10}, "caminho": caminho}
    salvo = salvar(cliente, aberto, [camada("video", {**camada_, "texto_rico": deformado}), faixas[1]])
    assert salvo.status_code == 200, salvo.text
    guardado = cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]["texto_rico"]
    assert guardado["deformar"]["curvatura"] == 50 and guardado["caminho"]["nos"][1]["ex"] == 50
    # Dentro de uma forma, o caminho tem de ser fechado; curvatura fora de -100 a 100 não vale
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    area_aberta = {**texto, "caminho": {**caminho, "tipo": "area"}}
    com_area = camada("video", {**camada_, "texto_rico": area_aberta})
    assert salvar(cliente, aberto, [com_area, faixas[1]]).status_code == 422
    exagero = {**texto, "deformar": {"estilo": "onda", "curvatura": 150}}
    assert salvar(cliente, aberto, [camada("video", {**camada_, "texto_rico": exagero}), faixas[1]]).status_code == 422


def test_pranchetas(cliente, db_limpo):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    foto = criar_midia(db_limpo, cliente)
    prancheta = {"largura": 400, "altura": 300, "fundo": {"cor": "#ff4040", "transparente": False}}
    pasta = {**clipe(None, 0, 5, id_="p1"), "midia_id": None, "pasta": True, "mesclagem": "normal",
             "prancheta": prancheta}
    dentro = {**camada("video", clipe(foto, 0, 5, id_="foto")), "pai": "f-p1"}
    faixas = [{**camada("video", pasta), "nome": "Capa"}, dentro, {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    assert cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]["prancheta"] == prancheta
    # A prancheta é um grupo da raiz: numa camada comum, ou dentro de outra pasta, não vale
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    comum = {**clipe(foto, 0, 5, id_="c2"), "prancheta": prancheta}
    assert salvar(cliente, aberto, [camada("video", comum), faixas[2]]).status_code == 422
    aninhada = {**camada("video", {**pasta, "id": "p2"}), "pai": "f-p1"}
    assert salvar(cliente, aberto, [faixas[0], aninhada, faixas[2]]).status_code == 422


def test_quadro_com_foto(cliente, db_limpo):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    foto = criar_midia(db_limpo, cliente)
    db_limpo.midias.update_one({"_id": ObjectId(foto)}, {"$set": {"imagem": True}})
    video = criar_midia(db_limpo, cliente)
    tinta = {"tipo": "imagem", "midia_id": foto, "ajuste": "cobrir", "escala": 1.5, "x": 0.1, "y": -0.2}
    quadro = {"caixa": {"largura": 202, "altura": 102}, "margem": 1, "quadro": True, "traco": None,
              "subcaminhos": [{"nos": [{"x": 1, "y": 1}, {"x": 201, "y": 1}, {"x": 201, "y": 101}, {"x": 1, "y": 101}],
                               "fechado": True, "operacao": "somar"}], "preenchimento": tinta}
    forma = {**clipe(None, 0, 5, id_="quadro"), "midia_id": None, "vetor": quadro}
    faixas = [camada("video", forma), {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    assert cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]["vetor"] == quadro
    # A foto conta como usada (não sai da biblioteca) e precisa ser uma imagem
    assert cliente.delete(f"/api/midias/{foto}").status_code == 409
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    com_video = {**forma, "vetor": {**quadro, "preenchimento": {**tinta, "midia_id": video}}}
    assert salvar(cliente, aberto, [camada("video", com_video), faixas[1]]).status_code == 422


def test_mascara_vetorial(cliente, db_limpo):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    foto = criar_midia(db_limpo, cliente)
    mascara = {"subcaminhos": [{"nos": [{"x": 0, "y": 0}, {"x": 400, "y": 0}, {"x": 200, "y": 300}], "fechado": True,
                                "operacao": "somar"}], "base": "ocultar", "ligada": True, "vinculada": False,
               "densidade": 0.8, "difusao": 4, "matriz": [1, 0, 0, 1, 0, 0]}
    faixas = [camada("video", {**clipe(foto, 0, 5, id_="foto"), "mascara_vetorial": mascara}),
              {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    assert cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]["mascara_vetorial"] == mascara
    torta = {**mascara, "matriz": [1, 0, 0]}
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert salvar(cliente, aberto, [camada("video", {**faixas[0]["clipes"][0], "mascara_vetorial": torta}),
                                    faixas[1]]).status_code == 422


def test_caminhos_do_documento(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    assert projeto["caminhos"] == []
    sub = {"nos": [{"x": 10, "y": 10, "sx": 30, "sy": 0}, {"x": 90, "y": 40, "ex": 70, "ey": 50}], "fechado": False,
           "operacao": "somar"}
    caminhos = [{"id": "trab", "nome": "Caminho de trabalho", "subcaminhos": [sub], "trabalho": True, "recorte": False},
                {"id": "c1", "nome": "  Contorno  ", "subcaminhos": [], "trabalho": False, "recorte": True}]
    salvo = salvar(cliente, projeto, projeto["faixas"], caminhos=caminhos)
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert aberto["caminhos"][0]["subcaminhos"] == [sub]
    assert aberto["caminhos"][1]["nome"] == "Contorno"
    # Dois de trabalho, ou o mesmo id, não valem
    dois = [{**caminhos[0]}, {**caminhos[1], "trabalho": True, "recorte": False}]
    assert salvar(cliente, aberto, aberto["faixas"], caminhos=dois).status_code == 422
    repetido = [caminhos[0], {**caminhos[1], "id": "trab"}]
    assert salvar(cliente, aberto, aberto["faixas"], caminhos=repetido).status_code == 422
    # No vídeo, os caminhos são ignorados
    video = cliente.post("/api/projetos", json={"nome": "Vídeo", "proporcao": "16:9"}).json()
    assert salvar(cliente, video, video["faixas"], caminhos=caminhos).json()["caminhos"] == []


def test_tamanho_fora_dos_limites_e_o_video_continua_igual(cliente):
    cadastrar(cliente)
    assert cliente.post("/api/projetos", json={"tamanho": {"largura": 9000, "altura": 100}}).status_code == 422
    resposta = cliente.post("/api/projetos", json={"tamanho": {"largura": 7000, "altura": 7000}})
    assert resposta.status_code == 422 and "36 milhões" in resposta.json()["detail"]
    video = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    assert video["tipo"] == "video" and video["tamanho"] is None
    # O tamanho mandado ao salvar um vídeo é ignorado
    salvo = salvar(cliente, video, video["faixas"], tamanho={"largura": 500, "altura": 500}).json()
    assert salvo["tamanho"] is None and salvo["proporcao"] == "16:9"


def test_proporcao_mais_perto_e_imagem_em_resolucao_cheia_servida():
    assert proporcao_mais_perto(1080, 1080) == "1:1"
    assert proporcao_mais_perto(1500, 500) == "21:9"
    assert proporcao_mais_perto(1280, 720) == "16:9"
    assert arquivo_publico("imagem.png") and arquivo_publico("proxy.webp")


def test_estilo_de_camada_e_luz_global(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    estilo = {"efeitos": [
        {"tipo": "sombra", "id": "e1", "modo": "multiplicar", "opacidade": 0.75, "cor": "#000000", "angulo": 120,
         "luz_global": True, "distancia": 10, "espalhar": 0.1, "tamanho": 12, "vazar": True},
        {"tipo": "tracado", "id": "e2", "tamanho": 4, "posicao": "fora",
         "tinta": {"tipo": "cor", "cor": "#ff0000"}},
        {"tipo": "chanfro", "id": "e3", "estilo": "interno", "tecnica": "suave", "profundidade": 1, "direcao": "cima",
         "tamanho": 6, "altitude": 30, "contorno_brilho": {"pontos": [{"x": 0, "y": 0}, {"x": 1, "y": 1}]}},
    ], "mesclar_se": {"canal": "cinza", "esta": [0, 0, 200, 255], "abaixo": [0, 0, 255, 255]}}
    forma = {**clipe(None, 0, 5, id_="v1"), "midia_id": None, "vetor": {
        "subcaminhos": [{"nos": [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 100, "y": 100}], "fechado": True}],
        "caixa": {"largura": 100, "altura": 100}, "preenchimento": {"tipo": "cor", "cor": "#3366ff"}},
        "estilo_camada": estilo}
    faixas = [camada("video", forma), {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas, luz_global={"angulo": 135, "altitude": 40})
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert aberto["luz_global"] == {"angulo": 135, "altitude": 40}
    guardado = aberto["faixas"][0]["clipes"][0]["estilo_camada"]
    assert guardado["efeitos"][1] == estilo["efeitos"][1], "o efeito guarda só o que veio"
    assert guardado["mesclar_se"]["esta"] == [0, 0, 200, 255]
    # Faixa fora de ordem, opacidade fora de 0 a 1 e o estilo num projeto de vídeo não valem
    errado = {**estilo, "mesclar_se": {"esta": [0, 200, 100, 255]}}
    ruim = camada("video", {**forma, "estilo_camada": errado})
    assert salvar(cliente, aberto, [ruim, faixas[1]]).status_code == 422
    demais = {"efeitos": [{"tipo": "sombra", "id": "x", "opacidade": 2}]}
    assert salvar(cliente, aberto, [camada("video", {**forma, "estilo_camada": demais}), faixas[1]]).status_code == 422


def test_camada_de_preenchimento(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    degrade = {"nome": "", "tipo": "solido",
               "cores": [{"posicao": 0, "cor": "#000000"}, {"posicao": 1, "cor": "#ffffff"}],
               "opacidades": [{"posicao": 0, "opacidade": 1}, {"posicao": 1, "opacidade": 1}]}
    preenchimento = {"tinta": {"tipo": "degrade", "degrade": degrade, "forma": "linear", "angulo": 0, "escala": 1,
                               "inverter": False}, "de": {"x": 0.1, "y": 0.5}, "ate": {"x": 0.9, "y": 0.5}}
    camada_ = {**clipe(None, 0, 5, id_="p1"), "midia_id": None, "camada_de_preenchimento": preenchimento}
    faixas = [camada("video", camada_), {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert aberto["faixas"][0]["clipes"][0]["camada_de_preenchimento"]["ate"] == {"x": 0.9, "y": 0.5}
    # Com foto não vale; a tinta "nenhuma" também não
    com_foto = camada("video", {**camada_, "camada_de_preenchimento": {"tinta": {"tipo": "nenhuma"}}})
    assert salvar(cliente, aberto, [com_foto, faixas[1]]).status_code == 422
