# -----------------------------------------------
# TakeOne — animações em HTML (a biblioteca de efeitos), gravadas em vídeo pelo worker
# Funções puras: os modelos, a conferência dos campos e a página de cada animação.
#
# Cada modelo é um arquivo core/animacoes/<id>.html que traz os próprios dados num bloco
# <script type="application/json" id="modelo"> (nome, categoria, descrição, duração, motor e campos).
# Há dois motores, os dois sem relógio: "css" (animações CSS, que o worker pausa e avança quadro a quadro
# por document.getAnimations) e "canvas" (o modelo define window.renderAt(t), uma função pura do tempo,
# em Canvas 2D, SVG ou Three.js). Nada de GSAP: a licença dele proíbe editores visuais de animação.
#
# No HTML do modelo: {{campo}} é o texto escapado; {{campo:palavras}}, {{campo:linhas}} e {{campo:letras}}
# viram spans com --i (para entrar em sequência); {{base}} é a pasta dos arquivos comuns (comum.js, vendor/).
# A página ganha window.CAMPOS, window.QUADRO ({largura, altura, u}) e window.DURACAO.
#
# Temas (core/animacoes/temas/<tema>.json: igreja, casamento, podcast...) são versões prontas de um desenho:
# o mesmo HTML com outros textos, cores e duração. Cada versão vira um modelo "<tema>-<id>" na biblioteca,
# com a miniatura própria; o desenho continua um só.
# -----------------------------------------------
import html
import json
import re
from pathlib import Path

PASTA_MODELOS = Path(__file__).resolve().parent.parent / "animacoes"
PASTA_FONTES = Path(__file__).resolve().parent.parent / "fontes"
FPS = 30
DURACAO_MINIMA = 1.5
DURACAO_MAXIMA = 10.0

# Quadro de cada proporção do projeto, com o lado menor em 1080 (o render estica para 4K)
QUADROS = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "3:4": (1080, 1440),
    "21:9": (2520, 1080),
}

# Cores da marca (docs/marca/guia.md), o ponto de partida de todo modelo
COR_1 = "#ff624a"
COR_2 = "#ff3478"
BRANCO = "#ffffff"

CATEGORIAS = {
    "titulos": "Títulos",
    "tarjas": "Tarjas e nomes",
    "chamadas": "Chamadas",
    "numeros": "Números e gráficos",
    "listas": "Listas e passos",
    "citacoes": "Citações",
    "redes": "Redes sociais",
    "logos": "Logos e marca",
    "transicoes": "Vinhetas e transições",
    "fundos": "Fundos e partículas",
    "adesivos": "Adesivos",
}
MOTORES = {"css", "canvas"}
TIPOS = {"texto", "linhas", "cor", "numero"}
ARQUIVOS_COMUNS = re.compile(r"(comum\.js|vendor/[\w.-]+\.js)")

_COR = re.compile(r"#[0-9a-fA-F]{6}")
_CAMPO = re.compile(r"\{\{(\w+)(?::(palavras|linhas|letras))?\}\}")
_ID = re.compile(r"[a-z0-9_]+")
_DADOS = re.compile(r'<script type="application/json" id="modelo">(.*?)</script>\s*', re.S)


class ErroAnimacao(ValueError):
    """Campo inválido: a mensagem vai para a pessoa."""


def _carregar_desenhos() -> dict:
    """Lê os desenhos de core/animacoes. Um arquivo mal formado é erro de programação: falha alto."""
    modelos = {}
    for arquivo in sorted(PASTA_MODELOS.glob("*.html")):
        texto = arquivo.read_text(encoding="utf-8")
        achado = _DADOS.search(texto)
        if not achado:
            raise ValueError(f"{arquivo.name}: falta o bloco de dados do modelo")
        dados = json.loads(achado.group(1))
        for chave in ("nome", "categoria", "descricao", "duracao", "motor", "campos"):
            if chave not in dados:
                raise ValueError(f"{arquivo.name}: falta {chave}")
        if dados["categoria"] not in CATEGORIAS or dados["motor"] not in MOTORES:
            raise ValueError(f"{arquivo.name}: categoria ou motor desconhecido")
        campos = []
        for campo in dados["campos"]:
            if campo["tipo"] not in TIPOS:
                raise ValueError(f"{arquivo.name}: tipo de campo desconhecido em {campo['id']}")
            campos.append((campo["id"], campo["rotulo"], campo["tipo"], str(campo["padrao"]),
                           int(campo.get("maximo", 0))))
        modelos[arquivo.stem] = {
            "nome": dados["nome"], "categoria": dados["categoria"], "descricao": dados["descricao"],
            "duracao": float(dados["duracao"]), "motor": dados["motor"], "campos": campos,
            # Modelos que cobrem o quadro todo (fundos, vinhetas): a conferência das bordas não vale para eles
            "tela_cheia": bool(dados.get("tela_cheia", False)),
            "corpo": _DADOS.sub("", texto, count=1),
            "desenho": arquivo.stem, "temas": [],
        }
    return modelos


