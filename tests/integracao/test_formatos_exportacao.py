# Exportar em outros formatos: o quadro em PNG, o GIF, só o som e outra taxa de quadros. Todos saem do
# mesmo grafo do vídeo, então o PNG tem de ser o quadro do MP4 e o som tem de chegar em -14 LUFS.
import json
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from core.modelos.exportacao import arquivo_do_formato, chave_exportacao
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import (
    SEGUNDO,
    TEM_FFMPEG,
    criar_midia,
    gerar_cor,
    gerar_tom_longo,
    loudness_do_video,
    quadro_do_video,
)
from worker.worker_principal import processar_job


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _projeto(cliente, clipes, nome="Formatos"):
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    corpo = {"versao": projeto["versao"], "nome": nome, "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": clipes}]}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert salvo.status_code == 200, salvo.text
    return projeto["id"]


def _exportar(cliente, db, projeto_id, **pedido):
    resposta = cliente.post("/api/exportacoes", json={"projeto_id": projeto_id, "resolucao": "720p", **pedido})
    assert resposta.status_code == 201, resposta.text
    job = pegar_proximo_job(db, ["renderizacao"], "w-teste")
    situacao = processar_job(db, job, "w-teste")
    doc = db.exportacoes.find_one({"_id": ObjectId(resposta.json()["id"])})
    arquivo = storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"],
                                                     arquivo_do_formato(doc.get("formato"))))
    return situacao, doc, arquivo


def _sondar(arquivo) -> dict:
    saida = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(arquivo)],
                           capture_output=True, text=True, check=True, timeout=60).stdout
    return json.loads(saida)


