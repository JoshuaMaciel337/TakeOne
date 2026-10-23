# -----------------------------------------------
# TakeOne — onde a imagem de cada clipe fica no quadro
#
# Espelha apps/web/src/lib/projeto/geometria.ts: a prévia no navegador e o render fazem a mesma
# conta, conferida pelos mesmos casos em tests/casos/geometria.json.
#
# A mídia recortada entra inteira no quadro, do maior tamanho que cabe e centralizada. Depois a
# transformação aumenta ou diminui a partir do centro, gira e desloca.
# -----------------------------------------------
from dataclasses import dataclass


@dataclass(frozen=True)
class Caixa:
    """Retângulo girado em volta do próprio centro, em pixels do quadro."""
    cx: float
    cy: float
    largura: float
    altura: float
    rotacao: float   # graus, sentido horário
    opacidade: float


def recorte_na_fonte(recorte: dict, virar: dict | None) -> dict:
    """O recorte nas coordenadas da mídia como ela é (o do clipe é do que aparece, já virado)."""
    virar = virar or {}
    return {
        **recorte,
        "x": 1 - recorte["x"] - recorte["largura"] if virar.get("horizontal") else recorte["x"],
        "y": 1 - recorte["y"] - recorte["altura"] if virar.get("vertical") else recorte["y"],
    }


# O PNG de um texto é medido num quadro com este lado menor; em outro tamanho, a caixa escala junto
LADO_REFERENCIA_TEXTO = 1080


def caixa_do_texto(transformacao: dict, imagem: tuple[float, float], quadro: tuple[float, float]) -> Caixa:
    """imagem: (largura, altura) do PNG do texto desenhado para LADO_REFERENCIA_TEXTO."""
    escala = transformacao["escala"] * min(quadro) / LADO_REFERENCIA_TEXTO
    return Caixa(
        cx=quadro[0] / 2 + transformacao["x"] * quadro[0],
        cy=quadro[1] / 2 + transformacao["y"] * quadro[1],
        largura=imagem[0] * escala,
        altura=imagem[1] * escala,
        rotacao=transformacao["rotacao"],
        opacidade=transformacao["opacidade"],
    )


def caixa_do_clipe(transformacao: dict, recorte: dict, midia: tuple[float, float],
                   quadro: tuple[float, float]) -> Caixa:
    """midia e quadro: (largura, altura) em pixels."""
    largura = midia[0] * recorte["largura"]
    altura = midia[1] * recorte["altura"]
    encaixe = min(quadro[0] / largura, quadro[1] / altura) * transformacao["escala"]
    return Caixa(
        cx=quadro[0] / 2 + transformacao["x"] * quadro[0],
        cy=quadro[1] / 2 + transformacao["y"] * quadro[1],
        largura=largura * encaixe,
        altura=altura * encaixe,
        rotacao=transformacao["rotacao"],
        opacidade=transformacao["opacidade"],
    )


def caixa_visivel(caixa: Caixa, recorte: dict, quadro: tuple[float, float],
                  margem: float = 2) -> tuple[Caixa, dict] | None:
    """
    Só o pedaço do clipe que cai no quadro: a caixa encolhida até ele (com `margem` pixels de folga, para a leitura
    bilinear da borda) e o recorte da mídia que vai nela, para o mesmo desenho. Serve ao render de um clipe ampliado
    demais (o quadro inteiro de um zoom de 2000% passaria dos limites do FFmpeg). None quando não encolhe.
    """
    import math

    meia_l, meia_a = caixa.largura / 2, caixa.altura / 2
    angulo = math.radians(caixa.rotacao)
    cos, sen = math.cos(angulo), math.sin(angulo)
    # Os cantos do quadro no espaço da caixa (sem o giro dela), e o retângulo que os contém, dentro da caixa
    locais = []
    for x, y in ((0, 0), (quadro[0], 0), (0, quadro[1]), (quadro[0], quadro[1])):
        dx, dy = x - caixa.cx, y - caixa.cy
        locais.append((dx * cos + dy * sen, -dx * sen + dy * cos))
    u0 = max(-meia_l, min(u for u, _ in locais) - margem)
    u1 = min(meia_l, max(u for u, _ in locais) + margem)
    v0 = max(-meia_a, min(v for _, v in locais) - margem)
    v1 = min(meia_a, max(v for _, v in locais) + margem)
    if u1 <= u0 or v1 <= v0:
        return None
    if (u1 - u0) * (v1 - v0) > 0.9 * caixa.largura * caixa.altura:
        return None
    fu0, fu1 = (u0 + meia_l) / caixa.largura, (u1 + meia_l) / caixa.largura
    fv0, fv1 = (v0 + meia_a) / caixa.altura, (v1 + meia_a) / caixa.altura
    novo = {"x": recorte["x"] + fu0 * recorte["largura"], "y": recorte["y"] + fv0 * recorte["altura"],
            "largura": recorte["largura"] * (fu1 - fu0), "altura": recorte["altura"] * (fv1 - fv0)}
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    return Caixa(cx=caixa.cx + uc * cos - vc * sen, cy=caixa.cy + uc * sen + vc * cos, largura=u1 - u0,
                 altura=v1 - v0, rotacao=caixa.rotacao, opacidade=caixa.opacidade), novo
