# -----------------------------------------------
# TakeOne — texto em fala com o Kokoro-82M (pesos Apache 2.0), na CPU, sem PyTorch
#
# 1. Fonemas: o espeak-ng (GPL-3) roda como programa separado, um pedaço de texto por vez entre os
#    sinais de pontuação, que voltam para o lugar (o Kokoro faz a entonação por eles). Rodar à parte
#    mantém a licença dele fora do TakeOne, como o ComfyUI e o deep-filter.
# 2. Pedaços: o modelo fala no máximo 510 fonemas por vez; o texto é cortado de preferência no fim das
#    frases, depois nas vírgulas e por último entre palavras, em pedaços de tamanho parecido.
# 3. Voz: o estilo de cada voz é uma tabela com uma linha por tamanho de pedaço.
# 4. Junção: o silêncio das pontas de cada pedaço sai e entra uma pausa no lugar da pontuação.
# A divisão em pedaços e as pausas seguem o kokoro-onnx (MIT, THIRD_PARTY.md).
# -----------------------------------------------
import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np

TAXA = 24000
MAXIMO_DE_FONEMAS = 510
LARGURA_DO_ESTILO = 256
PAUSA_FRASE_S = 0.25
PAUSA_VIRGULA_S = 0.1
FIM_DE_FRASE = ".!?…"
MEIO_DE_FRASE = ",;:"
# Silêncio: o que fica 50 dB abaixo do pico da fala, em janelas de 2048 amostras
SILENCIO_DB = 50.0

VOZES = {
    "pf_dora": "Dora (feminina)",
    "pm_alex": "Alex (masculina)",
    "pm_santa": "Santa (masculina, grave)",
}
VOZ_PADRAO = "pf_dora"
VELOCIDADE_MINIMA, VELOCIDADE_MAXIMA = 0.7, 1.4

# Pontuação que o modelo conhece. Vírgula e ponto entre algarismos são do número ("39,90", "1.500")
_PONTUACAO = re.compile(r"((?:[.,](?!\d)|(?<!\d)[.,]|[!?…;:—\"“”«»()])+)")
_ABRE = "(\"“«"
_REAIS = re.compile(r"R\$ ?(\d[\d.]*)(?:,(\d{2}))?")


def normalizar(texto: str) -> str:
    """O que o espeak lê errado em português: "R$ 39,90" vira "39 reais e 90 centavos"."""
    def reais(achado: re.Match) -> str:
        inteiro, centavos = achado.group(1).rstrip("."), achado.group(2)
        unidade = "real" if inteiro == "1" else "reais"
        if centavos and centavos != "00":
            return f"{inteiro} {unidade} e {int(centavos)} {'centavo' if centavos == '01' else 'centavos'}"
        return f"{inteiro} {unidade}"
    return _REAIS.sub(reais, " ".join(texto.split()))


def fonemas(texto: str, espeak: str = "espeak-ng", idioma: str = "pt-br") -> str:
    """O texto em IPA com as marcas de tônica, com a pontuação de volta no lugar (como o phonemizer)."""
    partes: list[str] = []
    abrindo = ""
    for pedaco in _PONTUACAO.split(normalizar(texto)):
        if not pedaco.strip():
            continue
        if _PONTUACAO.fullmatch(pedaco.strip()):
            sinais = pedaco.strip()
            # O que abre (parêntese, aspas) vai grudado na palavra seguinte; o resto, na anterior
            fecha = sinais.rstrip(_ABRE)
            abrindo += sinais[len(fecha):]
            if fecha:
                if partes:
                    # O travessão fica solto, com espaço dos dois lados (como o phonemizer deixa)
                    partes[-1] += (" " + fecha) if fecha.startswith("—") else fecha
                else:
                    abrindo = fecha + abrindo
            continue
        saida = subprocess.run([espeak, "-q", "-v", idioma, "--ipa", "--", pedaco.strip()], capture_output=True,
                               text=True, encoding="utf-8", check=True).stdout
        partes.append(abrindo + " ".join(saida.split()))
        abrindo = ""
    return " ".join(p for p in partes if p)


def _atomos(texto: str, limite: int, nivel: int = 0):
    """Pedaços de no máximo `limite`, cortados no lugar menos ruim (frase, vírgula, palavra, meio)."""
    if len(texto) <= limite:
        if texto:
            yield texto
        return
    fronteiras = (rf"(?<=[{re.escape(FIM_DE_FRASE)}])\s+", rf"(?<=[{re.escape(MEIO_DE_FRASE)}])\s+", r"\s+")
    for indice in range(nivel, len(fronteiras)):
        pedacos = re.split(fronteiras[indice], texto)
        if len(pedacos) > 1:
            for pedaco in pedacos:
                yield from _atomos(pedaco.strip(), limite, indice + 1)
            return
    for inicio in range(0, len(texto), limite):
        yield texto[inicio:inicio + limite]


