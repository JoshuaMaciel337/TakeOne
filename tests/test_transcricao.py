# Transcrição: as funções puras que preparam as palavras para guardar, e o processo à parte
import importlib.util

import pytest

from core.modelos.transcricao import (
    SEGUNDOS_POR_FATIA,
    aparar_no_silencio,
    encaixar_recuperadas,
    fatias_de,
    limpar_palavras,
    palavras_simuladas,
    repete_vizinhas,
    trechos_suspeitos,
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


def _fala(texto: str, inicio: float, passo: float = 0.4) -> list[dict]:
    return [{"texto": w, "inicio": round(inicio + i * passo, 3), "fim": round(inicio + i * passo + 0.3, 3)}
            for i, w in enumerate(texto.split())]


def test_trechos_suspeitos_palavra_longa_e_voz_sem_palavra():
    # Voz (-12 dB) de 0 a 8 s; o resto é silêncio
    niveis = [-12] * 800 + [-90] * 200
    palavras = [*_fala("Essa ferramenta edita", 0.0), {"texto": "vídeos", "inicio": 1.2, "fim": 2.6},
                *_fala("sozinhos dentro do", 2.6)]
    # "vídeos" dura 1,4 s (o ritmo é 0,3 s por palavra curta) e de 3,7 s a 8 s há voz sem palavra
    assert trechos_suspeitos(palavras, niveis, 100, 10.0) == [(1.2, 2.6), (3.7, 10.0)]
    assert trechos_suspeitos(palavras, [-90] * 1000, 100, 10.0) == [], "sem voz nenhuma não há o que rever"


def test_recuperadas_so_entram_se_repetirem_a_fala_vizinha():
    palavras = [*_fala("Essa ferramenta edita", 0.0), {"texto": "vídeos", "inicio": 1.2, "fim": 2.6}]
    retake = _fala("Essa ferramenta edita vídeos", 1.2, 0.35)
    assert repete_vizinhas(retake, palavras, 1.2, 2.6)
    assert not repete_vizinhas(_fala("E aí", 1.2), palavras, 1.2, 2.6), "invenção do Whisper fica de fora"
    juntas = encaixar_recuperadas(palavras, retake, 1.2, 2.6)
    assert [p["texto"] for p in juntas] == ["Essa", "ferramenta", "edita", "Essa", "ferramenta", "edita", "vídeos"]
    # A palavra inventada no fim, por cima de uma palavra que ficou, não entra
    depois = [*palavras, {"texto": "sozinhos", "inicio": 2.6, "fim": 3.0}]
    inventada = [*retake, {"texto": "áudio...", "inicio": 2.62, "fim": 2.8}]
    assert [p["texto"] for p in encaixar_recuperadas(depois, inventada, 1.2, 2.6)][-1] == "sozinhos"
    # Encostar uns centésimos na vizinha não tira a palavra: ela só termina onde a outra começa
    encostada = [*retake[:-1], {"texto": "vídeos", "inicio": 2.25, "fim": 2.85}]
    juntas = encaixar_recuperadas(depois, encostada, 1.2, 2.6)
    assert [p["texto"] for p in juntas][-2:] == ["vídeos", "sozinhos"] and juntas[-2]["fim"] == 2.6
    com_reticencias = [*retake[:-1], {"texto": "vídeos...", "inicio": 2.25, "fim": 2.5}]
    cortada = encaixar_recuperadas(palavras, com_reticencias, 1.2, 2.6)
    assert cortada[-1]["texto"] == "vídeos", "sem as reticências da palavra cortada na borda"
