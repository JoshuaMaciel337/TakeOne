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
