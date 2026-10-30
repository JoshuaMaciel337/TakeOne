# -----------------------------------------------
# TakeOne — emoji automático nas legendas (o Clipar, ADR 0004, 14.8), escolhido pelo LLM local
# Funções puras: a lista fechada de emojis, o pedido ao modelo, o formato da resposta e a conferência.
#
# O editor manda o texto de cada legenda; o modelo (Qwen3 8B pelo Ollama) aponta, pelo nome, um emoji da lista
# para as legendas em que ele reforça o que é dito. A lista é fechada (o esquema só aceita os nomes dela): o
# modelo não inventa um emoji que a fonte não tem, e o nome em português o ajuda a escolher pelo sentido. O que
# vem fora das regras (legendas vizinhas, emojis demais, o mesmo seguido) é tirado aqui.
# -----------------------------------------------
from core.modelos.palavras_chave import MAXIMO_DE_LEGENDAS, legendas_numeradas

# Nome → emoji. Os nomes vão ao modelo; os emojis são desenhados pela fonte de emoji do servidor
EMOJIS = {
    "fogo": "🔥", "dinheiro": "💰", "nota_de_dinheiro": "💵", "grafico_subindo": "📈", "grafico_caindo": "📉",
    "foguete": "🚀", "estrela": "⭐", "brilho": "✨", "coracao": "❤️", "coracao_partido": "💔", "risada": "😂",
    "sorriso": "😄", "piscadela": "😉", "apaixonado": "😍", "pensativo": "🤔", "surpreso": "😮", "chocado": "😱",
    "triste": "😢", "chorando": "😭", "bravo": "😠", "legal": "😎", "mente_explodindo": "🤯", "aplausos": "👏",
    "joinha": "👍", "nao_curti": "👎", "maos_juntas": "🙏", "musculo": "💪", "apontando": "👉", "olhos": "👀",
    "atencao": "⚠️", "proibido": "🚫", "certo": "✅", "errado": "❌", "pergunta": "❓", "exclamacao": "❗",
    "ideia": "💡", "alvo": "🎯", "trofeu": "🏆", "medalha": "🥇", "coroa": "👑", "diamante": "💎",
    "presente": "🎁", "festa": "🎉", "relogio": "⏰", "ampulheta": "⏳", "calendario": "📅", "celular": "📱",
    "computador": "💻", "camera": "📸", "video": "🎬", "microfone": "🎤", "musica": "🎵", "livro": "📚",
    "escola": "🎓", "lapis": "✏️", "cerebro": "🧠", "coracao_saude": "🩺", "remedio": "💊", "comida": "🍽️",
    "cafe": "☕", "pizza": "🍕", "casa": "🏠", "carro": "🚗", "aviao": "✈️", "mundo": "🌎", "sol": "☀️",
    "lua": "🌙", "chuva": "🌧️", "raio": "⚡", "planta": "🌱", "arvore": "🌳", "cachorro": "🐶", "gato": "🐱",
    "bebe": "👶", "familia": "👨‍👩‍👧", "casal": "💑", "amigos": "🤝", "trabalho": "💼", "ferramenta": "🔧",
    "cadeado": "🔒", "chave": "🔑", "sino": "🔔", "megafone": "📣", "mensagem": "💬", "email": "📧",
    "carrinho": "🛒", "etiqueta": "🏷️", "cem": "💯", "um": "1️⃣", "dois": "2️⃣", "tres": "3️⃣", "seta_cima": "⬆️",
    "seta_baixo": "⬇️", "cruz": "✝️", "biblia": "📖", "anjo": "😇", "pomba": "🕊️", "esporte": "⚽",
    "corrida": "🏃", "dormir": "😴", "doente": "🤒", "segredo": "🤫", "dedo_cruzado": "🤞", "mapa": "🗺️",
}

# No máximo uma legenda com emoji a cada duas, e nunca duas seguidas
FRACAO_MAXIMA = 0.4

ESQUEMA = {
    "type": "object",
    "properties": {
        "escolhas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"legenda": {"type": "integer"}, "emoji": {"type": "string", "enum": list(EMOJIS)}},
                "required": ["legenda", "emoji"],
            },
        },
    },
    "required": ["escolhas"],
}

INSTRUCOES = f"""Você põe emojis em legendas de vídeos curtos para redes sociais. Cada legenda começa com o \
número dela (L0, L1...); as legendas seguidas formam as frases, então leia a frase inteira antes de escolher. \
Responda só com o JSON pedido.

- O emoji tem de combinar com o sentido E com o sentimento da frase. Assunto triste ou sério (doença, morte, medo, \
perda) pede um emoji sério (triste, chorando, chocado, maos_juntas) ou nenhum: nunca troféu, medalha, festa, \
certo ou joinha num assunto assim.
- Ponha só onde a legenda diz algo concreto que o emoji mostra: dinheiro, tempo, comida, um lugar, uma emoção \
forte, uma conquista de verdade, um alerta, um número. Nas legendas neutras ou de ligação, nada.
- Exemplos: "ganhei dez mil reais" → dinheiro; "fiquei com muito medo" → chocado; "descobri que estava \
doente" → triste; "acordo às cinco da manhã" → relogio; "isso mudou minha vida" → brilho; "pare de fazer \
isso" → proibido.
- No máximo uma legenda com emoji a cada três, nunca em duas seguidas. Na dúvida, não ponha.
- Use só os nomes desta lista: {", ".join(EMOJIS)}.
- Devolva o número da legenda e o nome do emoji."""


def montar_mensagens(legendas: list[dict]) -> list[dict]:
    return [{"role": "system", "content": INSTRUCOES},
            {"role": "user", "content": f"Legendas:\n{legendas_numeradas(legendas)}"}]


def conferir_escolhas(bruto: dict, legendas: list[dict]) -> dict[str, str]:
    """id da legenda → nome do emoji: só nomes da lista, legendas que existem, nenhuma vizinha de outra, sem o
    mesmo emoji duas vezes seguidas e no máximo FRACAO_MAXIMA das legendas (as primeiras escolhas ficam)."""
    total = min(len(legendas), MAXIMO_DE_LEGENDAS)
    por_indice: dict[int, str] = {}
    for escolha in bruto.get("escolhas") or []:
        if not isinstance(escolha, dict):
            continue
        i, nome = escolha.get("legenda"), escolha.get("emoji")
        if isinstance(i, int) and 0 <= i < total and nome in EMOJIS and i not in por_indice:
            por_indice[i] = nome
    maximo = max(1, int(total * FRACAO_MAXIMA)) if total else 0
    ficam: dict[int, str] = {}
    anterior = None
    for i in sorted(por_indice):
        if len(ficam) >= maximo or (i - 1) in ficam or por_indice[i] == anterior:
            continue
        ficam[i] = anterior = por_indice[i]
    return {legendas[i]["id"]: nome for i, nome in ficam.items()}


def escolhas_simuladas(legendas: list[dict]) -> dict[str, str]:
    """Sem modelo (MODO_IA=simulado): um emoji a cada três legendas, passando pela lista."""
    nomes = list(EMOJIS)
    total = min(len(legendas), MAXIMO_DE_LEGENDAS)
    escolhas = [{"legenda": i, "emoji": nomes[(i // 3) % len(nomes)]} for i in range(0, total, 3)]
    return conferir_escolhas({"escolhas": escolhas}, legendas)
