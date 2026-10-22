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
# As expressões (repetir os pontos em ciclo ou vaivém, tremer) entram na mesma conta: a repetição troca o
# tempo da expressão por um tempo que volta (mod), e o tremido soma três senos.
# -----------------------------------------------
import math

from core.utils.tempo import TICKS_POR_SEGUNDO

PROPRIEDADES = ("x", "y", "escala", "rotacao", "opacidade")
# Fase do tremido de cada propriedade, para x e y não tremerem juntos (a mesma de keyframes.ts)
FASE_DO_TREMOR = {"x": 0, "y": 7.3, "escala": 13.1, "rotacao": 19.7, "opacidade": 29.3}
ESCALA_MINIMA = 0.01


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


def ruido(s: float) -> float:
    """Ruído suave entre -1 e 1: `s` é quantos ciclos já passaram."""
    w = 2 * math.pi * s
    return (math.sin(w + 1.3) + 0.6 * math.sin(1.73 * w + 4.1) + 0.35 * math.sin(2.91 * w + 2.2)) / 1.95


def tempo_repetido(pontos: list[dict], local: float, modo: str) -> float:
    """O instante dentro dos pontos que vale em `local`: depois do último, volta do primeiro ou vai e volta."""
    primeiro = pontos[0]["t"]
    periodo = pontos[-1]["t"] - primeiro
    if len(pontos) < 2 or periodo <= 0 or local <= primeiro + periodo:
        return local
    passado = local - primeiro
    if modo == "ciclo":
        return primeiro + math.fmod(passado, periodo)
    q = math.fmod(passado, 2 * periodo)
    return primeiro + (q if q < periodo else 2 * periodo - q)


def _tremor(expressao: dict | None) -> dict | None:
    tremor = (expressao or {}).get("tremer")
    return tremor if tremor and tremor["periodo"] > 0 and tremor["amplitude"] != 0 else None


def valor_com_expressao(pontos: list[dict] | None, fixo: float, expressao: dict | None, propriedade: str,
                        local: float) -> float:
    """O valor da propriedade em `local` (desde o começo do clipe), com os pontos e a expressão."""
    valor = fixo
    if pontos:
        repetir = (expressao or {}).get("repetir")
        valor = valor_no_tempo(pontos, tempo_repetido(pontos, local, repetir) if repetir else local)
    tremor = _tremor(expressao)
    if tremor:
        valor += tremor["amplitude"] * ruido((local + tremor["deslocamento"]) / tremor["periodo"]
                                             + FASE_DO_TREMOR[propriedade])
        if propriedade == "opacidade":
            valor = min(1.0, max(0.0, valor))
        if propriedade == "escala":
            valor = max(ESCALA_MINIMA, valor)
    return valor


def transformacao_no_tempo(clipe: dict, t: float) -> dict:
    """A transformação em `t` da linha do tempo (mesma unidade de clipe["inicio"]), sem as animações."""
    keyframes = clipe.get("keyframes") or {}
    expressoes = clipe.get("expressoes") or {}
    resultado = dict(clipe["transformacao"])
    for propriedade in animadas(clipe):
        resultado[propriedade] = valor_com_expressao(keyframes.get(propriedade), clipe["transformacao"][propriedade],
                                                     expressoes.get(propriedade), propriedade, t - clipe["inicio"])
    return resultado


def animadas(clipe: dict) -> set[str]:
    """As propriedades que mudam com o tempo: as que têm keyframes ou tremido."""
    keyframes = clipe.get("keyframes") or {}
    expressoes = clipe.get("expressoes") or {}
    return {p for p in PROPRIEDADES if keyframes.get(p) or _tremor(expressoes.get(p))}


def maior_escala(clipe: dict) -> float:
    """A maior escala que o clipe alcança com os keyframes e o tremido (o tamanho da caixa no render)."""
    pontos = (clipe.get("keyframes") or {}).get("escala")
    maior = max(ponto["valor"] for ponto in pontos) if pontos else clipe["transformacao"]["escala"]
    tremor = _tremor((clipe.get("expressoes") or {}).get("escala"))
    return maior + abs(tremor["amplitude"]) if tremor else maior


