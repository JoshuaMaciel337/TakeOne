# Exportações: pedir, acompanhar, baixar, link do celular e o render de verdade.
# O render com FFmpeg é pulado quando ele não está instalado. No Docker e no CI ele roda.
import math
import shutil
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.exportacao import ARQUIVO_VIDEO, chave_exportacao
from core.modelos.midia import chave_arquivo, montar_midia
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from core.utils.geometria import caixa_do_clipe
from core.utils.keyframes import valor_com_expressao
from core.utils.tempo import segundos_para_ticks
from tests.integracao.test_api import cadastrar
from worker.worker_principal import processar_job

SEGUNDO = segundos_para_ticks(1)
TEM_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def organizacao_de(cliente) -> ObjectId:
    return ObjectId(cliente.get("/api/auth/eu").json()["organizacao"]["id"])


def criar_midia(db, cliente, largura=1280, altura=720, duracao=4.0, audio=True, gerar=None) -> str:
    """Mídia pronta. Com `gerar`, o arquivo original é criado de verdade (para o render)."""
    organizacao_id = organizacao_de(cliente)
    midia = montar_midia(organizacao_id, ObjectId(), "fonte.mp4", 1000, "video/mp4")
    midia.update({"status": "pronta", "duracao": duracao,
                  "video": {"codec": "h264", "largura": largura, "altura": altura, "fps": 30, "rotacao": 0},
                  "audio": {"codec": "aac", "canais": 2, "taxa": 48000} if audio else None})
    midia_id = db.midias.insert_one(midia).inserted_id
    if gerar:
        caminho = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
        caminho.parent.mkdir(parents=True, exist_ok=True)
        gerar(caminho)
    return str(midia_id)


def projeto_com(cliente, midia_id, proporcao="9:16", duracao=2, **clipe_extra) -> dict:
    projeto = cliente.post("/api/projetos", json={"proporcao": proporcao}).json()
    clipe = {"id": "c1", "midia_id": midia_id, "inicio": 0, "duracao": duracao * SEGUNDO, "entrada": 0,
             "velocidade": 1, "volume": 1, **clipe_extra}
    corpo = {"versao": projeto["versao"], "nome": "Lançamento", "proporcao": proporcao, "taxa": projeto["taxa"],
             "fundo": {"cor": "#ff00ff"}, "faixas": [{**projeto["faixas"][0], "clipes": [clipe]}]}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert salvo.status_code == 200, salvo.text
    return salvo.json()


def test_pedir_acompanhar_e_excluir_exportacao(cliente, db_limpo):
    cadastrar(cliente)
    projeto = projeto_com(cliente, criar_midia(db_limpo, cliente))

    vazio = cliente.post("/api/projetos", json={}).json()
    assert cliente.post("/api/exportacoes", json={"projeto_id": vazio["id"]}).status_code == 422

    criada = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"})
    assert criada.status_code == 201
    exportacao = criada.json()
    assert (exportacao["status"], exportacao["largura"], exportacao["altura"]) == ("processando", 720, 1280)
    assert exportacao["processamento"]["status"] == "pendente"
    job = db_limpo.jobs.find_one({"tipo": "renderizacao"})
    assert job["entrada"]["exportacao_id"] == exportacao["id"]

    # A exportação guarda uma cópia do projeto: editar depois não muda o vídeo
    guardada = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    assert guardada["projeto"]["versao"] == projeto["versao"]
    listadas = cliente.get(f"/api/exportacoes?projeto_id={projeto['id']}").json()
    assert [e["id"] for e in listadas] == [exportacao["id"]]
    assert cliente.post(f"/api/exportacoes/{exportacao['id']}/link-celular").status_code == 409

    assert cliente.delete(f"/api/exportacoes/{exportacao['id']}").status_code == 204
    assert db_limpo.jobs.find_one({"_id": job["_id"]})["status"] == "erro", "o render na fila é cancelado"
    assert cliente.get(f"/api/exportacoes/{exportacao['id']}").status_code == 404


