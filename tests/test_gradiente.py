# Degradê: os casos que a amostra do painel confere (gradiente.test.ts), o pontilhado e o preenchimento
import json
from pathlib import Path

import numpy as np
import pytest

from core.utils.forma import desenhar_forma
from core.utils.gradiente import cor_no_degrade, imagem_do_degrade, t_do_degrade
from core.utils.texto import TEXTO_PADRAO, desenhar_texto

CASOS = json.loads((Path(__file__).parent / "casos" / "gradiente.json").read_text(encoding="utf-8"))["casos"]


@pytest.mark.parametrize("caso", CASOS, ids=[c["degrade"]["tipo"] + str(len(c["degrade"]["cores"])) for c in CASOS])
def test_conta_igual_a_dos_casos(caso):
    cores = cor_no_degrade(caso["degrade"], np.array(caso["t"]))
    assert np.allclose(cores, caso["cores"], atol=1e-6)
    t = t_do_degrade(caso["degrade"], caso["largura"], caso["altura"], tuple(caso["caixa"]))
    for pixel in caso["pixels"]:
        assert t[pixel["y"], pixel["x"]] == pytest.approx(pixel["t"], abs=1e-9)


def test_pontilhado_nao_desvia_a_cor():
    # Um degradê quase parado (de 100 a 101): a média de cada coluna fica na conta, sem faixas de um nível
    degrade = {"tipo": "linear", "cores": ["#646464", "#656565"], "angulo": 0, "meio": 0.5}
    imagem = np.asarray(imagem_do_degrade(degrade, 64, 64, (0, 0, 64, 64)), dtype=np.float64)
    esperado = cor_no_degrade(degrade, t_do_degrade(degrade, 64, 64, (0, 0, 64, 64)))
    assert abs(imagem.mean() - esperado.mean()) < 0.05
    assert len(np.unique(imagem[:, 32, 0])) == 2, "a coluna do meio mistura os dois níveis"


def test_texto_em_degrade_vai_de_uma_cor_a_outra():
    texto = {**TEXTO_PADRAO, "conteudo": "IIIIIIII", "tamanho": 0.15,
             "degrade": {"tipo": "linear", "cores": ["#ff0000", "#0000ff"], "angulo": 0, "meio": 0.5}}
    imagem = np.asarray(desenhar_texto(texto, 1000))
    opacos = imagem[..., 3] == 255
    colunas = np.where(opacos.any(axis=0))[0]
    esquerda = imagem[:, colunas[:10]][opacos[:, colunas[:10]]]
    direita = imagem[:, colunas[-10:]][opacos[:, colunas[-10:]]]
    assert esquerda[:, 0].mean() > 200 and esquerda[:, 2].mean() < 60
    assert direita[:, 2].mean() > 200 and direita[:, 0].mean() < 60


def test_forma_em_degrade_so_no_preenchimento():
    forma = {"tipo": "retangulo", "cor": "#ffffff", "contorno_cor": "#00ff00", "contorno": 0.05, "proporcao": 2,
             "degrade": {"tipo": "linear", "cores": ["#ff0000", "#0000ff"], "angulo": 0, "meio": 0.5}}
    imagem = np.asarray(desenhar_forma(forma))
    meio = imagem.shape[0] // 2
    linha = imagem[meio]
    assert linha[300][0] > 180 and linha[-300][2] > 180, "vermelho à esquerda, azul à direita"
    # O contorno continua verde nas bordas
    borda = imagem[meio, np.where(imagem[meio, :, 3] == 255)[0][2]]
    assert borda[1] > 200 and borda[0] < 60
    # Sem degradê, o desenho é o de sempre
    sem = {k: v for k, v in forma.items() if k != "degrade"}
    assert desenhar_forma({**sem, "degrade": None}).tobytes() == desenhar_forma(sem).tobytes()
