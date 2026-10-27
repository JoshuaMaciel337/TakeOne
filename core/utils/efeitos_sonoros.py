# -----------------------------------------------
# TakeOne — efeitos sonoros desenhados aqui (o Clipar, ADR 0004, 14.12d)
#
# Cada efeito é uma conta: ruído filtrado com o filtro de variáveis de estado (Chamberlin) e a frequência andando,
# tons com a altura caindo e envelopes. O sorteio tem semente fixa, então o mesmo efeito sai igual sempre: nenhum
# arquivo de terceiros, e nada para guardar além do próprio WAV na mídia do espaço. Estéreo, 48 kHz, 16 bits, com o
# pico em -1 dBFS.
# -----------------------------------------------
import io
import wave

import numpy as np

TAXA = 48_000
PICO = 10 ** (-1 / 20)
# Mude a versão quando o desenho de um efeito mudar: a mídia já criada no espaço continua, e o pedido novo faz outra
VERSAO = 1

EFEITOS = {
    "whoosh": ("Whoosh", "Ar passando rápido, para cortes e entradas."),
    "swish": ("Swish", "Um whoosh curto e agudo, para textos que entram."),
    "camera": ("Clique de câmera", "O obturador abrindo e fechando, para o flash."),
    "impacto": ("Impacto grave", "Um golpe fundo que treme, para a frase forte."),
    "pagina": ("Página", "Uma folha virando, para a Bíblia e os livros."),
    "teclado": ("Teclado", "Teclas sendo digitadas, para o texto que se escreve."),
    "estalo": ("Estalo", "Um pop curto, para o que aparece na tela."),
    "subida": ("Subida", "O som que cresce até o corte, para a tensão."),
    "brilho": ("Brilho", "Sininhos que cintilam, para uma revelação."),
}


def _filtro(entrada: np.ndarray, frequencia: np.ndarray, q: float, saida: str = "banda") -> np.ndarray:
    """O filtro de variáveis de estado com a frequência mudando a cada amostra (passa-baixa, banda ou passa-alta)."""
    f = 2 * np.sin(np.pi * np.minimum(frequencia, TAXA / 6) / TAXA)
    amortecer = 1 / q
    baixa = banda = 0.0
    resultado = np.empty_like(entrada)
    for i, x in enumerate(entrada.tolist()):
        alta = x - baixa - amortecer * banda
        banda += f[i] * alta
        baixa += f[i] * banda
        resultado[i] = baixa if saida == "baixa" else banda if saida == "banda" else alta
    return resultado


def _amostras(segundos: float) -> np.ndarray:
    return np.arange(round(segundos * TAXA)) / TAXA


def _ruido(sorteio: np.random.Generator, n: int) -> np.ndarray:
    return sorteio.standard_normal(n)


def _ressonancia(t: np.ndarray, frequencia: float, queda: float) -> np.ndarray:
    return np.sin(2 * np.pi * frequencia * t) * np.exp(-t / queda)


def _clique(sorteio, n: int, inicio: float, ressoa: float, forca: float) -> np.ndarray:
    """Um clique mecânico: um estalo de ruído e uma ressonância curta que morre logo."""
    som = np.zeros(n)
    i = round(inicio * TAXA)
    t = _amostras(0.05)
    estalo = _ruido(sorteio, len(t)) * np.exp(-t / 0.0015)
    corpo = _ressonancia(t, ressoa, 0.012) * 0.8
    pedaco = (estalo + corpo)[: n - i]
    som[i:i + len(pedaco)] += forca * pedaco
    return som


def _whoosh(sorteio, duracao: float, de: float, ate: float, pico: float) -> tuple[np.ndarray, np.ndarray]:
    t = _amostras(duracao)
    p = t / duracao
    # A frequência sobe até o pico e cai um pouco depois; o volume é uma cúpula com o máximo no mesmo ponto
    sobe = np.minimum(p / pico, 1)
    desce = np.clip((p - pico) / (1 - pico), 0, 1)
    frequencia = de * (ate / de) ** sobe * (1 - 0.55 * desce)
    volume = np.where(p < pico, np.sin(np.pi / 2 * p / pico) ** 2, np.cos(np.pi / 2 * desce) ** 1.5)
    ruido = _ruido(sorteio, len(t))
    som = _filtro(ruido, frequencia, 1.4) * volume
    # Da esquerda para a direita
    lado = np.clip(p, 0, 1)
    return som * np.cos(lado * np.pi / 2) * 1.2, som * np.sin(lado * np.pi / 2) * 1.2


def _impacto(sorteio) -> np.ndarray:
    t = _amostras(1.8)
    altura = 38 + 52 * np.exp(-t / 0.12)
    fase = 2 * np.pi * np.cumsum(altura) / TAXA
    corpo = np.sin(fase) * np.exp(-t / 0.55)
    golpe = _filtro(_ruido(sorteio, len(t)) * np.exp(-t / 0.03), np.full(len(t), 450.0), 0.8, "baixa")
    return np.tanh(1.6 * (corpo + 1.4 * golpe))


def _pagina(sorteio) -> np.ndarray:
    t = _amostras(0.65)
    ruido = _filtro(_ruido(sorteio, len(t)), np.full(len(t), 2600.0), 0.7)
    # O papel amassa em estalinhos: rajadas curtas em lugares sorteados, mais densas no meio
    rajadas = np.zeros(len(t))
    for _ in range(26):
        centro = sorteio.beta(2.2, 2.2) * 0.6
        largura = sorteio.uniform(0.006, 0.03)
        rajadas += sorteio.uniform(0.3, 1) * np.exp(-((t - centro) / largura) ** 2)
    envelope = np.sin(np.pi * np.clip(t / 0.62, 0, 1)) ** 0.8
    return ruido * (0.25 + rajadas) * envelope


