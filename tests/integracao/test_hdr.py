# HDR do celular: a ingestão marca o PQ ou o HLG, a cópia leve sai em SDR BT.709 e o render passa pelo mesmo filtro
import subprocess

import numpy as np
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from api.main import app
from core.modelos.midia import ARQUIVO_PROXY_VIDEO, chave_arquivo
from core.utils import storage
from core.utils.ffmpeg import resumir_sondagem, sondar
from tests.integracao.test_api import cadastrar
from tests.integracao.test_exportacoes import TEM_FFMPEG, organizacao_de, quadro_do_video
from tests.integracao.test_imagens import SEGUNDO, _exportar, enviar_imagem


@pytest.fixture
def cliente(db_limpo):
    with TestClient(app) as cliente:
        yield cliente


def _video_pq(caminho):
    """2 s de barras de cor gravadas como um celular grava HDR: BT.2020, PQ, 10 bits e marcado."""
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2",
                    "-vf", "format=yuv420p,zscale=tin=bt709:min=bt709:pin=bt709:rin=tv:t=smpte2084:p=bt2020:"
                           "m=bt2020nc:r=tv:npl=100,format=yuv420p10le",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p10le", "-color_primaries", "bt2020",
                    "-color_trc", "smpte2084", "-colorspace", "bt2020nc", "-color_range", "tv",
                    "-f", "mp4", str(caminho)], check=True, timeout=120)


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_video_hdr_vira_sdr_na_copia_leve_e_no_render_igual(cliente, db_limpo):
    cadastrar(cliente)
    organizacao = organizacao_de(cliente)
    midia_id = enviar_imagem(db_limpo, organizacao, "celular.mp4", _video_pq)
    midia = cliente.get(f"/api/midias/{midia_id}").json()
    assert midia["status"] == "pronta"
    salva = db_limpo.midias.find_one({"_id": ObjectId(midia_id)})
    assert salva["video"]["hdr"] == "pq"
    # A cópia leve (o que a prévia mostra) sai em SDR, marcada como BT.709
    proxy = storage.caminho_local(chave_arquivo(organizacao, ObjectId(midia_id), ARQUIVO_PROXY_VIDEO))
    fluxo = next(s for s in sondar(proxy)["streams"] if s["codec_type"] == "video")
    marcas = (fluxo.get("color_transfer"), fluxo.get("color_primaries"), fluxo.get("pix_fmt"))
    assert marcas == ("bt709", "bt709", "yuv420p")
    assert resumir_sondagem(sondar(proxy))["video"]["hdr"] is None
    previa = quadro_do_video(proxy, 1.0, 640, 360).astype(float)
    # O tonemap não apaga nem estoura a imagem: as barras continuam coloridas
    assert 40 < previa.mean() < 200 and previa.std() > 40

    # O render lê o original HDR pelo mesmo filtro: o vídeo exportado fica igual à cópia leve
    clipe = {"id": "c1", "midia_id": str(midia_id), "inicio": 0, "duracao": 2 * SEGUNDO, "entrada": 0,
             "velocidade": 1, "volume": 1}
    video = _exportar(cliente, db_limpo, lambda p: [{**p["faixas"][0], "clipes": [clipe]}], 2.0, proporcao="16:9")
    exportado = quadro_do_video(video, 1.0, 1280, 720).astype(float)
    # A cópia leve tem 640 × 360: compara na resolução dela
    reduzido = exportado.reshape(360, 2, 640, 2, 3).mean(axis=(1, 3))
    diferenca = np.abs(reduzido - previa)
    assert diferenca.mean() < 4, f"exportado a {diferenca.mean():.2f} níveis da cópia leve"
