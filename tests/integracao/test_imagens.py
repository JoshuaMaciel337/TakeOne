# Imagens na biblioteca, de ponta a ponta: ingestão pelo Pillow, arquivos servidos, projeto e o que é só de vídeo
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from core.modelos.exportacao import ARQUIVO_VIDEO, chave_exportacao
from core.modelos.job import montar_job
from core.modelos.midia import chave_arquivo, montar_midia
from core.utils import storage
from core.utils.fila import enfileirar_job, pegar_proximo_job
from core.utils.geometria import caixa_do_clipe
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import CORES, FUNDO, TEM_FFMPEG, cor_esperada, organizacao_de, quadro_do_video
from worker.worker_principal import processar_job

SEGUNDO = 254_016_000_000


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def enviar_imagem(db, organizacao_id, nome: str, criar) -> ObjectId:
    """Como o tus deixa a mídia ao terminar o envio: original no lugar e a ingestão na fila."""
    midia = montar_midia(organizacao_id, ObjectId(), nome, 1)
    midia["_id"] = db.midias.insert_one(midia).inserted_id
    caminho = storage.caminho_local(chave_arquivo(organizacao_id, midia["_id"], midia["original"]))
    caminho.parent.mkdir(parents=True, exist_ok=True)
    criar(caminho)
    db.midias.update_one({"_id": midia["_id"]}, {"$set": {"status": "processando"}})
    enfileirar_job(db, montar_job("ingestao", organizacao_id, {"midia_id": str(midia["_id"])}))
    job = pegar_proximo_job(db, ["ingestao"], "w-teste")
    assert processar_job(db, job, "w-teste") == "concluido", db.jobs.find_one({"_id": job["_id"]})["erro"]
    return midia["_id"]


