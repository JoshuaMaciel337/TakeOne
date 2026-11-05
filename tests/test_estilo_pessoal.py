# O estilo pessoal (onda 16.7): aprender a diferença sobre o "Melhorar" pelos vizinhos e pelo boosting
import numpy as np
import pytest

from core.modelos.estilo_pessoal import (
    Boosting,
    Par,
    cor_prevista,
    prever_pelos_vizinhos,
    quanto_acompanha,
    vizinhos,
)


def _vetor(cena: int, semente: int) -> np.ndarray:
    v = np.zeros(384, np.float32)
    v[cena * 30:cena * 30 + 30] = 1
    v += np.random.default_rng(semente).normal(0, 0.05, 384).astype(np.float32)
    return v / np.linalg.norm(v)


def _pares() -> list[Par]:
    # A pessoa esquenta e clareia os retratos (cena 0) e esfria e escurece as paisagens (cena 1)
    pares = []
    for i in range(6):
        melhorado = {"exposicao": 0.1 * (i % 3)}
        pares.append(Par(f"r{i}", _vetor(0, i), (0.4, 0, 0), melhorado,
                         {"exposicao": melhorado["exposicao"] + 0.4, "temperatura": 0.3, "filtro": "quente",
                          "intensidade": 1}))
        pares.append(Par(f"p{i}", _vetor(1, 50 + i), (0.6, 0, 0), {}, {"exposicao": -0.3, "temperatura": -0.25}))
    return pares


def test_vizinhos_e_quanto_acompanha_o_melhorar():
    pares = _pares()
    perto = vizinhos(pares, _vetor(0, 99))
    assert len(perto) == 5 and all(pares[i].midia_id.startswith("r") for i, _ in perto)
    acompanha = dict(zip(("exposicao", "temperatura"), quanto_acompanha(pares)[[0, 6]], strict=True))
    # A exposição segue o Melhorar nos retratos (a inclinação passa de 1 e fica em 1); a temperatura não varia nele
    assert acompanha == {"exposicao": 1.0, "temperatura": 0.5}
    # Quem põe sempre o mesmo valor, seja qual for o Melhorar, não acompanha
    fixos = [Par(str(i), _vetor(0, i), (0.5, 0, 0), {"temperatura": -0.5 + 0.1 * i}, {"temperatura": 0.35})
             for i in range(8)]
    assert quanto_acompanha(fixos)[6] == 0
    assert prever_pelos_vizinhos(fixos, _vetor(0, 50), {"temperatura": -0.4})[6] == pytest.approx(0.35)


def test_cor_prevista_pelos_vizinhos():
    pares = _pares()
    retrato = cor_prevista(pares, _vetor(0, 77), (0.4, 0, 0), {"exposicao": 0.2})
    assert retrato["exposicao"] == pytest.approx(0.6, abs=0.02) and retrato["temperatura"] == pytest.approx(0.3)
    # O que não é número vem do par mais parecido
    assert retrato["filtro"] == "quente"
    paisagem = cor_prevista(pares, _vetor(1, 78), (0.6, 0, 0), {"exposicao": 0.1}, intensidade=0.5)
    assert paisagem["exposicao"] == pytest.approx(0.1 - 0.15, abs=0.02) and "filtro" not in paisagem
    assert prever_pelos_vizinhos([], _vetor(0, 1), {"exposicao": 0.2})[0] == pytest.approx(0.2)


def test_boosting_aprende_a_diferenca():
    pytest.importorskip("sklearn")
    r = np.random.default_rng(0)
    pares = []
    for i in range(320):
        cena = i % 2
        luz = float(r.uniform(0.2, 0.8))
        melhorado = {"exposicao": round(0.47 - luz, 2)}
        # Retratos: mais quente; paisagens: mais saturadas; e um pouco mais claro quanto mais escura a foto
        cor = {"exposicao": melhorado["exposicao"] + 0.3 * (0.5 - luz), "temperatura": 0.3 if cena == 0 else 0,
               "saturacao": 0.25 if cena == 1 else 0}
        pares.append(Par(str(i), _vetor(cena, i), (luz, 0, 0), melhorado, cor))
    modelo = Boosting.treinar(pares)
    retrato = cor_prevista(pares, _vetor(0, 999), (0.3, 0, 0), {"exposicao": 0.17}, boosting=modelo)
    assert retrato["temperatura"] == pytest.approx(0.3, abs=0.05)
    assert abs(retrato.get("saturacao", 0)) < 0.05
    assert retrato["exposicao"] == pytest.approx(0.17 + 0.06, abs=0.04)
    paisagem = cor_prevista(pares, _vetor(1, 998), (0.6, 0, 0), {"exposicao": -0.13}, boosting=modelo)
    assert paisagem["saturacao"] == pytest.approx(0.25, abs=0.05) and abs(paisagem.get("temperatura", 0)) < 0.05
