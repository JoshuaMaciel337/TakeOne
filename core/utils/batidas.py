# -----------------------------------------------
# TakeOne — batidas da música, para cortar e animar no ritmo
# Funções puras em numpy, sem biblioteca de áudio: o worker decodifica o som com o FFmpeg e chama aqui.
#
# O caminho é o clássico (Ellis, "Beat Tracking by Dynamic Programming", 2007):
# 1. Envelope de ataques: o fluxo espectral (quanto a energia de cada faixa de frequência sobe de um
#    quadro para o outro, em escala logarítmica), sem metade da média local, para sobressair o que "bate".
# 2. Andamento: a autocorrelação do envelope em janelas de uns 9 s (o tempograma), nos atrasos entre 60 e
#    200 BPM, com preferência suave perto de 120 BPM (a mesma batida a 60 ou a 240 também correlaciona;
#    a preferência escolhe a do meio).
# 3. Batidas: programação dinâmica que soma a força dos ataques e pune intervalos longe do andamento,
#    e depois volta do fim para o começo.
# 4. Tempos fortes: de 4 em 4 batidas, na fase (0 a 3) cujas batidas têm mais força nos graves.
# -----------------------------------------------
import numpy as np

TAXA = 22050
JANELA = 2048
SALTO = 512                       # 23 ms por quadro do envelope
BPM_MINIMO, BPM_MAXIMO = 60.0, 200.0
BPM_PREFERIDO = 120.0
LARGURA_PREFERENCIA = 1.0         # em oitavas: quanto a preferência por 120 BPM pesa
RIGIDEZ = 100.0                   # quanto a programação dinâmica pune intervalo fora do andamento
GRAVES_HZ = 150.0
MINIMO_S = 4.0                    # menos que isso não dá para achar andamento
JANELA_DO_ANDAMENTO = 384         # quadros do tempograma: uns 9 s
FRACAO_DO_FUNDO = 0.5             # quanto da média local sai do envelope de ataques


def _quadros(amostras: np.ndarray) -> np.ndarray:
    """O espectro de magnitude de cada quadro (janela de Hann), quadros nas linhas."""
    if len(amostras) < JANELA:
        amostras = np.pad(amostras, (0, JANELA - len(amostras)))
    n = 1 + (len(amostras) - JANELA) // SALTO
    indices = np.arange(JANELA)[None, :] + SALTO * np.arange(n)[:, None]
    return np.abs(np.fft.rfft(amostras[indices] * np.hanning(JANELA)[None, :], axis=1))


