# -----------------------------------------------
# TakeOne — o estilo pessoal das fotos do álbum (onda 16.7, docs/decisoes/0006-album-de-fotos.md, decisão 4)
#
# Um estilo pessoal aprende com pares (foto → a cor final que a pessoa deu): as fotos editadas no TakeOne e as que
# chegam com o .xmp de outro programa ao lado. Cada controle tem um quanto a pessoa acompanha o "Melhorar" da foto
# (core/utils/melhorar.py): a inclinação entre o valor que ela deu e o que o "Melhorar" sugeria, de 0 a 1, pelos
# pares todos. Quem corrige a luz foto a foto fica perto de 1 (o estilo é o gosto por cima da correção); quem põe
# sempre o mesmo valor fica perto de 0 (o estilo é o valor). O valor final é o dos pares mais parecidos pelo vetor
# da foto (DINOv2, "parece com estas 5 fotos suas") mais essa parte da diferença entre o "Melhorar" desta foto e o
# deles; a partir de 300 pares, um gradient boosting por controle (o scikit-learn, se estiver instalado) prevê o
# valor menos essa parte, sobre o vetor, a luz medida e o "Melhorar". O que não é número (o filtro, a LUT, a cor por
# matiz, as rodas e as curvas) vem do par mais parecido. Puro, sem banco (tests/test_estilo_pessoal.py).
# -----------------------------------------------
from dataclasses import dataclass

import numpy as np

CONTROLES = ("exposicao", "contraste", "realces", "sombras", "brancos", "pretos", "temperatura", "tom", "vibracao",
             "saturacao", "nevoa", "vinheta")
LIMITES = {"exposicao": (-2, 2), "vinheta": (0, 1)}
MELHORADOS = ("exposicao", "contraste", "realces", "sombras", "temperatura", "tom", "saturacao")
# O que não é número e vem do par mais parecido
EXTRAS = ("filtro", "intensidade", "lut", "hsl", "curvas", "matiz_escuros", "forca_escuros", "matiz_medios",
          "forca_medios", "matiz_claros", "forca_claros")
VIZINHOS = 5
MINIMO_PARA_O_BOOSTING = 300
# Sem pares que digam (poucos, ou o "Melhorar" sempre igual), a pessoa acompanha metade do "Melhorar"
ACOMPANHA_SEM_DADOS = 0.5


@dataclass
class Par:
    midia_id: str
    vetor: np.ndarray
    luz: tuple[float, float, float]
    melhorado: dict
    cor: dict


def _valores(d: dict) -> np.ndarray:
    return np.array([float(d.get(c) or 0) for c in CONTROLES])


def quanto_acompanha(pares: list[Par]) -> np.ndarray:
    """Por controle, a inclinação (de 0 a 1) entre o valor que a pessoa deu e o que o "Melhorar" sugeria."""
    if len(pares) < 4:
        return np.full(len(CONTROLES), ACOMPANHA_SEM_DADOS)
    cor = np.stack([_valores(p.cor) for p in pares])
    melhorado = np.stack([_valores(p.melhorado) for p in pares])
    saida = np.full(len(CONTROLES), ACOMPANHA_SEM_DADOS)
    for k in range(len(CONTROLES)):
        variancia = melhorado[:, k].var()
        if variancia > 1e-4:
            covariancia = ((melhorado[:, k] - melhorado[:, k].mean()) * (cor[:, k] - cor[:, k].mean())).mean()
            saida[k] = float(np.clip(covariancia / variancia, 0, 1))
    return saida


def caracteristicas(vetor: np.ndarray, luz: tuple[float, float, float], melhorado: dict) -> np.ndarray:
    """O que o boosting olha: o vetor da foto, a luz medida (mediana, estourado e afogado) e o "Melhorar"."""
    return np.concatenate([np.asarray(vetor, np.float32), np.asarray(luz, np.float32),
                           np.array([float(melhorado.get(c) or 0) for c in MELHORADOS], np.float32)])


