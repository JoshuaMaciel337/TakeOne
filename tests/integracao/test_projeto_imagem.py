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
    # A largura variável do traço volta como foi; lados acima de 20 não valem
    perfil = [{"t": 0, "esquerda": 0, "direita": 0}, {"t": 0.5, "esquerda": 2, "direita": 1.5},
              {"t": 1, "esquerda": 0, "direita": 0}]
    com_perfil = {**vetor, "traco": {**vetor["traco"], "perfil": perfil}}
    salvo = salvar(cliente, aberto, [camada("video", {**forma, "vetor": com_perfil}), faixas[1]])
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert aberto["faixas"][0]["clipes"][0]["vetor"]["traco"]["perfil"] == perfil
    largo = {**vetor, "traco": {**vetor["traco"], "perfil": [{"t": 0.5, "esquerda": 30, "direita": 1}]}}
    assert salvar(cliente, aberto, [camada("video", {**forma, "vetor": largo}), faixas[1]]).status_code == 422

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
    # Toque no texto: a letra girada e deslocada volta como foi; giro além de uma volta não vale
    tocado = {**texto, "paragrafos": [{"trechos": [{"texto": "O", "estilo": {"giro": -30, "deslocamento": 12.5}},
                                                   {"texto": "lá", "estilo": {}}], "estilo": {}}]}
    salvo = salvar(cliente, aberto, [camada("video", {**camada_, "texto_rico": tocado}), faixas[1]])
    assert salvo.status_code == 200, salvo.text
    guardado = cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]["texto_rico"]
    assert guardado["paragrafos"][0]["trechos"][0]["estilo"] == {"giro": -30, "deslocamento": 12.5}
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    demais = {**texto, "paragrafos": [{"trechos": [{"texto": "O", "estilo": {"giro": 400}}], "estilo": {}}]}
    assert salvar(cliente, aberto, [camada("video", {**camada_, "texto_rico": demais}), faixas[1]]).status_code == 422


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


def test_ajustes_da_camada_de_ajuste(cliente):
    from tests.integracao.test_luts import cube_que_inverte, importar

    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    lut = importar(cliente, cube_que_inverte()).json()

    def ajuste(id_, ajuste_imagem, **extra):
        return camada("video", {**clipe(None, 0, 5, id_=id_), "midia_id": None, "ajuste": True,
                                "ajuste_imagem": ajuste_imagem, **extra})

    niveis = {"tipo": "niveis", "canais": {"rgb": {"preto": 20, "branco": 230, "gama": 1.2}}}
    curvas = {"tipo": "curvas", "canais": {"r": {"pontos": [[0, 0], [0.5, 0.6], [1, 1]]}}}
    mapa = {"tipo": "mapa_degrade", "cores": [{"posicao": 0, "cor": "#200040"}, {"posicao": 1, "cor": "#ffd080"}]}
    pesquisa = {"tipo": "pesquisa", "lut": {"id": lut["id"], "intensidade": 0.5}}
    principal = {**projeto["faixas"][0], "clipes": []}
    faixas = [ajuste("a1", niveis), ajuste("a2", curvas), ajuste("a3", mapa), ajuste("a4", pesquisa), principal]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    lidos = [f["clipes"][0]["ajuste_imagem"] for f in aberto["faixas"][:4]]
    assert lidos[0]["canais"]["rgb"]["gama"] == 1.2 and lidos[0]["canais"]["rgb"]["saida_branco"] == 255
    assert lidos[2]["inverter"] is False and lidos[3]["lut"]["intensidade"] == 0.5
    # A LUT usada pela Pesquisa de cores não sai
    assert cliente.delete(f"/api/luts/{lut['id']}").status_code == 409
    # Sem ser camada de ajuste, com o branco abaixo do preto, com a curva fora de ordem ou de um tipo que não existe
    sem_ajuste = camada("video", {**clipe(None, 0, 5, id_="x"), "midia_id": None, "ajuste_imagem": niveis})
    invertidos = ajuste("x", {"tipo": "niveis", "canais": {"g": {"preto": 200, "branco": 100}}})
    fora_de_ordem = ajuste("x", {"tipo": "curvas", "canais": {"rgb": {"pontos": [[0.5, 0.5], [0.2, 0.2]]}}})
    desconhecido = ajuste("x", {"tipo": "solarizar"})
    for errado in (sem_ajuste, invertidos, fora_de_ordem, desconhecido):
        assert salvar(cliente, aberto, [errado, principal]).status_code == 422
    # No vídeo não vale
    video = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    resposta = salvar(cliente, video, [ajuste("v", niveis), {**video["faixas"][0], "clipes": []}])
    assert resposta.status_code == 422


