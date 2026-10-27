# -----------------------------------------------
# TakeOne — o pedido de edição em palavras (o Clipar, ADR 0004, 14.10)
#
# A pessoa escreve como quer a edição ("legenda amarela e maior, zoom quando ele fala do câncer, sem título") e o
# Qwen3 local traduz o pedido num plano de um conjunto fechado de ações: as legendas (estilo, tamanho, cor,
# lugar, caixa alta, pôr ou tirar), a cor das palavras de ênfase, o título (pôr, tirar ou trocar o texto), os
# zooms (onde a fala diz certas palavras ou em frases apontadas), tirar as pausas, cortar frases, o formato, o
# enquadramento e o volume da música. O que ele não sabe fazer vai em "nao_deu", e a dúvida vira uma pergunta
# com opções (botões). O editor (ou a montagem dos cortes) é quem aplica: o plano só escolhe entre opções e
# aponta números de frases. Funções puras: montam e conferem, sem acessar o banco nem o modelo.
# -----------------------------------------------
import re
import unicodedata

ESTILOS_DE_LEGENDA = ("contorno", "caixa", "amarela", "destaque", "karaoke", "palavra")
CORES = {
    "branco": "#ffffff", "preto": "#000000", "amarelo": "#ffd60a", "vermelho": "#ff3b30", "verde": "#2ee6a6",
    "azul": "#2f80ff", "ciano": "#22d3ee", "rosa": "#ff3d77", "laranja": "#ff8a00", "roxo": "#9b5cff",
    "dourado": "#e6b422", "cinza": "#9aa0a6",
}
TAMANHOS = ("manter", "menor", "maior", "bem_maior")
POSICOES = ("manter", "baixo", "meio", "alto")
FORMATOS = ("manter", "9:16", "16:9", "1:1", "4:5")
ENQUADRAMENTOS = ("manter", "rosto", "centro", "inteiro")
MUSICA = ("manter", "abaixar", "aumentar", "tirar")
ACOES = ("manter", "por", "tirar")
SIM_NAO = ("manter", "sim", "nao")
MAXIMO_DE_FRASES = 160            # as frases de um corte (ou do vídeo, no editor) que vão ao modelo
MAXIMO_DE_LETRAS_DA_FRASE = 300
# As frases cabem no contexto de 8.192 do Qwen3 com as regras e a resposta: uns 3,5 caracteres por token em
# português, e as regras e o esquema levam uns 2 mil
LETRAS_DAS_FRASES = 14000
MAXIMO_DE_PALAVRAS_DE_ZOOM = 6
MAXIMO_DE_ZOOMS = 8
TEXTO_MAXIMO = 120
PEDIDO_MAXIMO = 500

_cores_da_lista = ["manter", "marca", *CORES]

# O modelo responde com a lista do que foi pedido, uma ação por item (o tipo, o valor e as frases); o que não foi
# pedido simplesmente não aparece. Com um formato de campos obrigatórios (um por parte do vídeo, com "manter"), o
# Qwen3 8B preenchia todos: "legendas amarelas" vinha também com outro tamanho, outro estilo, zooms e a música
# tirada. A conferência (`conferir_plano`) junta a lista no plano de campos que o editor aplica.
ACOES_DO_PEDIDO = {
    "legenda_cor": "a cor das letras das legendas (valor: a cor)",
    "legenda_tamanho": "o tamanho das legendas (valor: menor, maior ou bem_maior)",
    "legenda_estilo": "o estilo das legendas (valor: contorno, caixa, amarela, destaque, karaoke ou palavra)",
    "legenda_lugar": "onde ficam as legendas (valor: baixo, meio ou alto)",
    "legenda_caixa_alta": "legendas em letras maiúsculas (valor: sim) ou minúsculas (valor: nao)",
    "por_legendas": "pôr legendas num vídeo que não tem",
    "tirar_legendas": "tirar as legendas",
    "enfase_cor": "a cor das palavras fortes pintadas nas legendas (valor: a cor)",
    "tirar_enfase": "tirar as palavras pintadas das legendas",
    "trocar_titulo": "trocar o texto do título (valor: o título novo, de 3 a 9 palavras)",
    "por_titulo": "pôr um título na abertura (valor: o título, ou vazio)",
    "tirar_titulo": "tirar o título",
    "zoom_nas_palavras": "zoom quando a fala diz certas palavras (valor: as palavras, separadas por vírgula)",
    "zoom_nas_frases": "zoom em frases do vídeo (frases: os números delas)",
    "tirar_zooms": "tirar os zooms",
    "tirar_pausas": "tirar as pausas e as hesitações",
    "cortar_frases": "cortar frases do vídeo (frases: os números delas)",
    "formato": "o formato do vídeo (valor: 9:16, 16:9, 1:1 ou 4:5)",
    "enquadrar": "o enquadramento (valor: rosto, centro ou inteiro)",
    "musica": "a música (valor: abaixar, aumentar ou tirar)",
}

