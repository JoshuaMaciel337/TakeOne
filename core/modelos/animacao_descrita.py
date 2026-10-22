# -----------------------------------------------
# TakeOne — "Descreva a animação" (experimental): o LLM local escreve a animação em HTML e CSS
# Funções puras: o pedido ao modelo e a limpeza do que ele devolve.
#
# O modelo recebe as regras do esqueleto (medidas em --u, cores em --cor-*, saída perto de --dur) e um
# modelo pronto de exemplo, e devolve {css, html}. Só passam tags de texto e de desenho (SVG), sem
# script, sem url(), sem @import e sem atributos de evento: a página é aberta no worker e no navegador.
# O que sobra vira o modelo "livre" de core/modelos/animacao_html.py e é gravado como os outros.
# -----------------------------------------------
import re
from html import escape
from html.parser import HTMLParser

from core.modelos.animacao_html import ErroAnimacao

DESCRICAO_MINIMA = 5
DESCRICAO_MAXIMA = 400
CSS_MAXIMO = 12000
HTML_MAXIMO = 6000

ESQUEMA = {
    "type": "object",
    "properties": {"css": {"type": "string"}, "html": {"type": "string"}},
    "required": ["css", "html"],
}

TAGS = {"div", "span", "p", "h1", "h2", "h3", "strong", "em", "b", "i", "br", "svg", "g", "path", "circle",
        "rect", "line", "polyline", "polygon", "ellipse"}