def test_filtros_inteligentes(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    forma = {"subcaminhos": [{"nos": [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 100, "y": 100}], "fechado": True,
                              "operacao": "somar"}], "caixa": {"largura": 100, "altura": 100},
             "preenchimento": {"tipo": "cor", "cor": "#ff0000"}}
    filtros = {"filtros": [{"id": "a", "tipo": "gaussiano", "opcoes": {"raio": 4.5}},
                           {"id": "b", "tipo": "adicionar_ruido", "opcoes": {"quantidade": 12, "monocromatico": True,
                                                                             "distribuicao": "gaussiana"},
                            "modo": "sobrepor", "opacidade": 0.5, "ligado": False}]}
    camada_ = {**clipe(None, 0, 5, id_="v"), "midia_id": None, "vetor": forma, "filtros_inteligentes": filtros}
    principal = {**projeto["faixas"][0], "clipes": []}
    salvo = salvar(cliente, projeto, [camada("video", camada_), principal])
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    lidos = aberto["faixas"][0]["clipes"][0]["filtros_inteligentes"]["filtros"]
    assert lidos[0]["opcoes"]["raio"] == 4.5 and lidos[1]["modo"] == "sobrepor" and lidos[1]["ligado"] is False
    # Um tipo fora do padrão, opções demais, num ajuste ou no vídeo
    errado = {**camada_, "filtros_inteligentes": {"filtros": [{"id": "x", "tipo": "Gaussiano!"}]}}
    demais = {**camada_, "filtros_inteligentes": {"filtros": [{"id": "x", "tipo": "gaussiano",
                                                               "opcoes": {f"o{i}": i for i in range(81)}}]}}
    no_ajuste = {**clipe(None, 0, 5, id_="j"), "midia_id": None, "ajuste": True, "filtros_inteligentes": filtros}
    for ruim in (errado, demais, no_ajuste):
        assert salvar(cliente, aberto, [camada("video", ruim), principal]).status_code == 422
    video = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    assert salvar(cliente, video, [camada("video", camada_), {**video["faixas"][0], "clipes": []}]).status_code == 422


def test_variacoes_do_preenchimento_generativo(cliente, db_limpo):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    escolhida = criar_midia(db_limpo, cliente)
    outra = criar_midia(db_limpo, cliente)
    geracao = {"descricao": "um barco", "variacoes": [escolhida, outra]}
    faixas = [camada("video", {**clipe(escolhida, 0, 5, id_="gerada"), "geracao": geracao}),
              {**projeto["faixas"][0], "clipes": []}]
    salvo = salvar(cliente, projeto, faixas)
    assert salvo.status_code == 200, salvo.text
    assert cliente.get(f"/api/projetos/{projeto['id']}").json()["faixas"][0]["clipes"][0]["geracao"] == geracao
    # A variação que não está no clipe também conta como usada
    assert cliente.delete(f"/api/midias/{outra}").status_code == 409
    # Só no projeto de imagem
    video = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    principal = {**video["faixas"][0], "clipes": [{**clipe(escolhida, 0, 5, id_="v"), "geracao": geracao}]}
    assert salvar(cliente, video, [principal]).status_code == 422


def test_informacoes_do_arquivo(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 640, "altura": 480}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    informacoes = {"titulo": "Cartaz", "autor": "Equipe", "descricao": "Para a vitrine.",
                   "palavras_chave": [" verão ", "promoção", "verão", ""], "direitos": "© 2026 Equipe",
                   "situacao_direitos": "protegido", "url": "https://exemplo.com.br"}
    salvo = salvar(cliente, projeto, [vazia], informacoes=informacoes)
    assert salvo.status_code == 200, salvo.text
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert aberto["informacoes"] == {**informacoes, "palavras_chave": ["verão", "promoção"]}
    # Longo demais não passa; no vídeo, fica de fora
    assert salvar(cliente, aberto, [vazia], informacoes={"titulo": "x" * 201}).status_code == 422
    video = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    assert salvar(cliente, video, video["faixas"], informacoes=informacoes).json()["informacoes"] is None


