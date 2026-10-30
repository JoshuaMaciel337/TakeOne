# -----------------------------------------------
# TakeOne — onde está o rosto principal de uma mídia, ao longo do tempo
#
# Uma por mídia: amostras (tempo em segundos da mídia, centro x e y em frações da imagem como ela
# aparece, já girada, e a área do rosto). O editor transforma as amostras em keyframes de posição
# que seguem o rosto (apps/web/src/lib/projeto/reenquadrar.ts). Funções puras.
# -----------------------------------------------
from core.utils.mongo import agora

STATUS_PROCESSANDO = "processando"
STATUS_PRONTO = "pronto"
STATUS_ERRO = "erro"

# Quadros analisados por segundo: o bastante para seguir quem anda, sem pesar no worker
AMOSTRAS_POR_SEGUNDO = 2
# Largura em que o detector vê o quadro (o rosto de alguém num plano aberto ainda aparece)
LARGURA_DE_ANALISE = 480
CONFIANCA_MINIMA = 0.6
# Outro rosto só "rouba" o enquadramento se estiver perto de quem já estava em quadro
# (adaptado do HolyCut): a plateia ao fundo não tira o foco de quem fala
DISTANCIA_MESMA_PESSOA = 0.18
# Os outros rostos de cada amostra: no máximo tantos, e só os de pelo menos tanto da área do principal (a plateia
# ao fundo não conta)
OUTROS_NO_MAXIMO = 3
AREA_DOS_OUTROS = 0.25
# 2: as amostras têm os outros rostos do quadro (as de antes, sem eles, são buscadas de novo quando o layout pede)
VERSAO_DA_BUSCA = 2


def montar_rosto(organizacao_id, midia_id) -> dict:
    momento = agora()
    return {"organizacao_id": organizacao_id, "midia_id": midia_id, "status": STATUS_PROCESSANDO,
            "amostras": [], "erro": None, "criado_em": momento, "atualizado_em": momento}


def _distancia(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def escolher_rosto(ultimo: tuple[float, float] | None,
                   rostos: list[tuple[float, float, float]]) -> tuple[float, float, float] | None:
    """
    O rosto de quem está em quadro, entre os achados (x, y, área), normalizados. Sem ninguém antes,
    fica o maior. Se já havia alguém, continua nele enquanto houver um rosto perto; se ele saiu, entra
    o maior que restou.
    """
    if not rostos:
        return None
    if ultimo is not None:
        perto = [r for r in rostos if _distancia(r[:2], ultimo) <= DISTANCIA_MESMA_PESSOA]
        if perto:
            return max(perto, key=lambda r: r[2] / (0.05 + _distancia(r[:2], ultimo)))
    return max(rostos, key=lambda r: r[2])


def outros_rostos(escolhido: tuple[float, float, float],
                  rostos: list[tuple[float, float, float]]) -> list[tuple[float, float, float]]:
    """Os rostos do quadro além do escolhido, do maior para o menor, sem os pequenos demais perto dele."""
    outros = [r for r in rostos if r is not escolhido and r[2] >= escolhido[2] * AREA_DOS_OUTROS]
    return sorted(outros, key=lambda r: -r[2])[:OUTROS_NO_MAXIMO]
