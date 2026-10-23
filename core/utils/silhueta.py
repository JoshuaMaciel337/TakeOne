# -----------------------------------------------
# TakeOne — contorno e sombra em volta do que aparece do clipe (recortes, logos, formas, adesivos)
#
# Os dois saem do alfa final do clipe, no tamanho dele (antes do giro e da opacidade), numa margem transparente:
#   contorno: o alfa desfocado (sigma = metade da largura) e cortado no limiar Φ(−2), onde a borda de um
#             degrau desfocado fica a dois sigmas de distância; a rampa tem um pixel
#   sombra:   o alfa desfocado, deslocado, na cor e na opacidade dela
# e a pilha é sombra, contorno e o clipe. As medidas são frações da altura do clipe. A prévia faz a mesma conta
# num framebuffer (lib/projeto/silhueta.ts e o compositor); os casos ficam em tests/casos/silhueta.json.
# -----------------------------------------------
import math

LIMIAR_DO_CONTORNO = 0.02275   # Φ(−2)
DENSIDADE_NA_BORDA = 0.05399   # φ(2): quanto o alfa desfocado muda por sigma na borda do contorno

LARGURA_MAXIMA = 0.08
DESFOQUE_MAXIMO = 0.08
DISTANCIA_MAXIMA = 0.15


def tem_silhueta(clipe: dict) -> bool:
    contorno, sombra = clipe.get("contorno"), clipe.get("sombra")
    return bool((contorno and contorno.get("largura", 0) > 0) or (sombra and sombra.get("opacidade", 0) > 0))


def margem_da_silhueta(clipe: dict, altura: float) -> int:
    """Os pixels de margem em volta do clipe (de `altura` pixels) para caber o contorno e a sombra."""
    contorno, sombra = clipe.get("contorno"), clipe.get("sombra")
    margem = 0.0
    if contorno and contorno.get("largura", 0) > 0:
        margem = max(margem, contorno["largura"] * altura + 2)
    if sombra and sombra.get("opacidade", 0) > 0:
        margem = max(margem, (sombra["distancia"] + 3 * sombra["desfoque"]) * altura + 2)
    return math.ceil(margem)


def deslocamento_da_sombra(sombra: dict, altura: float) -> tuple[float, float]:
    """(dx, dy) da sombra em pixels: o ângulo em graus, 0 para a direita e 90 para baixo."""
    angulo = math.radians(sombra["angulo"])
    distancia = sombra["distancia"] * altura
    return distancia * math.cos(angulo), distancia * math.sin(angulo)


def rampa_do_contorno(sigma: float) -> float:
    """Quanto o alfa desfocado anda em um pixel na borda do contorno; no contorno fino (sigma abaixo de 1,2 px), no
    máximo o dobro do limiar, para o alfa 0 dar cobertura 0 (senão o contorno tingia a caixa inteira do clipe)."""
    return min(DENSIDADE_NA_BORDA / max(sigma, 1e-6), 2 * LIMIAR_DO_CONTORNO)


def cobertura_do_contorno(alfa_desfocado: float, sigma: float) -> float:
    """Quanto do contorno cobre o pixel, pelo alfa desfocado (0 a 1) e o sigma do desfoque em pixels."""
    return min(max((alfa_desfocado - LIMIAR_DO_CONTORNO) / rampa_do_contorno(sigma) + 0.5, 0.0), 1.0)


def _rgb(cor: str) -> tuple[int, int, int]:
    valor = int(cor.lstrip("#"), 16)
    return (valor >> 16) & 255, (valor >> 8) & 255, valor & 255


def filtros_da_silhueta(clipe: dict, altura: int, numero: int, cabeca: str) -> tuple[str, int]:
    """
    O grafo que põe a margem, o contorno e a sombra em volta do clipe em `cabeca` (uma cadeia sem rótulo de
    saída). O contorno fica embaixo do clipe; a sombra é do conjunto (clipe e contorno) e fica embaixo de tudo.
    Devolve a cadeia nova e a margem em pixels (de cada lado).
    """
    margem = margem_da_silhueta(clipe, altura)
    contorno, sombra = clipe.get("contorno"), clipe.get("sombra")
    com_contorno = bool(contorno and contorno.get("largura", 0) > 0)
    com_sombra = bool(sombra and sombra.get("opacidade", 0) > 0)
    juntar = "" if cabeca.endswith("]") else ","
    copias = 1 + 2 * com_contorno
    rotulos = [f"sl{numero}_{i}" for i in range(copias)]
    linhas = [f"{cabeca}{juntar}format=rgba,pad=iw+{2 * margem}:ih+{2 * margem}:{margem}:{margem}:color=black@0"
              + (f",split={copias}" + "".join(f"[{r}]" for r in rotulos) if copias > 1 else f"[{rotulos[0]}]")]
    camada = rotulos[0]
    if com_contorno:
        r, g, b = _rgb(contorno["cor"])
        sigma = contorno["largura"] * altura / 2
        rampa = rampa_do_contorno(sigma)
        # Em 16 bits: o limiar fica em 2,3% do alfa, e em 8 bits a borda sairia em degraus. O lut de gray16 vai
        # até maxval (65280), que volta a 255 em 8 bits
        linhas += [
            f"[{rotulos[1]}]alphaextract,format=gray16le,gblur=sigma={max(sigma, 0.05):.4f}:steps=6,"
            f"lut=c0='clip((val/65535-{LIMIAR_DO_CONTORNO})/{rampa:.8f}+0.5,0,1)*maxval',format=gray[ca{numero}]",
            f"[{rotulos[2]}]format=rgba,lutrgb=r={r}:g={g}:b={b}[cc{numero}]",
            f"[cc{numero}][ca{numero}]alphamerge[co{numero}]",
            # O clipe por cima do contorno (o overlay compõe o alfa reto dos dois)
            f"[co{numero}][{camada}]overlay=format=rgb,format=rgba[cl{numero}]",
        ]
        camada = f"cl{numero}"
    if com_sombra:
        r, g, b = _rgb(sombra["cor"])
        sigma = sombra["desfoque"] * altura
        dx, dy = deslocamento_da_sombra(sombra, altura)
        dx, dy = round(dx), round(dy)
        mx, my = abs(dx), abs(dy)
        desfocar = f"gblur=sigma={sigma:.4f}:steps=6," if sigma >= 0.05 else ""
        linhas += [
            f"[{camada}]split=3[sd{numero}][se{numero}][sf{numero}]",
            f"[se{numero}]alphaextract,{desfocar}lut=c0='val*{sombra['opacidade']:.6f}',"
            f"pad=iw+{2 * mx}:ih+{2 * my}:{mx}:{my}:color=black,crop=iw-{2 * mx}:ih-{2 * my}:{mx - dx}:{my - dy}"
            f"[sa{numero}]",
            f"[sf{numero}]format=rgba,lutrgb=r={r}:g={g}:b={b}[sc{numero}]",
            f"[sc{numero}][sa{numero}]alphamerge[so{numero}]",
            f"[so{numero}][sd{numero}]overlay=format=rgb,format=rgba",
        ]
    else:
        # A cadeia segue sem rótulo de saída: tira o do último passo
        ultima = linhas.pop()
        linhas.append(ultima[: ultima.rindex("[")])
    return ";\n".join(linhas), margem
