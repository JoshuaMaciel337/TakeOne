# -----------------------------------------------
# TakeOne — texto que aparece letra a letra e palavra destacada
#
# Espelha apps/web/src/lib/projeto/letras.ts (a mesma conta, conferida pelos casos de
# tests/casos/letras.json). O texto continua sendo um PNG só (core/utils/texto.py); o que muda é a
# parte dele que aparece: um trecho de letras [de, ate), na ordem de leitura. O layout diz onde cada
# letra fica no PNG, em frações da imagem, e a máscara esconde o que vem antes de `de` e a partir de
# `ate`. Na prévia a máscara é feita no shader; no render, com duas caixas transparentes
# (drawbox) por lado, que o sendcmd muda quando o trecho muda.
#
# Usos:
#   - entrada e saída "letras" (máquina de escrever) e "palavras";
#   - destaque das legendas: uma segunda imagem, na cor do destaque, mostra só a palavra falada
#     ("palavra") ou tudo até ela ("karaoke"), pelos tempos das palavras.
# -----------------------------------------------
import math

TIPOS_LETRA_A_LETRA = ("letras", "palavras")
# Folga nas contas com frações: o mesmo instante dá a mesma letra na prévia e no render
EPSILON = 1e-9


def palavras_das_letras(letras: str) -> list[list[int]]:
    """[de, ate) de cada palavra (sequência sem espaço) dentro das letras do texto."""
    palavras, inicio = [], None
    for indice, letra in enumerate(letras + " "):
        if letra.isspace():
            if inicio is not None:
                palavras.append([inicio, indice])
                inicio = None
        elif inicio is None:
            inicio = indice
    return palavras


def _ativa(item: dict | None) -> bool:
    return bool(item) and item["tipo"] in TIPOS_LETRA_A_LETRA and item["duracao"] > 0


def _ate_pelo_progresso(tipo: str, p: float, layout: dict) -> int:
    n = layout["n"]
    if tipo == "letras":
        return min(n, math.floor(p * n + EPSILON))
    palavras = layout["palavras"]
    mostradas = min(len(palavras), math.floor(p * len(palavras) + EPSILON))
    return n if mostradas >= len(palavras) else palavras[mostradas][0]


def tempos_das_palavras(texto: dict, layout: dict, duracao: float) -> list[float]:
    """
    Quando cada palavra começa, desde o começo do clipe. Sem tempos (legenda digitada), as palavras
    dividem a duração pelo número de letras.
    """
    palavras = layout["palavras"]
    tempos = texto.get("tempos")
    if tempos and len(tempos) == len(palavras):
        return list(tempos)
    n = max(layout["n"], 1)
    return [duracao * de / n for de, _ in palavras]


def palavra_no_tempo(tempos: list[float], t: float) -> int:
    """A última palavra que já começou em `t` (desde o começo do clipe), ou -1."""
    atual = -1
    for indice, inicio in enumerate(tempos):
        if inicio <= t + EPSILON:
            atual = indice
    return atual


def trecho_visivel(clipe: dict, layout: dict, t: float, destaque: bool = False) -> tuple[int, int] | None:
    """
    O trecho de letras [de, ate) que aparece em `t` (mesma unidade de clipe["inicio"], das durações
    e dos tempos das palavras), ou None quando aparece tudo.
    destaque: a conta da imagem do destaque, em vez da do texto.
    """
    n = layout["n"]
    local = t - clipe["inicio"]
    if destaque:
        texto = clipe["texto"]
        palavras = layout["palavras"]
        atual = palavra_no_tempo(tempos_das_palavras(texto, layout, clipe["duracao"]), local)
        if atual < 0:
            return (0, 0)
        de = palavras[atual][0] if texto["destaque"]["modo"] == "palavra" else 0
        # Com o texto entrando letra a letra, o destaque não passa do que já apareceu
        aparecido = trecho_visivel(clipe, layout, t)
        ate = min(palavras[atual][1], aparecido[1]) if aparecido else palavras[atual][1]
        return (min(de, ate), ate)

    animacao = clipe.get("animacao") or {}
    ate = n
    entrada, saida = animacao.get("entrada"), animacao.get("saida")
    if _ativa(entrada):
        ate = min(ate, _ate_pelo_progresso(entrada["tipo"], min(1.0, max(0.0, local / entrada["duracao"])), layout))
    if _ativa(saida):
        restante = clipe["duracao"] - local
        ate = min(ate, _ate_pelo_progresso(saida["tipo"], min(1.0, max(0.0, restante / saida["duracao"])), layout))
    return None if ate >= n else (0, ate)


