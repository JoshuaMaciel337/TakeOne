# -----------------------------------------------
# TakeOne — transições entre clipes da faixa principal, no render
#
# Espelha apps/web/src/lib/projeto/transicao.ts (a mesma conta, conferida por
# tests/casos/transicao.json). A transição fica no clipe que sai e cobre o corte pela metade; na
# janela, os dois clipes aparecem. No FFmpeg ela vira os mesmos recursos das animações: fade com
# alfa para a opacidade (linear), expressão de tempo no x do overlay e scale por quadro no zoom.
# As cortinas não mexem na transformação: revelam parte de quem entra. No FFmpeg, um geq zera o alfa
# fora da parte revelada, ligado só na janela da transição (o geq é lento).
# -----------------------------------------------
from core.utils.animacao import suavizar

ZOOM_TRANSICAO = 0.6
CORTINAS = ("cortina_direita", "cortina_esquerda", "cortina_baixo", "cortina_cima")
REVELADO_INTEIRO = {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0}


def janelas_da_principal(clipes: list[dict]) -> dict[str, dict]:
    """id → {"inicio", "fim", "efeitos"}: quanto de cada clipe aparece, contando as transições."""
    janelas = {c["id"]: {"inicio": c["inicio"], "fim": c["inicio"] + c["duracao"], "efeitos": []} for c in clipes}
    for clipe, proximo in zip(clipes, clipes[1:], strict=False):
        transicao = clipe.get("transicao")
        if not transicao or transicao["duracao"] <= 0:
            continue
        corte = clipe["inicio"] + clipe["duracao"]
        inicio = corte - transicao["duracao"] / 2
        fim = inicio + transicao["duracao"]
        janelas[clipe["id"]]["fim"] = fim
        janelas[clipe["id"]]["efeitos"].append({"tipo": transicao["tipo"], "papel": "sai", "inicio": inicio,
                                                "duracao": transicao["duracao"]})
        janelas[proximo["id"]]["inicio"] = inicio
        janelas[proximo["id"]]["efeitos"].append({"tipo": transicao["tipo"], "papel": "entra", "inicio": inicio,
                                                  "duracao": transicao["duracao"]})
    return janelas


def transformacao_na_transicao(base: dict, efeitos: list[dict], t: float) -> dict:
    resultado = dict(base)
    for efeito in efeitos:
        p = min(1.0, max(0.0, (t - efeito["inicio"]) / efeito["duracao"]))
        e = suavizar(p)
        entra = efeito["papel"] == "entra"
        if efeito["tipo"] == "fusao":
            if entra:
                resultado["opacidade"] *= p
        elif efeito["tipo"] == "escurecer":
            resultado["opacidade"] *= min(1.0, max(0.0, 2 * p - 1)) if entra else min(1.0, max(0.0, 1 - 2 * p))
        elif efeito["tipo"] == "deslizar":
            if entra:
                resultado["x"] += 1 - e
        elif efeito["tipo"] == "empurrar":
            resultado["x"] += (1 - e) if entra else -e
        elif efeito["tipo"] == "zoom" and entra:
            resultado["escala"] *= ZOOM_TRANSICAO + (1 - ZOOM_TRANSICAO) * e
            resultado["opacidade"] *= p
    return resultado


def revelado_na_transicao(efeitos: list[dict], t: float) -> dict:
    """A parte do clipe que aparece no instante t, em frações dele (x0, y0, x1, y1), antes de girar."""
    revelado = dict(REVELADO_INTEIRO)
    for efeito in efeitos:
        if efeito["papel"] != "entra":
            continue
        e = suavizar(min(1.0, max(0.0, (t - efeito["inicio"]) / efeito["duracao"])))
        if efeito["tipo"] == "cortina_direita":
            revelado["x1"] = min(revelado["x1"], e)
        elif efeito["tipo"] == "cortina_esquerda":
            revelado["x0"] = max(revelado["x0"], 1 - e)
        elif efeito["tipo"] == "cortina_baixo":
            revelado["y1"] = min(revelado["y1"], e)
        elif efeito["tipo"] == "cortina_cima":
            revelado["y0"] = max(revelado["y0"], 1 - e)
    return revelado


def filtro_de_cortina(efeitos: list[dict], deslocamento: float) -> str | None:
    """
    O geq que deixa transparente o que a cortina ainda não revelou, ou None sem cortina.
    deslocamento: quanto somar ao T do geq para chegar ao tempo do vídeo final (o geq fica antes do
    setpts que leva o clipe para o lugar dele).
    """
    condicoes, fim = [], 0.0
    for efeito in efeitos:
        if efeito["papel"] != "entra" or efeito["tipo"] not in CORTINAS:
            continue
        inicio, duracao = efeito["inicio"], efeito["duracao"]
        e = f"(1-pow(1-clip((T+{_n(deslocamento)}-{_n(inicio)})/{_n(duracao)},0,1),3))"
        # O centro do pixel, como o v_local do shader da prévia
        condicoes.append({
            "cortina_direita": f"lte((X+0.5)/W,{e})",
            "cortina_esquerda": f"gte((X+0.5)/W,1-{e})",
            "cortina_baixo": f"lte((Y+0.5)/H,{e})",
            "cortina_cima": f"gte((Y+0.5)/H,1-{e})",
        }[efeito["tipo"]])
        fim = max(fim, inicio + duracao - deslocamento)
    if not condicoes:
        return None
    alfa = f"alpha(X,Y)*{'*'.join(condicoes)}"
    return (f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='{alfa}':enable='lt(t,{_n(fim)})'")


def _n(valor: float) -> str:
    texto = f"{valor:.6f}".rstrip("0").rstrip(".")
    return "0" if texto in ("", "-0") else texto


def filtros_de_transicao(efeitos: list[dict], var_tempo: str = "t") -> dict:
    """
    Como filtros_de_animacao: {"fades", "escala", "dx", "dy"}. Efeitos com tempos em segundos.
    """
    fades, escala, dx = [], [], []
    for efeito in efeitos:
        inicio, duracao = efeito["inicio"], efeito["duracao"]
        entra = efeito["papel"] == "entra"
        p = f"clip(({var_tempo}-{_n(inicio)})/{_n(duracao)},0,1)"
        falta = f"pow(1-{p},3)"     # 1 - suavizar(p)
        tipo = efeito["tipo"]
        if tipo == "fusao" and entra:
            fades.append(f"fade=t=in:st={_n(inicio)}:d={_n(duracao)}:alpha=1")
        elif tipo == "escurecer":
            meio = duracao / 2
            if entra:
                fades.append(f"fade=t=in:st={_n(inicio + meio)}:d={_n(meio)}:alpha=1")
            else:
                fades.append(f"fade=t=out:st={_n(inicio)}:d={_n(meio)}:alpha=1")
        elif tipo == "deslizar" and entra:
            dx.append(falta)
        elif tipo == "empurrar":
            dx.append(falta if entra else f"-(1-{falta})")
        elif tipo == "zoom" and entra:
            fades.append(f"fade=t=in:st={_n(inicio)}:d={_n(duracao)}:alpha=1")
            escala.append(f"({_n(ZOOM_TRANSICAO)}+{_n(1 - ZOOM_TRANSICAO)}*(1-{falta}))")
    return {"fades": fades, "escala": "*".join(escala) or None, "dx": "+".join(dx) or "0", "dy": "0"}
