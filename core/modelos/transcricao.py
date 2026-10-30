# -----------------------------------------------
# TakeOne — transcrição da fala de uma mídia
#
# Uma por mídia: as palavras com o tempo de cada uma, em segundos da mídia. O editor transforma essas
# palavras em legendas no tempo da linha do tempo (apps/web/src/lib/projeto/legendasDaFala.ts).
# Funções puras: montam e calculam, sem acessar o banco.
# -----------------------------------------------
import re

from core.utils.mongo import agora

# faster-whisper large-v3-turbo em int8: uns 3 GB de VRAM, bom em português e rápido
MODELO = "large-v3-turbo"
IDIOMAS = ("auto", "pt", "en", "es")

STATUS_PROCESSANDO = "processando"
STATUS_PRONTA = "pronta"
STATUS_ERRO = "erro"

# Áudio maior que isso é ouvido em fatias, para a memória não crescer com a duração
SEGUNDOS_POR_FATIA = 600

# Texto do modo simulado (MODO_IA=simulado): sem modelo, para desenvolver e testar o fluxo
TEXTO_SIMULADO = ("Este é um texto de exemplo gerado sem o modelo de transcrição. Ele serve para testar as legendas "
                  "automáticas no editor, com frases curtas e pausas entre elas.")


def montar_transcricao(organizacao_id, midia_id, idioma: str) -> dict:
    """Documento novo, ainda processando."""
    momento = agora()
    return {
        "organizacao_id": organizacao_id,
        "midia_id": midia_id,
        "status": STATUS_PROCESSANDO,
        "idioma": idioma,
        "modelo": MODELO,
        "palavras": [],
        "erro": None,
        "criado_em": momento,
        "atualizado_em": momento,
    }


def fatias_de(duracao: float) -> list[tuple[float, float]]:
    """Trechos de até SEGUNDOS_POR_FATIA que cobrem a mídia inteira."""
    if duracao <= SEGUNDOS_POR_FATIA:
        return [(0.0, duracao)]
    fatias, inicio = [], 0.0
    while inicio < duracao:
        fatias.append((inicio, min(inicio + SEGUNDOS_POR_FATIA, duracao)))
        inicio += SEGUNDOS_POR_FATIA
    return fatias


def limpar_palavras(brutas: list[dict]) -> list[dict]:
    """
    Palavras do Whisper prontas para guardar: sem espaços nas pontas, sem vazias, em ordem, com o fim
    depois do começo e sem uma passar por cima da seguinte.
    """
    palavras = []
    for bruta in sorted((b for b in brutas if b.get("inicio") is not None), key=lambda b: b["inicio"]):
        texto = re.sub(r"\s+", " ", bruta.get("texto") or "").strip()
        if not texto:
            continue
        inicio = max(float(bruta["inicio"]), palavras[-1]["fim"] if palavras else 0.0)
        fim = max(float(bruta.get("fim") or inicio), inicio + 0.01)
        palavras.append({"texto": texto, "inicio": round(inicio, 3), "fim": round(fim, 3)})
    return palavras


# Uma palavra nunca encolhe abaixo disto ao tirar o silêncio das pontas, em segundos
PALAVRA_MINIMA = 0.08
# Silêncio é o que fica tantos dB abaixo da fala típica da gravação, dentro destes limites
ABAIXO_DA_FALA_DB = 25
LIMIAR_DB = (-60, -30)


