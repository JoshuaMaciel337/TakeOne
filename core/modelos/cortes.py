# -----------------------------------------------
# TakeOne — achar os cortes de um vídeo longo (o Clipar, ADR 0004, 14.3)
#
# A fala vira frases (pela pontuação e pelas pausas), as frases vão ao LLM em janelas de 4 a 6 min (pela duração
# pedida) com sobra entre elas, numeradas e com o tempo, e o modelo só aponta frases: a primeira e a última do
# corte (e até 2 trechos a mais, não vizinhos), o título, as palavras de foco, o resumo, a categoria e as quatro
# notas com a frase de cada uma. Os números vêm primeiro e são obrigatórios, presos às frases da janela: com uma
# lista de trechos, o Qwen3 8B a deixava vazia em todos os cortes e escrevia só o título. O tempo sai da
# transcrição. A conferência descarta o que não se sustenta, a junção tira os repetidos (pelo tempo e pelo texto)
# e a nota final mistura o modelo com as medidas do vídeo.
# Funções puras: montam e conferem, sem acessar o banco nem o modelo.
# -----------------------------------------------
import re
import unicodedata

JANELA_SEGUNDOS = 360.0
SOBRA_SEGUNDOS = 60.0
# O Qwen3 8B lê a janela em ordem e para quando chega ao limite de cortes: numa de 6 min com 4 ou 6 cortes, o fim
# da janela ficava sem nenhum (no TEDx de teste, o melhor momento, aos 9 min). Por isso as janelas são menores e
# o pedido é dividir a janela inteira em momentos com nota (a nota escolhe os melhores depois), como o Cut.Pro faz
JANELA_MINIMA_SEGUNDOS = 240.0
PAUSA_DE_FRASE = 0.7          # uma pausa assim fecha a frase mesmo sem ponto
MAXIMO_DE_PALAVRAS_NA_FRASE = 40
MAXIMO_DE_TRECHOS = 3
MAXIMO_DE_CORTES_POR_JANELA = 8
TITULO_MINIMO_PALAVRAS = 2
TITULO_MAXIMO_PALAVRAS = 10
TITULO_MAXIMO = 80
RESUMO_MAXIMO = 240
MOTIVO_MAXIMO = 120
SOBREPOSICAO_MAXIMA = 0.5     # dois cortes que dividem mais que isso do menor são o mesmo corte
PARECENCA_MAXIMA = 0.55       # trigramas em comum: acima disso, é o mesmo conteúdo dito de novo
FOLGA_DA_FAIXA = 0.2          # a duração pode passar 20% para cada lado da faixa pedida

# As faixas de duração (em segundos) que a pessoa escolhe; "auto" deixa o modelo escolher
FAIXAS = {
    "auto": (20.0, 90.0),
    "curto": (15.0, 30.0),
    "medio": (30.0, 60.0),
    "longo": (60.0, 90.0),
    "extra": (90.0, 180.0),
    "muito_longo": (180.0, 300.0),
}
CATEGORIAS = {
    "historia": "História",
    "dica": "Dica",
    "opiniao": "Opinião forte",
    "revelacao": "Revelação",
    "humor": "Humor",
    "explicacao": "Explicação",
    "emocao": "Momento emocionante",
    "polemica": "Polêmica",
}
CRITERIOS = ("gancho", "fluxo", "valor", "autonomia")
# Palavras que, abrindo o corte, apontam para algo dito antes dele: o corte não se entende sozinho
REFERENCIAS_SOLTAS = {"isso", "isto", "esse", "essa", "este", "esta", "aquilo", "ele", "ela", "eles", "elas",
                      "também", "tambem", "aí", "ai", "daí", "dai", "então", "entao", "já", "ja", "porém", "porem",
                      "entretanto", "inclusive", "aliás", "alias"}
# Uma resposta solta ("Não, não tenho.", "Exato."): o corte começa respondendo a uma pergunta que ficou de fora
RESPOSTAS_SOLTAS = {"não", "nao", "sim", "exato", "exatamente", "verdade", "claro", "certo", "isso"}
PROPAGANDA = re.compile(r"\b(link na (descrição|bio)|cupom|desconto de \d+|patrocin|use o código|"
                        r"comenta (a palavra|aqui)|inscreva-se|ative o sininho|deixa (o|seu) like)\b", re.IGNORECASE)