def vizinhos(pares: list[Par], vetor: np.ndarray, k: int = VIZINHOS) -> list[tuple[int, float]]:
    """Os k pares mais parecidos (índice e cosseno), do mais parecido para o menos."""
    if not pares:
        return []
    matriz = np.stack([p.vetor for p in pares]).astype(np.float32)
    v = np.asarray(vetor, np.float32)
    parecido = matriz @ v / ((np.linalg.norm(matriz, axis=1) * (np.linalg.norm(v) or 1)) + 1e-9)
    ordem = np.argsort(-parecido)[:k]
    return [(int(i), float(parecido[i])) for i in ordem]


def prever_pelos_vizinhos(pares: list[Par], vetor: np.ndarray, melhorado: dict,
                          acompanha: np.ndarray | None = None) -> np.ndarray:
    """O valor dos vizinhos (média pesada pela semelhança à quarta) mais a parte do "Melhorar" que a pessoa segue."""
    perto = vizinhos(pares, vetor)
    if not perto:
        return _valores(melhorado)
    acompanha = quanto_acompanha(pares) if acompanha is None else acompanha
    pesos = np.array([max(c, 0.0) ** 4 for _, c in perto]) + 1e-6
    cor = (np.stack([_valores(pares[i].cor) for i, _ in perto]) * pesos[:, None]).sum(0) / pesos.sum()
    deles = (np.stack([_valores(pares[i].melhorado) for i, _ in perto]) * pesos[:, None]).sum(0) / pesos.sum()
    return cor + acompanha * (_valores(melhorado) - deles)


class Boosting:
    """Um gradient boosting por controle (HistGradientBoostingRegressor do scikit-learn), sobre o valor menos a
    parte do "Melhorar" que a pessoa segue."""

    def __init__(self, modelos: list, acompanha: np.ndarray):
        self.modelos = modelos
        self.acompanha = acompanha

    @classmethod
    def treinar(cls, pares: list[Par]) -> "Boosting":
        from sklearn.ensemble import HistGradientBoostingRegressor

        acompanha = quanto_acompanha(pares)
        x = np.stack([caracteristicas(p.vetor, p.luz, p.melhorado) for p in pares])
        y = np.stack([_valores(p.cor) - acompanha * _valores(p.melhorado) for p in pares])
        modelos = []
        for k in range(len(CONTROLES)):
            if np.allclose(y[:, k], y[0, k]):
                modelos.append(float(y[0, k]))
                continue
            modelo = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, max_depth=3,
                                                   l2_regularization=1.0, random_state=0)
            modelos.append(modelo.fit(x, y[:, k]))
        return cls(modelos, acompanha)

    def prever(self, vetor: np.ndarray, luz, melhorado: dict) -> np.ndarray:
        x = caracteristicas(vetor, luz, melhorado)[None]
        base = np.array([m if isinstance(m, float) else float(m.predict(x)[0]) for m in self.modelos])
        return base + self.acompanha * _valores(melhorado)


def boosting_disponivel() -> bool:
    try:
        import sklearn  # noqa: F401
    except ImportError:
        return False
    return True


def cor_prevista(pares: list[Par], vetor: np.ndarray, luz, melhorado: dict, intensidade: float = 1.0,
                 boosting: Boosting | None = None) -> dict:
    """A cor de uma foto pelo estilo: o valor previsto, com a intensidade contando a partir do "Melhorar" dela (0: só
    o "Melhorar"; 1: o estilo), e o que não é número do par mais parecido."""
    previsto = boosting.prever(vetor, luz, melhorado) if boosting else prever_pelos_vizinhos(pares, vetor, melhorado)
    base = _valores(melhorado)
    cor: dict = {}
    for k, controle in enumerate(CONTROLES):
        minimo, maximo = LIMITES.get(controle, (-1, 1))
        valor = round(min(maximo, max(minimo, float(base[k] + (previsto[k] - base[k]) * intensidade))), 3)
        if valor:
            cor[controle] = valor
    perto = vizinhos(pares, vetor, 1)
    if perto:
        do_par = pares[perto[0][0]].cor
        for chave in EXTRAS:
            if do_par.get(chave) not in (None, 0):
                cor[chave] = do_par[chave]
        if cor.get("lut"):
            forca = round(min(1.0, cor["lut"].get("intensidade", 1) * intensidade), 3)
            cor["lut"] = {**cor["lut"], "intensidade": forca}
    return cor
