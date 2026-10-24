# Vídeo gerado com IA: pedir, gerar (no modo simulado, sem o ComfyUI) e passar pela ingestão como um envio
import shutil
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from core.modelos.midia import chave_arquivo
from core.utils import storage
from core.utils.fila import pegar_proximo_job
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import organizacao_de
from tests.integracao.test_imagens import enviar_imagem
from worker.worker_principal import processar_job

TEM_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def test_pedido_invalido_e_recusado(cliente):
    cadastrar(cliente)
    assert cliente.post("/api/midias/gerar-video", json={"descricao": "  a "}).status_code == 422
    assert cliente.post("/api/midias/gerar-video", json={"descricao": "Mar", "formato": "4:3"}).status_code == 422
    assert cliente.post("/api/midias/gerar-video", json={"descricao": "Mar", "duracao": 9}).status_code == 422


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_video_gerado_entra_na_biblioteca_pela_ingestao(cliente, db_limpo):
    cadastrar(cliente)
    pedido = {"descricao": "Ondas do mar ao pôr do sol, câmera lenta", "formato": "9:16", "duracao": 2}
    resposta = cliente.post("/api/midias/gerar-video", json=pedido)
    assert resposta.status_code == 201
    midia = resposta.json()
    assert midia["nome"] == "IA · Ondas do mar ao pôr do sol" and midia["status"] == "processando"
    assert midia["gerada"] == {"descricao": "Ondas do mar ao pôr do sol, câmera lenta", "formato": "9:16", "duracao": 2,
                               "imagem_id": None}
    assert midia["processamento"]["status"] == "pendente"

    job = pegar_proximo_job(db_limpo, ["geracao_video"], "w-teste")
    assert job["entrada"]["midia_id"] == midia["id"] and isinstance(job["entrada"]["semente"], int)
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    # Gerado, a mídia segue na fila da ingestão, que mostra o progresso dela
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "processando" and vista["tamanho_total"] > 0

    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert ingestao["entrada"]["midia_id"] == midia["id"]
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta"
    assert (vista["video"]["largura"], vista["video"]["altura"]) == (480, 832)
    assert abs(vista["duracao"] - 2) < 0.1
    assert "proxy.mp4" in vista["arquivos"] and "capa.jpg" in vista["arquivos"]


def test_excluir_durante_a_geracao_cancela_o_job(cliente, db_limpo):
    cadastrar(cliente)
    midia = cliente.post("/api/midias/gerar-video", json={"descricao": "Floresta com neblina"}).json()
    assert cliente.delete(f"/api/midias/{midia['id']}").status_code == 204
    assert pegar_proximo_job(db_limpo, ["geracao_video"], "w-teste") is None


def _faixas(caminho):
    """Deitada, em três faixas: vermelho, verde e azul. Num vídeo 1:1, a do meio fica no centro."""
    faixas = Image.new("RGB", (1200, 600), (220, 30, 30))
    faixas.paste((30, 200, 60), (400, 0, 800, 600))
    faixas.paste((30, 60, 220), (800, 0, 1200, 600))
    faixas.save(caminho, "PNG")


