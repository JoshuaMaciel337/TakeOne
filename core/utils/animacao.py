# -----------------------------------------------
# TakeOne — animações de entrada e saída no render
#
# Espelha apps/web/src/lib/projeto/animacao.ts: a mesma conta, conferida pelos mesmos casos em
# tests/casos/animacao.json. No FFmpeg ela vira:
#   - opacidade: o filtro `fade` com alfa, que é linear como na prévia;
#   - movimento: expressões de tempo no x e no y do `overlay`;
#   - zoom: `scale` com eval=frame, depois do giro (escala uniforme dá no mesmo antes ou depois).
# -----------------------------------------------
DISTANCIA_VERTICAL = 0.08
DISTANCIA_HORIZONTAL = 0.15
ZOOM_INICIAL = 0.6
SEM_ANIMACAO = {"entrada": {"tipo": "nenhuma", "duracao": 0}, "saida": {"tipo": "nenhuma", "duracao": 0}}


def _limitar(valor: float) -> float:
    return min(1.0, max(0.0, valor))


def suavizar(p: float) -> float:
    return 1 - (1 - p) ** 3


def _ativa(animacao: dict) -> bool:
    return animacao["tipo"] != "nenhuma" and animacao["duracao"] > 0


def transformacao_animada(clipe: dict, t: float) -> dict:
    """A transformação do clipe no instante `t`. Tempos todos na mesma unidade (ticks ou segundos)."""
    animacao = clipe.get("animacao") or SEM_ANIMACAO
    resultado = dict(clipe["transformacao"])
    fim = clipe["inicio"] + clipe["duracao"]

    def aplicar(item: dict, p: float, sentido: int):
        if item["tipo"] == "nenhuma":
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
     "dx": expressão do deslocamento em frações da largura, "dy": em frações da altura}.
    inicio e fim em segundos.
    """
    animacao = clipe.get("animacao") or SEM_ANIMACAO
    fades, escala, dx, dy = [], [], [], []
    for nome, sentido in (("entrada", 1), ("saida", -1)):
        item = animacao[nome]
        if not _ativa(item):
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
    return {
        "fades": fades,
        "escala": "*".join(escala) or None,
        "dx": "+".join(dx) or "0",
        "dy": "+".join(dy) or "0",
    }


def animacoes_cabem(animacao: dict, duracao: float) -> bool:
    """True se as durações cabem no clipe."""
    return animacao["entrada"]["duracao"] + animacao["saida"]["duracao"] <= duracao
