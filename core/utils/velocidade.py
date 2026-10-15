# -----------------------------------------------
# TakeOne — velocidade com curva no render
#
# Espelha apps/web/src/lib/projeto/velocidade.ts (casos em tests/casos/velocidade.json). A curva
# (pontos u, s) redistribui o tempo dentro do clipe: a duração e o trecho da mídia não mudam e
# `velocidade` é a média. No FFmpeg:
#   - vídeo: um setpts leva o tempo da mídia ao tempo do clipe pela inversa da conta (reta entre
#     amostras da curva, que é suave o bastante para não se ver diferença);
#   - som: três atempo em série recebem o andamento por roteiro (asendcmd), no tempo da mídia, e o
#     tom da voz fica o mesmo.
# -----------------------------------------------
ANDAMENTO_MINIMO = 0.125
AMOSTRAS_DO_TEMPO = 96
# O andamento do som muda a cada 50 ms do clipe
PASSO_DO_ANDAMENTO = 0.05


def fator_na_curva(pontos: list, u: float) -> float:
    if u <= pontos[0][0]:
        return pontos[0][1]
    for (u0, s0), (u1, s1) in zip(pontos, pontos[1:], strict=False):
        if u < u1:
            return s0 + (s1 - s0) * (u - u0) / (u1 - u0)
    return pontos[-1][1]


def integral_da_curva(pontos: list, u: float) -> float:
    """A integral de s de 0 até u (exata: s é reta entre os pontos), também fora de 0 a 1."""
    if u <= 0:
        return u * pontos[0][1]
    soma = 0.0
    for (u0, s0), (u1, _) in zip(pontos, pontos[1:], strict=False):
        fim = min(u, u1)
        if fim > u0:
            soma += (fim - u0) * (s0 + fator_na_curva(pontos, fim)) / 2
        if u <= u1:
            return soma
    return soma + (u - 1) * pontos[-1][1]


def fracao_na_midia(pontos: list, u: float) -> float:
    return integral_da_curva(pontos, u) / integral_da_curva(pontos, 1)


def velocidade_na_curva(pontos: list, velocidade: float, u: float) -> float:
    return velocidade * fator_na_curva(pontos, u) / integral_da_curva(pontos, 1)


def _n(valor: float) -> str:
    texto = f"{valor:.6f}".rstrip("0").rstrip(".")
    return "0" if texto in ("", "-0") else texto


def expressao_do_tempo(pontos: list, duracao: float, trecho: float, var: str = "T") -> str:
    """
    A expressão do setpts: do tempo da mídia (`var`, segundos desde o começo do trecho) ao tempo do
    clipe, em segundos. duracao: do clipe; trecho: da mídia (duracao × velocidade).
    """
    amostras = [(k / AMOSTRAS_DO_TEMPO, fracao_na_midia(pontos, k / AMOSTRAS_DO_TEMPO) * trecho)
                for k in range(AMOSTRAS_DO_TEMPO + 1)]
    expressao = _n(duracao)
    for (u0, p0), (u1, p1) in reversed(list(zip(amostras, amostras[1:], strict=False))):
        trecho_reto = f"{_n(u0 * duracao)}+({var}-{_n(p0)})*{_n((u1 - u0) * duracao / (p1 - p0))}"
        expressao = f"if(lt({var},{_n(p1)}),{trecho_reto},{expressao})"
    return expressao


def atempo_necessarios(pontos: list, velocidade: float, duracao: float) -> int:
    """
    Quantos atempo em série a curva precisa: cada um vai de 0,5× para cima, e em série eles perdem um
    pedaço do fim do som (uns 0,2 s com três), então só os que fazem falta.
    """
    menor = min(max(ANDAMENTO_MINIMO, velocidade_na_curva(pontos, velocidade, k * PASSO_DO_ANDAMENTO / duracao))
                for k in range(int(duracao / PASSO_DO_ANDAMENTO) + 1))
    return 1 if menor >= 0.5 else 2 if menor >= 0.25 else 3


def comandos_do_andamento(pontos: list, velocidade: float, duracao: float, alvos: list[str]) -> str:
    """
    O roteiro do asendcmd: a cada PASSO_DO_ANDAMENTO do clipe, o andamento daquele instante, dividido
    pelos atempo em série (a raiz de cada um). Os tempos são da mídia: o roteiro fica antes do atempo.
    """
    trecho = duracao * velocidade
    linhas = []
    for k in range(int(duracao / PASSO_DO_ANDAMENTO) + 1):
        u = k * PASSO_DO_ANDAMENTO / duracao
        andamento = max(ANDAMENTO_MINIMO, velocidade_na_curva(pontos, velocidade, u))
        parte = andamento ** (1 / len(alvos))
        comandos = ", ".join(f"{alvo} tempo {parte:.6f}" for alvo in alvos)
        linhas.append(f"{fracao_na_midia(pontos, u) * trecho:.6f} {comandos};")
    return "\n".join(linhas) + "\n"