def _posicao(layout: dict, indice: int) -> tuple[dict, float]:
    """A linha da letra `indice` e o x (fração da imagem) onde ela começa."""
    linhas = layout["linhas"]
    contadas = 0
    for linha in linhas:
        letras = len(linha["xs"]) - 1
        if indice < contadas + letras:
            return linha, linha["xs"][indice - contadas]
        contadas += letras
    # Depois da última letra: o fim da última linha
    return linhas[-1], 1.0


def cortes(layout: dict, de: int, ate: int) -> dict:
    """
    A máscara do trecho [de, ate), em frações da imagem:
    "de": (y0, y1, x) — some o que fica acima de y0, e o que fica entre y0 e y1 à esquerda de x;
    "ate": (y0, y1, x) — some o que fica abaixo de y1, e o que fica entre y0 e y1 de x para a direita.
    Um ponto conta pelo centro do pixel, como no shader da prévia.
    """
    if de <= 0:
        corte_de = (0.0, 0.0, 0.0)
    else:
        linha, x = _posicao(layout, de)
        corte_de = (linha["y0"], linha["y1"], x)
    if ate >= layout["n"]:
        corte_ate = (1.0, 1.0, 1.0)
    else:
        linha, x = _posicao(layout, ate)
        corte_ate = (linha["y0"], linha["y1"], x)
    return {"de": corte_de, "ate": corte_ate}


def caixas_escondidas(layout: dict, de: int, ate: int, largura: int, altura: int) -> list[tuple[int, int, int, int]]:
    """
    As quatro caixas (x, y, w, h) em pixels que escondem o que fica fora do trecho, numa imagem
    largura × altura. Uma caixa vazia fica fora da imagem. O pixel i some quando o centro dele
    (i + 0,5) cai na parte escondida, como na prévia.
    """
    def primeiro(fracao: float, total: int) -> int:
        """O primeiro pixel cujo centro fica em `fracao` ou depois."""
        return min(max(math.ceil(fracao * total - 0.5 - EPSILON), 0), total)

    fora = (-2, -2, 1, 1)
    c = cortes(layout, de, ate)
    y0, y1, x = c["de"]
    topo, base, esquerda = primeiro(y0, altura), primeiro(y1, altura), primeiro(x, largura)
    acima = (0, 0, largura, topo) if topo > 0 else fora
    antes = (0, topo, esquerda, base - topo) if esquerda > 0 and base > topo else fora
    y0, y1, x = c["ate"]
    topo, base, direita = primeiro(y0, altura), primeiro(y1, altura), primeiro(x, largura)
    depois = (direita, topo, largura - direita, base - topo) if direita < largura and base > topo else fora
    abaixo = (0, base, largura, altura - base) if base < altura else fora
    return [acima, antes, depois, abaixo]


def comandos_das_letras(clipe: dict, layout: dict, janela: tuple[float, float], fps: float, alvo: str,
                        largura: int, altura: int, destaque: bool = False) -> str:
    """
    O roteiro do sendcmd que move as quatro caixas (`alvo`0 a `alvo`3) a cada quadro em que o
    trecho muda. Tempos em segundos: o clipe (inicio, duracao, animação e tempos das palavras) e a
    janela no vídeo final; o roteiro conta do começo da janela.
    """
    linhas, anterior = [], None
    quadros = round((janela[1] - janela[0]) * fps) + 1
    for n in range(quadros):
        local = n / fps
        trecho = trecho_visivel(clipe, layout, janela[0] + local, destaque) or (0, layout["n"])
        if trecho == anterior:
            continue
        anterior = trecho
        caixas = caixas_escondidas(layout, *trecho, largura, altura)
        partes = [f"{alvo}{i} {nome} {valor}" for i, caixa in enumerate(caixas)
                  for nome, valor in zip(("x", "y", "w", "h"), caixa, strict=True)]
        linhas.append(f"{local:.6f} " + ", ".join(partes) + ";")
    return "\n".join(linhas) + "\n"


def tem_letra_a_letra(clipe: dict) -> bool:
    animacao = clipe.get("animacao") or {}
    return _ativa(animacao.get("entrada")) or _ativa(animacao.get("saida"))


def tem_destaque(clipe: dict) -> bool:
    texto = clipe.get("texto") or {}
    return bool(texto.get("destaque"))


def texto_do_destaque(texto: dict) -> dict:
    """O texto na cor do destaque, sem fundo nem sombra: ele cobre as letras do texto de baixo."""
    return {**texto, "cor": texto["destaque"]["cor"], "fundo_opacidade": 0, "sombra": 0, "destaque": None}
