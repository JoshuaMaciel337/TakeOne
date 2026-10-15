# Transcrição: as funções puras que preparam as palavras para guardar, e o processo à parte
import importlib.util

import pytest

from core.modelos.transcricao import (
    SEGUNDOS_POR_FATIA,
    aparar_no_silencio,
    fatias_de,
    limpar_palavras,
    palavras_simuladas,
)


def test_palavras_limpas_em_ordem_e_sem_sobreposicao():
    brutas = [
        {"texto": " mundo.", "inicio": 0.6, "fim": 1.0},
        {"texto": " Olá,", "inicio": 0.1, "fim": 0.7},     # passa por cima da seguinte
        {"texto": "   ", "inicio": 1.1, "fim": 1.2},       # vazia
        {"texto": " sem tempo", "inicio": None, "fim": None},
        {"texto": " fim", "inicio": 2.0, "fim": 2.0},      # sem duração
    ]
    assert limpar_palavras(brutas) == [
        {"texto": "Olá,", "inicio": 0.1, "fim": 0.7},
        {"texto": "mundo.", "inicio": 0.7, "fim": 1.0},
        {"texto": "fim", "inicio": 2.0, "fim": 2.01},
    ]


def test_fatias_cobrem_a_midia_inteira():
    assert fatias_de(30) == [(0.0, 30)]
    fatias = fatias_de(SEGUNDOS_POR_FATIA * 2 + 15)
    assert fatias[0] == (0.0, SEGUNDOS_POR_FATIA) and fatias[-1][1] == SEGUNDOS_POR_FATIA * 2 + 15
    assert all(a[1] == b[0] for a, b in zip(fatias, fatias[1:], strict=False))


def test_palavras_simuladas_cabem_na_midia():
    palavras = palavras_simuladas(10)
    assert palavras and palavras[-1]["fim"] <= 10
    assert palavras_simuladas(0.2) == []


@pytest.mark.skipif(importlib.util.find_spec("faster_whisper") is not None, reason="só sem o faster-whisper")
def test_erro_no_processo_da_transcricao_chega_ao_worker(tmp_path):
    from worker.tarefas.transcricao import transcrever_em_outro_processo

    progresso = []
    with pytest.raises(RuntimeError, match="ModuleNotFoundError"):
        transcrever_em_outro_processo(tmp_path / "fala.wav", "pt", 10, lambda p, m: progresso.append(p))


def test_pontas_das_palavras_em_silencio_sao_aparadas():
    # 100 níveis por segundo: fala a -12 dB de 0,5 s a 1,2 s e de 3,0 s a 3,6 s; silêncio (-90 dB) no resto
    niveis = [-90] * 400
    for i in [*range(50, 120), *range(300, 360)]:
        niveis[i] = -12
    # O Whisper esticou "fim." até 2,4 s, dentro da pausa, e começou "Depois" cedo, em 2,7 s
    palavras = [{"texto": "o", "inicio": 0.5, "fim": 0.8}, {"texto": "fim.", "inicio": 0.8, "fim": 2.4},
                {"texto": "Depois", "inicio": 2.7, "fim": 3.6}]
    aparadas = aparar_no_silencio(palavras, niveis, 100)
    assert [(p["inicio"], p["fim"]) for p in aparadas] == [(0.5, 0.8), (0.8, 1.2), (3.0, 3.6)]
    # Nunca some uma palavra: em silêncio total ela fica com o tamanho mínimo
    so_silencio = aparar_no_silencio([{"texto": "x", "inicio": 1.0, "fim": 1.5}], [-90] * 300, 100)
    assert so_silencio[0]["fim"] - so_silencio[0]["inicio"] >= 0.08 - 1e-9
    assert aparar_no_silencio(palavras, [], 100) == palavras