ESQUEMA = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string"},
        "acoes": {
            "type": "array",
            "maxItems": 12,
            "items": {
                "type": "object",
                "properties": {
                    "tipo": {"type": "string", "enum": list(ACOES_DO_PEDIDO)},
                    "valor": {"type": "string"},
                    "frases": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["tipo", "valor", "frases"],
            },
        },
        "pergunta": {
            "type": "object",
            "properties": {"texto": {"type": "string"}, "opcoes": {"type": "array", "items": {"type": "string"}}},
            "required": ["texto", "opcoes"],
        },
        "nao_deu": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["resumo", "acoes", "pergunta", "nao_deu"],
}

_LISTA_DE_ACOES = "\n".join(f"- {tipo}: {descricao}" for tipo, descricao in ACOES_DO_PEDIDO.items())

INSTRUCOES = f"""Você é o assistente de edição de um editor de vídeo. A pessoa escreve como quer a edição de um \
vídeo curto e você transforma o pedido numa lista de ações, uma para cada coisa pedida. Só entra na lista o que \
a pessoa pediu: "legendas amarelas" é uma ação só (legenda_cor com valor amarelo). Nunca acrescente o que não \
foi pedido.

As ações possíveis (tipo: o que faz):
{_LISTA_DE_ACOES}

As cores: branco, preto, amarelo, vermelho, verde, azul, ciano, rosa, laranja, roxo, dourado, cinza, ou marca \
(a cor do kit de marca). Em cada ação, valor é o que a ação pede (vazio quando não pede nada) e frases é a \
lista dos números das frases (vazia quando a ação não é sobre frases). Para "corta a parte em que ele fala de \
X", use cortar_frases com as frases que falam de X.

Também:
- resumo: uma frase dizendo o que vai ser feito.
- pergunta: só quando o pedido não dá para entender e a resposta muda o que fazer: a pergunta curta e de 2 a 4 \
opções. Sem dúvida, texto vazio e opções vazias.
- nao_deu: o que foi pedido e não está entre as ações (por exemplo, "trocar a voz", "pôr um meme"), em poucas \
palavras cada. Não invente ação: o que não está na lista vai para nao_deu.

Exemplos:
- "legendas amarelas": acoes [legenda_cor amarelo].
- "tira o título e as pausas": acoes [tirar_titulo, tirar_pausas].
- "legenda bem grande no meio": acoes [legenda_tamanho bem_maior, legenda_lugar meio].
- "põe um meme no final" ou "troca a voz por uma de robô": nada disso é uma ação, então acoes fica vazia e o \
pedido vai para nao_deu. Nunca troque um pedido que não dá para fazer por outras ações.
- "deixa mais bonito" (vago): acoes vazia e uma pergunta com opções, como "O que você quer mudar?" com \
"Legendas maiores e coloridas", "Um título na abertura" e "Zoom nas frases fortes"."""


def _limpar(texto, maximo: int) -> str:
    return " ".join(str(texto or "").split())[:maximo]


def frases_para_o_modelo(frases: list[dict]) -> str:
    """Uma frase por linha: [3] (00:12) texto. Para no limite de letras (as do fim ficam de fora)."""
    linhas, usadas = [], 0
    for frase in frases[:MAXIMO_DE_FRASES]:
        total = int(float(frase.get("inicio") or 0))
        relogio = f"{total // 60:02d}:{total % 60:02d}"
        linha = f"[{int(frase['n'])}] ({relogio}) {_limpar(frase.get('texto'), MAXIMO_DE_LETRAS_DA_FRASE)}"
        if usadas + len(linha) > LETRAS_DAS_FRASES:
            break
        linhas.append(linha)
        usadas += len(linha) + 1
    return "\n".join(linhas)