def envelope_de_ataques(amostras: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(envelope de ataques, envelope só dos graves), um valor por quadro de SALTO amostras."""
    espectro = np.log1p(1000.0 * _quadros(amostras))
    subida = np.maximum(0.0, np.diff(espectro, axis=0, prepend=espectro[:1]))
    graves = int(GRAVES_HZ * JANELA / TAXA) + 1
    envelopes = []
    for fluxo in (subida.mean(axis=1), subida[:, :graves].mean(axis=1)):
        # Sem metade da média local (meio segundo): tira o volume geral, mas deixa um pouco do fundo. Tirar a
        # média inteira zerava as batidas mais fracas (a caixa entre dois bumbos) e o andamento caía pela
        # metade; não tirar nada deixava o ruído decidir o andamento de um ritmo simples.
        largura = max(1, int(0.5 * TAXA / SALTO))
        media = np.convolve(fluxo, np.ones(largura) / largura, mode="same")
        fluxo = np.maximum(0.0, fluxo - FRACAO_DO_FUNDO * media)
        desvio = fluxo.std()
        envelopes.append(fluxo / desvio if desvio > 0 else fluxo)
    return envelopes[0], envelopes[1]


def andamento(envelope: np.ndarray) -> float:
    """
    Período da batida em quadros (com fração): a média da autocorrelação em janelas de uns 9 s (o
    tempograma), com preferência perto de 120 BPM. A autocorrelação é sem tirar a média e normalizada pelo
    atraso zero, como no librosa: assim os candidatos ficam próximos e a preferência desempata entre a
    batida e a metade dela (sem isso, música com bumbo e caixa alternados saía na metade do andamento).
    """
    quadros_por_s = TAXA / SALTO
    menor = int(np.floor(60.0 / BPM_MAXIMO * quadros_por_s))
    maior = int(np.ceil(60.0 / BPM_MINIMO * quadros_por_s))
    janela = JANELA_DO_ANDAMENTO
    hann = np.hanning(janela)
    soma = np.zeros(maior + 1)
    for inicio in range(0, max(1, len(envelope) - janela // 2), janela // 4):
        pedaco = envelope[inicio:inicio + janela]
        if len(pedaco) < janela:
            pedaco = np.pad(pedaco, (0, janela - len(pedaco)))
        pedaco = pedaco * hann
        auto = np.correlate(pedaco, pedaco, mode="full")[janela - 1:janela + maior]
        if auto[0] > 0:
            soma += auto / auto[0]
    atrasos = np.arange(menor, maior + 1)
    bpm = 60.0 * quadros_por_s / atrasos
    peso = np.exp(-0.5 * (np.log2(bpm / BPM_PREFERIDO) / LARGURA_PREFERENCIA) ** 2)
    pontuacao = soma[atrasos] * peso
    i = int(np.argmax(pontuacao))
    # Refina o pico com uma parábola pelos vizinhos (o período raramente cai num número inteiro de quadros)
    if 0 < i < len(atrasos) - 1:
        a, b, c = pontuacao[i - 1], pontuacao[i], pontuacao[i + 1]
        curvatura = a - 2 * b + c
        if curvatura < 0:
            return float(atrasos[i] + 0.5 * (a - c) / curvatura)
    return float(atrasos[i])


def acompanhar_batidas(envelope: np.ndarray, periodo: float) -> np.ndarray:
    """Os quadros das batidas: programação dinâmica sobre o envelope (Ellis, 2007)."""
    n = len(envelope)
    pontos = envelope.astype(float).copy()
    anterior = np.full(n, -1)
    for t in range(n):
        de = int(round(t - 2 * periodo))
        ate = int(round(t - periodo / 2))
        if ate < 0:
            continue
        candidatos = np.arange(max(0, de), ate + 1)
        custo = -RIGIDEZ * np.log((t - candidatos) / periodo) ** 2
        k = int(np.argmax(pontos[candidatos] + custo))
        pontos[t] = envelope[t] + pontos[candidatos[k]] + custo[k]
        anterior[t] = candidatos[k]
    # A última batida: o melhor ponto entre os quadros do último período, já que depois dela não há ataque
    inicio = max(0, n - int(np.ceil(periodo)) - 1)
    t = inicio + int(np.argmax(pontos[inicio:]))
    batidas = []
    while t >= 0:
        batidas.append(t)
        t = anterior[t]
    return np.array(batidas[::-1], dtype=int)


def analisar(amostras: np.ndarray) -> dict:
    """
    As batidas de um som mono em TAXA Hz: {"bpm", "batidas": [s...], "fortes": [s...]}. Sem ritmo
    (som curto ou sem ataques), devolve listas vazias.
    """
    amostras = np.asarray(amostras, dtype=np.float32)
    if len(amostras) < MINIMO_S * TAXA or not np.any(amostras):
        return {"bpm": 0.0, "batidas": [], "fortes": []}
    envelope, graves = envelope_de_ataques(amostras)
    if not envelope.any():
        return {"bpm": 0.0, "batidas": [], "fortes": []}
    periodo = andamento(envelope)
    quadros = acompanhar_batidas(envelope, periodo)
    # O ataque fica meio quadro depois do começo do quadro em que a energia subiu
    segundos = (quadros * SALTO + JANELA / 2) / TAXA
    fase = int(np.argmax([graves[quadros[f::4]].sum() for f in range(min(4, len(quadros)))])) if len(quadros) else 0
    return {
        "bpm": round(60.0 * TAXA / SALTO / periodo, 1),
        "batidas": [round(float(s), 3) for s in segundos],
        "fortes": [round(float(s), 3) for s in segundos[fase::4]],
    }
