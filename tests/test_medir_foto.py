# As medidas de cada foto do álbum (onda 16.2): foco, exposição e o vetor; os rostos com os modelos instalados
from pathlib import Path

import numpy as np
import pytest

from core.utils.medir_foto import Modelos, exposicao, foco, medir, reduzida, vetor

cv2 = pytest.importorskip("cv2")
SEM_MODELOS = Path("/nao/existe")


def _cena(semente: int = 1, lado: int = 600) -> np.ndarray:
    """Uma cena com bordas (para o foco): retângulos de cores sorteadas sobre um fundo."""
    sorteio = np.random.default_rng(semente)
    imagem = np.full((lado, lado, 3), 90, np.uint8)
    for _ in range(40):
        x, y = sorteio.integers(0, lado - 60, 2)
        cor = tuple(int(c) for c in sorteio.integers(0, 255, 3))
        cv2.rectangle(imagem, (int(x), int(y)), (int(x) + 50, int(y) + 50), cor, -1)
    return imagem


def test_foco_cai_com_o_desfoque_e_o_melhor_bloco_acha_o_assunto():
    nitida = cv2.cvtColor(_cena(), cv2.COLOR_BGR2GRAY)
    borrada = cv2.GaussianBlur(nitida, (0, 0), 4)
    assert foco(nitida)["geral"] > 10 * foco(borrada)["geral"]
    # Só um canto nítido (o assunto) num fundo borrado: a média cai, o melhor bloco continua alto
    meio = borrada.copy()
    meio[:150, :150] = nitida[:150, :150]
    assert foco(meio)["melhor_bloco"] > 5 * foco(borrada)["melhor_bloco"]


def test_exposicao():
    branca = np.full((100, 100), 255, np.uint8)
    assert exposicao(branca) == {"mediana": 1.0, "estourado": 1.0, "afogado": 0.0}
    metade = np.zeros((100, 100), np.uint8)
    metade[:, 50:] = 128
    e = exposicao(metade)
    assert e["afogado"] == 0.5 and e["estourado"] == 0.0


def test_reduzida_nao_aumenta():
    assert reduzida(np.zeros((300, 200, 3), np.uint8)).shape == (300, 200, 3)
    assert reduzida(np.zeros((3000, 2000, 3), np.uint8)).shape == (1024, 683, 3)


def test_vetor_sem_o_modelo_separa_cenas_diferentes():
    modelos = Modelos(SEM_MODELOS, SEM_MODELOS, SEM_MODELOS, SEM_MODELOS, SEM_MODELOS)
    a, quase_a, b = _cena(1), cv2.GaussianBlur(_cena(1), (0, 0), 1), _cena(7)
    va, vq, vb = vetor(a, modelos), vetor(quase_a, modelos), vetor(b, modelos)
    assert va.shape == (384,) and abs(float(np.linalg.norm(va)) - 1) < 1e-5
    assert float(va @ vq) > float(va @ vb)


def test_medir_sem_modelos_nao_acha_rostos():
    medidas, v, pessoas = medir(_cena(), Modelos(SEM_MODELOS, SEM_MODELOS, SEM_MODELOS, SEM_MODELOS, SEM_MODELOS))
    assert medidas["rostos"] == [] and medidas["com_vetor_do_modelo"] is False and medidas["com_pessoas"] is False
    assert set(medidas) == {"versao", "foco", "exposicao", "rostos", "com_vetor_do_modelo", "com_pessoas"}
    assert v.shape == (384,) and pessoas.shape == (0, 128)


FOTOS = Path(__file__).resolve().parents[1] / "apps/web/public/marca/fotos"


@pytest.mark.skipif(not Modelos().vetor, reason="DINOv2 não instalado")
def test_vetor_do_dinov2_aproxima_a_mesma_cena():
    # Fotos de verdade (as da marca): a mesma foto um pouco mais escura e cortada continua bem mais perto dela do
    # que de outra foto. Em cenas sintéticas (quadrados de cores), o DINOv2 acha tudo parecido, com razão.
    modelos = Modelos()
    a, b = cv2.imread(str(FOTOS / "podcast.jpg")), cv2.imread(str(FOTOS / "gastronomia.jpg"))
    parecida = cv2.convertScaleAbs(a[20:, 20:], alpha=0.85)
    va, vp, vb = vetor(a, modelos), vetor(parecida, modelos), vetor(b, modelos)
    assert float(va @ vp) > 0.92 > float(va @ vb) + 0.1