def esquema_da_janela(primeira: int | None = None, ultima: int | None = None) -> dict:
    """O formato da resposta, com os números presos às frases da janela (de primeira a ultima)."""
    numero: dict = {"type": "integer"}
    if primeira is not None and ultima is not None:
        numero = {"type": "integer", "minimum": primeira, "maximum": ultima}
    return {
        "type": "object",
        "properties": {
            "cortes": {
                "type": "array",
                "maxItems": MAXIMO_DE_CORTES_POR_JANELA,
                "items": {
                    "type": "object",
                    "properties": {
                        "de": numero,
                        "ate": numero,
                        "mais": {
                            "type": "array",
                            "maxItems": MAXIMO_DE_TRECHOS - 1,
                            "items": {"type": "object", "required": ["de", "ate"],
                                      "properties": {"de": numero, "ate": numero}},
                        },
                        "titulo": {"type": "string"},
                        "foco": {"type": "array", "items": {"type": "string"}},
                        "resumo": {"type": "string"},
                        "categoria": {"type": "string", "enum": list(CATEGORIAS)},
                        "notas": {"type": "object", "properties": {c: {"type": "number"} for c in CRITERIOS},
                                  "required": list(CRITERIOS)},
                        "motivos": {"type": "object", "properties": {c: {"type": "string"} for c in CRITERIOS},
                                    "required": list(CRITERIOS)},
                    },
                    "required": ["de", "ate", "mais", "titulo", "foco", "resumo", "categoria", "notas", "motivos"],
                },
            },
        },
        "required": ["cortes"],
    }


ESQUEMA = esquema_da_janela()


def sem_acento(texto: str) -> str:
    base = unicodedata.normalize("NFD", (texto or "").lower())
    return "".join(letra for letra in base if unicodedata.category(letra) != "Mn")


def _token(texto: str) -> str:
    return re.sub(r"[^a-z0-9]", "", sem_acento(texto))


# -----------------------------------------------
# Frases e janelas
# -----------------------------------------------
def frases_da_fala(palavras: list[dict]) -> list[dict]:
    """
    As palavras (texto, inicio, fim, em segundos da mídia) viram frases: fecha no ponto, na interrogação, na
    exclamação, numa pausa de PAUSA_DE_FRASE ou com MAXIMO_DE_PALAVRAS_NA_FRASE. Cada frase guarda o número
    da primeira e da última palavra (de, ate), o tempo e o texto.
    """
    frases: list[dict] = []
    comeco = 0
    for i, palavra in enumerate(palavras):
        proxima = palavras[i + 1] if i + 1 < len(palavras) else None
        fecha = (proxima is None or re.search(r"[.!?…]['\"”)]*$", palavra["texto"])
                 or proxima["inicio"] - palavra["fim"] >= PAUSA_DE_FRASE
                 or i - comeco + 1 >= MAXIMO_DE_PALAVRAS_NA_FRASE)
        if fecha:
            grupo = palavras[comeco:i + 1]
            frases.append({"n": len(frases), "de": comeco, "ate": i, "inicio": float(grupo[0]["inicio"]),
                           "fim": float(grupo[-1]["fim"]), "texto": " ".join(p["texto"].strip() for p in grupo)})
            comeco = i + 1
    return frases


def tamanho_da_janela(faixa: str) -> tuple[float, float]:
    """A janela e a sobra para a faixa de duração: a janela tem 3 cortes do maior (de 4 a 6 min) e a sobra, um corte
    inteiro (até metade da janela), para todo corte caber inteiro em alguma janela."""
    _, maximo = FAIXAS.get(faixa, FAIXAS["auto"])
    janela = min(JANELA_SEGUNDOS, max(JANELA_MINIMA_SEGUNDOS, 3 * maximo))
    return janela, min(maximo, janela / 2)


def janelas_de_frases(frases: list[dict], segundos: float = JANELA_SEGUNDOS,
                      sobra: float = SOBRA_SEGUNDOS) -> list[list[dict]]:
    """Pedaços da fala para o modelo caber no contexto, com sobra entre um e outro. A fala não é resumida."""
    if not frases:
        return []
    grupos, inicio, fim_total = [], frases[0]["inicio"], frases[-1]["fim"]
    passo = max(segundos - sobra, 30.0)
    while True:
        fim = inicio + segundos
        grupo = [frase for frase in frases if frase["inicio"] < fim and frase["fim"] > inicio]
        if grupo:
            grupos.append(grupo)
        if fim >= fim_total:
            return grupos
        inicio += passo


