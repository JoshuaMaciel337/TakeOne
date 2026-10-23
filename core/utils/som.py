# -----------------------------------------------
# TakeOne — som dos clipes: formato dos fades
#
# Espelha apps/web/src/lib/projeto/som.ts. Os formatos são as curvas do `afade` do FFmpeg, com a
# mesma fórmula do af_afade.c, para a prévia (ganho do Web Audio a cada quadro) tocar igual ao
# render. Os casos de tests/casos/fades.json conferem as três pontas: a fórmula aqui, o FFmpeg e o TS.
# -----------------------------------------------
import math
import random
import struct

from core.utils.keyframes import valor_no_tempo
from core.utils.tempo import TICKS_POR_SEGUNDO

# Nome no projeto → curva do afade
CURVAS_DO_FADE = {"linear": "tri", "suave": "qsin", "s": "hsin", "exponencial": "exp"}
CURVA_PADRAO = "linear"


def ganho_do_fade(curva: str, p: float) -> float:
    """O ganho (0 a 1) quando o fade já andou `p` (0 a 1) do caminho, como o afade calcula."""
    p = min(1.0, max(0.0, p))
    if curva == "suave":
        return math.sin(p * math.pi / 2)
    if curva == "s":
        return (1 - math.cos(p * math.pi)) / 2
    if curva == "exponencial":
        # -100 dB no começo, como o afade: exp(ln(10⁻⁵) · (1 − p))
        return math.exp(-11.512925464970227 * (1 - p))
    return p


# -----------------------------------------------
# Abaixar na fala (apps/web/src/lib/projeto/abaixar.ts): a curva de volume gravada no clipe
# -----------------------------------------------
# A curva muda o volume a cada 10 ms; a prévia muda o ganho a cada quadro da tela (16 ms)
PASSO_DA_CURVA = 0.01


def comandos_de_volume(pontos: list[dict] | None, duracao: float, alvo: str, volume: list[dict] | None = None,
                       antes: float = 0) -> str:
    """
    O roteiro do asendcmd com o fator da curva (pontos em ticks desde o começo do clipe) a cada
    PASSO_DA_CURVA, só quando ele muda. Tempos em segundos desde o começo do clipe. `volume`: os
    keyframes de volume do clipe, multiplicados ao abaixar na fala no mesmo roteiro (como a prévia
    multiplica os dois no ganho). `antes`: segundos que o som começa antes do clipe (a mistura de uma
    transição); o roteiro conta do começo do som, e a curva continua no tempo do clipe.
    """
    linhas, anterior = [], None
    for n in range(int(duracao / PASSO_DA_CURVA) + 1):
        roteiro = n * PASSO_DA_CURVA
        local = roteiro - antes
        valor = max(0.0, valor_no_tempo(pontos, local * TICKS_POR_SEGUNDO)) if pontos else 1.0
        if volume:
            valor *= max(0.0, valor_no_tempo(volume, local * TICKS_POR_SEGUNDO))
        if anterior is None or abs(valor - anterior) > 1e-4:
            linhas.append(f"{roteiro:.2f} {alvo} volume {valor:.6f};")
            anterior = valor
    return "\n".join(linhas) + "\n"


# -----------------------------------------------
# Igualar o volume: cada mídia medida na ingestão (LUFS integrado, como o render mede a mistura)
# -----------------------------------------------
LUFS_IGUALAR = -14
GANHO_IGUALAR_MAXIMO_DB = 20
# A mesma conversão que o render faz no som de cada clipe: o número medido é o que entra na mistura
FILTRO_MEDIR_LOUDNESS = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,ebur128=framelog=quiet"


def ganho_para_igualar(lufs: float | None) -> float:
    """Os dB que levam a mídia a -14 LUFS; 0 se ela não foi medida ou é silêncio."""
    if lufs is None or lufs <= -70:
        return 0.0
    return min(max(LUFS_IGUALAR - lufs, -GANHO_IGUALAR_MAXIMO_DB), GANHO_IGUALAR_MAXIMO_DB)