def _tres_clipes(cliente, db):
    vermelho = criar_midia(db, cliente, largura=640, altura=360, duracao=2.0, audio=False,
                           gerar=gerar_cor("0xff0000"))
    azul = criar_midia(db, cliente, largura=640, altura=360, duracao=2.0, audio=False, gerar=gerar_cor("0x0000ff"))
    base = {"velocidade": 1, "volume": 1, "entrada": 0, "duracao": 2 * SEGUNDO}
    return [{**base, "id": "a", "midia_id": vermelho, "inicio": 0},
            {**base, "id": "b", "midia_id": azul, "inicio": 2 * SEGUNDO,
             "transicao": {"tipo": "cortina_direita", "duracao": SEGUNDO}},
            {**base, "id": "c", "midia_id": vermelho, "inicio": 4 * SEGUNDO,
             "transformacao": {"x": 0.2, "y": 0, "escala": 0.5, "rotacao": 15, "opacidade": 1}}]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_quadro_em_png_e_o_quadro_do_video(cliente, db_limpo):
    cadastrar(cliente)
    projeto_id = _projeto(cliente, _tres_clipes(cliente, db_limpo))
    situacao, _, video = _exportar(cliente, db_limpo, projeto_id)
    assert situacao == "concluido"
    # No corte da cortina (4 s) e no meio do último clipe, girado e menor (5,2 s)
    for segundos in (4.0, 5.2):
        situacao, doc, png = _exportar(cliente, db_limpo, projeto_id, formato="png", tempo=round(segundos * SEGUNDO))
        assert situacao == "concluido", doc.get("erro")
        assert doc["arquivos"] == ["quadro.png"] and doc["duracao"] is None
        quadro = np.asarray(Image.open(png).convert("RGB"), dtype=np.float64)
        assert quadro.shape == (720, 1280, 3)
        do_video = quadro_do_video(video, segundos, 1280, 720).astype(np.float64)
        diferenca = np.abs(quadro - do_video).mean()
        # O vídeo passa pelo YUV 4:2:0; o PNG sai direto do RGB da montagem
        assert diferenca < 3, f"{segundos} s: {diferenca:.2f} níveis"
    baixado = cliente.get(f"/api/exportacoes/{doc['_id']}/arquivos/quadro.png?baixar=true")
    assert baixado.headers["content-type"] == "image/png"
    assert 'filename="formatos.png"' in baixado.headers["content-disposition"]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_gif_e_outra_taxa_de_quadros(cliente, db_limpo):
    cadastrar(cliente)
    projeto_id = _projeto(cliente, _tres_clipes(cliente, db_limpo))
    situacao, doc, gif = _exportar(cliente, db_limpo, projeto_id, formato="gif", taxa=10)
    assert situacao == "concluido", doc.get("erro")
    assert (doc["largura"], doc["altura"], doc["resolucao"]) == (854, 480, "480p")
    with Image.open(gif) as imagem:
        assert imagem.format == "GIF" and imagem.size == (854, 480)
        assert 58 <= imagem.n_frames <= 61, imagem.n_frames
        assert imagem.info.get("loop") == 0
        imagem.seek(5)
        r, g, b = imagem.convert("RGB").getpixel((427, 240))
        assert r > 200 and b < 60, (r, g, b)

    situacao, doc, video = _exportar(cliente, db_limpo, projeto_id, taxa=60)
    assert situacao == "concluido", doc.get("erro")
    fluxo = next(f for f in _sondar(video)["streams"] if f["codec_type"] == "video")
    assert fluxo["r_frame_rate"] == "60/1" and 359 <= int(fluxo["nb_frames"]) <= 361


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_so_o_som_em_m4a_e_wav(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=8.0, gerar=gerar_tom_longo)
    texto = {"id": "t", "midia_id": None, "inicio": 0, "duracao": 2 * SEGUNDO, "entrada": 0, "velocidade": 1,
             "volume": 1, "texto": {"conteudo": "Olá"}}
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    clipe = {"id": "v", "midia_id": midia_id, "inicio": 0, "duracao": 6 * SEGUNDO, "entrada": 0, "velocidade": 1,
             "volume": 0.3}
    faixas = [{"id": "tx", "tipo": "texto", "clipes": [texto]}, {**projeto["faixas"][0], "clipes": [clipe]}]
    corpo = {"versao": projeto["versao"], "nome": "Só o som", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": faixas}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert salvo.status_code == 200, salvo.text

    situacao, doc, m4a = _exportar(cliente, db_limpo, projeto["id"], formato="m4a")
    assert situacao == "concluido", doc.get("erro")
    sondado = _sondar(m4a)
    assert [f["codec_type"] for f in sondado["streams"]] == ["audio"]
    assert 5.9 < float(sondado["format"]["duration"]) < 6.1
    assert abs(loudness_do_video(m4a) - (-14)) <= 1
    assert not list(m4a.parent.glob("texto_*.png")), "o som não desenha os textos"

    situacao, doc, wav = _exportar(cliente, db_limpo, projeto["id"], formato="wav")
    assert situacao == "concluido", doc.get("erro")
    fluxo = _sondar(wav)["streams"][0]
    assert (fluxo["codec_name"], fluxo["sample_rate"]) == ("pcm_s24le", "48000")
    assert abs(loudness_do_video(wav) - (-14)) <= 1


def test_pedidos_que_nao_fazem_sentido(cliente, db_limpo):
    cadastrar(cliente)
    mudo = criar_midia(db_limpo, cliente, duracao=40.0, audio=False)
    base = {"velocidade": 1, "volume": 1, "entrada": 0, "midia_id": mudo, "inicio": 0}
    curto = _projeto(cliente, [{**base, "id": "a", "duracao": 4 * SEGUNDO}])
    longo = _projeto(cliente, [{**base, "id": "a", "duracao": 35 * SEGUNDO}])

    def pedir(projeto_id, **pedido):
        return cliente.post("/api/exportacoes", json={"projeto_id": projeto_id, **pedido})

    assert pedir(curto, formato="png").status_code == 422, "o quadro precisa do instante"
    assert pedir(curto, formato="png", tempo=4 * SEGUNDO).status_code == 422, "depois do fim"
    assert pedir(longo, formato="gif").status_code == 422
    assert "30 s" in pedir(longo, formato="gif").json()["detail"]
    assert pedir(curto, formato="gif", taxa=60).status_code == 422
    assert pedir(curto, formato="mp4", taxa=15).status_code == 422
    assert pedir(curto, formato="mp4", taxa=50).status_code == 201
