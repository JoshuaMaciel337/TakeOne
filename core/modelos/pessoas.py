# -----------------------------------------------
# TakeOne — as pessoas do álbum de fotos (onda 16.4, docs/decisoes/0006-album-de-fotos.md)
#
# Cada rosto medido tem um vetor de 128 números (SFace, core/utils/medir_foto.py). Juntar as pessoas é uma conta
# sobre eles: do maior rosto para o menor (o grande é o vetor mais confiável), cada um entra na pessoa de centro mais
# parecido, se passar do limiar, ou começa uma pessoa nova; no fim, as pessoas de centros parecidos se juntam. Os
# números e os nomes das pessoas de antes ficam: cada pessoa nova herda o número da antiga de centro mais parecido.
# Pura e sem banco, com testes (tests/test_pessoas.py).
# -----------------------------------------------
from dataclasses import dataclass, field

import numpy as np

# O cosseno a partir do qual dois rostos são a mesma pessoa (o SFace sugere 0,363; um pouco acima, para não juntar
# parentes parecidos, medido em fotos de família)
LIMIAR_DA_PESSOA = 0.42
# Juntar duas pessoas no fim, e herdar o número de uma pessoa de antes
LIMIAR_PARA_JUNTAR = 0.5
LIMIAR_PARA_HERDAR = 0.5
# Rostos menores que isto (em fração da foto) ficam de fora: o vetor de um rosto de poucos pixels é ruído
AREA_MINIMA_DO_ROSTO = 0.002


@dataclass
class Rosto:
    midia_id: str
    indice: int
    vetor: np.ndarray
    area: float
    caixa: list[float]


@dataclass
class Pessoa:
    numero: int
    centro: np.ndarray
    rostos: list[Rosto] = field(default_factory=list)

    @property
    def fotos(self) -> list[str]:
        return list(dict.fromkeys(r.midia_id for r in self.rostos))

    @property
    def capa(self) -> Rosto:
        """O rosto que representa a pessoa: o maior."""
        return max(self.rostos, key=lambda r: r.area)


def _normal(v: np.ndarray) -> np.ndarray:
    return v / (np.linalg.norm(v) or 1.0)


def _centro(rostos: list[Rosto]) -> np.ndarray:
    return _normal(np.mean([r.vetor for r in rostos], axis=0))


def agrupar(rostos: list[Rosto], antigas: list[tuple[int, np.ndarray]] = ()) -> list[Pessoa]:
    """As pessoas dos rostos, da que tem mais fotos para a que tem menos, com os números das de antes quando dá."""
    rostos = [r for r in rostos if r.area >= AREA_MINIMA_DO_ROSTO and np.linalg.norm(r.vetor) > 0]
    grupos: list[list[Rosto]] = []
    centros: list[np.ndarray] = []
    for rosto in sorted(rostos, key=lambda r: -r.area):
        v = _normal(rosto.vetor.astype(np.float32))
        rosto.vetor = v
        if centros:
            parecido = np.stack(centros) @ v
            melhor = int(np.argmax(parecido))
            # Dois rostos da mesma foto não são a mesma pessoa
            if parecido[melhor] >= LIMIAR_DA_PESSOA and all(r.midia_id != rosto.midia_id for r in grupos[melhor]):
                grupos[melhor].append(rosto)
                centros[melhor] = _centro(grupos[melhor])
                continue
        grupos.append([rosto])
        centros.append(v)
    # Junta as pessoas de centros parecidos (um rosto de lado no começo pode ter aberto uma pessoa a mais)
    juntou = True
    while juntou and len(grupos) > 1:
        juntou = False
        m = np.stack(centros) @ np.stack(centros).T
        np.fill_diagonal(m, -1)
        i, j = np.unravel_index(int(np.argmax(m)), m.shape)
        fotos_i = {r.midia_id for r in grupos[i]}
        if m[i, j] >= LIMIAR_PARA_JUNTAR and not fotos_i & {r.midia_id for r in grupos[j]}:
            i, j = min(i, j), max(i, j)
            grupos[i] += grupos.pop(j)
            centros.pop(j)
            centros[i] = _centro(grupos[i])
            juntou = True
    pessoas = sorted((Pessoa(0, c, g) for g, c in zip(grupos, centros, strict=True)),
                     key=lambda p: (-len(p.fotos), -p.capa.area))
    # Os números de antes: cada antiga vai para a nova mais parecida, uma vez só, das mais parecidas para as menos
    pares = sorted(((float(p.centro @ _normal(c)), k, n) for k, p in enumerate(pessoas) for n, c in antigas),
                   reverse=True)
    usadas_novas, usadas_antigas = set(), set()
    for parecido, k, numero in pares:
        if parecido < LIMIAR_PARA_HERDAR:
            break
        if k in usadas_novas or numero in usadas_antigas:
            continue
        pessoas[k].numero = numero
        usadas_novas.add(k)
        usadas_antigas.add(numero)
    proximo = max([n for n, _ in antigas] + [0]) + 1
    for k, p in enumerate(pessoas):
        if k not in usadas_novas:
            p.numero = proximo
            proximo += 1
    return pessoas