def _relogio(segundos: float) -> str:
    total = int(segundos)
    return f"{total // 60:02d}:{total % 60:02d}"


def texto_para_o_modelo(frases: list[dict]) -> str:
    """Uma frase por linha, com o número e o tempo: [12] (03:21) texto."""
    return "\n".join(f"[{frase['n']}] ({_relogio(frase['inicio'])}) {frase['texto']}" for frase in frases)


# -----------------------------------------------
# O pedido
# -----------------------------------------------
INSTRUCOES = """Você escolhe cortes de um vídeo longo para Reels, Shorts e TikTok. Você recebe um pedaço da \
transcrição: uma frase por linha, com o número entre colchetes e o tempo entre parênteses.

Cada corte é um momento que se entende sozinho, sem o resto do vídeo: começa na frase que arma a ideia (nunca \
numa saudação, numa introdução ou numa frase que responde a algo dito antes) e termina logo depois do desfecho \
ou da conclusão, sem pular para o assunto seguinte.

Para cada corte:
- de e ate: o número da primeira e o da última frase do corte. Some o tempo: o corte inteiro precisa ter a \
duração pedida, então ele quase sempre junta várias frases seguidas (uma frase sozinha dura poucos segundos).
- mais: quase sempre vazio; só quando a mesma ideia volta mais adiante, até 2 trechos a mais (de e ate de cada um).
- titulo: de 4 a 9 palavras que dão vontade de assistir, em português natural, fiéis ao que é dito (sem \
prometer o que o corte não mostra), sem emoji, sem hashtag e sem caixa alta. Conte a ideia ou a pergunta, não \
descreva a pessoa: "O hábito de dois minutos que muda o seu dia", "Por que a força de vontade não basta", \
"Ele perdeu tudo e recomeçou com dez reais"; nunca "Fulano fala sobre hábitos" nem "Fulano usou progresso".
- foco: 1 ou 2 palavras do título que merecem destaque.
- resumo: uma frase dizendo do que o corte fala.
- categoria: uma da lista.
- notas de 0 a 10: gancho (os primeiros segundos prendem?), fluxo (começa e termina no lugar certo, sem cortar \
a ideia?), valor (ensina, emociona ou diverte?), autonomia (quem não viu o vídeo entende?). Seja exigente e \
use a escala toda: 10 é raro (o melhor momento do vídeo inteiro), um bom corte fica entre 6 e 8, e os cortes \
de um mesmo pedaço quase nunca têm as mesmas notas.
- motivos: até 12 palavras para cada nota.

Divida o pedaço inteiro em momentos, um depois do outro, do começo ao fim (até 8): o último deve chegar perto \
da última linha. Dê a cada um a nota que ele merece, mesmo baixa; quem escolhe os melhores é a nota. Pule só \
o que não se sustenta sozinho (agradecimentos, transições). Não repita um momento com outras palavras."""


def montar_mensagens(janela: list[dict], faixa: str, estrategia: str = "", momentos: str = "",
                     genero: str = "", gosto: str = "") -> list[dict]:
    """O pedido de uma janela. A estratégia, o gênero e os momentos pedidos vêm da página de opções; o gosto, dos
    cortes avaliados no espaço (core/modelos/gosto.py)."""
    minimo, maximo = FAIXAS.get(faixa, FAIXAS["auto"])
    extras = [f"Duração de cada corte: de {minimo:.0f} a {maximo:.0f} segundos (some os trechos)."]
    if genero:
        extras.append(f"O vídeo é do tipo: {genero[:60]}.")
    if estrategia:
        extras.append(f"O que buscar e o estilo do título, nas palavras de quem pediu: {estrategia[:500]}")
    if momentos:
        extras.append(f"Prefira estes momentos, se aparecerem: {momentos[:300]}")
    if gosto:
        extras.append(gosto)
    return [
        {"role": "system", "content": INSTRUCOES + "\n\n" + "\n".join(extras)},
        {"role": "user", "content": texto_para_o_modelo(janela)},
    ]


# -----------------------------------------------
# Conferência
# -----------------------------------------------
def _limpar(texto, maximo: int) -> str:
    sem_emoji = "".join(letra for letra in str(texto or "")
                        if unicodedata.category(letra)[0] in "LNPZ" or letra in "$%&")
    return " ".join(sem_emoji.replace("#", " ").split())[:maximo].strip(" ,;:-")


def _nota(valor) -> float | None:
    try:
        nota = float(valor)
    except (TypeError, ValueError):
        return None
    return min(10.0, max(0.0, nota)) if nota == nota else None


