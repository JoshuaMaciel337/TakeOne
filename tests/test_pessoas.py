# As pessoas do álbum (onda 16.4): juntar os rostos pelo vetor, os rostos pequenos de fora e os números de antes
import numpy as np

from core.modelos.pessoas import Rosto, agrupar


def _base(semente: int) -> np.ndarray:
    v = np.random.default_rng(semente).normal(0, 1, 128).astype(np.float32)
    return v / np.linalg.norm(v)


def _rosto(foto: str, pessoa: int, semente: int, area: float = 0.02, ruido: float = 0.04) -> Rosto:
    v = _base(pessoa * 1000) + np.random.default_rng(semente).normal(0, ruido, 128).astype(np.float32)
    return Rosto(foto, 0, v, area, [0.1, 0.1, area ** 0.5, area ** 0.5])


def test_junta_a_mesma_pessoa_e_separa_as_outras():
    rostos = [_rosto(f"a{i}", 1, i) for i in range(5)] + [_rosto(f"b{i}", 2, 100 + i) for i in range(3)]
    rostos.append(_rosto("c", 3, 200))
    pessoas = agrupar(rostos)
    assert [len(p.fotos) for p in pessoas] == [5, 3, 1]
    assert {r.midia_id for r in pessoas[0].rostos} == {f"a{i}" for i in range(5)}
    assert [p.numero for p in pessoas] == [1, 2, 3]


def test_dois_rostos_da_mesma_foto_sao_pessoas_diferentes():
    # Gêmeos na mesma foto: os vetores quase iguais não viram uma pessoa só
    pessoas = agrupar([_rosto("f", 1, 1), _rosto("f", 1, 2)])
    assert len(pessoas) == 2


def test_rosto_pequeno_fica_de_fora():
    pessoas = agrupar([_rosto("a", 1, 1), _rosto("b", 1, 2, area=0.0005)])
    assert len(pessoas) == 1 and pessoas[0].fotos == ["a"]


def test_numeros_de_antes_ficam():
    rostos = [_rosto(f"a{i}", 1, i) for i in range(4)] + [_rosto(f"b{i}", 2, 50 + i) for i in range(2)]
    primeira = agrupar(rostos)
    antigas = [(7, primeira[0].centro), (3, primeira[1].centro)]
    # Chega gente nova: a pessoa 2 passa a ter mais fotos, e uma terceira aparece
    rostos += [_rosto(f"b{i}", 2, 60 + i) for i in range(2, 6)] + [_rosto("c", 9, 300)]
    segunda = agrupar(rostos, antigas)
    por_foto = {p.fotos[0][0]: p.numero for p in segunda}
    assert por_foto == {"a": 7, "b": 3, "c": 8}