def transformacao_de_base(clipe: dict) -> dict:
    """
    A transformação que o render usa para o tamanho da caixa: a escala é a maior dos keyframes (o
    clipe é redimensionado uma vez nesse tamanho e só diminui por quadro, sem perder nitidez) e a
    rotação animada fica de fora (o giro é feito por quadro depois).
    """
    mudam = animadas(clipe)
    base = dict(clipe["transformacao"])
    if "escala" in mudam:
        base["escala"] = maior_escala(clipe)
    if "rotacao" in mudam:
        base["rotacao"] = 0
    if "opacidade" in mudam:
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

    def regiao(k: int) -> str:
        """-1: antes do primeiro ponto; i: entre o ponto i e o i+1; o último: depois do último ponto."""
        if k < 0:
            return _n(pontos[0]["valor"])
        if k >= len(pontos) - 1:
            return _n(pontos[-1]["valor"])
        a, b = pontos[k], pontos[k + 1]
        p = f"(({var}-{_n(tempos[k])})/{_n(tempos[k + 1] - tempos[k])})"
        curva = f"({p}*{p}*(3-2*{p}))" if a["curva"] == "suave" else p
        return f"({_n(a['valor'])}+{_n(b['valor'] - a['valor'])}*{curva})"

    # Busca binária pelos tempos: a região k começa em tempos[k]. Em fila (um if dentro do outro), 100 pontos
    # passavam do limite de 100 níveis do parser do FFmpeg e a exportação falhava; em árvore, uns 7
    def arvore(de: int, ate: int) -> str:
        if de == ate:
            return regiao(de)
        meio = (de + ate + 1) // 2
        return f"if(lt({var},{_n(tempos[meio])}),{arvore(de, meio - 1)},{arvore(meio, ate)})"

    return arvore(-1, len(pontos) - 1)


def _tempo_da_repeticao(pontos: list[dict], modo: str, inicio_do_clipe: float, var: str) -> str:
    """O tempo do vídeo final que a expressão dos pontos deve usar: depois do último ponto, ele volta."""
    primeiro = pontos[0]["t"] / TICKS_POR_SEGUNDO
    periodo = (pontos[-1]["t"] - pontos[0]["t"]) / TICKS_POR_SEGUNDO
    if len(pontos) < 2 or periodo <= 0:
        return var
    local = f"({var}-{_n(inicio_do_clipe)})"
    passado = f"({local}-{_n(primeiro)})"
    if modo == "ciclo":
        dentro = f"mod({passado},{_n(periodo)})"
    else:
        q = f"mod({passado},{_n(2 * periodo)})"
        dentro = f"if(lt({q},{_n(periodo)}),{q},{_n(2 * periodo)}-{q})"
    voltando = f"({_n(inicio_do_clipe + primeiro)}+{dentro})"
    return f"if(gt({local},{_n(primeiro + periodo)}),{voltando},{var})"


def expressao_da_propriedade(clipe: dict, propriedade: str, inicio_do_clipe: float, var: str = "t") -> str:
    """A expressão do FFmpeg da propriedade, com os keyframes e a expressão (repetir, tremer)."""
    pontos = (clipe.get("keyframes") or {}).get(propriedade)
    expressao_dela = (clipe.get("expressoes") or {}).get(propriedade) or {}
    if pontos:
        repetir = expressao_dela.get("repetir")
        tempo = _tempo_da_repeticao(pontos, repetir, inicio_do_clipe, var) if repetir else var
        resultado = expressao(pontos, inicio_do_clipe, tempo)
    else:
        resultado = _n(clipe["transformacao"][propriedade])
    tremor = _tremor(expressao_dela)
    if tremor:
        ciclos = (f"(({var}-{_n(inicio_do_clipe)}+{_n(tremor['deslocamento'] / TICKS_POR_SEGUNDO)})"
                  f"/{_n(tremor['periodo'] / TICKS_POR_SEGUNDO)}+{_n(FASE_DO_TREMOR[propriedade])})")
        w = f"(2*PI*{ciclos})"
        soma = f"(sin({w}+1.3)+0.6*sin(1.73*{w}+4.1)+0.35*sin(2.91*{w}+2.2))/1.95"
        resultado = f"({resultado})+{_n(tremor['amplitude'])}*{soma}"
        if propriedade == "escala":
            resultado = f"max({_n(ESCALA_MINIMA)},{resultado})"
    return resultado


def comandos_de_opacidade(clipe: dict, inicio_do_clipe: float, janela: tuple[float, float], fps: float,
                          alvo: str) -> str:
    """
    O roteiro do sendcmd que muda a opacidade a cada quadro (keyframes e expressão do clipe).
    janela: (início, fim) do clipe no vídeo final, em segundos; os tempos do roteiro contam do começo
    da janela (o tempo da cadeia do clipe antes de ir para o lugar dele). Só escreve quando o valor muda.
    """
    pontos = (clipe.get("keyframes") or {}).get("opacidade")
    expressao_dela = (clipe.get("expressoes") or {}).get("opacidade")
    fixo = clipe["transformacao"]["opacidade"]
    linhas, anterior = [], None
    quadros = round((janela[1] - janela[0]) * fps) + 1
    for n in range(quadros):
        local = n / fps
        no_clipe = (janela[0] + local - inicio_do_clipe) * TICKS_POR_SEGUNDO
        valor = min(1.0, max(0.0, valor_com_expressao(pontos, fixo, expressao_dela, "opacidade", no_clipe)))
        if anterior is None or abs(valor - anterior) > 1e-4:
            linhas.append(f"{_n(local)} {alvo} aa {_n(valor)};")
            anterior = valor
    return "\n".join(linhas) + "\n"