def test_baixar_e_link_do_celular(cliente, db_limpo):
    cadastrar(cliente)
    projeto = projeto_com(cliente, criar_midia(db_limpo, cliente))
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"]}).json()

    # Como se o worker tivesse terminado
    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    arquivo = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_bytes(b"video de mentira")
    db_limpo.exportacoes.update_one({"_id": doc["_id"]}, {"$set": {"status": "pronta", "arquivos": [ARQUIVO_VIDEO]}})

    baixado = cliente.get(f"/api/exportacoes/{exportacao['id']}/arquivos/video.mp4?baixar=true")
    assert baixado.status_code == 200 and baixado.content == b"video de mentira"
    assert 'filename="lancamento.mp4"' in baixado.headers["content-disposition"]

    link = cliente.post(f"/api/exportacoes/{exportacao['id']}/link-celular").json()
    assert link["caminho"].startswith("/api/baixar/")
    # Sem a sessão, como o celular. (Outro TestClient trocaria o event loop do cliente do Mongo.)
    sessao = dict(cliente.cookies)
    cliente.cookies.clear()
    assert cliente.get(link["caminho"]).content == b"video de mentira"
    assert cliente.get("/api/baixar/token-inventado").status_code == 404
    assert cliente.get("/api/qrcode.svg?texto=x").status_code == 401
    cliente.cookies.update(sessao)
    qr = cliente.get("/api/qrcode.svg", params={"texto": "http://exemplo/api/baixar/abc"})
    assert qr.status_code == 200 and qr.text.startswith('<svg xmlns="http://www.w3.org/2000/svg"')

    # Um link novo desliga o anterior
    novo = cliente.post(f"/api/exportacoes/{exportacao['id']}/link-celular").json()
    assert cliente.get(link["caminho"]).status_code == 404
    assert cliente.get(novo["caminho"]).status_code == 200

    # Excluir o projeto leva as exportações e os arquivos junto
    assert cliente.delete(f"/api/projetos/{projeto['id']}").status_code == 204
    assert db_limpo.exportacoes.count_documents({}) == 0
    assert not arquivo.exists()


def test_exportacao_de_outro_espaco_nao_aparece(cliente, db_limpo):
    cadastrar(cliente)
    projeto = projeto_com(cliente, criar_midia(db_limpo, cliente))
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"]}).json()
    with TestClient(app) as outro:
        cadastrar(outro)
        assert outro.get(f"/api/exportacoes/{exportacao['id']}").status_code == 404
        assert outro.get("/api/exportacoes").json() == []
        assert outro.post("/api/exportacoes", json={"projeto_id": projeto["id"]}).status_code == 404


# -----------------------------------------------
# Render de verdade, conferido contra a geometria (a mesma conta da prévia)
# -----------------------------------------------
# Quadrantes da mídia de teste e a cor de cada um
CORES = {(0, 0): (255, 0, 0), (1, 0): (0, 255, 0), (0, 1): (255, 255, 0), (1, 1): (0, 0, 255)}
FUNDO = (255, 0, 255)


def gerar_quadrantes(caminho):
    """640 × 360, 2 s: vermelho, verde, amarelo e azul nos quatro quadrantes, com um tom de 440 Hz."""
    filtro = ("drawbox=x=0:y=0:w=320:h=180:color=0xff0000:t=fill,drawbox=x=320:y=0:w=320:h=180:color=0x00ff00:t=fill,"
              "drawbox=x=0:y=180:w=320:h=180:color=0xffff00:t=fill")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "color=c=0x0000ff:s=640x360:r=30:d=2",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                    "-vf", filtro, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", str(caminho)], check=True, timeout=120)


def quadro_do_video(caminho, segundos: float, largura: int, altura: int) -> np.ndarray:
    saida = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{segundos}", "-i", str(caminho),
                            "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           capture_output=True, check=True, timeout=60).stdout
    return np.frombuffer(saida, dtype=np.uint8).reshape(altura, largura, 3)