def _titulo(bruto) -> str | None:
    titulo = _limpar(bruto, TITULO_MAXIMO)
    palavras = titulo.split()
    if not TITULO_MINIMO_PALAVRAS <= len(palavras) <= TITULO_MAXIMO_PALAVRAS:
        return None
    # Caixa alta inteira vira frase comum (a legenda e o título escolhem o jeito de mostrar)
    if titulo.isupper() and len(titulo) > 4:
        titulo = titulo.capitalize()
    return titulo


def _trechos(brutos, numeros: set[int]) -> list[tuple[int, int]] | None:
    if not isinstance(brutos, list) or not brutos:
        return None
    trechos = []
    for item in brutos[:MAXIMO_DE_TRECHOS]:
        if not isinstance(item, dict):
            return None
        try:
            de, ate = int(item["de"]), int(item["ate"])
        except (KeyError, TypeError, ValueError):
            return None
        if de > ate:
            de, ate = ate, de
        if de not in numeros or ate not in numeros:
            return None
        trechos.append((de, ate))
    trechos.sort()
    juntos: list[tuple[int, int]] = []
    for de, ate in trechos:
        if juntos and de <= juntos[-1][1] + 1:
            juntos[-1] = (juntos[-1][0], max(juntos[-1][1], ate))
        else:
            juntos.append((de, ate))
    return juntos


def _estender_ate_o_minimo(trechos: list[tuple[int, int]], por_numero: dict[int, dict], minimo: float,
                           maximo: float) -> list[tuple[int, int]]:
    """
    O corte curto demais ganha as frases seguintes ao último trecho até chegar à duração mínima, sem passar da
    máxima: o modelo de 8B aponta a frase que arma a ideia e para cedo (no TEDx de teste, 13 s num pedido de
    30 a 60). Sem frase seguinte que caiba, fica como está (e a conferência descarta).
    """
    def duracao(lista):
        return sum(por_numero[ate]["fim"] - por_numero[de]["inicio"] for de, ate in lista)

    estendidos = list(trechos)
    while duracao(estendidos) < minimo:
        de, ate = estendidos[-1]
        seguinte = por_numero.get(ate + 1)
        if seguinte is None:
            break
        candidato = [*estendidos[:-1], (de, ate + 1)]
        if duracao(candidato) > maximo:
            break
        estendidos = candidato
    return estendidos


def conferir_cortes(bruto: dict, frases: list[dict], faixa: str) -> list[dict]:
    """Os cortes de uma janela que se sustentam, com o tempo saído da transcrição e o que foi descartado de fora."""
    por_numero = {frase["n"]: frase for frase in frases}
    minimo, maximo = FAIXAS.get(faixa, FAIXAS["auto"])
    cortes = []
    for item in (bruto or {}).get("cortes") or []:
        if not isinstance(item, dict):
            continue
        # A resposta de hoje: "de" e "ate" do corte e "mais"; "trechos" é a lista de antes
        brutos = item.get("trechos")
        if brutos is None and "de" in item and "ate" in item:
            brutos = [{"de": item["de"], "ate": item["ate"]}, *(item.get("mais") or [])]
        trechos = _trechos(brutos, set(por_numero))
        titulo = _titulo(item.get("titulo"))
        notas = {criterio: _nota((item.get("notas") or {}).get(criterio)) for criterio in CRITERIOS}
        if not trechos or not titulo or any(nota is None for nota in notas.values()):
            continue
        trechos = _estender_ate_o_minimo(trechos, por_numero, minimo, maximo)
        tempos = [(por_numero[de]["inicio"], por_numero[ate]["fim"]) for de, ate in trechos]
        duracao = sum(fim - inicio for inicio, fim in tempos)
        if not minimo * (1 - FOLGA_DA_FAIXA) <= duracao <= maximo * (1 + FOLGA_DA_FAIXA):
            continue
        texto = " ".join(por_numero[n]["texto"] for de, ate in trechos for n in range(de, ate + 1) if n in por_numero)
        foco = [_limpar(palavra, 30) for palavra in (item.get("foco") or [])[:2]]
        foco = [palavra for palavra in foco if palavra and _token(palavra) in _token(titulo)]
        primeira = _token(texto.split()[0]) if texto.split() else ""
        motivos = {criterio: _limpar((item.get("motivos") or {}).get(criterio), MOTIVO_MAXIMO)
                   for criterio in CRITERIOS}
        resposta = bool(re.match(r"^\S+?[,.!]", texto)) and primeira in {_token(p) for p in RESPOSTAS_SOLTAS}
        if resposta:
            notas["fluxo"] = min(notas["fluxo"], 5.0)
            notas["autonomia"] = min(notas["autonomia"], 5.0)
            motivos["autonomia"] = f"Começa respondendo (\"{texto.split()[0]}\") a algo que ficou fora do corte."
        elif primeira in {_token(palavra) for palavra in REFERENCIAS_SOLTAS}:
            # Começa apontando para trás: o fluxo e a autonomia caem, e o motivo diz por quê
            notas["fluxo"] = min(notas["fluxo"], 5.0)
            notas["autonomia"] = min(notas["autonomia"], 5.0)
            motivos["autonomia"] = f"Começa por \"{texto.split()[0]}\", que aponta para algo dito antes."
        cortes.append({
            "trechos": [{"inicio": round(inicio, 3), "fim": round(fim, 3)} for inicio, fim in tempos],
            "frases": [{"de": de, "ate": ate} for de, ate in trechos],
            "duracao": round(duracao, 3),
            "titulo": titulo,
            "foco": foco,
            "resumo": _limpar(item.get("resumo"), RESUMO_MAXIMO),
            "categoria": item.get("categoria") if item.get("categoria") in CATEGORIAS else "explicacao",
            "notas": notas,
            "motivos": motivos,
            "texto": texto,
            "propaganda": bool(PROPAGANDA.search(texto)),
        })
    return cortes[:MAXIMO_DE_CORTES_POR_JANELA]


