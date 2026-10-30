# -----------------------------------------------
# TakeOne — o layout de uma cena no formato em pé (lib/projeto/layoutDaCena.ts, casos em tests/casos/layout.json)
#
#   caber: o clipe inteiro no meio, sobre uma cópia dele mesmo cobrindo o quadro, desfocada;
#   duas pessoas e tela e rosto: o quadro dividido em cima e embaixo, cada parte com um pedaço da imagem.
# A cópia de baixo guarda o id e o som do clipe; a outra vai para uma faixa logo acima, sem som.
# -----------------------------------------------
from collections.abc import Callable

from core.utils.geometria import recorte_na_fonte

SUFIXO_DO_LAYOUT = "~layout"
DIVISAO_MINIMA = 0.2
ZOOM_MAXIMO = 4.0


def _limitar(valor: float, minimo: float, maximo: float) -> float:
    return min(maximo, max(minimo, valor))


def tem_layout(clipe: dict) -> bool:
    return bool(clipe.get("layout") and clipe.get("midia_id") and not clipe.get("texto") and not clipe.get("ajuste"))


def quadro_da_proporcao(proporcao: str) -> tuple[float, float]:
    largura, altura = (float(v) for v in proporcao.split(":"))
    return largura, altura


def partes_da_divisao(divisao: float) -> tuple[float, float]:
    cima = _limitar(divisao, DIVISAO_MINIMA, 1 - DIVISAO_MINIMA)
    return cima, 1 - cima


def recorte_da_regiao(regiao: dict, midia: tuple[float, float], alvo: tuple[float, float]) -> dict:
    """O maior retângulo da mídia na proporção do alvo, dividido pelo zoom, em volta do centro e dentro da imagem."""
    proporcao = alvo[0] / alvo[1]
    zoom = _limitar(regiao["zoom"], 1, ZOOM_MAXIMO)
    if midia[0] / midia[1] > proporcao:
        largura, altura = midia[1] * proporcao / midia[0], 1.0
    else:
        largura, altura = 1.0, midia[0] / proporcao / midia[1]
    largura, altura = largura / zoom, altura / zoom
    return {"x": _limitar(regiao["x"] - largura / 2, 0, 1 - largura),
            "y": _limitar(regiao["y"] - altura / 2, 0, 1 - altura), "largura": largura, "altura": altura}


def escala_para_cobrir(midia: tuple[float, float], quadro: tuple[float, float]) -> float:
    largura, altura = quadro[0] / midia[0], quadro[1] / midia[1]
    return max(largura, altura) / min(largura, altura)


def _keyframes_da_copia(keyframes: dict | None) -> dict | None:
    if not keyframes:
        return None
    restantes = {k: keyframes[k] for k in ("volume", "opacidade") if keyframes.get(k)}
    return restantes or None


def copias_do_layout(clipe: dict, midia: tuple[float, float], quadro: tuple[float, float]) -> tuple[dict, dict] | None:
    """(a cópia que fica na faixa do clipe, com o id e o som; a que vai para a faixa de cima)."""
    layout = clipe.get("layout")
    if not layout or not tem_layout(clipe) or midia[0] <= 0 or midia[1] <= 0:
        return None
    opacidade = (clipe.get("transformacao") or {}).get("opacidade", 1)
    base = {**clipe, "layout": None, "keyframes": _keyframes_da_copia(clipe.get("keyframes")), "expressoes": None,
            "mascara": None, "contorno": None, "sombra": None}

    def acima(copia: dict) -> dict:
        return {**base, **copia, "id": f"{clipe['id']}{SUFIXO_DO_LAYOUT}", "som_separado": True, "transicao": None}

    if layout["tipo"] == "caber":
        recorte = clipe.get("recorte") or {"largura": 1, "altura": 1}
        recortada = (midia[0] * recorte["largura"], midia[1] * recorte["altura"])
        embaixo = {**base, "cantos": None,
                   "transformacao": {"x": 0, "y": 0, "escala": escala_para_cobrir(recortada, quadro), "rotacao": 0,
                                     "opacidade": opacidade},
                   "efeito": {"tipo": "desfoque", "intensidade": _limitar(layout["desfoque"], 0.05, 1)}}
        return embaixo, acima({"transformacao": {"x": 0, "y": 0, "escala": 1, "rotacao": 0, "opacidade": opacidade}})
    cima, baixo = partes_da_divisao(layout["divisao"])

    def parte(regiao: dict, altura: float, centro: float) -> dict:
        recorte = recorte_da_regiao(regiao, midia, (quadro[0], quadro[1] * altura))
        return {"recorte": recorte_na_fonte(recorte, clipe.get("virar")),
                "transformacao": {"x": 0, "y": centro, "escala": 1, "rotacao": 0, "opacidade": opacidade}}

    return ({**base, **parte(layout["quadros"][0], cima, cima / 2 - 0.5)},
            acima(parte(layout["quadros"][1], baixo, cima / 2)))


def com_os_layouts(projeto: dict, tamanho: Callable[[str], tuple[float, float] | None]) -> dict:
    """O projeto com as cópias dos layouts, numa faixa logo acima de cada faixa que tem algum."""
    if not any(tem_layout(c) for f in projeto["faixas"] for c in f["clipes"]):
        return projeto
    quadro = quadro_da_proporcao(projeto["proporcao"])
    faixas = []
    for faixa in projeto["faixas"]:
        copias = {}
        for clipe in faixa["clipes"]:
            medida = tamanho(clipe["midia_id"]) if tem_layout(clipe) else None
            par = copias_do_layout(clipe, medida, quadro) if medida else None
            if par:
                copias[clipe["id"]] = par
        if not copias:
            faixas.append(faixa)
            continue
        faixas.append({**faixa, "id": f"{faixa['id']}{SUFIXO_DO_LAYOUT}",
                       "tipo": "video" if faixa["tipo"] == "principal" else faixa["tipo"], "muda": True,
                       "clipes": [par[1] for par in copias.values()]})
        faixas.append({**faixa, "clipes": [copias[c["id"]][0] if c["id"] in copias else c for c in faixa["clipes"]]})
    return {**projeto, "faixas": faixas}