def test_imagem_entra_na_biblioteca_e_no_projeto(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)

    def logo(caminho):
        imagem = Image.new("RGBA", (800, 400), (0, 0, 0, 0))
        imagem.paste((255, 98, 74, 255), (200, 100, 600, 300))
        imagem.save(caminho, "PNG")

    midia_id = enviar_imagem(db_limpo, organizacao, "Logo da loja.png", logo)
    midia = cliente.get(f"/api/midias/{midia_id}").json()
    assert midia["status"] == "pronta" and midia["imagem"] is True
    assert midia["duracao"] is None and midia["audio"] is None
    assert (midia["video"]["largura"], midia["video"]["altura"]) == (800, 400) and midia["video"]["transparente"]
    # imagem.png também é servida: a exportação do editor de imagem lê a resolução cheia
    assert set(midia["arquivos"]) == {"proxy.webp", "imagem.png", "capa.jpg", "miniaturas.jpg"}
    resposta = cliente.get(f"/api/midias/{midia_id}/arquivos/proxy.webp")
    assert resposta.status_code == 200 and resposta.headers["content-type"] == "image/webp"

    # Um clipe de imagem pode durar o quanto quiser, mesmo depois de dividido (entrada > 0)
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    clipe = {"id": "c1", "midia_id": str(midia_id), "inicio": 0, "duracao": 600 * SEGUNDO, "entrada": 30 * SEGUNDO,
             "velocidade": 1, "volume": 1}
    corpo = {"versao": projeto["versao"], "nome": "Com imagem", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"}, "faixas": [{**projeto["faixas"][0], "clipes": [clipe]}]}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert salvo.status_code == 200, salvo.text
    # Mas não numa faixa de áudio: ela não tem som
    corpo["versao"] = salvo.json()["versao"]
    corpo["faixas"].append({"id": "a1", "tipo": "audio", "oculta": False, "muda": False, "travada": False,
                            "clipes": [{**clipe, "id": "c2"}]})
    assert cliente.put(f"/api/projetos/{projeto['id']}", json=corpo).status_code == 422

    # O que é só de vídeo recusa a imagem com uma mensagem clara
    for rota in ("limpeza-imagem", "rosto", "transcricao", "batidas", "voz-limpa"):
        resposta = cliente.post(f"/api/midias/{midia_id}/{rota}", json={})
        assert resposta.status_code in (409, 422), (rota, resposta.status_code)
    # O recorte do fundo vale também em imagens (o editor de imagem)
    assert cliente.post(f"/api/midias/{midia_id}/recorte-fundo").status_code == 200


def test_imagem_que_nao_abre_vira_erro(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    midia = montar_midia(organizacao, ObjectId(), "quebrada.jpg", 1)
    midia["_id"] = db_limpo.midias.insert_one(midia).inserted_id
    caminho = storage.caminho_local(chave_arquivo(organizacao, midia["_id"], midia["original"]))
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"nao e uma foto" * 50)
    enfileirar_job(db_limpo, montar_job("ingestao", organizacao, {"midia_id": str(midia["_id"])}))
    job = pegar_proximo_job(db_limpo, ["ingestao"], "w-teste")
    assert processar_job(db_limpo, job, "w-teste") == "erro"
    salva = db_limpo.midias.find_one({"_id": midia["_id"]})
    assert salva["status"] == "erro" and "não é uma imagem válida" in salva["erro"]


# -----------------------------------------------
# Render de verdade: a imagem no lugar da geometria (a mesma conta da prévia), do começo ao fim
# -----------------------------------------------
def _quadrantes_png(caminho):
    """640 × 360 nas cores dos quadrantes do teste de vídeo (test_exportacoes.CORES)."""
    imagem = Image.new("RGB", (640, 360))
    for (cx, cy), cor in CORES.items():
        imagem.paste(cor, (cx * 320, cy * 180, cx * 320 + 320, cy * 180 + 180))
    imagem.save(caminho, "PNG")


def _exportar(cliente, db, corpo_faixas, duracao_s, proporcao="9:16"):
    projeto = cliente.post("/api/projetos", json={"proporcao": proporcao}).json()
    corpo = {"versao": projeto["versao"], "nome": "Imagem", "proporcao": proporcao, "taxa": projeto["taxa"],
             "fundo": {"cor": "#{:02x}{:02x}{:02x}".format(*FUNDO)}, "faixas": corpo_faixas(projeto)}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert salvo.status_code == 200, salvo.text
    exportacao = cliente.post("/api/exportacoes", json={"projeto_id": projeto["id"], "resolucao": "720p"}).json()
    job = pegar_proximo_job(db, ["renderizacao"], "w-teste")
    assert processar_job(db, job, "w-teste") == "concluido", db.jobs.find_one({"_id": job["_id"]})["erro"]
    pronta = cliente.get(f"/api/exportacoes/{exportacao['id']}").json()
    assert abs(pronta["duracao"] - duracao_s) < 0.1
    doc = db.exportacoes.find_one({"_id": ObjectId(exportacao["id"])})
    return storage.caminho_local(chave_exportacao(doc["organizacao_id"], doc["_id"], ARQUIVO_VIDEO))


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_poe_a_imagem_no_lugar_da_previa_do_comeco_ao_fim(cliente, db_limpo):
    cadastrar(cliente)
    midia_id = enviar_imagem(db_limpo, organizacao_de(cliente), "quadrantes.png", _quadrantes_png)
    transformacao = {"x": 0.1, "y": -0.15, "escala": 0.6, "rotacao": 30, "opacidade": 1}
    # Velocidade e entrada guardadas no clipe não valem para a imagem: ela dura o clipe inteiro
    clipe = {"id": "c1", "midia_id": str(midia_id), "inicio": 0, "duracao": 3 * SEGUNDO, "entrada": 30 * SEGUNDO,
             "velocidade": 2, "volume": 1, "transformacao": transformacao}
    video = _exportar(cliente, db_limpo, lambda p: [{**p["faixas"][0], "clipes": [clipe]}], 3.0)
    caixa = caixa_do_clipe(transformacao, {"x": 0, "y": 0, "largura": 1, "altura": 1}, (640, 360), (720, 1280))
    for instante in (0.1, 1.5, 2.9):
        quadro = quadro_do_video(video, instante, 720, 1280)
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
        assert not erros, f"{instante} s: {len(erros)} pontos diferentes da prévia, por exemplo {erros[:5]}"


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_logo_transparente_deixa_ver_o_que_esta_embaixo(cliente, db_limpo):
    cadastrar(cliente)

    def logo(caminho):
        imagem = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
        imagem.paste((0, 255, 0, 255), (100, 100, 300, 300))
        imagem.save(caminho, "PNG")

    midia_id = enviar_imagem(db_limpo, organizacao_de(cliente), "logo.png", logo)
    clipe = {"id": "l1", "midia_id": str(midia_id), "inicio": 0, "duracao": 2 * SEGUNDO, "entrada": 0,
             "velocidade": 1, "volume": 1}
    video = _exportar(cliente, db_limpo, lambda p: [{**p["faixas"][0], "clipes": [clipe]}], 2.0, proporcao="1:1")
    quadro = quadro_do_video(video, 1.0, 720, 720)
    # A imagem cabe no quadro (720 × 720): o quadrado verde no meio, o fundo do projeto em volta
    assert max(abs(int(a) - b) for a, b in zip(quadro[360, 360], (0, 255, 0), strict=True)) < 40
    for ponto in ((60, 60), (660, 360), (360, 680)):
        obtido = quadro[ponto[1], ponto[0]]
        assert max(abs(int(a) - b) for a, b in zip(obtido, FUNDO, strict=True)) < 40, (ponto, obtido)


def test_bmp_gif_animado_e_tiff_de_16_bits_entram_como_fotos(cliente, db_limpo):
    import numpy as np

    from tests.integracao.test_exportacoes import organizacao_de

    cadastrar(cliente)
    org = organizacao_de(cliente)

    def bmp(caminho):
        Image.new("RGB", (64, 48), (200, 30, 30)).save(caminho, "BMP")

    def gif(caminho):
        quadros = [Image.new("RGB", (40, 30), cor) for cor in ((0, 200, 0), (0, 0, 200))]
        quadros[0].save(caminho, "GIF", save_all=True, append_images=quadros[1:], duration=100)

    def tiff(caminho):
        Image.fromarray(np.full((20, 30), 40000, np.uint16)).save(caminho, "TIFF")

    for nome, criar, tamanho in (("a.bmp", bmp, (64, 48)), ("b.gif", gif, (40, 30)), ("c.tif", tiff, (30, 20))):
        midia = cliente.get(f"/api/midias/{enviar_imagem(db_limpo, org, nome, criar)}").json()
        assert midia["status"] == "pronta" and midia["imagem"], (nome, midia.get("erro"))
        assert (midia["video"]["largura"], midia["video"]["altura"]) == tamanho, nome


def test_imagem_aberta_como_documento(cliente, db_limpo):
    from tests.integracao.test_exportacoes import organizacao_de

    cadastrar(cliente)
    org = organizacao_de(cliente)

    def foto(caminho):
        Image.new("RGBA", (300, 200), (10, 120, 230, 128)).save(caminho, "PNG")

    midia_id = str(enviar_imagem(db_limpo, org, "Logo da loja.png", foto))
    aberta = cliente.post("/api/projetos/da-imagem", json={"midia_id": midia_id})
    assert aberta.status_code == 201, aberta.text
    projeto = aberta.json()
    assert projeto["tipo"] == "imagem" and projeto["nome"] == "Logo da loja"
    assert projeto["tamanho"] == {"largura": 300, "altura": 200} and projeto["fundo"]["transparente"]
    camada = projeto["faixas"][0]["clipes"][0]
    assert camada["midia_id"] == midia_id and camada["transformacao"]["escala"] == 1
    # O documento abre e salva como qualquer outro
    campos = ("versao", "nome", "proporcao", "taxa", "fundo", "tamanho", "faixas")
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json={k: projeto[k] for k in campos})
    assert salvo.status_code == 200, salvo.text
    assert cliente.delete(f"/api/midias/{midia_id}").status_code == 409


def test_tamanho_do_documento_aberto():
    from core.modelos.projeto import tamanho_para_documento

    assert tamanho_para_documento(300, 200) == {"largura": 300, "altura": 200}
    assert tamanho_para_documento(16000, 4000)["largura"] == 8192
    grande = tamanho_para_documento(9000, 9000)
    assert grande["largura"] * grande["altura"] <= 36_000_000
