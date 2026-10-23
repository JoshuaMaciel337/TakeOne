# -----------------------------------------------
# TakeOne — LUTs importadas (.cube)
#
# A pessoa envia um .cube; a API lê, confere e guarda a tabela em float32 (lut.bin: R, G e B de cada ponto,
# o vermelho variando mais rápido, como no .cube). No clipe, a LUT entra antes dos ajustes de cor, misturada
# ao original pela intensidade, e tudo vira a mesma LUT 3D de 33 pontos que a prévia e o render já usam
# (core/utils/cor.py, gerar_cube). A leitura é tetraédrica, a mesma de lib/projeto/lutImportada.ts.
# -----------------------------------------------
import re
from dataclasses import dataclass

import numpy as np

TAMANHO_MINIMO = 2
TAMANHO_MAXIMO = 65
BYTES_MAXIMOS = 10 * 1024 * 1024   # o proxy do Next corta o corpo em 10 MB
ARQUIVO_LUT = "lut.bin"


class ErroLut(ValueError):
    """O arquivo não é um .cube 3D que dá para usar. A mensagem é para a pessoa."""


@dataclass(frozen=True)
class LutImportada:
    tamanho: int
    dados: np.ndarray                       # (tamanho³, 3), float32, o vermelho variando mais rápido
    minimo: tuple[float, float, float] = (0.0, 0.0, 0.0)
    maximo: tuple[float, float, float] = (1.0, 1.0, 1.0)
    titulo: str = ""


def _tres(partes: list[str], linha: int) -> tuple[float, float, float]:
    if len(partes) != 3:
        raise ErroLut(f"A linha {linha} do arquivo devia ter três números.")
    try:
        return float(partes[0]), float(partes[1]), float(partes[2])
    except ValueError as e:
        raise ErroLut(f"A linha {linha} do arquivo tem um valor que não é número.") from e


def ler_cube(texto: str) -> LutImportada:
    """Lê um .cube 3D (TITLE, LUT_3D_SIZE, DOMAIN_MIN, DOMAIN_MAX e os pontos). O 1D é recusado."""
    tamanho = None
    titulo = ""
    minimo, maximo = (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)
    valores: list[tuple[float, float, float]] = []
    for numero, bruta in enumerate(texto.splitlines(), start=1):
        linha = bruta.split("#", 1)[0].strip()
        if not linha:
            continue
        partes = linha.split()
        chave = partes[0].upper()
        if chave == "TITLE":
            encontrado = re.search(r'"(.*)"', linha)
            titulo = (encontrado.group(1) if encontrado else " ".join(partes[1:]))[:80]
        elif chave == "LUT_1D_SIZE":
            raise ErroLut("Esta é uma LUT 1D. O TakeOne usa LUTs 3D (LUT_3D_SIZE).")
        elif chave == "LUT_3D_SIZE":
            try:
                tamanho = int(partes[1])
            except (IndexError, ValueError) as e:
                raise ErroLut("O tamanho da LUT (LUT_3D_SIZE) não é um número.") from e
            if not TAMANHO_MINIMO <= tamanho <= TAMANHO_MAXIMO:
                raise ErroLut(f"A LUT tem {tamanho} pontos por eixo; o TakeOne aceita de {TAMANHO_MINIMO} a "
                              f"{TAMANHO_MAXIMO}.")
        elif chave == "DOMAIN_MIN":
            minimo = _tres(partes[1:], numero)
        elif chave == "DOMAIN_MAX":
            maximo = _tres(partes[1:], numero)
        elif chave[0].isalpha():
            continue   # outras palavras-chave (LUT_3D_INPUT_RANGE e afins) não mudam a tabela
        else:
            valores.append(_tres(partes, numero))
    if tamanho is None:
        raise ErroLut("O arquivo não diz o tamanho da LUT (LUT_3D_SIZE). Envie um .cube 3D.")
    if len(valores) != tamanho ** 3:
        raise ErroLut(f"A LUT de {tamanho} pontos devia ter {tamanho ** 3} linhas de cor; o arquivo tem "
                      f"{len(valores)}.")
    if any(b <= a for a, b in zip(minimo, maximo, strict=True)):
        raise ErroLut("O domínio da LUT (DOMAIN_MIN e DOMAIN_MAX) está invertido.")
    dados = np.asarray(valores, dtype=np.float32)
    if not np.isfinite(dados).all():
        raise ErroLut("A LUT tem valores que não são números.")
    return LutImportada(tamanho, dados, minimo, maximo, titulo)


def chave_da_lut(organizacao_id, lut_id) -> str:
    return f"org_{organizacao_id}/luts/{lut_id}/{ARQUIVO_LUT}"


def para_bytes(lut: LutImportada) -> bytes:
    return lut.dados.astype("<f4").tobytes()


def de_bytes(conteudo: bytes, tamanho: int, minimo=(0.0, 0.0, 0.0), maximo=(1.0, 1.0, 1.0)) -> LutImportada:
    dados = np.frombuffer(conteudo, dtype="<f4").reshape(tamanho ** 3, 3)
    return LutImportada(tamanho, dados, tuple(minimo), tuple(maximo))


def ler_lut(lut: LutImportada, rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    """A cor da LUT no ponto rgb (0 a 1), pela leitura tetraédrica (a do lut3d do FFmpeg)."""
    n = lut.tamanho
    s = [min(max((v - a) / (b - a), 0.0), 1.0) * (n - 1) for v, a, b in zip(rgb, lut.minimo, lut.maximo, strict=True)]
    p = [min(int(v), n - 2) for v in s]
    d = [v - q for v, q in zip(s, p, strict=True)]
    dados = lut.dados

    def ponto(x: int, y: int, z: int) -> tuple[float, float, float]:
        linha = dados[(z * n + y) * n + x]
        return float(linha[0]), float(linha[1]), float(linha[2])

    x0, y0, z0 = p
    x1, y1, z1 = x0 + 1, y0 + 1, z0 + 1
    dr, dg, db = d
    if dr > dg:
        if dg > db:
            pesos, cantos = (1 - dr, dr - dg, dg - db, db), ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1))
        elif dr > db:
            pesos, cantos = (1 - dr, dr - db, db - dg, dg), ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x1, y1, z1))
        else:
            pesos, cantos = (1 - db, db - dr, dr - dg, dg), ((x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1))
    elif db > dg:
        pesos, cantos = (1 - db, db - dg, dg - dr, dr), ((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x1, y1, z1))
    elif db > dr:
        pesos, cantos = (1 - dg, dg - db, db - dr, dr), ((x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1))
    else:
        pesos, cantos = (1 - dg, dg - dr, dr - db, db), ((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y1, z1))
    soma = [0.0, 0.0, 0.0]
    for peso, canto in zip(pesos, cantos, strict=True):
        cor = ponto(*canto)
        for k in range(3):
            soma[k] += peso * cor[k]
    return soma[0], soma[1], soma[2]


def aplicar_lut(rgb: tuple[float, float, float], lut: LutImportada, intensidade: float) -> tuple[float, float, float]:
    """O pixel pela LUT, misturado ao original pela intensidade (0 a 1) e preso entre 0 e 1."""
    saida = ler_lut(lut, rgb)
    return tuple(min(max(v + (s - v) * intensidade, 0.0), 1.0) for v, s in zip(rgb, saida, strict=True))
