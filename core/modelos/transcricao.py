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

    na_fala = [n for p in palavras for n in niveis[indice(p["inicio"]):indice(p["fim"])]]
    if not na_fala:
        return palavras
    tipico = sorted(na_fala)[len(na_fala) // 2]
    limiar = min(max(tipico - ABAIXO_DA_FALA_DB, LIMIAR_DB[0]), LIMIAR_DB[1])
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
