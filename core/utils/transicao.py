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
import math

from core.utils.animacao import suavizar

ZOOM_TRANSICAO = 0.6
# Desfoque no meio da transição "desfoque": sigma em frações da altura do clipe
DESFOQUE_TRANSICAO = 0.03
CORTINAS = ("cortina_direita", "cortina_esquerda", "cortina_baixo", "cortina_cima")
# Transições de máscara (transicao.ts): o campo de cada tipo, a borda suave e as faixas das persianas
MASCARAS = ("relogio", "iris", "losango", "persianas", "diagonal", "blocos")
COLUNAS_DOS_BLOCOS = 12
SUAVIDADE_DA_TRANSICAO = 0.04
FAIXAS_DAS_PERSIANAS = 8
REVELADO_INTEIRO = {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0}
# Zoom com desfoque (transicao.ts): as cópias vão de 1 a 1 + ZOOM_DO_DESFOQUE, e o próximo aparece nesse trecho
ZOOM_DO_DESFOQUE = 0.35
TROCA_DO_ZOOM_DESFOQUE = (0.4, 0.6)


def janelas_da_principal(clipes: list[dict], quadro: float) -> dict[str, dict]:
    """
    id → {"inicio", "fim", "efeitos"}: quanto de cada clipe aparece, contando as transições. `quadro` é a
    duração de um quadro do projeto (na unidade dos clipes): a transição vira quadros inteiros e a janela
    começa num quadro, como em transicao.ts.
    """
    janelas = {c["id"]: {"inicio": c["inicio"], "fim": c["inicio"] + c["duracao"], "efeitos": []} for c in clipes}
    for clipe, proximo in zip(clipes, clipes[1:], strict=False):
        transicao = clipe.get("transicao")
        # As de luz cortam seco: a camada de ajuste por cima faz o efeito (transicao_de_luz.py)
        if not transicao or transicao["duracao"] <= 0 or transicao["tipo"] in ("flash", "clarao"):
            continue
        corte = clipe["inicio"] + clipe["duracao"]
        quadros = max(1, round(transicao["duracao"] / quadro))
        duracao = quadros * quadro
        inicio = corte - (quadros // 2) * quadro
        fim = inicio + duracao
        janelas[clipe["id"]]["fim"] = fim
        janelas[clipe["id"]]["efeitos"].append({"tipo": transicao["tipo"], "papel": "sai", "inicio": inicio,
                                                "duracao": duracao})
        janelas[proximo["id"]]["inicio"] = inicio
        janelas[proximo["id"]]["efeitos"].append({"tipo": transicao["tipo"], "papel": "entra", "inicio": inicio,
                                                  "duracao": duracao})
    return janelas


def janelas_do_som(clipes: list[dict], quadro: float) -> dict[str, dict]:
    """As janelas do som: só as transições com `misturar_som` estendem o som dos dois clipes (janelasDoSom)."""
    return janelas_da_principal([c if (c.get("transicao") or {}).get("misturar_som") else {**c, "transicao": None}
                                 for c in clipes], quadro)


def fator_da_mistura(efeitos: list[dict], t: float) -> float:
    """O ganho na mistura das transições: o que sai desce pelo cosseno, o que entra sobe pelo seno (fatorDaMistura)."""
    fator = 1.0
    for efeito in efeitos:
        p = min(1.0, max(0.0, (t - efeito["inicio"]) / efeito["duracao"]))
        fator *= math.sin(p * math.pi / 2) if efeito["papel"] == "entra" else math.cos(p * math.pi / 2)
    return fator


def expressao_da_mistura(efeitos: list[dict], comeco: float) -> str:
    """
    fator_da_mistura numa expressão do volume do FFmpeg, no tempo `t` do som do clipe, que começa em `comeco`
    da linha do tempo (efeitos e comeco em segundos).
    """
    partes = []
    for efeito in efeitos:
        p = f"clip((t+{comeco - efeito['inicio']:.6f})/{efeito['duracao']:.6f},0,1)"
        partes.append(f"{'sin' if efeito['papel'] == 'entra' else 'cos'}(PI/2*{p})")
    return "*".join(partes) or "1"


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
        elif efeito["tipo"] == "desfoque" and entra:
            resultado["opacidade"] *= p
        elif efeito["tipo"] == "zoom_desfoque" and entra:
            de, ate = TROCA_DO_ZOOM_DESFOQUE
            resultado["opacidade"] *= min(1.0, max(0.0, (p - de) / (ate - de)))
    return resultado


def desfoque_na_transicao(efeitos: list[dict], t: float) -> float:
    """
    O desfoque (sigma em frações da altura do clipe) no instante t: os dois clipes desfocam até o
    meio da janela, o corte, e voltam a ficar nítidos depois.
    """
    desfoque = 0.0
    for efeito in efeitos:
        if efeito["tipo"] == "desfoque":
            p = min(1.0, max(0.0, (t - efeito["inicio"]) / efeito["duracao"]))
            desfoque = max(desfoque, DESFOQUE_TRANSICAO * (1 - abs(2 * p - 1)))
    return desfoque


def zoom_na_transicao(efeitos: list[dict], t: float) -> float:
    """O peso das cópias ampliadas do zoom com desfoque no instante t (zoomNaTransicao)."""
    peso = 0.0
    for efeito in efeitos:
        if efeito["tipo"] == "zoom_desfoque":
            p = min(1.0, max(0.0, (t - efeito["inicio"]) / efeito["duracao"]))
            peso = max(peso, 1 - abs(2 * p - 1))
    return peso


def filtros_do_zoom_desfoque(efeitos: list[dict], comeco: float, largura: int, altura: int,
                             amostras: int, rotulo: str) -> str | None:
    """
    O pedaço do grafo do zoom com desfoque (no alfa pré-multiplicado, entre a entrada e a saída do pedaço), ou
    None sem ele. comeco: o instante da linha do tempo em que o tempo do pedaço é zero. As cópias ampliadas são
    o perspective (que, ao contrário do scale, liga e desliga pelo enable) e o mix e o blend também só ligam
    na janela: fora dela o clipe passa direto, e o render não paga as cópias no clipe inteiro.
    """
    zooms = [e for e in efeitos if e["tipo"] == "zoom_desfoque"]
    if not zooms:
        return None
    janelas = "+".join(f"between(t,{_n(e['inicio'] - comeco)},{_n(e['inicio'] + e['duracao'] - comeco)})"
                       for e in zooms)
    ligado = f"enable='{janelas}'"
    pesos = [f"(1-abs(2*clip((T+{_n(comeco - e['inicio'])})/{_n(e['duracao'])},0,1)-1))" for e in zooms]
    peso = pesos[0] if len(pesos) == 1 else f"max({','.join(pesos)})"
    copias = []
    for i in range(1, amostras):
        ampliacao = 1 + ZOOM_DO_DESFOQUE * i / (amostras - 1)
        # O canto da fonte que vai para o canto do clipe, com o centro do pixel no lugar em que o shader lê
        meio_l, meio_a = largura / 2, altura / 2
        d = 0.5 / ampliacao - 0.5
        x0, x1 = meio_l - meio_l / ampliacao + d, meio_l + meio_l / ampliacao + d
        y0, y1 = meio_a - meio_a / ampliacao + d, meio_a + meio_a / ampliacao + d
        copias.append(f"perspective=x0={_n(x0)}:y0={_n(y0)}:x1={_n(x1)}:y1={_n(y0)}:x2={_n(x0)}:y2={_n(y1)}"
                      f":x3={_n(x1)}:y3={_n(y1)}:interpolation=linear:{ligado}")
    nomes = [f"{rotulo}c{i}" for i in range(amostras)]
    fim = ";\n"
    return (f"split={amostras + 1}[{rotulo}n]" + "".join(f"[{n}]" for n in nomes) + fim
            + "".join(f"[{n}]{c}[{n}m]{fim}" for n, c in zip(nomes[1:], copias, strict=True))
            + f"[{nomes[0]}]" + "".join(f"[{n}m]" for n in nomes[1:])
            + f"mix=inputs={amostras}:weights='{' '.join(['1'] * amostras)}':{ligado}[{rotulo}b]{fim}"
            + f"[{rotulo}n][{rotulo}b]blend=all_expr='A+(B-A)*{peso}+0.5':{ligado}")


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


def valor_do_bloco(n: int) -> float:
    """O valor sorteado do bloco n (valorDoBloco): conta de inteiros pequenos, exata no geq e no shader."""
    return ((n * n * 631 + n * 313 + 17) % 1009) / 1009


def linhas_dos_blocos(largura: float, altura: float) -> int:
    return max(1, math.floor(COLUNAS_DOS_BLOCOS * altura / largura + 0.5))


def campo_da_transicao(tipo: str, x: float, y: float, largura: float, altura: float) -> float:
    """O campo do tipo no ponto (x, y) do clipe, em frações (campoDaTransicao)."""
    dx, dy = (x - 0.5) * largura, (y - 0.5) * altura
    if tipo == "relogio":
        volta = math.atan2(dx, -dy) / (2 * math.pi) + 1
        return volta - math.floor(volta)
    if tipo == "iris":
        return math.hypot(dx, dy) / (0.5 * math.hypot(largura, altura))
    if tipo == "losango":
        return (abs(dx) + abs(dy)) / (0.5 * (largura + altura))
    if tipo == "persianas":
        faixa = y * FAIXAS_DAS_PERSIANAS
        return faixa - math.floor(faixa)
    if tipo == "blocos":
        linhas = linhas_dos_blocos(largura, altura)
        coluna = min(math.floor(x * COLUNAS_DOS_BLOCOS), COLUNAS_DOS_BLOCOS - 1)
        linha = min(math.floor(y * linhas), linhas - 1)
        return valor_do_bloco(linha * COLUNAS_DOS_BLOCOS + coluna)
    return (x * largura + y * altura) / (largura + altura)


def limiar_da_transicao(e: float) -> float:
    return -SUAVIDADE_DA_TRANSICAO / 2 + e * (1 + SUAVIDADE_DA_TRANSICAO)


def _campo_no_geq(tipo: str) -> str:
    """O campo numa expressão do geq, pelo centro do pixel, como o shader."""
    dx, dy = "(X+0.5-W/2)", "(Y+0.5-H/2)"
    if tipo == "relogio":
        return f"mod(atan2({dx},-{dy})/(2*PI)+1,1)"
    if tipo == "iris":
        return f"hypot({dx},{dy})/(0.5*hypot(W,H))"
    if tipo == "losango":
        return f"(abs({dx})+abs({dy}))/(0.5*(W+H))"
    if tipo == "persianas":
        return f"mod((Y+0.5)/H*{FAIXAS_DAS_PERSIANAS},1)"
    if tipo == "blocos":
        c = COLUNAS_DOS_BLOCOS
        linhas = f"max(1,floor({c}*H/W+0.5))"
        n = f"(min(floor((Y+0.5)/H*{linhas}),{linhas}-1)*{c}+min(floor((X+0.5)/W*{c}),{c - 1}))"
        return f"mod({n}*{n}*631+{n}*313+17,1009)/1009"
    return "((X+0.5)+(Y+0.5))/(W+H)"


def _cobertura_no_geq(tipo: str, andamento: str) -> str:
    """Máscara: o campo abaixo do limiar aparece, com a borda suave (revelarNoCampo)."""
    limiar = f"{_n(-SUAVIDADE_DA_TRANSICAO / 2)}+{andamento}*{_n(1 + SUAVIDADE_DA_TRANSICAO)}"
    return f"clip(({limiar}-{_campo_no_geq(tipo)})/{_n(SUAVIDADE_DA_TRANSICAO)}+0.5,0,1)"


def filtro_de_cortina(efeitos: list[dict], deslocamento: float) -> str | None:
    """
    O geq que deixa transparente o que a cortina ainda não revelou, ou None sem cortina.
    deslocamento: quanto somar ao T do geq para chegar ao tempo do vídeo final (o geq fica antes do
    setpts que leva o clipe para o lugar dele).
    """
    condicoes, fim = [], 0.0
    for efeito in efeitos:
        if efeito["papel"] != "entra" or efeito["tipo"] not in CORTINAS + MASCARAS:
            continue
        inicio, duracao = efeito["inicio"], efeito["duracao"]
        e = f"(1-pow(1-clip((T+{_n(deslocamento)}-{_n(inicio)})/{_n(duracao)},0,1),3))"
        # O centro do pixel, como o v_local do shader da prévia
        condicoes.append({
            "cortina_direita": f"lte((X+0.5)/W,{e})",
            "cortina_esquerda": f"gte((X+0.5)/W,1-{e})",
            "cortina_baixo": f"lte((Y+0.5)/H,{e})",
            "cortina_cima": f"gte((Y+0.5)/H,1-{e})",
        }[efeito["tipo"]] if efeito["tipo"] in CORTINAS else _cobertura_no_geq(efeito["tipo"], e))
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
            # Na saída, -(1 - falta) escrito como (falta - 1): o avaliador do FFmpeg não aceita "-(" depois de outro
            # termo, e o clipe do meio de dois empurrões ("a+-(...)") derrubava a exportação
            dx.append(falta if entra else f"({falta}-1)")
        elif tipo == "desfoque" and entra:
            fades.append(f"fade=t=in:st={_n(inicio)}:d={_n(duracao)}:alpha=1")
        elif tipo == "zoom_desfoque" and entra:
            de, ate = TROCA_DO_ZOOM_DESFOQUE
            fades.append(f"fade=t=in:st={_n(inicio + de * duracao)}:d={_n((ate - de) * duracao)}:alpha=1")
        elif tipo == "zoom" and entra:
            fades.append(f"fade=t=in:st={_n(inicio)}:d={_n(duracao)}:alpha=1")
            escala.append(f"({_n(ZOOM_TRANSICAO)}+{_n(1 - ZOOM_TRANSICAO)}*(1-{falta}))")
    return {"fades": fades, "escala": "*".join(escala) or None, "dx": "+".join(dx) or "0", "dy": "0"}