def montar_mensagens(pedido: str, frases: list[dict], estado: dict | None = None) -> list[dict]:
    """O pedido, o que o vídeo tem hoje (legendas, título, zooms, formato) e as frases numeradas, quando há."""
    partes = [f"Pedido da pessoa: {_limpar(pedido, PEDIDO_MAXIMO)}"]
    if estado:
        descricao = []
        if "formato" in estado:
            descricao.append(f"formato {estado['formato']}")
        descricao.append("com legendas" if estado.get("legendas") else "sem legendas")
        if estado.get("titulo"):
            descricao.append(f"com o título \"{_limpar(estado['titulo'], TEXTO_MAXIMO)}\"")
        else:
            descricao.append("sem título")
        descricao.append("com zooms" if estado.get("zooms") else "sem zooms")
        descricao.append("com música" if estado.get("musica") else "sem música")
        partes.append("O vídeo hoje: " + ", ".join(descricao) + ".")
    if frases:
        partes.append("As frases do vídeo:\n" + frases_para_o_modelo(frases))
    else:
        partes.append("O pedido vale para vários vídeos ainda não montados: não há frases (cortar_frases e as "
                      "frases do zoom ficam vazias; o zoom vai pelas palavras).")
    return [{"role": "system", "content": INSTRUCOES}, {"role": "user", "content": "\n\n".join(partes)}]


def _escolha(valor, opcoes, padrao: str = "manter") -> str:
    return valor if isinstance(valor, str) and valor in opcoes else padrao


def _numeros(valores, validos: set[int], maximo: int) -> list[int]:
    saida = []
    for valor in valores if isinstance(valores, list) else []:
        if isinstance(valor, bool):
            continue
        try:
            numero = int(valor)
        except (TypeError, ValueError):
            continue
        if numero in validos and numero not in saida:
            saida.append(numero)
    return sorted(saida[:maximo])


def _palavras(valores) -> list[str]:
    saida = []
    for valor in valores if isinstance(valores, list) else []:
        palavra = _limpar(valor, 40)
        if len(re.sub(r"\W", "", palavra)) >= 3 and palavra.lower() not in (p.lower() for p in saida):
            saida.append(palavra)
    return saida[:MAXIMO_DE_PALAVRAS_DE_ZOOM]


def plano_vazio() -> dict:
    return conferir_plano({}, [])


def _sem_acento(texto: str) -> str:
    base = unicodedata.normalize("NFD", str(texto or "").lower().strip())
    return "".join(letra for letra in base if unicodedata.category(letra) != "Mn")


def _cor(valor: str) -> str | None:
    texto = _sem_acento(valor)
    if "marca" in texto:
        return "marca"
    # "amarela" e "amarelo": sem a última letra
    return next((nome for nome in CORES if _sem_acento(nome)[:-1] in texto), None)


_SINONIMOS = {
    "tamanho": {"bem_maior": ("bem", "enorme", "gigante", "muito"), "maior": ("maior", "grande", "aument"),
                "menor": ("menor", "pequen", "diminu")},
    "estilo": {"karaoke": ("karaoke",), "palavra": ("palavra",), "caixa": ("caixa", "fundo"),
               "destaque": ("destaque",), "amarela": ("amarel",), "contorno": ("contorno", "simples")},
    "posicao": {"meio": ("meio", "centro"), "alto": ("alto", "cima", "topo"), "baixo": ("baixo", "embaixo", "rodape")},
    "caixa_alta": {"nao": ("nao", "minuscul"), "sim": ("sim", "maiuscul")},
    "formato": {"9:16": ("9:16", "pe", "vertical", "story", "reels", "short", "tiktok"),
                "16:9": ("16:9", "deitado", "horizontal", "youtube", "paisagem"), "1:1": ("1:1", "quadrad"),
                "4:5": ("4:5",)},
    "enquadrar": {"rosto": ("rosto", "cara", "pessoa", "quem fala"), "inteiro": ("inteir", "tudo", "sem cortar"),
                  "centro": ("centro", "meio")},
    "musica": {"tirar": ("tira", "sem", "remov"), "abaixar": ("abaix", "baix", "diminu"),
               "aumentar": ("aument", "alta", "alto", "subi")},
}


def _sinonimo(grupo: str, valor: str) -> str | None:
    texto = _sem_acento(valor)
    for opcao, pistas in _SINONIMOS[grupo].items():
        # As pistas curtas ("pe") só valem como palavra inteira
        if any((pista in texto.split()) if len(pista) <= 3 else (pista in texto) for pista in pistas):
            return opcao
    return None


