# -----------------------------------------------
# TakeOne — "Criar automaticamente": o plano de edição que o LLM local monta a partir da fala
# Funções puras: o pedido ao modelo, o formato da resposta e a conferência do que ele devolveu.
#
# O modelo (Qwen3 8B pelo Ollama) não escreve código nem decide cortes: a limpeza da fala já faz isso.
# Ele lê a transcrição com as palavras numeradas e escolhe o título, a tarja de apresentação, os
# trechos para dar zoom e a chamada do fim, sempre apontando números de palavras. Assim o tempo de
# cada coisa sai da transcrição, não do modelo, e o que ele inventar fora dela é descartado aqui.
# -----------------------------------------------
import re
import unicodedata

# Medido no Qwen3 (prompt_eval_count): uns 7,3 tokens por palavra numerada, mais 180 das regras. Com 1800,
# o pedido dava 13.267 tokens e o Ollama cortava o começo (as regras e a abertura da fala); com 900, uns
# 6.400, e sobra lugar para a resposta nos 8.192 do contexto. O editor manda o começo e o fim da fala
MAXIMO_DE_PALAVRAS = 900
MAXIMO_DE_DESTAQUES = 4
DESTAQUE_MINIMO_S = 1.2
DESTAQUE_MAXIMO_S = 7.0
TITULO_MAXIMO = 40
CTA_MAXIMO = 40
PALAVRAS_DO_TITULO = 7
PALAVRAS_DA_CTA = 6
NOME_MAXIMO = 40
FUNCAO_MAXIMA = 60

ESQUEMA = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string"},
        "apresentacao": {
            "type": ["object", "null"],
            "properties": {"nome": {"type": "string"}, "funcao": {"type": "string"}, "palavra": {"type": "integer"}},
            "required": ["nome", "funcao", "palavra"],
        },
        "destaques": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"de": {"type": "integer"}, "ate": {"type": "integer"}},
                "required": ["de", "ate"],
            },
        },
        "cta": {"type": ["string", "null"]},
    },
    "required": ["titulo", "apresentacao", "destaques", "cta"],
}

INSTRUCOES = """Você é um editor de vídeos curtos para redes sociais. Você recebe a transcrição de um vídeo: cada \
palavra tem um número entre colchetes, e cada linha começa no segundo em que a frase começa. Monte o plano de \
edição e responda só com o JSON pedido, em português do Brasil.

- titulo: uma frase curta (de 2 a 6 palavras, até 40 letras) com o assunto ou o gancho do vídeo, para abrir \
o vídeo na tela. Sem aspas, sem emoji, sem ponto final.
- apresentacao: só se a pessoa disser o próprio nome (por exemplo "eu sou a Ana", "meu nome é João"). Devolva \
o nome como ela disse, a função dela se ela disser (o que faz, a empresa ou o cargo; senão ""), e o número da \
palavra em que o nome aparece. Se ninguém disser o nome, devolva null. Nunca invente um nome.
- destaques: os trechos com as frases mais fortes (uma ideia central, um número, uma conclusão, uma virada), \
para dar um zoom na imagem: mais ou menos um a cada 15 segundos de vídeo, no máximo 4. Cada um com o número \
da primeira palavra (de) e da última (ate), entre 1,5 e 6 segundos de fala, sem se sobrepor, em ordem.
- cta: se o vídeo pede uma ação (seguir, comentar, comprar, acessar um link, se inscrever), escreva uma \
chamada nova, curta e no imperativo, de 2 a 5 palavras, para mostrar no fim. Exemplos: "Siga para mais dicas", \
"Comente PLUGIN", "Link na bio", "Inscreva-se no canal". Não copie a frase da fala. Se não pede, null."""


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def _limpar(texto, maximo: int) -> str:
    """Sem aspas nem ponto no fim, e cortado em palavra inteira."""
    texto = " ".join(str(texto or "").replace('"', "").replace("“", "").replace("”", "").split()).strip(" .")
    if len(texto) > maximo:
        texto = texto[: maximo + 1].rsplit(" ", 1)[0]
    return texto.rstrip(" ,;:")


