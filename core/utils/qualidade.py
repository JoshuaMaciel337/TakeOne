# -----------------------------------------------
# TakeOne — a nota de cada instante de um vídeo, para a montagem automática escolher os melhores trechos
#
# O worker mede, em quadros pequenos (320 de largura, 4 por segundo): a nitidez (variância do laplaciano),
# o brilho médio, o deslocamento da câmera (correlação de fase com o quadro anterior) e a mudança do
# histograma (corte de cena). Esta conta junta as medidas numa nota de 0 a 1 por amostra:
#   nitidez  — relativa ao próprio vídeo (o 90º percentil vale 1) e zerada abaixo de um mínimo absoluto,
#              porque um vídeo todo borrado não pode virar "nítido" por comparação
#   luz      — zero no quase preto e no estourado, cheia entre os dois
#   tremor   — o quanto o deslocamento foge da média dos vizinhos (uma panorâmica suave não é tremor)
# Medido num vídeo-armadilha (bom, borrado, escuro e tremido, 4 s cada): nitidez 1600 contra 10 no
# borrado, brilho 0,30 contra 0,01 no escuro e mudança de histograma acima de 0,7 em cada corte.
# Funções puras, sem OpenCV: o worker mede, aqui só se calcula.
# -----------------------------------------------
import numpy as np

AMOSTRAS_POR_SEGUNDO = 4
LARGURA_DE_ANALISE = 320
# Variância do laplaciano abaixo disto (em 320 px) é imagem borrada, seja qual for o vídeo
NITIDEZ_MINIMA = 60.0
NITIDEZ_BOA = 200.0
# Brilho médio de 0 a 1: abaixo do primeiro é escuro demais; acima do último, estourado
BRILHO_ESCURO, BRILHO_BOM, BRILHO_CLARO, BRILHO_ESTOURADO = 0.06, 0.16, 0.85, 0.96
# Tremor em frações da largura por amostra: a partir do primeiro desconta, no segundo zera
TREMOR_ACEITO, TREMOR_MAXIMO = 0.006, 0.03
# Mudança do histograma (0 a 1) que conta como corte de cena
CORTE_MINIMO = 0.35


def _rampa(valor: np.ndarray, zero: float, cheio: float) -> np.ndarray:
    return np.clip((valor - zero) / (cheio - zero), 0.0, 1.0)


def notas(nitidez: np.ndarray, brilho: np.ndarray, deslocamento: np.ndarray, histograma: np.ndarray) -> dict:
    """
    nitidez, brilho e histograma: uma medida por amostra; deslocamento: (n, 2), em frações da largura.
    Devolve {nota: [0..1], corte: [bool]}, um valor por amostra.
    """
    nitidez = np.asarray(nitidez, dtype=np.float64)
    n = len(nitidez)
    if n == 0:
        return {"nota": [], "corte": []}
    referencia = max(float(np.percentile(nitidez, 90)), NITIDEZ_BOA)
    nota_nitidez = np.minimum(1.0, nitidez / referencia) * _rampa(nitidez, NITIDEZ_MINIMA, NITIDEZ_BOA)
    brilho = np.asarray(brilho, dtype=np.float64)
    nota_luz = _rampa(brilho, BRILHO_ESCURO, BRILHO_BOM) * (1 - _rampa(brilho, BRILHO_CLARO, BRILHO_ESTOURADO))
    # Tremor: a diferença entre o deslocamento de cada amostra e a média dos dois lados (o movimento lento fica)
    deslocamento = np.asarray(deslocamento, dtype=np.float64).reshape(n, 2)
    if n >= 3:
        janela = np.ones(5) / 5
        suave = np.stack([np.convolve(np.pad(deslocamento[:, k], 2, mode="edge"), janela, mode="valid")
                          for k in range(2)], axis=1)
        tremor = np.hypot(*(deslocamento - suave).T)
        # Um solavanco isolado pesa nos vizinhos também: a imagem fica ruim por um instante inteiro
        tremor = np.maximum(tremor, np.convolve(np.pad(tremor, 1, mode="edge"), np.ones(3) / 3, mode="valid"))
    else:
        tremor = np.zeros(n)
    nota_tremor = 1 - _rampa(tremor, TREMOR_ACEITO, TREMOR_MAXIMO)
    corte = np.asarray(histograma, dtype=np.float64) >= CORTE_MINIMO
    if n:
        corte[0] = False
    nota = nota_nitidez * nota_luz * nota_tremor
    return {"nota": [round(float(v), 3) for v in nota], "corte": [bool(v) for v in corte]}