def _teclado(sorteio) -> np.ndarray:
    duracao = 1.3
    n = round(duracao * TAXA)
    som = np.zeros(n)
    instante = 0.04
    while instante < duracao - 0.12:
        forca = sorteio.uniform(0.55, 1)
        som += _clique(sorteio, n, instante, sorteio.uniform(1800, 2600), forca)
        # O "toc" da tecla voltando, grave e curto
        i = round((instante + 0.035) * TAXA)
        t = _amostras(0.04)
        toc = (_ressonancia(t, sorteio.uniform(170, 230), 0.01) * 0.6 * forca)[: n - i]
        som[i:i + len(toc)] += toc
        instante += sorteio.choice([0.09, 0.12, 0.15, 0.2, 0.28])
    return som


def _estalo() -> np.ndarray:
    t = _amostras(0.16)
    altura = 180 + 760 * np.exp(-t / 0.012)
    fase = 2 * np.pi * np.cumsum(altura) / TAXA
    return np.sin(fase) * np.exp(-t / 0.035) * np.minimum(t / 0.0015, 1)


def _subida(sorteio) -> np.ndarray:
    t = _amostras(2.0)
    p = t / 2.0
    frequencia = 220 * (6000 / 220) ** (p ** 1.6)
    ruido = _filtro(_ruido(sorteio, len(t)), frequencia, 2.2)
    altura = 110 * (880 / 110) ** p
    tom = np.sin(2 * np.pi * np.cumsum(altura) / TAXA) * 0.35
    crescendo = p ** 2.2
    # Corta seco no fim (onde entra o corte), com 5 ms para não estalar
    fim = np.clip((2.0 - t) / 0.005, 0, 1)
    return (ruido + tom) * crescendo * fim


def _brilho(sorteio) -> np.ndarray:
    t = _amostras(1.6)
    som = np.zeros(len(t))
    # Sinos com parciais fora da série harmônica (como um sino de verdade), entrando em escada
    for k, base in enumerate((1320.0, 1760.0, 2217.0, 2637.0)):
        inicio = k * 0.07
        local = np.clip(t - inicio, 0, None)
        liga = (t >= inicio).astype(float)
        for parcial, peso in ((1, 1), (2.76, 0.45), (5.4, 0.22), (8.93, 0.1)):
            som += liga * peso * np.sin(2 * np.pi * base * parcial * local) * np.exp(-local / (0.55 / parcial ** 0.4))
    cintilar = _filtro(_ruido(sorteio, len(t)), np.full(len(t), 9000.0), 3) * np.exp(-t / 0.4) * 0.15
    return som + cintilar


def sintetizar(efeito: str) -> np.ndarray:
    """O efeito em estéreo (2 × amostras), em ponto flutuante, com o pico em -1 dBFS."""
    if efeito not in EFEITOS:
        raise ValueError("Efeito sonoro desconhecido.")
    sorteio = np.random.default_rng(sum(map(ord, efeito)) * 7919 + VERSAO)
    if efeito == "whoosh":
        esquerda, direita = _whoosh(sorteio, 0.9, 260, 3200, 0.58)
    elif efeito == "swish":
        esquerda, direita = _whoosh(sorteio, 0.38, 1400, 7000, 0.35)
    else:
        mono = {
            "camera": lambda: (_clique(sorteio, round(0.4 * TAXA), 0.01, 2300, 1)
                               + _clique(sorteio, round(0.4 * TAXA), 0.1, 1650, 0.75)),
            "impacto": lambda: _impacto(sorteio),
            "pagina": lambda: _pagina(sorteio),
            "teclado": lambda: _teclado(sorteio),
            "estalo": _estalo,
            "subida": lambda: _subida(sorteio),
            "brilho": lambda: _brilho(sorteio),
        }[efeito]()
        esquerda = direita = mono
    estereo = np.vstack([esquerda, direita])
    # Sem nível contínuo, e 3 ms de rampa nas pontas para nenhum começar ou acabar estalando
    estereo -= estereo.mean(axis=1, keepdims=True)
    rampa = min(round(0.003 * TAXA), estereo.shape[1] // 2)
    if rampa:
        subida = np.linspace(0, 1, rampa)
        estereo[:, :rampa] *= subida
        estereo[:, -rampa:] *= subida[::-1]
    return estereo * (PICO / max(np.abs(estereo).max(), 1e-9))


def wav(efeito: str) -> bytes:
    """O efeito num WAV de 16 bits, estéreo, 48 kHz."""
    estereo = sintetizar(efeito)
    inteiros = np.clip(np.round(estereo.T * 32767), -32768, 32767).astype("<i2")
    saida = io.BytesIO()
    with wave.open(saida, "wb") as arquivo:
        arquivo.setnchannels(2)
        arquivo.setsampwidth(2)
        arquivo.setframerate(TAXA)
        arquivo.writeframes(inteiros.tobytes())
    return saida.getvalue()


def duracao(efeito: str) -> float:
    return sintetizar(efeito).shape[1] / TAXA


def lista_de_efeitos() -> list[dict]:
    return [{"id": chave, "nome": nome, "descricao": descricao} for chave, (nome, descricao) in EFEITOS.items()]


def chave_do_efeito(efeito: str) -> str:
    return f"{efeito}:v{VERSAO}"