def test_imagem_que_nao_serve_e_recusada(cliente, db_limpo):
    cadastrar(cliente)
    pedido = {"descricao": "A câmera se aproxima", "imagem_id": "0" * 24}
    assert cliente.post("/api/midias/gerar-video", json=pedido).status_code == 404
    assert cliente.post("/api/midias/gerar-video", json={**pedido, "imagem_id": "nao-e-id"}).status_code == 404
    # Uma mídia que não é imagem (o próprio vídeo gerado, ainda processando)
    video = cliente.post("/api/midias/gerar-video", json={"descricao": "Mar"}).json()
    resposta = cliente.post("/api/midias/gerar-video", json={**pedido, "imagem_id": video["id"]})
    assert resposta.status_code == 409 and "imagem" in resposta.json()["detail"]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_video_a_partir_de_uma_imagem_comeca_nela(cliente, db_limpo):
    cadastrar(cliente)
    imagem_id = enviar_imagem(db_limpo, organizacao_de(cliente), "faixas.png", _faixas)
    pedido = {"descricao": "A câmera se aproxima devagar", "formato": "1:1", "duracao": 2, "imagem_id": str(imagem_id)}
    midia = cliente.post("/api/midias/gerar-video", json=pedido).json()
    assert midia["gerada"]["imagem_id"] == str(imagem_id)
    job = pegar_proximo_job(db_limpo, ["geracao_video"], "w-teste")
    assert job["entrada"]["imagem_id"] == str(imagem_id)
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta" and (vista["video"]["largura"], vista["video"]["altura"]) == (640, 640)

    # O primeiro quadro (no modo simulado, todos) é a imagem cobrindo o quadrado: verde no meio, faixas dos lados
    doc = db_limpo.midias.find_one({"_id": ObjectId(midia["id"])})
    original = storage.caminho_local(chave_arquivo(doc["organizacao_id"], doc["_id"], doc["original"]))
    bruto = subprocess.run(["ffmpeg", "-v", "error", "-i", str(original), "-frames:v", "1", "-f", "rawvideo",
                            "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    quadro = np.frombuffer(bruto, np.uint8).reshape(640, 640, 3).astype(int)
    for (x, y), cor in (((320, 320), (30, 200, 60)), ((60, 320), (220, 30, 30)), ((580, 320), (30, 60, 220))):
        assert np.abs(quadro[y, x] - cor).max() < 30, ((x, y), quadro[y, x])
    assert not list(original.parent.glob("quadro_inicial*")), "o quadro temporário fica apagado"

    # Imagem excluída antes de o worker pegar o pedido: erro claro na mídia
    outro = cliente.post("/api/midias/gerar-video", json=pedido).json()
    assert cliente.delete(f"/api/midias/{imagem_id}").status_code == 204
    job = pegar_proximo_job(db_limpo, ["geracao_video"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "erro"
    assert "imagem escolhida foi excluída" in cliente.get(f"/api/midias/{outro['id']}").json()["erro"]


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_imagem_gerada_entra_na_biblioteca_como_foto(cliente, db_limpo):
    cadastrar(cliente)
    assert cliente.post("/api/midias/gerar-imagem", json={"descricao": "Mar", "formato": "3:2"}).status_code == 422
    resposta = cliente.post("/api/midias/gerar-imagem", json={"descricao": "Um farol na neblina, fotografia",
                                                               "formato": "4:5"})
    assert resposta.status_code == 201, resposta.text
    midia = resposta.json()
    assert midia["nome"] == "IA · Um farol na neblina" and midia["gerada"]["duracao"] is None
    job = pegar_proximo_job(db_limpo, ["geracao_imagem"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
    ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    vista = cliente.get(f"/api/midias/{midia['id']}").json()
    assert vista["status"] == "pronta" and vista["imagem"]
    assert (vista["video"]["largura"], vista["video"]["altura"]) == (896, 1120)


def test_fluxo_da_imagem_e_o_do_video_com_um_quadro():
    from core.modelos.geracao import PASSOS_DA_IMAGEM, arquivo_gerado, montar_fluxo_da_imagem

    fluxo = montar_fluxo_da_imagem("Um farol", "9:16", 7, "takeone_x")
    assert fluxo["7"]["inputs"] | {"vae": None} == {"vae": None, "width": 704, "height": 1280, "length": 1,
                                                    "batch_size": 1}
    assert fluxo["8"]["inputs"]["steps"] == PASSOS_DA_IMAGEM and fluxo["8"]["inputs"]["seed"] == 7
    assert fluxo["11"] == {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "takeone_x"}}
    assert "10" not in fluxo
    salvo = {"filename": "takeone_x_00001_.png", "subfolder": "", "type": "output"}
    historico = {"outputs": {"11": {"images": [salvo]}}}
    assert arquivo_gerado(historico, ".png")["filename"] == "takeone_x_00001_.png"
    assert arquivo_gerado(historico) is None


def _recorte_com_buraco(largura=320, altura=200) -> str:
    """Um recorte em PNG (base64): metade azul, metade laranja, com um buraco transparente no meio."""
    import base64
    import io

    imagem = Image.new("RGBA", (largura, altura), (30, 60, 200, 255))
    imagem.paste((240, 140, 40, 255), (largura // 2, 0, largura, altura))
    imagem.paste((0, 0, 0, 0), (largura // 2 - 30, altura // 2 - 30, largura // 2 + 30, altura // 2 + 30))
    saida = io.BytesIO()
    imagem.save(saida, "PNG")
    return "data:image/png;base64," + base64.b64encode(saida.getvalue()).decode()


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_preenchimento_gera_as_variacoes_iguais_ao_recorte_fora_da_area(cliente, db_limpo):
    import base64
    import io

    cadastrar(cliente)
    # Sem área a preencher, base64 estragado, variações demais
    opaca = io.BytesIO()
    Image.new("RGBA", (64, 64), (10, 20, 30, 255)).save(opaca, "PNG")
    pedir = lambda corpo: cliente.post("/api/midias/preencher", json=corpo)  # noqa: E731
    assert pedir({"imagem": base64.b64encode(opaca.getvalue()).decode()}).status_code == 422
    assert pedir({"imagem": "nao-e-base64!!!!"}).status_code == 422
    assert pedir({"imagem": _recorte_com_buraco(), "variacoes": 4}).status_code == 422
    resposta = pedir({"imagem": _recorte_com_buraco(), "descricao": "Um barco, à noite", "variacoes": 2})
    assert resposta.status_code == 201, resposta.text
    midias = resposta.json()
    assert len(midias) == 2 and midias[0]["nome"] == "IA · Preenchimento · Um barco"
    assert midias[0]["status"] == "processando"
    sementes = set()
    for _ in midias:
        job = pegar_proximo_job(db_limpo, ["preenchimento"], "w-teste")
        sementes.add(job["entrada"]["semente"])
        resultado = processar_job(db_limpo, job, "w-teste")
        assert resultado == "concluido", db_limpo.jobs.find_one({"_id": job["_id"]})["erro"]
        ingestao = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
        assert processar_job(db_limpo, ingestao, "w-teste") == "concluido"
    assert len(sementes) == 2
    vista = cliente.get(f"/api/midias/{midias[0]['id']}").json()
    assert vista["status"] == "pronta" and vista["imagem"]
    assert (vista["video"]["largura"], vista["video"]["altura"]) == (320, 200)
    # Uma camada só com a área (transparente fora); dentro, a cor da volta (no modo simulado)
    org = organizacao_de(cliente)
    doc = db_limpo.midias.find_one({"_id": ObjectId(midias[0]["id"])})
    original = storage.caminho_local(chave_arquivo(org, doc["_id"], doc["original"]))
    pixels = np.asarray(Image.open(original).convert("RGBA")).astype(int)
    assert pixels[10, 10, 3] == 0 and pixels[10, 300, 3] == 0 and pixels[100, 160, 3] == 255
    assert np.abs(pixels[100, 160, :3] - (np.array([30, 60, 200]) + np.array([240, 140, 40])) / 2).max() < 40
    assert 0 < pixels[100, 160 - 33, 3] < 255
    # Mais variações do mesmo recorte e do mesmo texto; de uma mídia que não é preenchimento, não
    mais = cliente.post(f"/api/midias/{midias[0]['id']}/variacoes", json={"variacoes": 1})
    assert mais.status_code == 201, mais.text
    assert mais.json()[0]["nome"] == "IA · Preenchimento · Um barco" and mais.json()[0]["gerada"]["preenchimento"]
    job = pegar_proximo_job(db_limpo, ["preenchimento"], "w-teste")
    assert job["entrada"]["descricao"] == "Um barco, à noite"
    assert processar_job(db_limpo, job, "w-teste") == "concluido"
    imagem = enviar_imagem(db_limpo, org, "comum.png", _faixas)
    assert cliente.post(f"/api/midias/{imagem}/variacoes", json={}).status_code == 409


def test_fluxo_do_preenchimento_e_o_vace_com_a_mascara():
    from core.modelos.geracao import montar_fluxo_do_preenchimento, tamanho_do_preenchimento

    assert tamanho_do_preenchimento(832, 480) == (832, 480)
    # O recorte pequeno cresce até a área do modelo, na mesma proporção
    assert tamanho_do_preenchimento(160, 224) == (528, 752)
    assert tamanho_do_preenchimento(2000, 1000) == (896, 448)
    assert tamanho_do_preenchimento(4000, 500) == (1024, 128)
    fluxo = montar_fluxo_do_preenchimento("", "entrada.png", 640, 352, 9, "takeone_y")
    assert fluxo["1"]["inputs"]["unet_name"] == "wan2.1_vace_1.3B_fp16.safetensors"
    assert fluxo["7"]["inputs"]["control_masks"] == ["14", 0] and fluxo["7"]["inputs"]["length"] == 1
    assert fluxo["14"]["inputs"]["mask"] == ["12", 1] and fluxo["8"]["inputs"]["seed"] == 9
    assert "sem pessoas" in fluxo["5"]["inputs"]["text"] and "figura humana" in fluxo["6"]["inputs"]["text"]
    from core.modelos.geracao import montar_fluxo_do_vace_inteiro

    inteiro = montar_fluxo_do_vace_inteiro("aquarela", "foto.png", 640, 352, 3, "takeone_z", "neon")
    assert inteiro["14"]["class_type"] == "SolidMask" and inteiro["7"]["inputs"]["control_video"] == ["12", 0]
    assert "16" not in inteiro and inteiro["6"]["inputs"]["text"].endswith(", neon")
    com_texto = montar_fluxo_do_preenchimento("um barco", "entrada.png", 640, 352, 9, "takeone_y")
    assert com_texto["5"]["inputs"]["text"] == "um barco" and "figura humana" not in com_texto["6"]["inputs"]["text"]