def _agrupar(tamanhos: list[int], limite: int) -> list[tuple[int, int]]:
    grupos, inicio, tamanho = [], 0, 0
    for i, n in enumerate(tamanhos):
        candidato = n if i == inicio else tamanho + 1 + n
        if candidato > limite and i > inicio:
            grupos.append((inicio, i))
            inicio, tamanho = i, n
        else:
            tamanho = candidato
    if tamanhos:
        grupos.append((inicio, len(tamanhos)))
    return grupos


def dividir(texto_em_fonemas: str, limite: int = MAXIMO_DE_FONEMAS) -> list[str]:
    """Pedaços de no máximo `limite` fonemas, do mesmo tamanho na medida do possível (um pedaço curto
    no fim sai com outro ritmo e outro volume)."""
    atomos = list(_atomos(texto_em_fonemas.strip(), limite))
    if not atomos:
        return []
    tamanhos = [len(a) for a in atomos]
    menos = len(_agrupar(tamanhos, limite))
    baixo, alto = max(tamanhos), limite
    while baixo < alto:
        meio = (baixo + alto) // 2
        if len(_agrupar(tamanhos, meio)) <= menos:
            alto = meio
        else:
            baixo = meio + 1
    return [" ".join(atomos[a:b]) for a, b in _agrupar(tamanhos, baixo)]


def pausa_depois(pedaco: str) -> float:
    sinal = pedaco.rstrip()[-1:]
    return PAUSA_FRASE_S if sinal in FIM_DE_FRASE else PAUSA_VIRGULA_S if sinal in MEIO_DE_FRASE else 0.0


def aparar(som: np.ndarray, janela: int = 2048, salto: int = 512) -> np.ndarray:
    """Sem o silêncio do começo e do fim (o modelo deixa um pouco em cada pedaço)."""
    if len(som) < janela:
        return som
    n = 1 + (len(som) - janela) // salto
    quadros = som[np.arange(janela)[None, :] + salto * np.arange(n)[:, None]]
    energia = np.sqrt(np.mean(quadros.astype(np.float64) ** 2, axis=1))
    if energia.max() <= 0:
        return som[:0]
    db = 20 * np.log10(np.maximum(energia, 1e-10) / energia.max())
    vivos = np.flatnonzero(db > -SILENCIO_DB)
    return som[vivos[0] * salto:min(len(som), vivos[-1] * salto + janela)]


def tokens(texto_em_fonemas: str, vocabulario: dict[str, int]) -> list[int]:
    """Os números dos fonemas que o modelo conhece (o resto fica de fora)."""
    return [vocabulario[c] for c in texto_em_fonemas if c in vocabulario]


@lru_cache(maxsize=1)
def _modelo(pasta: str):
    import onnxruntime

    opcoes = onnxruntime.SessionOptions()
    opcoes.intra_op_num_threads = 0
    sessao = onnxruntime.InferenceSession(str(Path(pasta) / "model.onnx"), opcoes, providers=["CPUExecutionProvider"])
    vocabulario = json.loads((Path(pasta) / "tokenizer.json").read_text(encoding="utf-8"))["model"]["vocab"]
    return sessao, vocabulario


def sintetizar(texto: str, pasta_do_modelo: Path, voz: str = VOZ_PADRAO, velocidade: float = 1.0,
               espeak: str = "espeak-ng", reportar=None) -> np.ndarray:
    """A fala do texto em float32, mono, TAXA Hz. `reportar(fracao)` acompanha os pedaços."""
    if voz not in VOZES:
        raise ValueError(f"Voz desconhecida: {voz}")
    sessao, vocabulario = _modelo(str(pasta_do_modelo))
    estilos = np.fromfile(Path(pasta_do_modelo) / f"{voz}.bin", dtype=np.float32).reshape(-1, 1, LARGURA_DO_ESTILO)
    pedacos = dividir(fonemas(texto, espeak))
    partes = []
    for i, pedaco in enumerate(pedacos):
        numeros = tokens(pedaco, vocabulario)
        if not numeros:
            continue
        saida = sessao.run(None, {
            "input_ids": np.array([[0, *numeros, 0]], dtype=np.int64),
            "style": estilos[min(len(numeros), len(estilos)) - 1],
            "speed": np.array([velocidade], dtype=np.float32),
        })
        partes.append(aparar(np.asarray(saida[0], dtype=np.float32).ravel()))
        if i < len(pedacos) - 1:
            partes.append(np.zeros(int(pausa_depois(pedaco) * TAXA), dtype=np.float32))
        if reportar:
            reportar((i + 1) / len(pedacos))
    return np.concatenate(partes) if partes else np.zeros(0, dtype=np.float32)
