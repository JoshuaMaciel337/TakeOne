# A nota de cada instante de um vídeo: nitidez, luz, câmera firme e cortes de cena
import numpy as np

from core.utils.qualidade import notas


def _medidas(n=40, nitidez=1500.0, brilho=0.35):
    return np.full(n, nitidez), np.full(n, brilho), np.zeros((n, 2)), np.zeros(n)


def test_imagem_boa_vale_perto_de_um():
    resultado = notas(*_medidas())
    assert min(resultado["nota"]) > 0.95 and not any(resultado["corte"])


def test_borrado_escuro_e_estourado_valem_zero():
    nitidez, brilho, deslocamento, histograma = _medidas()
    nitidez[10:20] = 15          # borrado
    brilho[20:25] = 0.02         # quase preto
    brilho[25:30] = 0.99         # estourado
    nota = notas(nitidez, brilho, deslocamento, histograma)["nota"]
    assert max(nota[10:30]) < 0.01
    assert min(nota[:10] + nota[30:]) > 0.9


def test_video_todo_borrado_nao_vira_nitido_por_comparacao():
    nota = notas(*_medidas(nitidez=20.0))["nota"]
    assert max(nota) < 0.01


def test_tremor_desconta_e_panoramica_suave_nao():
    nitidez, brilho, _, histograma = _medidas()
    panoramica = np.tile([0.01, 0.0], (40, 1))   # 1% da largura por amostra, sempre igual
    assert min(notas(nitidez, brilho, panoramica, histograma)["nota"]) > 0.95
    sorteio = np.random.default_rng(3)
    tremido = sorteio.normal(0, 0.03, (40, 2))
    assert np.mean(notas(nitidez, brilho, tremido, histograma)["nota"]) < 0.4


def test_corte_de_cena_e_marcado_menos_na_primeira_amostra():
    nitidez, brilho, deslocamento, histograma = _medidas()
    histograma[0] = 0.9
    histograma[12] = 0.8
    histograma[30] = 0.2
    corte = notas(nitidez, brilho, deslocamento, histograma)["corte"]
    assert [i for i, v in enumerate(corte) if v] == [12]


def test_sem_amostras():
    assert notas(np.array([]), np.array([]), np.zeros((0, 2)), np.array([])) == {"nota": [], "corte": []}
