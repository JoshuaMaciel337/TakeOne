# -----------------------------------------------
# TakeOne — o gancho narrado do corte (o Clipar, ADR 0004, 14.8), escrito pelo LLM local
# Funções puras: o pedido ao modelo, o formato da resposta e a conferência da frase.
#
# O editor manda o título do corte e o texto das legendas; o modelo (Qwen3 8B pelo Ollama) escreve uma frase curta,
# para ser falada no começo do vídeo, que faz a pessoa querer ver o resto. O Kokoro fala a frase (o texto em fala de
# sempre) e o editor a põe no começo, com o som do vídeo abaixando por baixo dela.
# -----------------------------------------------
import re
import unicodedata

PALAVRAS_MINIMAS = 4
PALAVRAS_MAXIMAS = 18
# O texto do corte vai cortado: o começo basta para a ideia, e o pedido cabe folgado no contexto do modelo
LETRAS_DO_TEXTO = 4000

# O teto da frase vira gramática no Ollama: sem ele, o modelo chegou a copiar a fala inteira do corte (mais de 6 min
# escrevendo uma frase que a conferência ia recusar)
LETRAS_MAXIMAS = 180
TOKENS_MAXIMOS = 120
ESQUEMA = {"type": "object", "properties": {"frase": {"type": "string", "maxLength": LETRAS_MAXIMAS}},
           "required": ["frase"]}

INSTRUCOES = f"""Você escreve ganchos narrados para vídeos curtos de redes sociais, em português do Brasil. \
Recebe o título e o que é dito no vídeo. Responda só com o JSON pedido.

- Escreva uma frase só, de {PALAVRAS_MINIMAS} a {PALAVRAS_MAXIMAS} palavras, para uma voz falar antes de a pessoa \
do vídeo começar: uma pergunta ou uma promessa que dá vontade de ver até o fim.
- Fale do assunto do vídeo, com as palavras dele, sem contar a conclusão.
- Nada de emojis, hashtags, aspas, "neste vídeo", "assista até o fim" ou "você não vai acreditar".
- Escreva como se fala, com a pontuação no fim."""

FRASE_SIMULADA = "Sabe o que quase ninguém percebe sobre isso?"
PROIBIDAS = ("neste video", "nesse video", "assista ate o fim", "voce nao vai acreditar")


def montar_mensagens(titulo: str, texto: str) -> list[dict]:
    corpo = " ".join(str(texto).split())[:LETRAS_DO_TEXTO]
    return [{"role": "system", "content": INSTRUCOES},
            {"role": "user", "content": f"Título: {titulo.strip() or '(sem título)'}\nO que é dito: {corpo}"}]


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def conferir_frase(bruto: dict) -> str | None:
    """A frase limpa (sem aspas, emojis, hashtags e espaços a mais, com pontuação no fim), ou None se ela não serve:
    curta ou longa demais, ou com os clichês proibidos."""
    frase = str((bruto or {}).get("frase") or "")
    frase = re.sub(r"[\"“”«»]", "", frase)
    frase = re.sub(r"#\w+", "", frase)
    frase = "".join(c for c in frase if c.isalnum() or c.isspace() or c in ".,;:!?'-…%$")
    frase = " ".join(frase.split()).strip(" -")
    if len(frase.split()) > PALAVRAS_MAXIMAS:
        # Longa demais: o modelo às vezes emenda outra frase depois do gancho; a primeira, sozinha, pode servir
        primeira = re.match(r"^.+?[.!?…](?=\s|$)", frase)
        frase = primeira.group(0) if primeira else frase
    palavras = frase.split()
    if not PALAVRAS_MINIMAS <= len(palavras) <= PALAVRAS_MAXIMAS:
        return None
    if any(proibida in _sem_acento(frase) for proibida in PROIBIDAS):
        return None
    if frase[-1] not in ".!?…":
        frase += "."
    return frase[0].upper() + frase[1:]
