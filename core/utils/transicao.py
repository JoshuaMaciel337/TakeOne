# -----------------------------------------------
# TakeOne — transições entre clipes da faixa principal, no render
#
# Espelha apps/web/src/lib/projeto/transicao.ts (a mesma conta, conferida por
# tests/casos/transicao.json). A transição fica no clipe que sai e cobre o corte pela metade; na
# janela, os dois clipes aparecem. No FFmpeg ela vira os mesmos recursos das animações: fade com
# alfa para a opacidade (linear), expressão de tempo no x do overlay e scale por quadro no zoom.
# -----------------------------------------------
from core.utils.animacao import suavizar

ZOOM_TRANSICAO = 0.6


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