def _bruto_das_acoes(bruto: dict) -> dict:
    """A lista de ações do modelo no plano de campos (o formato de antes, que a conferência normaliza)."""
    legenda: dict = {}
    saida: dict = {"resumo": bruto.get("resumo"), "pergunta": bruto.get("pergunta"),
                   "nao_deu": list(bruto.get("nao_deu") or []) if isinstance(bruto.get("nao_deu"), list) else [],
                   "legenda": legenda, "cortar_frases": []}
    zoom = {"acao": "manter", "palavras": [], "frases": []}
    for acao in bruto.get("acoes") or []:
        if not isinstance(acao, dict):
            continue
        tipo, valor = acao.get("tipo"), str(acao.get("valor") or "")
        frases = acao.get("frases") if isinstance(acao.get("frases"), list) else []
        if tipo == "legenda_cor" and _cor(valor):
            legenda["cor"] = _cor(valor)
        elif tipo == "legenda_tamanho" and _sinonimo("tamanho", valor):
            legenda["tamanho"] = _sinonimo("tamanho", valor)
        elif tipo == "legenda_estilo" and _sinonimo("estilo", valor):
            legenda["estilo"] = _sinonimo("estilo", valor)
        elif tipo == "legenda_lugar" and _sinonimo("posicao", valor):
            legenda["posicao"] = _sinonimo("posicao", valor)
        elif tipo == "legenda_caixa_alta" and _sinonimo("caixa_alta", valor or "sim"):
            legenda["caixa_alta"] = _sinonimo("caixa_alta", valor or "sim")
        elif tipo in ("por_legendas", "tirar_legendas"):
            legenda["acao"] = "por" if tipo == "por_legendas" else "tirar"
        elif tipo == "enfase_cor" and _cor(valor):
            saida["enfase"] = {"acao": "por", "cor": _cor(valor)}
        elif tipo == "tirar_enfase":
            saida["enfase"] = {"acao": "tirar", "cor": "manter"}
        elif tipo in ("trocar_titulo", "por_titulo", "tirar_titulo"):
            saida["titulo"] = {"acao": {"trocar_titulo": "trocar", "por_titulo": "por", "tirar_titulo": "tirar"}[tipo],
                               "texto": valor if tipo != "tirar_titulo" else ""}
        elif tipo == "zoom_nas_palavras":
            zoom["acao"] = "por"
            zoom["palavras"] += [palavra.strip() for palavra in re.split(r"[,;]", valor) if palavra.strip()]
        elif tipo == "zoom_nas_frases":
            zoom["acao"] = "por"
            zoom["frases"] += frases
        elif tipo == "tirar_zooms":
            zoom = {"acao": "tirar", "palavras": [], "frases": []}
        elif tipo == "tirar_pausas":
            saida["pausas"] = "tirar"
        elif tipo == "cortar_frases":
            saida["cortar_frases"] += frases or [int(numero) for numero in re.findall(r"\d+", valor)]
        elif tipo in ("formato", "enquadrar", "musica") and _sinonimo(tipo, valor):
            saida[tipo] = _sinonimo(tipo, valor)
    saida["zoom"] = zoom
    return saida