# -----------------------------------------------
# Efeitos de voz: equalizador de três faixas, eco e reverb
#
# Os mesmos nós do Web Audio na prévia (apps/web/src/lib/previa/audio.ts): os filtros do FFmpeg
# (lowshelf, equalizer, highshelf) e o BiquadFilterNode seguem as fórmulas do "Audio EQ Cookbook";
# o eco é a mesma soma de três atrasos; o reverb é a mesma convolução, com a resposta ao impulso
# gerada aqui (servida à prévia pela API), sem normalizar nos dois lados.
# -----------------------------------------------
# Faixa → (filtro do FFmpeg, frequência, largura). Prateleiras com inclinação 1; o meio com Q 1
FAIXAS_DO_EQ = {"grave": ("lowshelf", 120, "t=s:w=1"), "medio": ("equalizer", 1000, "t=q:w=1"),
                "agudo": ("highshelf", 6000, "t=s:w=1")}
EQ_LIMITE_DB = 12
# Três repetições, cada uma mais fraca: o volume da primeira é o "eco" escolhido
ECO_ATRASO_S = 0.18
ECO_REPETICOES = 3
REVERB_DURACAO_S = 1.6
REVERB_PRE_ATRASO_S = 0.02
REVERB_QUEDA_S = 0.35   # constante de tempo do decaimento
REVERB_SEMENTE = 7
REVERB_TAXA = 48000


# Tirar o ronco: o passa-altas antes do equalizador
RONCO_HZ = 80


def filtros_de_voz(efeitos: dict) -> list[str]:
    """Tirar o ronco, equalizador e eco, em ordem. O reverb precisa de outra entrada (veja render.py)."""
    filtros = []
    if (efeitos.get("ronco") or 0) > 0.5:
        # Passa-altas de Butterworth em 80 Hz (Cookbook), o mesmo do BiquadFilterNode da prévia
        filtros.append(f"highpass=f={RONCO_HZ}:t=q:w=0.7071")
    for faixa, (filtro, frequencia, largura) in FAIXAS_DO_EQ.items():
        ganho = efeitos.get(faixa) or 0
        if abs(ganho) > 1e-9:
            filtros.append(f"{filtro}=f={frequencia}:g={ganho:g}:{largura}")
    eco = efeitos.get("eco") or 0
    if eco > 0:
        atrasos = "|".join(f"{round(ECO_ATRASO_S * 1000 * (i + 1))}" for i in range(ECO_REPETICOES))
        quedas = "|".join(f"{eco ** (i + 1):.6f}" for i in range(ECO_REPETICOES))
        filtros.append(f"aecho=in_gain=1:out_gain=1:delays={atrasos}:decays={quedas}")
    return filtros


def resposta_do_reverb() -> list[float]:
    """
    A resposta ao impulso da sala: ruído que decai, sempre o mesmo (semente fixa). A energia soma 1,
    para o "reverb" do clipe ser o volume da cauda.
    """
    sorteio = random.Random(REVERB_SEMENTE)
    total = round(REVERB_DURACAO_S * REVERB_TAXA)
    inicio = round(REVERB_PRE_ATRASO_S * REVERB_TAXA)
    amostras = [0.0] * total
    for i in range(inicio, total):
        t = (i - inicio) / REVERB_TAXA
        amostras[i] = sorteio.gauss(0, 1) * math.exp(-t / REVERB_QUEDA_S)
    energia = math.sqrt(sum(a * a for a in amostras))
    return [a / energia for a in amostras]


def wav_do_reverb() -> bytes:
    """A resposta ao impulso num WAV mono em ponto flutuante de 32 bits."""
    dados = struct.pack(f"<{round(REVERB_DURACAO_S * REVERB_TAXA)}f", *resposta_do_reverb())
    formato = struct.pack("<HHIIHH", 3, 1, REVERB_TAXA, REVERB_TAXA * 4, 4, 32)
    return (b"RIFF" + struct.pack("<I", 4 + 8 + len(formato) + 8 + len(dados)) + b"WAVE"
            + b"fmt " + struct.pack("<I", len(formato)) + formato + b"data" + struct.pack("<I", len(dados)) + dados)


def afir_sem_normalizar() -> str:
    """
    As opções do afir para a convolução pura (sem ganho automático). O FFmpeg 7 normaliza pelo
    irnorm; o 6 (o do CI, no Ubuntu) pelo gtype, que no 7 ficou obsoleto.
    """
    from core.utils.render import versao_principal_ffmpeg

    normalizar = "irnorm=-1" if versao_principal_ffmpeg() >= 7 else "gtype=none"
    return f"afir={normalizar}:irgain=1:irfmt=mono:dry=1:wet=1"