def cor_esperada(caixa, ponto, margem: float):
    """A cor que a geometria manda ter no ponto, ou None se ele fica perto demais de uma borda."""
    angulo = math.radians(-caixa.rotacao)
    dx, dy = ponto[0] - caixa.cx, ponto[1] - caixa.cy
    lx = dx * math.cos(angulo) - dy * math.sin(angulo)
    ly = dx * math.sin(angulo) + dy * math.cos(angulo)
    meia_l, meia_a = caixa.largura / 2, caixa.altura / 2
    if abs(lx) > meia_l + margem or abs(ly) > meia_a + margem:
        return FUNDO
    if abs(lx) > meia_l - margem or abs(ly) > meia_a - margem or abs(lx) < margem or abs(ly) < margem:
        return None   # borda da caixa ou divisa entre quadrantes
    return CORES[(int(lx > 0), int(ly > 0))]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_segue_a_geometria_da_previa(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    transformacao = {"x": 0.1, "y": -0.15, "escala": 0.6, "rotacao": 30, "opacidade": 1}
    projeto = projeto_com(cliente, midia_id, transformacao=transformacao)
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()

    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    pronta = cliente.get(f"/api/exportacoes/{exportacao['id']}").json()
    assert pronta["status"] == "pronta" and pronta["arquivos"] == ["video.mp4"]
    assert 1.9 < pronta["duracao"] < 2.1

    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    quadro = quadro_do_video(video, 1.0, 720, 1280)
    recorte = {"x": 0, "y": 0, "largura": 1, "altura": 1}
    caixa = caixa_do_clipe(transformacao, recorte, (640, 360), (720, 1280))

    conferidos, erros = 0, []
    for y in range(20, 1280, 40):
        for x in range(20, 720, 40):
            esperada = cor_esperada(caixa, (x, y), margem=6)
            if esperada is None:
                continue
            obtida = tuple(int(c) for c in quadro[y, x])
            conferidos += 1
            if max(abs(a - b) for a, b in zip(obtida, esperada, strict=True)) > 48:
                erros.append(((x, y), esperada, obtida))
    assert conferidos > 400
    assert not erros, f"{len(erros)} pontos diferentes da prévia, por exemplo {erros[:5]}"


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_poe_o_texto_no_lugar_da_previa(cliente, db_limpo):
    from core.utils.geometria import LADO_REFERENCIA_TEXTO, caixa_do_texto
    from core.utils.texto import desenhar_texto

    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    projeto = projeto_com(cliente, midia_id)
    texto = {"conteudo": "Oi", "tamanho": 0.15, "fundo_cor": "#00ffff", "fundo_opacidade": 1}
    transformacao = {"x": 0.1, "y": -0.3, "escala": 1.2, "rotacao": 0, "opacidade": 1}
    clipe_texto = {"id": "t1", "midia_id": None, "texto": texto, "inicio": 0, "duracao": 2 * SEGUNDO, "entrada": 0,
                   "transformacao": transformacao}
    faixa_texto = {"id": "ft", "tipo": "texto", "oculta": False, "muda": False, "travada": False,
                   "clipes": [clipe_texto]}
    corpo = {campo: projeto[campo] for campo in ("versao", "nome", "proporcao", "taxa", "fundo")}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json={**corpo, "faixas": [faixa_texto, *projeto["faixas"]]})
    assert salvo.status_code == 200, salvo.text
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    quadro = quadro_do_video(video, 1.0, 720, 1280)
    referencia = desenhar_texto(texto, LADO_REFERENCIA_TEXTO).size
    caixa = caixa_do_texto(transformacao, referencia, (720, 1280))
    # Logo acima da borda de baixo da caixa, no meio: só o fundo do texto, sem letra
    x, y = round(caixa.cx), round(caixa.cy + caixa.altura / 2 - caixa.altura * 0.12)
    assert max(abs(int(a) - b) for a, b in zip(quadro[y, x], (0, 255, 255), strict=True)) <= 40, quadro[y, x]
    # Fora da caixa, à esquerda dela, aparece o fundo do projeto (a imagem fica mais embaixo)
    fora = quadro[round(caixa.cy), max(round(caixa.cx - caixa.largura / 2 - 30), 0)]
    assert max(abs(int(a) - b) for a, b in zip(fora, FUNDO, strict=True)) <= 40, fora


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_anima_o_texto_como_a_previa(cliente, db_limpo):
    from core.utils.geometria import LADO_REFERENCIA_TEXTO, caixa_do_texto
    from core.utils.texto import desenhar_texto

    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    projeto = projeto_com(cliente, midia_id)
    texto = {"conteudo": "Oi", "tamanho": 0.15, "fundo_cor": "#00ffff", "fundo_opacidade": 1}
    transformacao = {"x": 0, "y": -0.3, "escala": 1, "rotacao": 0, "opacidade": 1}
    animacao = {"entrada": {"tipo": "aparecer", "duracao": SEGUNDO}, "saida": {"tipo": "nenhuma", "duracao": 0}}
    clipe_texto = {"id": "t1", "midia_id": None, "texto": texto, "inicio": 0, "duracao": 2 * SEGUNDO, "entrada": 0,
                   "transformacao": transformacao, "animacao": animacao}
    faixa_texto = {"id": "ft", "tipo": "texto", "oculta": False, "muda": False, "travada": False,
                   "clipes": [clipe_texto]}
    corpo = {campo: projeto[campo] for campo in ("versao", "nome", "proporcao", "taxa", "fundo")}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json={**corpo, "faixas": [faixa_texto, *projeto["faixas"]]})
    assert salvo.status_code == 200, salvo.text
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    caixa = caixa_do_texto(transformacao, desenhar_texto(texto, LADO_REFERENCIA_TEXTO).size, (720, 1280))
    x, y = round(caixa.cx), round(caixa.cy + caixa.altura / 2 - caixa.altura * 0.12)
    # Na metade do "aparecer", o ciano está pela metade sobre o magenta do fundo; depois, inteiro
    meio = quadro_do_video(video, 0.5, 720, 1280)[y, x]
    depois = quadro_do_video(video, 1.5, 720, 1280)[y, x]
    assert max(abs(int(a) - b) for a, b in zip(meio, (128, 128, 255), strict=True)) <= 48, meio
    assert max(abs(int(a) - b) for a, b in zip(depois, (0, 255, 255), strict=True)) <= 40, depois


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_aplica_a_cor_e_a_vinheta_da_previa(cliente, db_limpo):
    from core.utils.cor import AJUSTES_NEUTROS, aplicar_cor

    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    cor = {"saturacao": -1, "vinheta": 1}
    projeto = projeto_com(cliente, midia_id, proporcao="16:9", cor=cor)
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    quadro = quadro_do_video(video, 1.0, 1280, 720)
    # Perto do centro do quadrante vermelho (a vinheta quase não pega): o cinza do vermelho
    cinza = round(255 * aplicar_cor((1, 0, 0), {**AJUSTES_NEUTROS, "saturacao": -1})[0])
    ponto = quadro[290, 500]
    assert max(abs(int(c) - cinza) for c in ponto) <= 20, ponto
    # No canto, a vinheta no máximo deixa tudo quase preto
    assert max(int(c) for c in quadro[3, 3]) <= 25, quadro[3, 3]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_faz_a_transicao_escurecer_no_corte(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    base = {"midia_id": midia_id, "velocidade": 1, "volume": 1}
    clipes = [{**base, "id": "a", "inicio": 0, "duracao": SEGUNDO, "entrada": 0,
               "transicao": {"tipo": "escurecer", "duracao": SEGUNDO // 2}},
              {**base, "id": "b", "inicio": SEGUNDO, "duracao": SEGUNDO, "entrada": SEGUNDO}]
    corpo = {"versao": projeto["versao"], "nome": "Transição", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#ff00ff"}, "faixas": [{**projeto["faixas"][0], "clipes": clipes}]}
    assert cliente.put(f"/api/projetos/{projeto['id']}", json=corpo).status_code == 200
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    # Bem no corte, os dois estão apagados: aparece a cor de fundo; longe dele, o vermelho do quadrante
    no_corte = quadro_do_video(video, 1.0, 1280, 720)[180, 320]
    longe = quadro_do_video(video, 0.4, 1280, 720)[180, 320]
    assert max(abs(int(a) - b) for a, b in zip(no_corte, FUNDO, strict=True)) <= 40, no_corte
    assert max(abs(int(a) - b) for a, b in zip(longe, CORES[(0, 0)], strict=True)) <= 40, longe


def som_do_video(caminho) -> np.ndarray:
    """O som do vídeo em mono, 48 kHz, como números de -1 a 1."""
    saida = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(caminho), "-vn",
                            "-ac", "1", "-ar", "48000", "-f", "f32le", "-"],
                           capture_output=True, check=True, timeout=60).stdout
    return np.frombuffer(saida, dtype=np.float32)


def loudness_do_video(caminho) -> float:
    saida = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(caminho), "-vn",
                            "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True, timeout=60).stderr
    return float(saida.rsplit("I:", 1)[1].split("LUFS")[0])


def gerar_tom_longo(caminho):
    """640 × 360, 8 s de cor lisa com um tom de 440 Hz."""
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "color=c=0x0000ff:s=640x360:r=30:d=8",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", str(caminho)], check=True, timeout=120)


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_chega_em_14_lufs_sem_mudar_o_equilibrio(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=8.0, gerar=gerar_tom_longo)
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    base = {"midia_id": midia_id, "velocidade": 1, "duracao": 4 * SEGUNDO}
    # Uma introdução baixa (5%, 26 dB abaixo) e depois o som cheio
    clipes = [{**base, "id": "baixo", "inicio": 0, "entrada": 0, "volume": 0.05},
              {**base, "id": "alto", "inicio": 4 * SEGUNDO, "entrada": 4 * SEGUNDO, "volume": 1}]
    corpo = {"versao": projeto["versao"], "nome": "Volume", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": clipes}]}
    assert cliente.put(f"/api/projetos/{projeto['id']}", json=corpo).status_code == 200
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    assert abs(loudness_do_video(video) - (-14)) <= 1
    som = som_do_video(video)

    def nivel_db(inicio, fim):
        trecho = som[int(inicio * 48000):int(fim * 48000)]
        return 20 * math.log10(float(np.sqrt(np.mean(trecho ** 2))))

    # Como na prévia, a introdução continua 26 dB abaixo. O loudnorm numa passada subia o trecho baixo
    # até perto do resto, e a diferença caía para poucos dB.
    diferenca = nivel_db(5, 7.5) - nivel_db(1, 3.5)
    assert 24 <= diferenca <= 28, diferenca


def gerar_cor(cor: str):
    def gerar(caminho):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                        "-i", f"color=c={cor}:s=640x360:r=30:d=2", "-c:v", "libx264", "-preset", "ultrafast",
                        "-pix_fmt", "yuv420p", str(caminho)], check=True, timeout=120)
    return gerar


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_faz_a_cortina_como_a_previa(cliente, db_limpo):
    cadastrar(cliente)
    vermelho = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, audio=False,
                           gerar=gerar_cor("0xff0000"))
    azul = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, audio=False,
                       gerar=gerar_cor("0x0000ff"))
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    base = {"velocidade": 1, "volume": 1, "entrada": 0, "duracao": SEGUNDO}
    clipes = [{**base, "id": "a", "midia_id": vermelho, "inicio": 0,
               "transicao": {"tipo": "cortina_direita", "duracao": SEGUNDO}},
              {**base, "id": "b", "midia_id": azul, "inicio": SEGUNDO}]
    corpo = {"versao": projeto["versao"], "nome": "Cortina", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": clipes}]}
    assert cliente.put(f"/api/projetos/{projeto['id']}", json=corpo).status_code == 200
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db_limpo, ["renderizacao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]

    doc = db_limpo.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    video = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))
    # No corte (metade da janela de 0,5 a 1,5 s) a cortina revelou 87,5% do azul, da esquerda para a direita
    no_corte = quadro_do_video(video, 1.0, 1280, 720)
    assert no_corte[360, 1000][2] > 200 and no_corte[360, 1000][0] < 50, no_corte[360, 1000]
    assert no_corte[360, 1240][0] > 200 and no_corte[360, 1240][2] < 50, no_corte[360, 1240]
    depois = quadro_do_video(video, 1.8, 1280, 720)
    assert depois[360, 1240][2] > 200 and depois[360, 1240][0] < 50, "depois da janela o azul aparece inteiro"