def conferir_plano(bruto: dict, frases: list[dict]) -> dict:
    """O plano só com opções que existem e frases que existem; o que vier fora disso vira "manter". Aceita a lista de
    ações do modelo (`acoes`) ou o plano de campos (o que o simulado e os testes montam)."""
    bruto = bruto if isinstance(bruto, dict) else {}
    if isinstance(bruto.get("acoes"), list):
        bruto = _bruto_das_acoes(bruto)
    validos = {int(frase["n"]) for frase in frases[:MAXIMO_DE_FRASES]}
    legenda = bruto.get("legenda") if isinstance(bruto.get("legenda"), dict) else {}
    enfase = bruto.get("enfase") if isinstance(bruto.get("enfase"), dict) else {}
    titulo = bruto.get("titulo") if isinstance(bruto.get("titulo"), dict) else {}
    zoom = bruto.get("zoom") if isinstance(bruto.get("zoom"), dict) else {}
    pergunta = bruto.get("pergunta") if isinstance(bruto.get("pergunta"), dict) else {}
    cores = set(_cores_da_lista)
    plano = {
        "resumo": _limpar(bruto.get("resumo"), 240),
        "legenda": {
            "acao": _escolha(legenda.get("acao"), (*ACOES, "mudar")),
            "estilo": _escolha(legenda.get("estilo"), ESTILOS_DE_LEGENDA),
            "tamanho": _escolha(legenda.get("tamanho"), TAMANHOS),
            "cor": _escolha(legenda.get("cor"), cores),
            "posicao": _escolha(legenda.get("posicao"), POSICOES),
            "caixa_alta": _escolha(legenda.get("caixa_alta"), SIM_NAO),
        },
        "enfase": {"acao": _escolha(enfase.get("acao"), ACOES), "cor": _escolha(enfase.get("cor"), cores)},
        "titulo": {"acao": _escolha(titulo.get("acao"), (*ACOES, "trocar")),
                   "texto": _limpar(titulo.get("texto"), TEXTO_MAXIMO)},
        "zoom": {"acao": _escolha(zoom.get("acao"), ACOES), "palavras": _palavras(zoom.get("palavras")),
                 "frases": _numeros(zoom.get("frases"), validos, MAXIMO_DE_ZOOMS)},
        "pausas": _escolha(bruto.get("pausas"), ("manter", "tirar")),
        "cortar_frases": _numeros(bruto.get("cortar_frases"), validos, MAXIMO_DE_FRASES),
        "formato": _escolha(bruto.get("formato"), FORMATOS),
        "enquadrar": _escolha(bruto.get("enquadrar"), ENQUADRAMENTOS),
        "musica": _escolha(bruto.get("musica"), MUSICA),
        "pergunta": {"texto": "", "opcoes": []},
        "nao_deu": [_limpar(item, 80) for item in (bruto.get("nao_deu") or [])[:6] if _limpar(item, 80)]
        if isinstance(bruto.get("nao_deu"), list) else [],
    }
    # Ajustar as legendas que existem com o estilo, o tamanho ou a cor é "mudar"; sem nada disso, não muda nada
    mudancas = [plano["legenda"][campo] != "manter" for campo in ("estilo", "tamanho", "cor", "posicao", "caixa_alta")]
    if plano["legenda"]["acao"] == "manter" and any(mudancas):
        plano["legenda"]["acao"] = "mudar"
    if plano["legenda"]["acao"] == "mudar" and not any(mudancas):
        plano["legenda"]["acao"] = "manter"
    # Zoom sem onde, e trocar o título sem texto, não fazem nada
    if plano["zoom"]["acao"] == "por" and not plano["zoom"]["palavras"] and not plano["zoom"]["frases"]:
        plano["zoom"]["acao"] = "manter"
        plano["nao_deu"].append("zoom sem dizer onde")
    if plano["titulo"]["acao"] == "trocar" and not plano["titulo"]["texto"]:
        plano["titulo"]["acao"] = "manter"
    if plano["enfase"]["acao"] == "manter" and plano["enfase"]["cor"] != "manter":
        plano["enfase"]["acao"] = "por"
    # Uma frase cortada não é também o lugar de um zoom
    plano["zoom"]["frases"] = [n for n in plano["zoom"]["frases"] if n not in plano["cortar_frases"]]
    texto_da_pergunta = _limpar(pergunta.get("texto"), 160)
    opcoes = [_limpar(opcao, 60) for opcao in (pergunta.get("opcoes") or [])[:4]] \
        if isinstance(pergunta.get("opcoes"), list) else []
    opcoes = [opcao for opcao in opcoes if opcao]
    if texto_da_pergunta and len(opcoes) >= 2:
        plano["pergunta"] = {"texto": texto_da_pergunta, "opcoes": opcoes}
    return plano


def cor_do_plano(nome: str) -> str | None:
    """O hex da cor do plano ("marca" e "manter" ficam para o editor, que conhece o kit)."""
    return CORES.get(nome)


def plano_simulado(pedido: str, frases: list[dict]) -> dict:
    """Sem o modelo (o modo simulado e o CI): palavras do pedido viram partes do plano, para testar o fluxo."""
    texto = pedido.lower()
    bruto: dict = {"resumo": "Plano de exemplo, sem o modelo.", "nao_deu": []}
    legenda: dict = {}
    for nome in CORES:
        # "amarela" e "amarelo": sem a última letra
        if nome[:-1] in texto:
            legenda["cor"] = nome
            break
    if "maior" in texto:
        legenda["tamanho"] = "maior"
    if "sem legenda" in texto:
        legenda["acao"] = "tirar"
    bruto["legenda"] = legenda
    if "sem título" in texto or "sem titulo" in texto:
        bruto["titulo"] = {"acao": "tirar", "texto": ""}
    if "pausa" in texto:
        bruto["pausas"] = "tirar"
    if "zoom" in texto and frases:
        bruto["zoom"] = {"acao": "por", "palavras": [], "frases": [frases[0]["n"]]}
    for formato in FORMATOS[1:]:
        if formato in texto:
            bruto["formato"] = formato
    if "música" in texto or "musica" in texto:
        bruto["musica"] = "abaixar"
    if "meme" in texto:
        bruto["nao_deu"] = ["pôr um meme"]
    return conferir_plano(bruto, frases)
