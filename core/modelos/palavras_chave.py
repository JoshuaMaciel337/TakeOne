# -----------------------------------------------
# TakeOne — palavras-chave das legendas, escolhidas pelo LLM local
# Funções puras: o pedido ao modelo, o formato da resposta e a conferência do que ele devolveu.
#
# O editor manda o texto de cada legenda; o modelo (Qwen3 8B pelo Ollama) aponta, por número, a palavra
# mais forte de cada uma (um número, um nome, a ideia central). As palavras são contadas como no desenho
# do texto (core/utils/texto.py): sequências sem espaço, linha a linha. O que o modelo inventar fora
# disso, ou palavras vazias como "de" e "que", é descartado aqui.
# -----------------------------------------------
import re
import unicodedata

MAXIMO_DE_LEGENDAS = 400           # uns 20 min de legenda; cabe no contexto de 8 mil tokens
MAXIMO_POR_LEGENDA = 2

ESQUEMA = {
    "type": "object",
    "properties": {
        "escolhas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"legenda": {"type": "integer"},
                               "palavras": {"type": "array", "items": {"type": "integer"}}},
                "required": ["legenda", "palavras"],
            },
        },
    },
    "required": ["escolhas"],
}

INSTRUCOES = """Você destaca palavras-chave em legendas de vídeos curtos para redes sociais. Cada legenda \
começa com o número dela (L0, L1...) e cada palavra tem um número entre colchetes. Responda só com o JSON pedido.

- Para cada legenda, escolha a palavra mais forte: um número, um valor, um nome próprio, a ideia central ou \
uma palavra de emoção. No máximo 2 por legenda, e nunca palavras vazias como artigos, preposições, \
pronomes ou "que", "é", "muito".
- Pule as legendas sem nada que mereça destaque (não precisa escolher em todas). Em média, uma palavra a cada \
uma ou duas legendas.
- Devolva o número da legenda e os números das palavras escolhidas, como aparecem no texto."""

# Palavras que nunca são chave, mesmo que o modelo aponte (comparadas sem acento e em minúsculas)
VAZIAS = set("""a o as os um uma uns umas de do da dos das no na nos nas em por para pra pro com sem e ou mas \
que se eu tu ele ela nos vos eles elas voce voces me te lhe isso isto aquilo esse essa este esta aquele aquela \
meu minha seu sua nosso nossa ja nao sim muito mais menos bem tambem so ate ao aos como quando onde porque \
pois entao tipo ai la aqui ser ter estar foi era sao esta tem vai vou fazer e ha""".split())


def palavras_do_texto(texto: str) -> list[str]:
    """As palavras na ordem do desenho: sequências sem espaço, linha a linha (core/utils/letras.py)."""
    return [p for linha in str(texto).replace("\r\n", "\n").split("\n") for p in linha.split()]


def _normalizada(palavra: str) -> str:
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", palavra.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", sem_acento)


def legendas_numeradas(legendas: list[dict]) -> str:
    """Uma linha por legenda: 'L3: [0]Hoje [1]vou [2]mostrar'."""
    return "\n".join(f"L{i}: " + " ".join(f"[{j}]{p}" for j, p in enumerate(palavras_do_texto(legenda["texto"])))
                     for i, legenda in enumerate(legendas[:MAXIMO_DE_LEGENDAS]))


def montar_mensagens(legendas: list[dict]) -> list[dict]:
    return [{"role": "system", "content": INSTRUCOES},
            {"role": "user", "content": f"Legendas:\n{legendas_numeradas(legendas)}"}]


def conferir_escolhas(bruto: dict, legendas: list[dict]) -> dict[str, list[int]]:
    """id da legenda → números das palavras-chave, só com o que existe no texto e não é palavra vazia."""
    chaves: dict[str, list[int]] = {}
    total = min(len(legendas), MAXIMO_DE_LEGENDAS)
    for escolha in bruto.get("escolhas") or []:
        if not isinstance(escolha, dict):
            continue
        i = escolha.get("legenda")
        if not isinstance(i, int) or not 0 <= i < total:
            continue
        palavras = palavras_do_texto(legendas[i]["texto"])
        boas = []
        for j in escolha.get("palavras") or []:
            if not isinstance(j, int) or not 0 <= j < len(palavras) or j in boas:
                continue
            normal = _normalizada(palavras[j])
            if not normal or normal in VAZIAS or (len(normal) < 3 and not normal.isdigit()):
                continue
            boas.append(j)
        if boas:
            chaves[legendas[i]["id"]] = sorted(boas[:MAXIMO_POR_LEGENDA])
    return chaves


def escolhas_simuladas(legendas: list[dict]) -> dict[str, list[int]]:
    """Sem modelo (MODO_IA=simulado): a palavra mais longa de uma legenda sim, outra não."""
    escolhas = []
    for i, legenda in enumerate(legendas[:MAXIMO_DE_LEGENDAS]):
        palavras = palavras_do_texto(legenda["texto"])
        if i % 2 == 0 and palavras:
            escolhas.append({"legenda": i, "palavras": [max(range(len(palavras)),
                                                            key=lambda j: len(_normalizada(palavras[j])))]})
    return conferir_escolhas({"escolhas": escolhas}, legendas)