def _carregar_temas(desenhos: dict) -> tuple[dict, dict]:
    """Os temas e as versões de cada um. Devolve (id do tema → nome, id da versão → modelo)."""
    temas, versoes = {}, {}
    arquivos = sorted((PASTA_MODELOS / "temas").glob("*.json"),
                      key=lambda a: (json.loads(a.read_text(encoding="utf-8")).get("ordem", 99), a.stem))
    for arquivo in arquivos:
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        tema = arquivo.stem
        if not _ID.fullmatch(tema) or "nome" not in dados:
            raise ValueError(f"temas/{arquivo.name}: id ou nome do tema inválido")
        temas[tema] = dados["nome"]
        for versao in dados.get("versoes", []):
            desenho = desenhos.get(versao.get("modelo"))
            chave = f"{tema}-{versao.get('id', '')}"
            if desenho is None or not _ID.fullmatch(versao.get("id", "")) or "nome" not in versao:
                raise ValueError(f"temas/{arquivo.name}: versão {chave} sem nome ou com modelo desconhecido")
            if chave in versoes:
                raise ValueError(f"temas/{arquivo.name}: versão {chave} repetida")
            padroes = versao.get("padroes", {})
            ids = {c[0] for c in desenho["campos"]}
            if sobra := set(padroes) - ids:
                raise ValueError(f"temas/{arquivo.name}: {chave} muda campos que o modelo não tem: {sobra}")
            versoes[chave] = {
                **desenho, "nome": versao["nome"], "descricao": versao.get("descricao", desenho["descricao"]),
                "duracao": float(versao.get("duracao", desenho["duracao"])), "temas": [tema],
                "campos": [(c, r, t, str(padroes.get(c, p)), x) for c, r, t, p, x in desenho["campos"]],
            }
    return temas, versoes


def _carregar() -> tuple[dict, dict]:
    desenhos = _carregar_desenhos()
    temas, versoes = _carregar_temas(desenhos)
    return {**desenhos, **versoes}, temas


# id → modelo (os desenhos e as versões dos temas) e id → nome do tema, lidos uma vez, na importação
MODELOS, TEMAS = _carregar()
# Só os desenhos: o que o LLM escolhe no "Descreva a animação" (as versões mudam só os valores de partida)
DESENHOS = {chave: m for chave, m in MODELOS.items() if chave == m["desenho"]}


def lista_de_modelos() -> list[dict]:
    """Os modelos para o painel do editor, com os campos e os valores de partida, por categoria."""
    ordem = list(CATEGORIAS)
    return [{"id": chave, "nome": m["nome"], "descricao": m["descricao"], "duracao": m["duracao"],
             "categoria": m["categoria"], "nome_da_categoria": CATEGORIAS[m["categoria"]],
             "temas": [{"id": t, "nome": TEMAS[t]} for t in m["temas"]],
             "campos": [{"id": c, "rotulo": r, "tipo": t, "padrao": p, "maximo": x} for c, r, t, p, x in m["campos"]]}
            for chave, m in sorted(MODELOS.items(), key=lambda par: (ordem.index(par[1]["categoria"]), par[1]["nome"]))]


# A animação que o LLM escreveu ("Descreva a animação"): o CSS e o HTML já limpos, mais as cores
LIVRE = "livre"


def _conferir_livre(campos: dict) -> dict:
    from core.modelos.animacao_descrita import separar_resposta

    saida = {}
    for chave, padrao in (("cor_1", COR_1), ("cor_2", COR_2), ("cor_texto", BRANCO)):
        valor = str(campos.get(chave, padrao))
        if not _COR.fullmatch(valor):
            raise ErroAnimacao("Use cores no formato #rrggbb.")
        saida[chave] = valor.lower()
    # Limpa de novo: o que chega aqui pode ter vindo da API, não só do worker
    saida["css"], saida["html"] = separar_resposta({"css": campos.get("css"), "html": campos.get("html")})
    return saida


def aproveitar_campos(modelo: str, campos: dict) -> dict:
    """
    Os campos que o LLM preencheu ao escolher um modelo pronto, prontos para conferir_campos: o vazio sai
    (vale o padrão do modelo), o texto é cortado no máximo, o número fica só com os algarismos ("1.000")
    e a cor fora do formato sai. Antes, um "" num número ou uma legenda longa descartava o modelo pronto
    e a animação era escrita do zero, o caminho que o modelo de 8B acerta pouco.
    """
    saida = {}
    for chave, _rotulo, tipo, _padrao, maximo in MODELOS[modelo]["campos"]:
        valor = " ".join(str(campos.get(chave) or "").split()) if tipo != "linhas" else str(campos.get(chave) or "")
        valor = valor.strip()
        if not valor:
            continue
        if tipo == "numero":
            valor = re.sub(r"\D", "", valor)
            if not 1 <= len(valor) <= 7:
                continue
        elif tipo == "cor":
            if not _COR.fullmatch(valor):
                continue
        else:
            valor = valor[:maximo].rstrip()
        saida[chave] = valor
    return saida