def test_modo_de_cor(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 320, "altura": 240}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    duotone = {"tipo": "duotone", "tintas": [{"nome": "Preto", "cor": "#000000", "curva": [0, 25, 50, 75, 100]},
                                             {"nome": "Marrom", "cor": "#a0703c", "curva": [0, 35, 60, 80, 90]}]}
    salvo = salvar(cliente, projeto, [vazia], modo=duotone)
    assert salvo.status_code == 200, salvo.text
    assert salvo.json()["modo"]["tintas"][1]["cor"] == "#a0703c"
    indexadas = {"tipo": "indexadas", "paleta": [[0, 0, 0], [255, 255, 255]], "pontilhado": "difusao",
                 "quantidade": 1, "transparencia": False}
    aberto = salvar(cliente, salvo.json(), [vazia], modo=indexadas).json()
    assert aberto["modo"]["paleta"] == [[0, 0, 0], [255, 255, 255]]
    # O RGB não é guardado; campos que faltam, cores fora de 0 a 255 e tinta demais não passam
    assert salvar(cliente, aberto, [vazia], modo={"tipo": "rgb"}).json()["modo"] is None
    atual = cliente.get(f"/api/projetos/{projeto['id']}").json()
    assert salvar(cliente, atual, [vazia], modo={"tipo": "bitmap", "metodo": "limiar"}).status_code == 422
    assert salvar(cliente, atual, [vazia], modo={**indexadas, "paleta": [[0, 0, 300]]}).status_code == 422
    assert salvar(cliente, atual, [vazia], modo={**duotone, "tintas": duotone["tintas"] * 3}).status_code == 422


def test_variaveis_e_conjuntos(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 320, "altura": 240}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    variaveis = {"variaveis": [{"nome": "titulo", "tipo": "texto", "faixa": "f1"},
                               {"nome": "logo", "tipo": "visibilidade", "faixa": "f2"}],
                 "conjuntos": [{"nome": "Verão", "valores": {"titulo": "Liquidação", "logo": "sim"}}]}
    salvo = salvar(cliente, projeto, [vazia], variaveis=variaveis)
    assert salvo.status_code == 200, salvo.text
    assert salvo.json()["variaveis"] == variaveis
    atual = salvo.json()
    # Nome com espaço, nomes repetidos e valor longo demais não passam
    ruim = {"variaveis": [{"nome": "meu titulo", "tipo": "texto", "faixa": "f1"}]}
    assert salvar(cliente, atual, [vazia], variaveis=ruim).status_code == 422
    repetida = {"variaveis": [{"nome": "a", "tipo": "texto", "faixa": "f1"},
                              {"nome": "A", "tipo": "texto", "faixa": "f2"}]}
    assert salvar(cliente, atual, [vazia], variaveis=repetida).status_code == 422
    longo = {**variaveis, "conjuntos": [{"nome": "x", "valores": {"titulo": "y" * 2001}}]}
    assert salvar(cliente, atual, [vazia], variaveis=longo).status_code == 422
    # Sem variáveis, não guarda nada
    assert salvar(cliente, atual, [vazia], variaveis={"variaveis": [], "conjuntos": []}).json()["variaveis"] is None


def test_guias_do_documento(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 320, "altura": 240}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    salvo = salvar(cliente, projeto, [vazia], guias={"verticais": [160, -20.5], "horizontais": [0]})
    assert salvo.status_code == 200, salvo.text
    assert salvo.json()["guias"] == {"verticais": [160, -20.5], "horizontais": [0]}
    atual = salvo.json()
    assert salvar(cliente, atual, [vazia], guias={"verticais": [1e7]}).status_code == 422
    assert salvar(cliente, atual, [vazia], guias={"verticais": [], "horizontais": []}).json()["guias"] is None


def test_contagem_notas_e_escala_de_medida(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 320, "altura": 240}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    pontos = [{"x": 10, "y": 20}, {"x": 30.5, "y": 40}]
    contagem = {"grupos": [{"id": "g1", "nome": " Células ", "cor": "#00ff00", "pontos": pontos}], "ativo": "g1"}
    notas = [{"id": "n1", "x": 100, "y": 50, "autor": "Ana", "texto": "Clarear o rosto"}]
    escala = {"pixels": 100, "comprimento": 2.5, "unidade": "cm"}
    salvo = salvar(cliente, projeto, [vazia], contagem=contagem, notas=notas, escala_de_medida=escala)
    assert salvo.status_code == 200, salvo.text
    corpo = salvo.json()
    assert corpo["contagem"]["grupos"][0]["nome"] == "Células"
    assert corpo["contagem"]["grupos"][0]["pontos"][1] == {"x": 30.5, "y": 40}
    assert corpo["contagem"]["grupos"][0]["tamanho_do_rotulo"] == 12
    assert corpo["notas"][0]["texto"] == "Clarear o rosto" and corpo["notas"][0]["cor"] == "#ffd60a"
    assert corpo["escala_de_medida"] == escala
    # Ids repetidos, pontos longe demais e escala sem tamanho são recusados
    dois = {"grupos": [contagem["grupos"][0], contagem["grupos"][0]]}
    assert salvar(cliente, corpo, [vazia], contagem=dois).status_code == 422
    assert salvar(cliente, corpo, [vazia], notas=[notas[0], notas[0]]).status_code == 422
    assert salvar(cliente, corpo, [vazia], notas=[{**notas[0], "x": 1e7}]).status_code == 422
    assert salvar(cliente, corpo, [vazia], escala_de_medida={**escala, "pixels": 0}).status_code == 422
    # Sem grupos, a contagem não é guardada; sem notas, a lista fica vazia
    limpo = salvar(cliente, corpo, [vazia], contagem={"grupos": []}).json()
    assert limpo["contagem"] is None and limpo["notas"] == [] and limpo["escala_de_medida"] is None