VAZIAS = {"br", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse"}
# Dentro do <svg> o HTML não fecha tag sozinho: a forma sem "/>" ficava aberta, a seguinte virava filha dela
# e não aparecia. O <br> é HTML e fica como está
FORMAS_DO_SVG = VAZIAS - {"br"}
ATRIBUTOS = {"class", "style", "viewbox", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
             "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
             "stroke-dasharray", "stroke-dashoffset", "transform", "opacity", "pathlength"}
# A barra invertida também: com os escapes do CSS, "u\rl(" e "@imp\6f rt" passavam pelos outros nomes
_DECLARACAO_PROIBIDA = re.compile(r"url\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding|\\", re.I)
_PROIBIDO_NO_CSS = re.compile(r"url\s*\(|@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding|</|<|\\",
                              re.I)


def _instrucoes() -> str:
    from core.modelos.animacao_html import MODELOS

    exemplos = "\n\n".join(MODELOS[nome]["corpo"] for nome in ("tarja", "contador"))
    return f"""Você cria animações curtas em HTML e CSS para pôr por cima de vídeos (motion graphics), \
como tarjas, títulos, números e chamadas. Responda só com o JSON {{"css": "...", "html": "..."}}.

Regras:
- O quadro é a página inteira (body), com fundo transparente: nada de fundo cobrindo a tela toda. Use \
position:absolute para posicionar.
- Medidas sempre em calc(var(--u)*N): 1 u é 1% do lado menor do quadro. Não use px, vw, vh nem %.
- Cores: var(--cor-1) e var(--cor-2) para o destaque (dá para fazer degradê entre elas) e var(--cor-texto) \
para o texto. Pode usar rgba() para sombras.
- Fontes: Inter (pesos 400 a 900) ou Montserrat.
- Movimento só com @keyframes e animation do CSS. Nada de JavaScript, <script>, imagens, url(), @import ou links.
- A animação dura var(--dur): os elementos entram no começo e saem no fim, com a saída começando em \
calc(var(--dur) - 0.5s). Pode haver movimento em laço no meio (animation-iteration-count: infinite).
- Tags permitidas: div, span, p, h1, h2, h3, strong, em, br e desenho em svg (path, circle, rect, line, \
polygon). Textos curtos, em português do Brasil.
- Seletores de classe sempre com ponto: .titulo {{...}}, nunca titulo {{...}}. Não estilize body nem html.
- Escreva os textos direto no HTML. Nada de {{{{campo}}}}: isso é dos exemplos, não existe aqui.
- Tudo tem que aparecer dentro do quadro e grande o bastante para ler num celular: textos de 6 a 14 u, \
no centro ou no terço de baixo.

Dois exemplos (o CSS fica dentro de <style> e o resto é o HTML):
{exemplos}"""


def esquema_da_escolha() -> dict:
    from core.modelos.animacao_html import DESENHOS

    return {
        "type": "object",
        "properties": {"modelo": {"type": "string", "enum": [*DESENHOS, "livre"]},
                       "campos": {"type": "object", "additionalProperties": {"type": "string"}}},
        "required": ["modelo", "campos"],
    }


def mensagens_da_escolha(descricao: str) -> list[dict]:
    """Primeiro passo: encaixar o pedido num modelo pronto (o que um modelo pequeno faz bem)."""
    from core.modelos.animacao_html import DESENHOS

    lista = "\n".join(
        f"- {chave}: {m['descricao']} Campos: "
        + ", ".join(f"{c} ({r.lower()})" for c, r, tipo, _p, _x in m["campos"] if tipo != "cor")
        for chave, m in DESENHOS.items())
    instrucoes = f"""Você escolhe a animação pronta que atende ao pedido e preenche os campos dela, em português \
do Brasil. Responda só com o JSON {{"modelo": "...", "campos": {{...}}}}.

Animações prontas:
{lista}

- Prefira sempre uma animação pronta quando o principal do pedido couber nela, mesmo que algum detalhe fique \
de fora: um número que sobe (com ou sem barra) é o contador; um nome com cargo é a tarja; uma frase de \
abertura é o título; um pedido de ação é a chamada.
- Use a escolhida e preencha os campos com os textos do pedido (curtos). Não copie a descrição do movimento \
para os campos: eles são só o que aparece escrito na tela. Prefixo e sufixo do contador são símbolos curtos \
(R$, +, %, mil); a legenda diz o que o número mede ("de desconto", "clientes"); o que o pedido não disser fica \
"". O campo valor \
é só o número inteiro, sem símbolos; o que vem antes ou depois dele vai em prefixo e sufixo.
- Se nenhuma atende (por exemplo, um desenho, uma seta, um ícone, várias coisas juntas), devolva \
"modelo": "livre" e "campos": {{}}."""
    return [{"role": "system", "content": instrucoes}, {"role": "user", "content": f"Pedido: {descricao}"}]


def montar_mensagens(descricao: str, duracao: float, proporcao: str) -> list[dict]:
    return [
        {"role": "system", "content": _instrucoes()},
        {"role": "user", "content": f"Duração: {duracao:g} s. Formato do vídeo: {proporcao}. Pedido: {descricao}"},
    ]


class _Limpador(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes: list[str] = []
        self.abertas: list[str] = []
        self.ignorando = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "iframe", "object", "embed", "template"):
            self.ignorando += 1
            return
        if self.ignorando or tag not in TAGS:
            return
        limpos = []
        for nome, valor in attrs:
            nome = nome.lower()
            if nome not in ATRIBUTOS or valor is None:
                continue
            if nome == "style" and _PROIBIDO_NO_CSS.search(valor):
                continue
            limpos.append(f'{nome}="{escape(valor, quote=True)}"')
        fim = "/>" if tag in FORMAS_DO_SVG else ">"
        self.partes.append(f"<{tag}{''.join(' ' + a for a in limpos)}{fim}")
        if tag not in VAZIAS:
            self.abertas.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag in TAGS and tag not in VAZIAS and self.abertas and self.abertas[-1] == tag and not self.ignorando:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in ("script", "style", "iframe", "object", "embed", "template"):
            self.ignorando = max(0, self.ignorando - 1)
            return
        if self.ignorando or tag not in self.abertas:
            return
        while self.abertas:
            aberta = self.abertas.pop()
            self.partes.append(f"</{aberta}>")
            if aberta == tag:
                break

    def handle_data(self, data):
        if not self.ignorando:
            self.partes.append(escape(data, quote=False))

    def resultado(self) -> str:
        return "".join(self.partes) + "".join(f"</{tag}>" for tag in reversed(self.abertas))


def limpar_html(html: str) -> str:
    limpador = _Limpador()
    limpador.feed(html)
    limpador.close()
    return limpador.resultado().strip()


def limpar_css(css: str) -> str:
    """Tira as regras com o que não pode (url, @import...), as @font-face (as fontes já vêm da página) e
    qualquer resto de tag."""
    css = re.sub(r"</?style[^>]*>", "", css, flags=re.I)
    css = re.sub(r"@font-face\s*\{[^}]*\}", "", css, flags=re.I)
    css = re.sub(r"@import[^;]*;?", "", css, flags=re.I)
    # Declaração a declaração: some só a que tem algo proibido. Separado nos ";", "{" e "}" (conta linear):
    # a expressão antiga voltava letra por letra e um CSS longo sem separadores prendia a API por segundos
    pedacos = re.split(r"([;{}])", css)
    css = "".join(pedaco for pedaco in pedacos if pedaco in ";{}" or not _DECLARACAO_PROIBIDA.search(pedaco))
    return css.replace("<", "").strip()


def _nos_seletores(css: str, trocar) -> str:
    """
    Aplica `trocar` só no texto dos seletores (antes do "{" de cada regra), nunca nas declarações nem no
    nome e nos passos de um @keyframes: com a troca no CSS inteiro, `animation: pulsar 1s` e
    `@keyframes pulsar` ganhavam o ponto quando a classe tinha o mesmo nome, e a animação sumia.
    """
    pedacos, pilha, inicio = [], [], 0
    for j, letra in enumerate(css):
        if letra == "{":
            preludio = css[inicio:j]
            if pilha and pilha[-1] != "grupo":
                tipo = "regra"
            elif preludio.strip().startswith("@"):
                tipo = "keyframes" if re.match(r"\s*@(-\w+-)?keyframes\b", preludio, re.I) else "grupo"
            else:
                tipo, preludio = "regra", trocar(preludio)
            pedacos += [preludio, "{"]
            pilha.append(tipo)
            inicio = j + 1
        elif letra == "}":
            pedacos += [css[inicio:j], "}"]
            if pilha:
                pilha.pop()
            inicio = j + 1
    pedacos.append(css[inicio:])
    return "".join(pedacos)


def corrigir_seletores(css: str, html: str) -> str:
    """O modelo pequeno às vezes esquece o ponto da classe ("titulo{...}" em vez de ".titulo{...}"): põe o
    ponto nas classes que o HTML usa e que não são nome de tag. Também tira as regras de body e html."""
    css = re.sub(r"(^|[}\s])(?:html|body)\s*\{[^}]*\}", r"\1", css)
    nomes = {nome for classe in re.findall(r'class="([^"]+)"', html) for nome in classe.split()
             if nome not in TAGS and re.fullmatch(r"[\w-]+", nome)}

    def trocar(seletor: str) -> str:
        for nome in nomes:
            seletor = re.sub(rf"(^|[,\s>+~]){re.escape(nome)}(?=\s*[,:.>+~\[\s]|\s*$)", rf"\1.{nome}", seletor)
        return seletor

    return _nos_seletores(css, trocar)


def separar_resposta(bruto: dict) -> tuple[str, str]:
    """(css, html) limpos. O modelo às vezes põe o <style> dentro do html: o CSS vai para o lugar certo."""
    css, html = str(bruto.get("css") or ""), str(bruto.get("html") or "")
    for bloco in re.findall(r"<style[^>]*>(.*?)</style>", html, flags=re.I | re.S):
        css += "\n" + bloco
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.I | re.S)
    css, html = limpar_css(css)[:CSS_MAXIMO], limpar_html(html)[:HTML_MAXIMO]
    css = corrigir_seletores(css, html)
    if "{{" in html:
        raise ErroAnimacao("O modelo deixou um campo sem preencher. Tente descrever de outro jeito.")
    if not html or not re.search(r"@keyframes", css):
        raise ErroAnimacao("O modelo não devolveu uma animação. Tente descrever de outro jeito.")
    return css, html


def resposta_simulada(descricao: str) -> dict:
    """Sem modelo (MODO_IA=simulado): uma animação simples com o texto pedido."""
    return {
        "css": ".caixa{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:var(--cor-texto);"
               "font-weight:800;font-size:calc(var(--u)*8);animation:entrar .6s both}"
               "@keyframes entrar{from{opacity:0;transform:translate(-50%,-30%)}}",
        "html": f'<div class="caixa">{escape(descricao[:40])}</div>',
    }