# -----------------------------------------------
# Nota, junção e ordem
# -----------------------------------------------
def nota_final(notas: dict, medidas: dict | None = None) -> int:
    """
    0 a 100: as quatro notas do modelo (gancho pesa mais, como nos clipadores) e as medidas do vídeo, quando há
    (ritmo da fala, rosto à vista, nitidez e firmeza, cada uma de 0 a 1). Propaganda perde pontos fora daqui.
    """
    modelo = (1.4 * notas["gancho"] + notas["fluxo"] + notas["valor"] + 0.8 * notas["autonomia"]) / 4.2 / 10
    if medidas:
        valores = [float(valor) for valor in medidas.values() if valor is not None]
        if valores:
            return round(100 * (0.8 * modelo + 0.2 * sum(valores) / len(valores)))
    return round(100 * modelo)


def _trigramas(texto: str) -> set[tuple[str, ...]]:
    tokens = [token for token in (_token(palavra) for palavra in texto.split()) if token]
    return {tuple(tokens[i:i + 3]) for i in range(len(tokens) - 2)}


def parecenca(a: str, b: str) -> float:
    """Quanto dois textos dizem o mesmo: os trigramas em comum sobre os do menor."""
    ta, tb = _trigramas(a), _trigramas(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def _sobreposicao(a: dict, b: dict) -> float:
    comum = sum(max(0.0, min(x["fim"], y["fim"]) - max(x["inicio"], y["inicio"]))
                for x in a["trechos"] for y in b["trechos"])
    return comum / max(1e-6, min(a["duracao"], b["duracao"]))


def juntar_cortes(cortes: list[dict], maximo: int) -> list[dict]:
    """
    Do melhor para o pior: fica o corte que não repete um que já ficou (no tempo, como as janelas que se
    sobrepõem, ou no texto, o mesmo conteúdo dito de novo em outro lugar do vídeo). Cada um ganha um id.
    """
    ordenados = sorted(cortes, key=lambda corte: (corte["nota"], -corte["trechos"][0]["inicio"]), reverse=True)
    ficam: list[dict] = []
    for corte in ordenados:
        if any(_sobreposicao(corte, outro) > SOBREPOSICAO_MAXIMA for outro in ficam):
            continue
        if any(parecenca(corte["texto"], outro["texto"]) > PARECENCA_MAXIMA for outro in ficam):
            continue
        ficam.append(corte)
        if len(ficam) == maximo:
            break
    for i, corte in enumerate(ficam):
        corte["id"] = f"c{i + 1:02d}"
    return ficam


def maximo_de_cortes(duracao: float, pedido: int | None = None) -> int:
    """Quantos cortes no máximo: o pedido, ou uns 2 por minuto de vídeo, de 3 a 30."""
    if pedido:
        return max(1, min(50, int(pedido)))
    return max(3, min(30, round(duracao / 60 * 2)))


# -----------------------------------------------
# A lista de cortes (14.4): os parecidos, a cópia e a parte 2
# -----------------------------------------------
PARECIDO_NO_TEMPO = 0.25        # abaixo da junção (0,5): dividem um pedaço do tempo, mas ficaram os dois
PARECIDO_NO_TEXTO = 0.3         # abaixo da junção (0,55): dizem parte do mesmo
PARTE_MINIMA_SEGUNDOS = 5.0     # menos fala que isso depois do corte não é uma parte 2
MAXIMO_DE_CORTES_NA_LISTA = 100


def parecidos(cortes: list[dict]) -> dict[str, list[str]]:
    """Para cada corte, os outros que dividem um pedaço do tempo ou do texto com ele (o aviso da lista). A cópia
    feita pela pessoa não conta: ela é o mesmo corte de propósito."""
    resultado: dict[str, list[str]] = {}
    for a in cortes:
        resultado[a["id"]] = [
            b["id"] for b in cortes
            if b is not a and b.get("copia_de") != a["id"] and a.get("copia_de") != b["id"]
            and (_sobreposicao(a, b) > PARECIDO_NO_TEMPO
                 or parecenca(a.get("texto") or "", b.get("texto") or "") > PARECIDO_NO_TEXTO)
        ]
    return resultado


def proximo_id(cortes: list[dict]) -> str:
    """O id seguinte ("c13"), depois do maior que já existe."""
    numeros = [int(corte["id"][1:]) for corte in cortes if re.fullmatch(r"c\d+", str(corte.get("id") or ""))]
    return f"c{max(numeros, default=0) + 1:02d}"


def copia_do_corte(corte: dict, cortes: list[dict]) -> dict:
    """A cópia, para montar o mesmo corte com outra edição: sem o projeto, a avaliação, a capa e a saída."""
    titulo = _limpar(f"{corte['titulo']} (cópia)", TITULO_MAXIMO)
    return {**corte, "id": proximo_id(cortes), "titulo": titulo, "copia_de": corte["id"], "projeto_id": None,
            "avaliacao": None, "capa": None, "saida": None}


def _titulo_da_parte(titulo: str) -> str:
    achado = re.search(r"\s*\(parte (\d+)\)$", titulo)
    base, numero = (titulo[:achado.start()], int(achado.group(1)) + 1) if achado else (titulo, 2)
    sufixo = f" (parte {numero})"
    return base[:TITULO_MAXIMO - len(sufixo)].rstrip() + sufixo


def continuacao(corte: dict, palavras: list[dict], faixa: str, cortes: list[dict]) -> dict | None:
    """
    A parte 2: as frases logo depois do fim do corte, até a duração dele (dentro da faixa pedida), fechando numa
    frase. Sem o modelo, então sem notas: a lista mostra que ela continua o outro. None quando a fala acaba ali.
    """
    fim = corte["trechos"][-1]["fim"]
    frases = [frase for frase in frases_da_fala(palavras) if frase["inicio"] >= fim - 0.05]
    if not frases:
        return None
    minimo, maximo = FAIXAS.get(faixa, FAIXAS["auto"])
    alvo = max(minimo, min(float(corte["duracao"]), maximo))
    escolhidas: list[dict] = []
    for frase in frases:
        if escolhidas and frase["fim"] - escolhidas[0]["inicio"] > maximo * (1 + FOLGA_DA_FAIXA):
            break
        escolhidas.append(frase)
        if frase["fim"] - escolhidas[0]["inicio"] >= alvo:
            break
    inicio, fim_da_parte = escolhidas[0]["inicio"], escolhidas[-1]["fim"]
    if fim_da_parte - inicio < PARTE_MINIMA_SEGUNDOS:
        return None
    texto = " ".join(frase["texto"] for frase in escolhidas)
    parte = {
        "id": proximo_id(cortes),
        "trechos": [{"inicio": round(inicio, 3), "fim": round(fim_da_parte, 3)}],
        "duracao": round(fim_da_parte - inicio, 3),
        "titulo": _titulo_da_parte(corte["titulo"]),
        "foco": [],
        "resumo": "",
        "categoria": corte.get("categoria") or "explicacao",
        "notas": None,
        "motivos": None,
        "nota": None,
        "texto": texto,
        "propaganda": bool(PROPAGANDA.search(texto)),
        "enfase": [],
        "parte_de": corte["id"],
        "avaliacao": None,
        "projeto_id": None,
    }
    return parte