def _exportar(cliente, db, projeto_id: str):
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto_id, "resolucao": "720p"}).json()
    job = pegar_proximo_job(db, ["renderizacao"], "w-teste")
    assert processar_job(db, job, "w-teste") == "concluido", db.jobs.find_one({"_id": job["_id"]})["erro"]
    doc = db.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    return storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))


def _perto(cor, esperada, tolerancia=40):
    return max(abs(int(a) - b) for a, b in zip(cor, esperada, strict=True)) <= tolerancia


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_segue_os_keyframes_de_posicao_e_opacidade(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    linear = "linear"
    # x vai de -0,25 a +0,25 em 2 s; a escala 0,5 deixa o clipe com 640 × 360 no quadro de 1280 × 720
    keyframes = {"x": [{"t": 0, "valor": -0.25, "curva": linear}, {"t": 2 * SEGUNDO, "valor": 0.25, "curva": linear}]}
    projeto = projeto_com(cliente, midia_id, proporcao="16:9", transformacao={"x": 0, "y": 0, "escala": 0.5,
                                                                            "rotacao": 0, "opacidade": 1},
                          keyframes=keyframes)
    video = _exportar(cliente, db_limpo, projeto["id"])
    # O centro do quadrante vermelho fica 160 px à esquerda e 90 px acima do centro do clipe
    for t, cx in ((0.0, 320), (1.0, 640)):
        quadro = quadro_do_video(video, t, 1280, 720)
        assert _perto(quadro[270, cx - 160], CORES[(0, 0)]), (t, quadro[270, cx - 160])
    assert _perto(quadro_do_video(video, 1.0, 1280, 720)[270, 160], FUNDO), "o clipe já saiu dali"

    opacidade = {"opacidade": [{"t": 0, "valor": 0, "curva": linear}, {"t": 2 * SEGUNDO, "valor": 1, "curva": linear}]}
    projeto = projeto_com(cliente, midia_id, proporcao="16:9", keyframes=opacidade)
    db_limpo.jobs.delete_many({})
    video = _exportar(cliente, db_limpo, projeto["id"])
    # Na metade, o vermelho do quadrante aparece meio a meio com o fundo magenta
    meio = quadro_do_video(video, 1.0, 1280, 720)[180, 320]
    assert _perto(meio, (255, 0, 128), 25), meio
    assert _perto(quadro_do_video(video, 0.0, 1280, 720)[180, 320], FUNDO, 25)


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_aceita_giro_e_escala_com_keyframes(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    fim = 2 * SEGUNDO
    keyframes = {"rotacao": [{"t": 0, "valor": 0, "curva": "suave"}, {"t": fim, "valor": 90, "curva": "linear"}],
                 "escala": [{"t": 0, "valor": 0.3, "curva": "linear"}, {"t": fim, "valor": 0.8, "curva": "linear"}]}
    projeto = projeto_com(cliente, midia_id, proporcao="16:9", keyframes=keyframes)
    video = _exportar(cliente, db_limpo, projeto["id"])
    # No começo o clipe é pequeno e reto: o centro do quadro tem a divisa dos quadrantes, as bordas têm o fundo
    comeco = quadro_do_video(video, 0.0, 1280, 720)
    assert _perto(comeco[30, 30], FUNDO) and _perto(comeco[360 - 40, 640 - 80], CORES[(0, 0)])
    # Em 1,95 s: giro de 89,8° (curva suave) e escala 0,7875 (1008 × 567). O centro do quadrante vermelho,
    # 252 px à esquerda e 142 px acima do centro do clipe, gira no sentido horário para (+142, -252)
    fim_do_giro = quadro_do_video(video, 1.95, 1280, 720)
    assert _perto(fim_do_giro[360 - 252, 640 + 142], CORES[(0, 0)]), fim_do_giro[360 - 252, 640 + 142]
    # Fora do clipe girado (que vai de x = 356 a 924), mas dentro da área do giro: só o fundo, sem rastro
    assert _perto(fim_do_giro[360, 220], FUNDO), fim_do_giro[360, 220]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_repete_os_keyframes_e_treme(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, gerar=gerar_quadrantes)
    # x vai de -0,25 a +0,25 em 0,8 s e repete do começo; y treme 5% do quadro, uma vez por segundo
    keyframes = {"x": [{"t": 0, "valor": -0.25, "curva": "linear"},
                       {"t": round(0.8 * SEGUNDO), "valor": 0.25, "curva": "linear"}]}
    tremor = {"periodo": SEGUNDO, "amplitude": 0.05, "deslocamento": 0}
    projeto = projeto_com(cliente, midia_id, proporcao="16:9",
                          transformacao={"x": 0, "y": 0, "escala": 0.5, "rotacao": 0, "opacidade": 1},
                          keyframes=keyframes, expressoes={"x": {"repetir": "ciclo"}, "y": {"tremer": tremor}})
    video = _exportar(cliente, db_limpo, projeto["id"])
    # Em 1,2 s o ciclo está na metade (x = 0: o clipe de 640 × 360 começa em x = 320); sem repetir, x seria
    # 0,25. O y é o do tremido nesse instante (a conta da prévia), e a borda de cima do clipe anda com ele
    dy = round(valor_com_expressao(None, 0, {"tremer": tremor}, "y", 1.2 * SEGUNDO) * 720)
    assert dy != 0
    quadro = quadro_do_video(video, 1.2, 1280, 720)
    topo = 180 + dy
    assert _perto(quadro[topo + 8, 320 + 8], CORES[(0, 0)]), quadro[topo + 8, 320 + 8]
    assert _perto(quadro[topo - 8, 320 + 8], FUNDO), quadro[topo - 8, 320 + 8]
    assert _perto(quadro[topo + 8, 320 - 8], FUNDO), quadro[topo + 8, 320 - 8]
