# Transcrição: as funções puras que preparam as palavras para guardar
from core.modelos.transcricao import SEGUNDOS_POR_FATIA, fatias_de, limpar_palavras, palavras_simuladas


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