def transcricao_numerada(palavras: list[dict]) -> str:
    """Uma linha por frase (quebra em pontuação ou pausa de 0,6 s): '12.4s: [30]Hoje [31]vou [32]mostrar...'."""
    linhas, atual = [], []
    for i, p in enumerate(palavras[:MAXIMO_DE_PALAVRAS]):
        if atual and (p["inicio"] - palavras[i - 1]["fim"] >= 0.6 or re.search(r"[.!?]$", palavras[i - 1]["texto"])):
            linhas.append(atual)
            atual = []
        atual.append(i)
    if atual:
        linhas.append(atual)
    return "\n".join(f"{palavras[ids[0]]['inicio']:.1f}s: "
                     + " ".join(f"[{i}]{palavras[i]['texto'].strip()}" for i in ids) for ids in linhas)


def montar_mensagens(palavras: list[dict], duracao: float) -> list[dict]:
    corte = "" if len(palavras) <= MAXIMO_DE_PALAVRAS else f" (só as primeiras {MAXIMO_DE_PALAVRAS} palavras)"
    return [
        {"role": "system", "content": INSTRUCOES},
        {"role": "user",
         "content": f"Vídeo de {duracao:.0f} segundos. Transcrição{corte}:\n{transcricao_numerada(palavras)}"},
    ]


def conferir_plano(bruto: dict, palavras: list[dict]) -> dict:
    """O plano só com o que se sustenta na transcrição: índices dentro dela, trechos de tamanho razoável e
    sem sobreposição, e a apresentação só se o nome estiver de fato na fala perto da palavra apontada."""
    total = min(len(palavras), MAXIMO_DE_PALAVRAS)
    titulo = _limpar(bruto.get("titulo"), TITULO_MAXIMO)
    plano = {"titulo": titulo if len(titulo.split()) <= PALAVRAS_DO_TITULO else "", "apresentacao": None,
             "destaques": [], "cta": None}

    apresentacao = bruto.get("apresentacao")
    if isinstance(apresentacao, dict):
        nome = _limpar(apresentacao.get("nome"), NOME_MAXIMO)
        indice = apresentacao.get("palavra")
        if nome and isinstance(indice, int) and 0 <= indice < total:
            perto = {_sem_acento(re.sub(r"\W", "", palavras[i]["texto"]))
                     for i in range(max(0, indice - 4), min(total, indice + 6))}
            if _sem_acento(re.sub(r"\W", "", nome.split()[0])) in perto:
                plano["apresentacao"] = {"nome": nome, "funcao": _limpar(apresentacao.get("funcao"), FUNCAO_MAXIMA),
                                         "palavra": indice}

    fim_anterior = -1.0
    for destaque in sorted((d for d in bruto.get("destaques") or [] if isinstance(d, dict)),
                           key=lambda d: d.get("de") if isinstance(d.get("de"), int) else 0):
        de, ate = destaque.get("de"), destaque.get("ate")
        if not (isinstance(de, int) and isinstance(ate, int) and 0 <= de <= ate < total):
            continue
        inicio, fim = palavras[de]["inicio"], palavras[ate]["fim"]
        if fim - inicio < DESTAQUE_MINIMO_S or fim - inicio > DESTAQUE_MAXIMO_S or inicio < fim_anterior:
            continue
        plano["destaques"].append({"de": de, "ate": ate})
        fim_anterior = fim
        if len(plano["destaques"]) == MAXIMO_DE_DESTAQUES:
            break

    # Chamada comprida é a fala copiada, não uma chamada
    cta = _limpar(bruto.get("cta"), CTA_MAXIMO)
    plano["cta"] = cta if cta and len(cta.split()) <= PALAVRAS_DA_CTA else None
    return plano


def plano_simulado(palavras: list[dict]) -> dict:
    """Sem modelo (MODO_IA=simulado): um plano previsível, para testar o fluxo inteiro."""
    titulo = " ".join(p["texto"] for p in palavras[:4]) or "Meu vídeo"
    meio = len(palavras) // 2
    destaques = [{"de": meio, "ate": min(len(palavras) - 1, meio + 5)}] if palavras else []
    return conferir_plano({"titulo": titulo, "apresentacao": None, "destaques": destaques, "cta": "Siga para mais"},
                          palavras)
