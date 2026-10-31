# -----------------------------------------------
# TakeOne — o gosto do espaço no Clipar (ADR 0004, 14.3 e 14.10): os cortes que a pessoa marcou com "gostei" e
# "não gostei" nas clipagens de antes
#
# Entram de dois jeitos na clipagem seguinte:
#   - como exemplos no pedido ao modelo (o título, a categoria, a duração e o começo da fala de cada um), para ele
#     preferir os momentos parecidos com os de que a pessoa gostou;
#   - num ajuste pequeno da nota (no máximo GOSTO_MAXIMO pontos para cada lado), pela categoria e pela duração dos
#     avaliados: o modelo de 8B segue os exemplos pouco, e o ajuste é medido e explicado no corte.
# Com menos de MINIMO_DE_AVALIACOES, não há gosto. Funções puras.
# -----------------------------------------------
from core.modelos.cortes import CATEGORIAS

MINIMO_DE_AVALIACOES = 2
EXEMPLOS_DE_CADA = 4          # gostei e não gostei, os mais novos
LETRAS_DO_EXEMPLO = 160
GOSTO_MAXIMO = 6              # pontos (de 100) para cada lado
PONTOS_POR_CATEGORIA = 3      # cada avaliação da mesma categoria, com o sinal dela
PONTOS_DA_DURACAO = 2         # perto da duração dos que ela gostou
PERTO_DA_DURACAO = 0.3        # 30% para cada lado


def avaliados(clipagens: list[dict], tirar_id=None) -> list[dict]:
    """Os cortes avaliados das clipagens (as mais novas primeiro), sem os da clipagem `tirar_id`."""
    saida = []
    for clipagem in clipagens:
        if tirar_id is not None and clipagem.get("_id") == tirar_id:
            continue
        for corte in clipagem.get("cortes") or []:
            if corte.get("avaliacao") in ("gostei", "nao_gostei") and corte.get("titulo"):
                saida.append({"avaliacao": corte["avaliacao"], "titulo": corte["titulo"],
                              "categoria": corte.get("categoria") or "explicacao",
                              "duracao": float(corte.get("duracao") or 0),
                              "texto": " ".join(str(corte.get("texto") or "").split())[:LETRAS_DO_EXEMPLO]})
    return saida


def gosto_do_espaco(cortes: list[dict]) -> dict | None:
    """Os exemplos de cada lado e o resumo para o ajuste, ou None sem avaliações bastantes."""
    if len(cortes) < MINIMO_DE_AVALIACOES:
        return None
    gostei = [corte for corte in cortes if corte["avaliacao"] == "gostei"]
    nao = [corte for corte in cortes if corte["avaliacao"] == "nao_gostei"]
    categorias: dict[str, int] = {}
    for corte in cortes:
        categorias[corte["categoria"]] = categorias.get(corte["categoria"], 0) + (1 if corte in gostei else -1)
    duracoes = sorted(corte["duracao"] for corte in gostei if corte["duracao"] > 0)
    return {
        "gostei": gostei[:EXEMPLOS_DE_CADA],
        "nao_gostei": nao[:EXEMPLOS_DE_CADA],
        "categorias": {nome: saldo for nome, saldo in categorias.items() if saldo},
        "duracao": duracoes[len(duracoes) // 2] if len(duracoes) >= 2 else None,
    }


def _exemplo(corte: dict) -> str:
    categoria = CATEGORIAS.get(corte["categoria"], corte["categoria"])
    return f'- "{corte["titulo"]}" ({categoria}, {round(corte["duracao"])} s): começa com "{corte["texto"]}"'


def texto_do_gosto(gosto: dict | None) -> str:
    """O trecho do pedido ao modelo com os exemplos, ou vazio."""
    if not gosto or not (gosto["gostei"] or gosto["nao_gostei"]):
        return ""
    partes = ["Quem pediu já avaliou cortes de outros vídeos. Prefira momentos com o jeito dos que a pessoa gostou "
              "e evite os parecidos com os de que ela não gostou (o assunto deste vídeo é outro: copie o tipo de "
              "momento, não o assunto)."]
    if gosto["gostei"]:
        partes.append("Gostou:\n" + "\n".join(_exemplo(corte) for corte in gosto["gostei"]))
    if gosto["nao_gostei"]:
        partes.append("Não gostou:\n" + "\n".join(_exemplo(corte) for corte in gosto["nao_gostei"]))
    return "\n".join(partes)


def ajuste_do_gosto(corte: dict, gosto: dict | None) -> tuple[int, str]:
    """Os pontos que o gosto soma ou tira da nota do corte, e o porquê (vazio quando é 0)."""
    if not gosto:
        return 0, ""
    motivos, pontos = [], 0
    saldo = gosto["categorias"].get(corte.get("categoria") or "", 0)
    if saldo:
        pontos += PONTOS_POR_CATEGORIA * saldo
        nome = CATEGORIAS.get(corte["categoria"], corte["categoria"]).lower()
        motivos.append(f"você {'gostou' if saldo > 0 else 'não gostou'} de cortes de {nome}")
    referencia = gosto.get("duracao")
    # A duração não compensa uma categoria de que a pessoa não gostou
    perto = referencia and abs(float(corte.get("duracao") or 0) - referencia) <= PERTO_DA_DURACAO * referencia
    if saldo >= 0 and perto:
        pontos += PONTOS_DA_DURACAO
        motivos.append(f"tem a duração dos que você gostou (uns {round(referencia)} s)")
    pontos = max(-GOSTO_MAXIMO, min(GOSTO_MAXIMO, pontos))
    if not pontos:
        return 0, ""
    return pontos, f"{'+' if pontos > 0 else ''}{pontos} pelo seu gosto: " + " e ".join(motivos) + "."
