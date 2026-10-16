# -----------------------------------------------
# TakeOne — animações em HTML (tarjas, títulos, CTA, contador...), gravadas em vídeo pelo worker
# Funções puras: os modelos, a conferência dos campos e a página de cada animação.
#
# Cada modelo é um HTML com CSS (core/animacoes/<id>.html) animado só por CSS, sem GSAP (a licença dele
# proíbe editores visuais de animação). O tempo é o das animações CSS: o worker pausa todas e avança
# document.getAnimations() quadro a quadro, então a mesma página dá sempre os mesmos quadros.
# -----------------------------------------------
import html
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

# Campo: (id, rótulo, tipo, padrão, tamanho máximo). Tipos: texto, linhas (aceita quebra), cor, numero.
MODELOS = {
    "tarja": {
        "nome": "Tarja com nome",
        "descricao": "Nome e função na parte de baixo, entrando pela esquerda.",
        "duracao": 4.0,
        "campos": [
            ("nome", "Nome", "texto", "Ana Souza", 40),
            ("funcao", "Função", "texto", "Fundadora", 60),
            ("cor_1", "Cor da barra (início)", "cor", COR_1, 0),
            ("cor_2", "Cor da barra (fim)", "cor", COR_2, 0),
            ("cor_texto", "Cor do texto", "cor", BRANCO, 0),
        ],
    },
    "titulo": {
        "nome": "Título cinético",
        "descricao": "As palavras entram uma a uma, no centro; a última em destaque.",
        "duracao": 3.0,
        "campos": [
            ("texto", "Título", "texto", "Edite melhor. Conte mais.", 60),
            ("cor_texto", "Cor do texto", "cor", BRANCO, 0),
            ("cor_1", "Destaque (início)", "cor", COR_1, 0),
            ("cor_2", "Destaque (fim)", "cor", COR_2, 0),
        ],
    },
    "revelacao": {
        "nome": "Revelação de nome",
        "descricao": "Um bloco de cor atravessa e revela o nome, com uma linha embaixo.",
        "duracao": 3.5,
        "campos": [
            ("texto", "Nome", "texto", "TakeOne", 30),
            ("subtitulo", "Linha de baixo", "texto", "Edite melhor. Conte mais.", 60),
            ("cor_1", "Cor do bloco (início)", "cor", COR_1, 0),
            ("cor_2", "Cor do bloco (fim)", "cor", COR_2, 0),
            ("cor_texto", "Cor do texto", "cor", BRANCO, 0),
        ],
    },
    "cta": {
        "nome": "Chamada (CTA)",
        "descricao": "Um botão com seta que salta, embaixo no centro.",
        "duracao": 4.0,
        "campos": [
            ("texto", "Texto", "texto", "Compre pelo link na bio", 40),
            ("cor_1", "Cor (início)", "cor", COR_1, 0),
            ("cor_2", "Cor (fim)", "cor", COR_2, 0),
            ("cor_texto", "Cor do texto", "cor", BRANCO, 0),
        ],
    },
    "contador": {
        "nome": "Número que conta",
        "descricao": "Um número que sobe de zero até o valor, com uma legenda.",
        "duracao": 3.0,
        "campos": [
            ("valor", "Valor final", "numero", "250", 0),
            ("prefixo", "Antes do número", "texto", "+", 6),
            ("sufixo", "Depois do número", "texto", "mil", 10),
            ("legenda", "Legenda", "texto", "pessoas alcançadas", 50),
            ("cor_1", "Cor (início)", "cor", COR_1, 0),
            ("cor_2", "Cor (fim)", "cor", COR_2, 0),
            ("cor_texto", "Cor da legenda", "cor", BRANCO, 0),
        ],
    },
    "citacao": {
        "nome": "Citação",
        "descricao": "Aspas grandes e o texto linha a linha, com o autor.",
        "duracao": 5.0,
        "campos": [
            ("texto", "Citação (uma linha por quebra)", "linhas",
             "A melhor parte da conversa\ncabe em 30 segundos.", 160),
            ("autor", "Autor", "texto", "Ana Souza", 40),
            ("cor_1", "Cor das aspas (início)", "cor", COR_1, 0),
            ("cor_2", "Cor das aspas (fim)", "cor", COR_2, 0),
            ("cor_texto", "Cor do texto", "cor", BRANCO, 0),
        ],
    },
}

_COR = re.compile(r"#[0-9a-fA-F]{6}")
_CAMPO = re.compile(r"\{\{(\w+)\}\}")


class ErroAnimacao(ValueError):
    """Campo inválido: a mensagem vai para a pessoa."""


def lista_de_modelos() -> list[dict]:
    """Os modelos para o painel do editor, com os campos e os valores de partida."""
    return [{"id": chave, "nome": m["nome"], "descricao": m["descricao"], "duracao": m["duracao"],
             "campos": [{"id": c, "rotulo": r, "tipo": t, "padrao": p, "maximo": x} for c, r, t, p, x in m["campos"]]}
            for chave, m in MODELOS.items()]


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


def _spans(texto: str, separador: str, classe: str) -> str:
    """Cada palavra (ou linha) num span com o índice --i, para as animações em sequência."""
    partes = [p for p in (texto.split(separador) if separador else texto.split()) if p.strip()]
    return "".join(f'<span class="{classe}" style="--i:{i}">{html.escape(p.strip())}</span>'
                   for i, p in enumerate(partes))


def _valores(modelo: str, campos: dict) -> dict:
    valores = {chave: html.escape(valor) for chave, valor in campos.items()}
    if modelo == "titulo":
        valores["palavras"] = _spans(campos["texto"], "", "palavra")
    if modelo == "citacao":
        valores["linhas"] = _spans(campos["texto"], "\n", "linha")
    return valores


def montar_html(modelo: str, campos: dict, duracao: float, proporcao: str, base_das_fontes: str) -> str:
    """A página da animação. base_das_fontes: onde estão os arquivos de core/fontes (file:// no worker,
    a rota da API na prévia do navegador)."""
    campos = conferir_campos(modelo, campos)
    largura, altura = QUADROS[proporcao]
    if modelo == LIVRE:
        corpo = f"<style>\n{campos['css']}\n</style>\n{campos['html']}"
    else:
        corpo = (PASTA_MODELOS / f"{modelo}.html").read_text(encoding="utf-8")
        valores = _valores(modelo, campos)
        corpo = _CAMPO.sub(lambda m: valores.get(m[1], ""), corpo)
    fontes = "\n".join(
        f"@font-face{{font-family:{familia};src:url('{base_das_fontes}/{arquivo}');font-weight:100 900}}"
        for familia, arquivo in (("Inter", "Inter%5Bopsz,wght%5D.ttf"), ("Montserrat", "Montserrat%5Bwght%5D.ttf"),
                                 ("Caveat", "Caveat%5Bwght%5D.ttf")))
    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
{fontes}
html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}
body{{width:{largura}px;height:{altura}px;position:relative;font-family:Inter,sans-serif;
  --dur:{duracao:.3f}s;--u:{min(largura, altura) / 100:.3f}px;
  --cor-1:{campos.get('cor_1', COR_1)};--cor-2:{campos.get('cor_2', COR_2)};
  --cor-texto:{campos.get('cor_texto', BRANCO)}}}
*{{box-sizing:border-box}}
</style>
</head><body>
{corpo}
</body></html>"""


def quadros_da_animacao(duracao: float) -> int:
    return max(1, round(duracao * FPS))
