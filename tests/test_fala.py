# Texto em fala: fonemas, pedaços, pausas e o corte do silêncio; e a voz de verdade, onde o modelo está
import shutil

import numpy as np
import pytest

from core.config import ESPEAK, MODELO_FALA
from core.utils.fala import (
    MAXIMO_DE_FONEMAS,
    PAUSA_FRASE_S,
    PAUSA_VIRGULA_S,
    TAXA,
    aparar,
    dividir,
    fonemas,
    normalizar,
    pausa_depois,
    sintetizar,
    tokens,
)

TEM_ESPEAK = shutil.which(ESPEAK) is not None
TEM_MODELO = TEM_ESPEAK and (MODELO_FALA / "model.onnx").is_file()


def test_preco_e_lido_em_reais():
    assert normalizar("Por  R$ 39,90 hoje") == "Por 39 reais e 90 centavos hoje"
    assert normalizar("R$1 e R$ 1.500,00") == "1 real e 1.500 reais"
    assert normalizar("R$ 2,01") == "2 reais e 1 centavo"


def test_pedacos_cabem_no_modelo_e_cortam_no_fim_da_frase():
    frase = "ˈabc dˈef ɡˈhi. "
    texto = (frase * 60).strip()
    pedacos = dividir(texto)
    assert all(len(p) <= MAXIMO_DE_FONEMAS for p in pedacos)
    assert all(p.endswith(".") for p in pedacos), "corta no fim das frases"
    assert " ".join(pedacos) == texto
    # Pedaços de tamanho parecido: nenhum muito menor que os outros
    tamanhos = [len(p) for p in pedacos]
    assert min(tamanhos) > 0.6 * max(tamanhos)
    # Sem pontuação, corta entre palavras; sem espaço, no meio
    assert all(len(p) <= 20 for p in dividir("abc " * 30, 20))
    assert all(len(p) <= 10 for p in dividir("x" * 25, 10)) and "".join(dividir("x" * 25, 10)) == "x" * 25
    assert dividir("") == []


def test_pausas_e_numeros_dos_fonemas():
    assert pausa_depois("ˈoɪ.") == PAUSA_FRASE_S
    assert pausa_depois("ˈoɪ,") == PAUSA_VIRGULA_S
    assert pausa_depois("ˈoɪ") == 0.0
    assert tokens("ab?c", {"a": 1, "b": 2, "?": 3}) == [1, 2, 3]


def test_silencio_das_pontas_sai():
    t = np.arange(TAXA) / TAXA
    tom = (0.5 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)
    som = np.concatenate([np.zeros(TAXA // 2, np.float32), tom, np.zeros(TAXA // 2, np.float32)])
    cortado = aparar(som)
    assert abs(len(cortado) - TAXA) < 4096
    assert len(aparar(np.zeros(TAXA, np.float32))) == 0


@pytest.mark.skipif(not TEM_ESPEAK, reason="espeak-ng não instalado")
def test_fonemas_com_a_pontuacao_no_lugar():
    ipa = fonemas("Oi, tudo bem? Custa R$ 39,90 — em 2026.")
    assert ipa.startswith("ˈoɪ, tˈudʊ bˈeɪŋ?")
    assert " — " in ipa and ipa.endswith(".")
    # "39,90" não é cortado na vírgula: vira reais e centavos
    assert "xeˈaɪz" in ipa and "sˌeɪŋtˈavʊs" in ipa


@pytest.mark.skipif(not TEM_MODELO, reason="Modelo de voz (Kokoro) ou espeak-ng não instalado")
def test_voz_de_verdade():
    som = sintetizar("Olá, tudo bem? Hoje tem novidade.", MODELO_FALA, "pf_dora")
    segundos = len(som) / TAXA
    assert 1.5 < segundos < 5, segundos
    assert np.abs(som).max() > 0.1
    # Mais rápido fica mais curto
    rapido = sintetizar("Olá, tudo bem? Hoje tem novidade.", MODELO_FALA, "pf_dora", velocidade=1.3)
    assert len(rapido) < len(som) * 0.9
    with pytest.raises(ValueError):
        sintetizar("Oi", MODELO_FALA, "voz_que_nao_existe")
