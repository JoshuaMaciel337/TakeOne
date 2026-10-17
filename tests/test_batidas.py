# Batidas da música: andamento, lugar de cada batida e tempos fortes, em faixas sintéticas de ritmo conhecido
import numpy as np

from core.utils.batidas import TAXA, analisar


def _faixa(bpm: float, segundos: float = 12.0, ruido: float = 0.05,
           desvio_s: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """Um bumbo (seno grave curto) a cada quatro batidas, chimbal (ruído agudo) nas outras, sobre ruído."""
    sorteio = np.random.default_rng(7)
    n = int(segundos * TAXA)
    som = ruido * sorteio.standard_normal(n).astype(np.float32)
    batidas = np.arange(desvio_s, segundos - 0.2, 60.0 / bpm)
    t = np.arange(int(0.12 * TAXA)) / TAXA
    bumbo = np.sin(2 * np.pi * 60 * t) * np.exp(-t * 30)
    chimbal = sorteio.standard_normal(len(t)) * np.exp(-t * 80) * 0.5
    for i, b in enumerate(batidas):
        k = int(b * TAXA)
        golpe = bumbo if i % 4 == 0 else chimbal
        som[k:k + len(golpe)] += golpe[: n - k]
    return som, batidas


def _erro_ms(achadas: list[float], certas: np.ndarray) -> float:
    """A maior distância (ms) de uma batida certa até a achada mais próxima, ignorando a primeira e a última."""
    achadas = np.array(achadas)
    return max(np.min(np.abs(achadas - b)) for b in certas[1:-1]) * 1000


def test_acha_o_andamento_e_as_batidas():
    for bpm in (90.0, 120.0, 128.0, 150.0):
        som, certas = _faixa(bpm, desvio_s=0.13)
        resultado = analisar(som)
        assert abs(resultado["bpm"] - bpm) < 1.5, (bpm, resultado["bpm"])
        assert _erro_ms(resultado["batidas"], certas) < 35, bpm


def test_tempos_fortes_caem_no_bumbo():
    som, certas = _faixa(110.0, segundos=14.0, desvio_s=0.3)
    fortes = np.array(analisar(som)["fortes"])
    bumbos = certas[::4]
    assert len(fortes) >= 4
    assert max(np.min(np.abs(bumbos - f)) for f in fortes) < 0.04


def test_sem_ritmo_nao_inventa():
    assert analisar(np.zeros(TAXA * 10, dtype=np.float32)) == {"bpm": 0.0, "batidas": [], "fortes": []}
    assert analisar(np.ones(TAXA, dtype=np.float32))["batidas"] == []
