# -----------------------------------------------
# TakeOne — animações de entrada, saída e loop no render
#
# Espelha apps/web/src/lib/projeto/animacao.ts: a mesma conta, conferida pelos mesmos casos em
# tests/casos/animacao.json. No FFmpeg ela vira:
#   - opacidade: o filtro `fade` com alfa, que é linear como na prévia;
#   - movimento: expressões de tempo no x e no y do `overlay`;
#   - zoom: `scale` com eval=frame, depois do giro (escala uniforme dá no mesmo antes ou depois);
#   - loop: senos do tempo no deslocamento, no zoom e no giro (`rotate` com expressão).
# -----------------------------------------------
import math

from core.utils.keyframes import transformacao_no_tempo

DISTANCIA_VERTICAL = 0.08
DISTANCIA_HORIZONTAL = 0.15
ZOOM_INICIAL = 0.6
LOOP_PULSAR = 0.06
LOOP_BALANCAR = 6
LOOP_FLUTUAR = 0.02
LOOP_TREMER = 0.008
SEM_ANIMACAO = {"entrada": {"tipo": "nenhuma", "duracao": 0}, "saida": {"tipo": "nenhuma", "duracao": 0}}


def _limitar(valor: float) -> float:
    return min(1.0, max(0.0, valor))


def suavizar(p: float) -> float:
    return 1 - (1 - p) ** 3


def _ativa(animacao: dict) -> bool:
    return animacao["tipo"] != "nenhuma" and animacao["duracao"] > 0


def loop_ativo(loop: dict | None) -> bool:
    return bool(loop) and loop["tipo"] != "nenhum" and loop["periodo"] > 0 and loop["intensidade"] > 0


def efeito_do_loop(loop: dict, s: float) -> dict:
    """O que o loop soma quando já passaram `s` ciclos desde o começo do clipe."""
    efeito = {"dx": 0.0, "dy": 0.0, "escala": 1.0, "rotacao": 0.0}
    i = loop["intensidade"]

    def onda(ciclos: float, fase: float = 0) -> float:
        return math.sin(2 * math.pi * ciclos * s + fase)

    if loop["tipo"] == "pulsar":
        efeito["escala"] = 1 + LOOP_PULSAR * i * (1 - math.cos(2 * math.pi * s)) / 2
    elif loop["tipo"] == "balancar":
        efeito["rotacao"] = LOOP_BALANCAR * i * onda(1)
    elif loop["tipo"] == "flutuar":
        efeito["dy"] = -LOOP_FLUTUAR * i * onda(1)
    elif loop["tipo"] == "tremer":
        efeito["dx"] = LOOP_TREMER * i * (0.6 * onda(3) + 0.4 * onda(5, 1))
        efeito["dy"] = LOOP_TREMER * i * (0.6 * onda(4, 2) + 0.4 * onda(7))
    return efeito


def maior_zoom_do_loop(clipe: dict) -> float:
    """O maior tamanho que o pulsar alcança (o render redimensiona o clipe uma vez nesse tamanho)."""
    loop = (clipe.get("animacao") or {}).get("loop")
    if loop_ativo(loop) and loop["tipo"] == "pulsar":
        return 1 + LOOP_PULSAR * loop["intensidade"]
    return 1.0


def loop_gira(clipe: dict) -> bool:
    loop = (clipe.get("animacao") or {}).get("loop")
    return loop_ativo(loop) and loop["tipo"] == "balancar"


def transformacao_animada(clipe: dict, t: float) -> dict:
    """
    A transformação do clipe no instante `t`, com os keyframes e as animações. Tempos todos na mesma
    unidade (ticks ou segundos), também os dos keyframes.
    """
    animacao = clipe.get("animacao") or SEM_ANIMACAO
    resultado = transformacao_no_tempo(clipe, t)
    fim = clipe["inicio"] + clipe["duracao"]

    def aplicar(item: dict, p: float, sentido: int):
        # Letra a letra não mexe na caixa: só no trecho que aparece (core/utils/letras.py)
        if item["tipo"] in ("nenhuma", "letras", "palavras"):
            return
        resultado["opacidade"] *= p
        falta = 1 - suavizar(p)
        if item["tipo"] == "subir":
            resultado["y"] += sentido * falta * DISTANCIA_VERTICAL
        elif item["tipo"] == "descer":
            resultado["y"] -= sentido * falta * DISTANCIA_VERTICAL
        elif item["tipo"] == "deslizar":
            resultado["x"] -= sentido * falta * DISTANCIA_HORIZONTAL
        elif item["tipo"] == "zoom":
            resultado["escala"] *= ZOOM_INICIAL + (1 - ZOOM_INICIAL) * suavizar(p)

    entrada, saida = animacao["entrada"], animacao["saida"]
    if _ativa(entrada):
        aplicar(entrada, _limitar((t - clipe["inicio"]) / entrada["duracao"]), 1)
    if _ativa(saida):
        aplicar(saida, _limitar((fim - t) / saida["duracao"]), -1)
    loop = animacao.get("loop")
    if loop_ativo(loop):
        efeito = efeito_do_loop(loop, (t - clipe["inicio"]) / loop["periodo"])
        resultado["x"] += efeito["dx"]
        resultado["y"] += efeito["dy"]
        resultado["escala"] *= efeito["escala"]
        resultado["rotacao"] += efeito["rotacao"]
    return resultado


