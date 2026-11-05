# Escolher as melhores fotos do álbum (onda 16.3): grupos, nota, desfocadas, olhos fechados, quantidade e destaques
import numpy as np

from core.modelos.escolha import Foto, Opcoes, escolher, nota_do_rosto, olhos_fechados


def _vetor(base: int, ruido: float, semente: int) -> np.ndarray:
    """Um vetor perto de uma base (a cena) com um pouco de ruído (a foto da rajada)."""
    r = np.random.default_rng(semente)
    v = np.zeros(384, np.float32)
    v[base * 40:base * 40 + 40] = 1
    v = v + r.normal(0, ruido, 384).astype(np.float32)
    return v / np.linalg.norm(v)


def _rosto(olho: float = 0.8, sorriso: float = 0.6) -> dict:
    return {"caixa": [0.4, 0.2, 0.2, 0.25], "confianca": 0.9, "foco": 2000, "olho_esq": olho, "olho_dir": olho,
            "sorriso": sorriso, "olhando": 0.8, "guinada": 0.0}


def _foto(nome: str, hora: float, cena: int, foco: float = 5000, rostos=(), semente: int = 0, ruido: float = 0.05):
    medidas = {"foco": {"geral": foco / 2, "melhor_bloco": foco},
               "exposicao": {"mediana": 0.45, "estourado": 0.0, "afogado": 0.0}, "rostos": list(rostos)}
    return Foto(nome, hora, 0, medidas, _vetor(cena, ruido, semente))


def _ensaio() -> list[Foto]:
    """Três cenas: um retrato em rajada (com uma tremida e uma de olho fechado), um grupo e um detalhe sem rosto."""
    fotos = [
        _foto("retrato_1", 0, 0, rostos=[_rosto(sorriso=0.3)], semente=1),
        _foto("retrato_2", 2, 0, rostos=[_rosto(sorriso=0.9)], semente=2),  # a melhor do retrato
        _foto("retrato_3", 4, 0, foco=600, rostos=[_rosto()], semente=3),  # tremida
        _foto("retrato_4", 6, 0, rostos=[_rosto(olho=0.2)], semente=4),  # piscou
        _foto("grupo_1", 400, 1, rostos=[_rosto(), _rosto(olho=0.3)], semente=5),  # alguém de olho fechado
        _foto("grupo_2", 403, 1, rostos=[_rosto(), _rosto()], semente=6),
        _foto("detalhe_1", 900, 2, foco=6000, semente=7),
        _foto("detalhe_2", 902, 2, foco=4000, semente=8),
    ]
    for i, f in enumerate(fotos):
        f.ordem = i
    return fotos


def test_rostos_e_olhos():
    assert olhos_fechados({"rostos": [_rosto(olho=0.2)]}) is True
    # Um olho só abaixo do limiar (a cabeça inclinada) não conta; os dois quase fechados, sim
    assert olhos_fechados({"rostos": [{**_rosto(), "olho_esq": 0.97, "olho_dir": 0.4}]}) is False
    assert olhos_fechados({"rostos": [{**_rosto(), "olho_esq": 0.17, "olho_dir": 0.64}]}) is True
    # Um rosto pequeno no fundo não decide
    pequeno = {**_rosto(olho=0.1), "caixa": [0, 0, 0.03, 0.03]}
    assert olhos_fechados({"rostos": [_rosto(), pequeno]}) is False
    assert nota_do_rosto({"rostos": []}) is None
    assert nota_do_rosto({"rostos": [_rosto(sorriso=0.9)]}) > nota_do_rosto({"rostos": [_rosto(sorriso=0.1)]})


def test_escolhe_a_melhor_de_cada_grupo_e_tira_as_ruins():
    r = escolher(_ensaio(), Opcoes(quantas="muitas"))
    # Cada cena é um grupo de parecidas
    assert len({r.grupo[n] for n in ("retrato_1", "retrato_2", "retrato_3", "retrato_4")}) == 1
    assert r.cena["grupo_1"] != r.cena["retrato_1"] and r.cena["detalhe_1"] != r.cena["grupo_1"]
    assert r.categoria["retrato_3"] == "desfocada" and r.categoria["retrato_4"] == "olhos_fechados"
    assert r.categoria["grupo_1"] == "olhos_fechados"
    assert r.categoria["retrato_2"] in ("escolhida", "destaque") and r.categoria["retrato_1"] == "parecida"
    assert r.categoria["grupo_2"] in ("escolhida", "destaque")
    # Sem rosto, o foco decide
    assert r.categoria["detalhe_1"] in ("escolhida", "destaque") and r.categoria["detalhe_2"] == "parecida"
    assert sum(c == "destaque" for c in r.categoria.values()) >= 1
    assert all(0 <= n <= 100 for n in r.nota.values()) and set(r.motivo) == set(r.categoria)


def test_quantidade_e_numero_exato():
    poucas = escolher(_ensaio(), Opcoes(quantas="minima"))
    boas = [n for n, c in poucas.categoria.items() if c in ("escolhida", "destaque")]
    assert len(boas) == 1 and sum(c == "talvez" for c in poucas.categoria.values()) == 2
    exato = escolher(_ensaio(), Opcoes(alvo=5))
    assert sum(c in ("escolhida", "destaque") for c in exato.categoria.values()) == 5


def test_olhos_fechados_desligado_e_rigor():
    r = escolher(_ensaio(), Opcoes(quantas="muitas", olhos_fechados=False))
    assert r.categoria["grupo_1"] != "olhos_fechados"
    # Tolerante, a tremida (12% da mediana do foco) continua desfocada; a de 4000 nunca é
    assert escolher(_ensaio(), Opcoes(rigor="tolerante")).categoria["retrato_3"] == "desfocada"
    assert escolher(_ensaio(), Opcoes(rigor="rigido")).categoria["detalhe_2"] != "desfocada"


def test_grupos_maiores_juntam_fotos_menos_parecidas():
    fotos = [_foto(f"f{i}", i * 2, 0, semente=i, ruido=0.11) for i in range(6)]
    for i, f in enumerate(fotos):
        f.ordem = i
    pequenos = escolher(fotos, Opcoes(grupos="pequeno"))
    grandes = escolher(fotos, Opcoes(grupos="muito_grande"))
    assert len(set(pequenos.grupo.values())) > len(set(grandes.grupo.values()))


def test_sem_fotos_e_sem_hora():
    assert escolher([], Opcoes()).categoria == {}
    fotos = [_foto("a", None, 0, semente=1), _foto("b", None, 3, semente=2)]
    fotos[1].ordem = 1
    r = escolher(fotos, Opcoes())
    assert set(r.categoria) == {"a", "b"} and r.cena["a"] != r.cena["b"]
