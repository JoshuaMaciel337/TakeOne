# -----------------------------------------------
# TakeOne — keyframes no render
#
# Espelha apps/web/src/lib/projeto/keyframes.ts (a mesma conta, conferida pelos casos de
# tests/casos/keyframes.json). No FFmpeg:
#   - posição e escala viram expressões de tempo no overlay e no scale (eval=frame), somadas às das
#     animações e transições;
#   - rotação vira um rotate com expressão;
#   - opacidade vira comandos por quadro (sendcmd) para o colorchannelmixer, que é rápido; o geq
#     faria a mesma conta pixel a pixel.
# -----------------------------------------------
from core.utils.tempo import TICKS_POR_SEGUNDO

PROPRIEDADES = ("x", "y", "escala", "rotacao", "opacidade")


def _suave(p: float) -> float:
    return p * p * (3 - 2 * p)


def valor_no_tempo(pontos: list[dict], t: float) -> float:
    """O valor da propriedade em `t` (desde o começo do clipe, na mesma unidade dos pontos)."""
    if t <= pontos[0]["t"]:
        return pontos[0]["valor"]
    for a, b in zip(pontos, pontos[1:], strict=False):
        if t < b["t"]:
            p = (t - a["t"]) / (b["t"] - a["t"])
            return a["valor"] + (b["valor"] - a["valor"]) * (_suave(p) if a["curva"] == "suave" else p)
    return pontos[-1]["valor"]


def transformacao_no_tempo(clipe: dict, t: float) -> dict:
    """A transformação em `t` da linha do tempo (mesma unidade de clipe["inicio"]), sem as animações."""
    keyframes = clipe.get("keyframes") or {}
    resultado = dict(clipe["transformacao"])
    for propriedade in PROPRIEDADES:
        pontos = keyframes.get(propriedade)
        if pontos:
            resultado[propriedade] = valor_no_tempo(pontos, t - clipe["inicio"])
    return resultado


def animadas(clipe: dict) -> set[str]:
    """As propriedades que têm keyframes."""
    keyframes = clipe.get("keyframes") or {}
    return {propriedade for propriedade in PROPRIEDADES if keyframes.get(propriedade)}


def transformacao_de_base(clipe: dict) -> dict:
    """
    A transformação que o render usa para o tamanho da caixa: a escala é a maior dos keyframes (o
    clipe é redimensionado uma vez nesse tamanho e só diminui por quadro, sem perder nitidez) e a
    rotação animada fica de fora (o giro é feito por quadro depois).
    """
    keyframes = clipe.get("keyframes") or {}
    base = dict(clipe["transformacao"])
    if keyframes.get("escala"):
        base["escala"] = max(ponto["valor"] for ponto in keyframes["escala"])
    if keyframes.get("rotacao"):
        base["rotacao"] = 0
    if keyframes.get("opacidade"):
        base["opacidade"] = 1
    return base


def _n(valor: float) -> str:
    texto = f"{valor:.6f}".rstrip("0").rstrip(".")
    return "0" if texto in ("", "-0") else texto


def expressao(pontos: list[dict], inicio_do_clipe: float, var: str = "t") -> str:
    """
    A expressão do FFmpeg com o valor em cada instante. inicio_do_clipe em segundos; os pontos em
    ticks desde o começo do clipe; `var` é o tempo do vídeo final, em segundos.
    """
    tempos = [inicio_do_clipe + ponto["t"] / TICKS_POR_SEGUNDO for ponto in pontos]
    resultado = _n(pontos[-1]["valor"])
    for i in range(len(pontos) - 2, -1, -1):
        a, b = pontos[i], pontos[i + 1]
        p = f"(({var}-{_n(tempos[i])})/{_n(tempos[i + 1] - tempos[i])})"
        curva = f"({p}*{p}*(3-2*{p}))" if a["curva"] == "suave" else p
        trecho = f"({_n(a['valor'])}+{_n(b['valor'] - a['valor'])}*{curva})"
        resultado = f"if(lt({var},{_n(tempos[i + 1])}),{trecho},{resultado})"
    return f"if(lt({var},{_n(tempos[0])}),{_n(pontos[0]['valor'])},{resultado})"


def comandos_de_opacidade(pontos: list[dict], inicio_do_clipe: float, janela: tuple[float, float], fps: float,
                          alvo: str) -> str:
    """
    O roteiro do sendcmd que muda a opacidade a cada quadro. janela: (início, fim) do clipe no vídeo
    final, em segundos; os tempos do roteiro contam do começo da janela (o tempo da cadeia do clipe
    antes de ir para o lugar dele). Só escreve quando o valor muda.
    """
    linhas, anterior = [], None
    quadros = round((janela[1] - janela[0]) * fps) + 1
    for n in range(quadros):
        local = n / fps
        valor = min(1.0, max(0.0, valor_no_tempo(pontos, (janela[0] + local - inicio_do_clipe) * TICKS_POR_SEGUNDO)))
        if anterior is None or abs(valor - anterior) > 1e-4:
            linhas.append(f"{_n(local)} {alvo} aa {_n(valor)};")
            anterior = valor
    return "\n".join(linhas) + "\n"