# -----------------------------------------------
# Expressões do FFmpeg (tempos em segundos, no tempo do vídeo final)
# -----------------------------------------------
def _n(valor: float) -> str:
    texto = f"{valor:.6f}".rstrip("0").rstrip(".")
    return "0" if texto in ("", "-0") else texto


def _progresso(var: str, inicio: float, fim: float, item: dict, entrada: bool) -> str:
    duracao = item["duracao"]
    if entrada:
        return f"clip(({var}-{_n(inicio)})/{_n(duracao)},0,1)"
    return f"clip(({_n(fim)}-{var})/{_n(duracao)},0,1)"


def _falta(progresso: str) -> str:
    """1 - suavizar(p) = (1 - p)³."""
    return f"pow(1-{progresso},3)"


def filtros_de_animacao(clipe: dict, inicio: float, fim: float, var_tempo: str = "t") -> dict:
    """
    {"fades": filtros de opacidade, "escala": expressão do fator de zoom (ou None),
     "dx": expressão do deslocamento em frações da largura, "dy": em frações da altura,
     "rotacao": expressão dos graus somados pelo loop (ou None)}.
    inicio e fim em segundos, como os tempos da animação.
    """
    animacao = clipe.get("animacao") or SEM_ANIMACAO
    fades, escala, dx, dy = [], [], [], []
    for nome, sentido in (("entrada", 1), ("saida", -1)):
        item = animacao[nome]
        if not _ativa(item) or item["tipo"] in ("letras", "palavras"):
            continue
        duracao = item["duracao"]
        if nome == "entrada":
            fades.append(f"fade=t=in:st={_n(inicio)}:d={_n(duracao)}:alpha=1")
        else:
            fades.append(f"fade=t=out:st={_n(fim - duracao)}:d={_n(duracao)}:alpha=1")
        falta = _falta(_progresso(var_tempo, inicio, fim, item, nome == "entrada"))
        if item["tipo"] == "subir":
            dy.append(f"{sentido}*{falta}*{_n(DISTANCIA_VERTICAL)}")
        elif item["tipo"] == "descer":
            dy.append(f"{-sentido}*{falta}*{_n(DISTANCIA_VERTICAL)}")
        elif item["tipo"] == "deslizar":
            dx.append(f"{-sentido}*{falta}*{_n(DISTANCIA_HORIZONTAL)}")
        elif item["tipo"] == "zoom":
            escala.append(f"({_n(ZOOM_INICIAL)}+{_n(1 - ZOOM_INICIAL)}*(1-{falta}))")
    rotacao = None
    loop = animacao.get("loop")
    if loop_ativo(loop):
        i = loop["intensidade"]
        s = f"(({var_tempo}-{_n(inicio)})/{_n(loop['periodo'])})"

        def onda(ciclos: int, fase: int = 0) -> str:
            return f"sin(2*PI*{ciclos}*{s}" + (f"+{fase})" if fase else ")")

        if loop["tipo"] == "pulsar":
            escala.append(f"(1+{_n(LOOP_PULSAR * i / 2)}*(1-cos(2*PI*{s})))")
        elif loop["tipo"] == "balancar":
            rotacao = f"{_n(LOOP_BALANCAR * i)}*{onda(1)}"
        elif loop["tipo"] == "flutuar":
            dy.append(f"-{_n(LOOP_FLUTUAR * i)}*{onda(1)}")
        elif loop["tipo"] == "tremer":
            amplitude = _n(LOOP_TREMER * i)
            dx.append(f"{amplitude}*(0.6*{onda(3)}+0.4*{onda(5, 1)})")
            dy.append(f"{amplitude}*(0.6*{onda(4, 2)}+0.4*{onda(7)})")
    return {
        "fades": fades,
        "escala": "*".join(escala) or None,
        "dx": "+".join(dx) or "0",
        "dy": "+".join(dy) or "0",
        "rotacao": rotacao,
    }


def animacoes_cabem(animacao: dict, duracao: float) -> bool:
    """True se as durações cabem no clipe."""
    return animacao["entrada"]["duracao"] + animacao["saida"]["duracao"] <= duracao
