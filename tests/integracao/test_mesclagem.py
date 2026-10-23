# Os modos de mesclagem que leem o fundo: a cor no vídeo exportado é a conta do shader da prévia,
# fundo × (1 − a) + modo(fundo, camada) × a, canal por canal.
import pytest
from fastapi.testclient import TestClient

from api.main import app
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import (
    SEGUNDO,
    TEM_FFMPEG,
    _exportar,
    criar_midia,
    gerar_cor,
    quadro_do_video,
)

FUNDO = (64, 128, 200)
CAMADA = (200, 96, 40)
OPACIDADE = 0.6
MODOS = {
    "escurecer": min,
    "clarear": max,
    "sobrepor": lambda b, s: 2 * b * s if b < 0.5 else 1 - 2 * (1 - b) * (1 - s),
    "luz_forte": lambda b, s: 2 * b * s if s < 0.5 else 1 - 2 * (1 - b) * (1 - s),
    "diferenca": lambda b, s: abs(b - s),
    "exclusao": lambda b, s: b + s - 2 * b * s,
}


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def esperada(modo: str, fundo, camada) -> tuple[int, ...]:
    conta = MODOS[modo]
    return tuple(round(255 * ((1 - OPACIDADE) * b / 255 + OPACIDADE * conta(b / 255, s / 255)))
                 for b, s in zip(fundo, camada, strict=True))


def _hexa(cor) -> str:
    return "0x" + "".join(f"{canal:02x}" for canal in cor)


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_modos_que_leem_o_fundo_saem_com_a_conta_da_previa(cliente, db_limpo):
    cadastrar(cliente)
    fundo = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=8.0, audio=False,
                        gerar=gerar_cor(_hexa(FUNDO)))
    camada = criar_midia(db_limpo, cliente, largura=640, altura=360, duracao=2.0, audio=False,
                         gerar=gerar_cor(_hexa(CAMADA)))
    projeto = cliente.post("/api/projetos", json={"proporcao": "16:9"}).json()
    base = {"velocidade": 1, "volume": 1, "entrada": 0}
    transformacao = {"x": 0, "y": 0, "escala": 0.5, "rotacao": 20, "opacidade": OPACIDADE}
    sobre = [{**base, "id": modo, "midia_id": camada, "inicio": round(i * 0.5 * SEGUNDO), "duracao": SEGUNDO // 2,
              "transformacao": transformacao, "mesclagem": modo} for i, modo in enumerate(MODOS)]
    # A cor da camada como o vídeo dela sai (a ida e volta do YUV muda uns níveis): um clipe normal e opaco
    sobre.append({**base, "id": "normal", "midia_id": camada, "inicio": 3 * SEGUNDO, "duracao": SEGUNDO // 2,
                  "transformacao": {**transformacao, "opacidade": 1}})
    principal = [{**base, "id": "f", "midia_id": fundo, "inicio": 0, "duracao": 7 * SEGUNDO // 2}]
    corpo = {"versao": projeto["versao"], "nome": "Mesclagem", "proporcao": "16:9", "taxa": projeto["taxa"],
             "fundo": {"cor": "#000000"},
             "faixas": [{"id": "s", "tipo": "video", "clipes": sobre}, {**projeto["faixas"][0], "clipes": principal}]}
    salvo = cliente.put(f"/api/projetos/{projeto['id']}", json=corpo)
    assert salvo.status_code == 200, salvo.text
    video = _exportar(cliente, db_limpo, projeto["id"])
    referencia = quadro_do_video(video, 3.25, 1280, 720)
    cor_da_camada = tuple(int(c) for c in referencia[360, 640])
    cor_do_fundo = tuple(int(c) for c in referencia[40, 40])
    erros = []
    for i, modo in enumerate(MODOS):
        quadro = quadro_do_video(video, i * 0.5 + 0.25, 1280, 720)
        no_meio = tuple(int(c) for c in quadro[360, 640])
        conta = esperada(modo, cor_do_fundo, cor_da_camada)
        # O vídeo final passa pelo YUV 4:2:0 de novo: uns níveis de folga
        if max(abs(a - b) for a, b in zip(no_meio, conta, strict=True)) > 4:
            erros.append((modo, no_meio, conta))
    assert not erros, erros