def conferir_campos(modelo: str, campos: dict) -> dict:
    """Os campos do modelo, com o padrão no que faltar. Recusa cor, número ou texto fora do esperado."""
    if modelo == LIVRE:
        return _conferir_livre(campos)
    if modelo not in MODELOS:
        raise ErroAnimacao("Modelo de animação desconhecido.")
    saida = {}
    for chave, rotulo, tipo, padrao, maximo in MODELOS[modelo]["campos"]:
        valor = campos.get(chave, padrao)
        if not isinstance(valor, str):
            valor = str(valor)
        if tipo == "cor":
            if not _COR.fullmatch(valor):
                raise ErroAnimacao(f"{rotulo}: use uma cor no formato #rrggbb.")
            valor = valor.lower()
        elif tipo == "numero":
            if not re.fullmatch(r"\d{1,7}", valor.strip()):
                raise ErroAnimacao(f"{rotulo}: use um número inteiro de até 7 algarismos.")
            valor = str(int(valor))
        else:
            valor = valor.replace("\r", "").strip() if tipo == "linhas" else " ".join(valor.split())
            if len(valor) > maximo:
                raise ErroAnimacao(f"{rotulo}: no máximo {maximo} letras.")
        saida[chave] = valor
    return saida


def _spans(partes: list[str], classe: str) -> str:
    """Cada parte num span com o índice --i, para as animações em sequência."""
    return "".join(f'<span class="{classe}" style="--i:{i}">{html.escape(p) if p != " " else "&nbsp;"}</span>'
                   for i, p in enumerate(partes))


def _substituir(corpo: str, campos: dict, base: str) -> str:
    def valor(achado: re.Match) -> str:
        chave, forma = achado.group(1), achado.group(2)
        if chave == "base":
            return base
        texto = campos.get(chave, "")
        if forma == "palavras":
            return _spans(texto.split(), "palavra")
        if forma == "linhas":
            return _spans([linha.strip() for linha in texto.split("\n") if linha.strip()], "linha")
        if forma == "letras":
            return _spans(list(texto), "letra")
        return html.escape(texto)

    return _CAMPO.sub(valor, corpo)


def _json_no_script(dados) -> str:
    """JSON que pode ir dentro de <script> sem fechar a tag."""
    return json.dumps(dados, ensure_ascii=False).replace("<", "\\u003c")


def montar_html(modelo: str, campos: dict, duracao: float, proporcao: str, base_das_fontes: str,
                base_dos_arquivos: str = "") -> str:
    """A página da animação. base_das_fontes e base_dos_arquivos: onde estão core/fontes e os arquivos
    comuns de core/animacoes (o servidor local do worker, ou as rotas da API na prévia do navegador)."""
    campos = conferir_campos(modelo, campos)
    largura, altura = QUADROS[proporcao]
    if modelo == LIVRE:
        corpo = f"<style>\n{campos['css']}\n</style>\n{campos['html']}"
    else:
        corpo = _substituir(MODELOS[modelo]["corpo"], campos, base_dos_arquivos)
    u = min(largura, altura) / 100
    fontes = "\n".join(
        f"@font-face{{font-family:{familia};src:url('{base_das_fontes}/{arquivo}');font-weight:100 900}}"
        for familia, arquivo in (("Inter", "Inter%5Bopsz,wght%5D.ttf"), ("Montserrat", "Montserrat%5Bwght%5D.ttf"),
                                 ("Caveat", "Caveat%5Bwght%5D.ttf")))
    globais = (f"window.CAMPOS={_json_no_script(campos)};"
               f"window.QUADRO={{largura:{largura},altura:{altura},u:{u:.3f}}};window.DURACAO={duracao:.3f};")
    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
{fontes}
html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}
body{{width:{largura}px;height:{altura}px;position:relative;font-family:Inter,sans-serif;
  --dur:{duracao:.3f}s;--u:{u:.3f}px;
  --cor-1:{campos.get('cor_1', COR_1)};--cor-2:{campos.get('cor_2', COR_2)};
  --cor-texto:{campos.get('cor_texto', BRANCO)}}}
*{{box-sizing:border-box}}
</style>
<script>{globais}</script>
<script src="{base_dos_arquivos}/comum.js"></script>
<script type="importmap">{{"imports":{{"three":"{base_dos_arquivos}/vendor/three.module.js"}}}}</script>
</head><body>
{corpo}
</body></html>"""


def quadros_da_animacao(duracao: float) -> int:
    return max(1, round(duracao * FPS))