def test_comps_de_camada(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 320, "altura": 240}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    estado = {"oculta": True, "transformacao": {"x": 0.1, "y": 0, "escala": 1, "rotacao": 0, "opacidade": 0.5},
              "mesclagem": "multiplicar", "preenchimento": 0.8}
    comp = {"id": "c1", "nome": " Versão A ", "comentario": "Para o cliente", "aparencia": False,
            "camadas": {"f1": estado, "f2": {"oculta": False}}}
    salvo = salvar(cliente, projeto, [vazia], comps=[comp])
    assert salvo.status_code == 200, salvo.text
    guardada = salvo.json()["comps"][0]
    assert guardada["nome"] == "Versão A" and guardada["aparencia"] is False and guardada["visibilidade"] is True
    assert guardada["camadas"]["f1"]["mesclagem"] == "multiplicar"
    # Só o que veio fica (o estilo e a transformação da f2 não aparecem)
    assert guardada["camadas"]["f2"] == {"oculta": False, "estilo_camada": None, "mesclagem": None,
                                         "preenchimento": None, "transformacao": None}
    atual = salvo.json()
    assert salvar(cliente, atual, [vazia], comps=[comp, comp]).status_code == 422
    ruim = {**comp, "camadas": {"f1": {"mesclagem": "inventado"}}}
    assert salvar(cliente, atual, [vazia], comps=[ruim]).status_code == 422
    assert salvar(cliente, atual, [vazia]).json()["comps"] == []


def test_linha_do_tempo_de_quadros(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 320, "altura": 240}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    quadros = [{"id": "q1", "atraso": 0.2, "camadas": {"f1": {"oculta": False}}},
               {"id": "q2", "camadas": {"f1": {"oculta": True}}}]
    salvo = salvar(cliente, projeto, [vazia], animacao={"quadros": quadros, "repetir": 3})
    assert salvo.status_code == 200, salvo.text
    animacao = salvo.json()["animacao"]
    assert animacao["repetir"] == 3 and [q["atraso"] for q in animacao["quadros"]] == [0.2, 0.5]
    atual = salvo.json()
    assert salvar(cliente, atual, [vazia], animacao={"quadros": [{"id": "q", "atraso": 61}]}).status_code == 422
    assert salvar(cliente, atual, [vazia], animacao={"quadros": []}).json()["animacao"] is None


def test_fatias(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 320, "altura": 240}}).json()
    vazia = {**projeto["faixas"][0], "clipes": []}
    fatias = [{"id": "f1", "nome": "topo", "x": 0, "y": 0, "largura": 320, "altura": 60}]
    salvo = salvar(cliente, projeto, [vazia], fatias=fatias)
    assert salvo.status_code == 200, salvo.text
    assert salvo.json()["fatias"] == fatias
    ruim = [{**fatias[0], "largura": 0}]
    assert salvar(cliente, salvo.json(), [vazia], fatias=ruim).status_code == 422


def test_grade_de_perspectiva(cliente):
    cadastrar(cliente)
    projeto = cliente.post("/api/projetos", json={"tamanho": {"largura": 800, "altura": 600}}).json()
    grade = {"tipo": 2, "horizonte": 270, "fuga": [{"x": -200, "y": 270}, {"x": 1000, "y": 270}],
             "origem": {"x": 400, "y": 510}, "distancia": 400, "celula": 50, "extensao": 1000, "visivel": True,
             "plano": "esquerdo"}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json={**projeto, "perspectiva": grade})
    assert salvo.status_code == 200, salvo.text
    assert cliente.get(f"/api/projetos/{projeto['id']}").json()["perspectiva"] == grade
    # Um ponto de fuga por tipo
    aberto = cliente.get(f"/api/projetos/{projeto['id']}").json()
    errada = {**grade, "tipo": 3}
    assert cliente.put(f"/api/projetos/{projeto['id']}", json={**aberto, "perspectiva": errada}).status_code == 422
    # No projeto de vídeo, não fica
    video = cliente.post("/api/projetos", json={"nome": "Vídeo", "proporcao": "16:9"}).json()
    salvo = cliente.put(f"/api/projetos/{video['id']}", json={**video, "perspectiva": grade})
    assert salvo.status_code == 200, salvo.text
    assert cliente.get(f"/api/projetos/{video['id']}").json()["perspectiva"] is None