def limiar_de_silencio(palavras: list[dict], niveis, por_segundo: int) -> float | None:
    """O nível (dB) abaixo do qual é silêncio: tantos dB abaixo da fala típica da gravação. None sem fala."""
    total = len(niveis)

    def indice(s: float) -> int:
        return min(int(round(s * por_segundo)), total)

    na_fala = [n for p in palavras for n in niveis[indice(p["inicio"]):indice(p["fim"])]]
    if not na_fala:
        return None
    tipico = sorted(na_fala)[len(na_fala) // 2]
    return min(max(tipico - ABAIXO_DA_FALA_DB, LIMIAR_DB[0]), LIMIAR_DB[1])


def aparar_no_silencio(palavras: list[dict], niveis, por_segundo: int) -> list[dict]:
    """
    Tira das pontas de cada palavra o que é silêncio nos níveis de áudio da ingestão (picos em dB, por
    janela). O Whisper costuma esticar a palavra para dentro da pausa seguinte; sem isso, uma pausa de
    2 s parecia ter 1 s. O limiar acompanha o volume da fala, para valer em gravação limpa e com ruído.
    """
    if not palavras or len(niveis) == 0:
        return palavras
    total = len(niveis)

    def indice(s: float) -> int:
        return min(max(int(round(s * por_segundo)), 0), total)

    limiar = limiar_de_silencio(palavras, niveis, por_segundo)
    if limiar is None:
        return palavras
    minima = round(PALAVRA_MINIMA * por_segundo)
    aparadas = []
    for palavra in palavras:
        ini, fim = indice(palavra["inicio"]), indice(palavra["fim"])
        while fim - ini > minima and niveis[fim - 1] < limiar:
            fim -= 1
        while fim - ini > minima and niveis[ini] < limiar:
            ini += 1
        aparadas.append({**palavra, "inicio": round(max(palavra["inicio"], ini / por_segundo), 3),
                         "fim": round(min(palavra["fim"], fim / por_segundo), 3)})
    return aparadas


# -----------------------------------------------
# Fala que o Whisper omitiu (para achar retakes)
# -----------------------------------------------
# O Whisper "limpa" a fala: quando a pessoa começa uma frase e repete, ele escreve uma vez só. Sobra um
# rastro: a palavra seguinte fica longa demais (a repetição está dentro dela) ou um trecho com voz fica
# sem palavra nenhuma. Esses trechos são ouvidos de novo, sozinhos, e o que voltar só entra se repetir
# palavras vizinhas: é o que um retake é, e o que as invenções do Whisper ("E aí", "Obrigado.") não são.
VEZES_O_RITMO = 2          # palavra suspeita: dura mais que o dobro do ritmo da pessoa para as letras dela
PALAVRA_SUSPEITA_S = 0.6   # e mais que isto
TRECHO_SEM_PALAVRA_S = 0.6   # trecho sem palavra maior que isto; os dois tipos precisam de voz em mais da metade
VIZINHANCA_S = 10.0        # as palavras recuperadas precisam repetir palavras até este tempo de distância
REPETIDAS_MINIMO = 2       # quantas palavras seguidas iguais contam como repetição
SOBREPOSICAO_TOLERADA_S = 0.05   # uma recuperada que começa até isto antes de uma palavra que ficou é a mesma


def _normal(texto: str) -> str:
    return re.sub(r"[^\w]", "", texto.lower())


def _com_voz(niveis, inicio: float, fim: float, por_segundo: int, limiar: float) -> float:
    trecho = niveis[max(int(inicio * por_segundo), 0):max(int(fim * por_segundo), 0)]
    return sum(1 for n in trecho if n >= limiar) / len(trecho) if len(trecho) else 0.0


def trechos_suspeitos(palavras: list[dict], niveis, por_segundo: int, duracao: float) -> list[tuple[float, float]]:
    """Onde o Whisper pode ter omitido fala: palavras longas demais e trechos com voz sem palavra."""
    limiar = limiar_de_silencio(palavras, niveis, por_segundo)
    if limiar is None:
        return []
    ritmos = sorted((p["fim"] - p["inicio"]) / max(len(p["texto"]), 1) for p in palavras)
    ritmo = ritmos[len(ritmos) // 2]
    trechos = [(p["inicio"], p["fim"]) for p in palavras
               if p["fim"] - p["inicio"] > max(PALAVRA_SUSPEITA_S, VEZES_O_RITMO * ritmo * len(p["texto"]))
               and _com_voz(niveis, p["inicio"], p["fim"], por_segundo, limiar) > 0.5]
    bordas = [0.0, *(x for p in palavras for x in (p["inicio"], p["fim"])), duracao]
    for inicio, fim in zip(bordas[0::2], bordas[1::2], strict=False):
        if fim - inicio > TRECHO_SEM_PALAVRA_S and _com_voz(niveis, inicio, fim, por_segundo, limiar) > 0.5:
            trechos.append((inicio, fim))
    return sorted(trechos)


def repete_vizinhas(novas: list[dict], palavras: list[dict], inicio: float, fim: float) -> bool:
    """As palavras recuperadas repetem pelo menos REPETIDAS_MINIMO palavras seguidas da fala por perto."""
    vizinhas = [_normal(p["texto"]) for p in palavras
                if p["fim"] > inicio - VIZINHANCA_S and p["inicio"] < fim + VIZINHANCA_S
                and not (p["inicio"] >= inicio - 0.01 and p["fim"] <= fim + 0.01)]
    recuperadas = [_normal(p["texto"]) for p in novas]
    n = REPETIDAS_MINIMO
    pares = {tuple(vizinhas[i:i + n]) for i in range(len(vizinhas) - n + 1)}
    return any(tuple(recuperadas[i:i + n]) in pares for i in range(len(recuperadas) - n + 1))


def encaixar_recuperadas(palavras: list[dict], novas: list[dict], inicio: float, fim: float) -> list[dict]:
    """
    Troca as palavras que estavam dentro do trecho pelas recuperadas. Só entram as que começam dentro
    dele e não começam dentro de uma palavra que ficou: no fim do trecho ouvido sozinho o Whisper
    costuma completar a frase com palavras que não foram ditas ali. A que só avança o fim sobre a
    vizinha (o Whisper estica a última palavra até a borda do trecho) é aparada onde a vizinha começa.
    """
    fora = [p for p in palavras if not (p["inicio"] >= inicio - 0.01 and p["fim"] <= fim + 0.01)]

    def por_cima(nova: dict) -> bool:
        return any(p["inicio"] - SOBREPOSICAO_TOLERADA_S <= nova["inicio"] < p["fim"] for p in fora)

    cabem = [n for n in novas if inicio - 0.01 <= n["inicio"] < fim and not por_cima(n)]
    for nova in cabem:
        # As reticências que o Whisper põe na palavra cortada na borda do trecho
        nova["texto"] = re.sub(r"(\.\.\.|…)$", "", nova["texto"]) or nova["texto"]
        # A recuperada termina onde a vizinha começa
        seguinte = next((p for p in fora if p["inicio"] >= nova["inicio"]), None)
        if seguinte and nova["fim"] > seguinte["inicio"]:
            nova["fim"] = max(nova["inicio"] + 0.01, seguinte["inicio"])
    return sorted([*fora, *cabem], key=lambda p: p["inicio"])


def palavras_simuladas(duracao: float) -> list[dict]:
    """Palavras de mentira que cobrem a mídia: 0,35 s cada, com uma pausa de 0,8 s depois de cada frase."""
    palavras, t, i = [], 0.2, 0
    texto = TEXTO_SIMULADO.split()
    while t + 0.3 < duracao:
        palavra = texto[i % len(texto)]
        palavras.append({"texto": palavra, "inicio": round(t, 3), "fim": round(t + 0.3, 3)})
        t += 0.35 + (0.8 if palavra.endswith(".") else 0)
        i += 1
    return palavras


# A dica do vocabulário da marca para o Whisper: os nomes que ele deve acertar. Ela entra no começo do contexto
# do decodificador, então fica curta (o contexto tem 448 tokens e a dica não pode empurrar o texto ouvido para fora)
LETRAS_DA_DICA = 400


def dica_do_vocabulario(vocabulario: list[str]) -> str | None:
    """Os nomes do vocabulário separados por vírgula, até LETRAS_DA_DICA letras, ou None sem nenhum."""
    nomes, total = [], 0
    for nome in vocabulario or []:
        nome = " ".join(str(nome).split())
        if not nome or total + len(nome) + 2 > LETRAS_DA_DICA:
            continue
        nomes.append(nome)
        total += len(nome) + 2
    return ", ".join(nomes) or None
