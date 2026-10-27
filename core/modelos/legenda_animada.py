# -----------------------------------------------
# TakeOne — legendas animadas (o Clipar, ADR 0004, decisão 8 e 14.12a)
#
# A fala (as palavras com o tempo e o papel: a ênfase escolhida pelo LLM) vira uma trilha de legenda desenhada em
# Canvas 2D por core/legendas/motor.js, com as fontes livres da biblioteca. O worker grava a trilha num vídeo de cor e
# num de transparência (como as animações em HTML), e o clipe dela entra numa faixa por cima: a prévia e o render
# usam o mesmo vídeo. Aqui ficam os estilos, o agrupamento das palavras em blocos (o que aparece junto na tela) e a
# página que o worker abre. Funções puras.
# -----------------------------------------------
import json
import re
from pathlib import Path

from core.modelos.animacao_html import QUADROS

PASTA_DO_MOTOR = Path(__file__).resolve().parent.parent / "legendas"
FPS = 30
DURACAO_MAXIMA = 300.0           # um corte de até 5 min
PALAVRAS_NO_MAXIMO = 3000
LETRAS_DA_PALAVRA = 40

# Os estilos: o jeito de agrupar ("bloco": várias palavras juntas, que entram uma a uma; "palavra": uma por vez),
# quantas letras cabem numa linha e quantas linhas um bloco tem, e as fontes da biblioteca que o motor carrega.
# O desenho de cada um fica em core/legendas/motor.js.
ESTILOS = {
    "editorial": {"nome": "Editorial", "agrupar": "bloco", "letras": 12, "linhas": 3,
                  "descricao": "Serifada condensada em caixa alta, a palavra forte em itálico dourado.",
                  "fontes": ["dm_serif", "playfair_italico"]},
    "uma_palavra": {"nome": "Uma palavra por vez", "agrupar": "palavra", "letras": 20, "linhas": 1,
                    "descricao": "Só a palavra falada, em negrito, entrando com um pulo curto.",
                    "fontes": ["montserrat"]},
    "minusculas": {"nome": "Minúsculas", "agrupar": "palavra", "letras": 20, "linhas": 1,
                   "descricao": "Uma palavra por vez, em minúsculas, discreta.",
                   "fontes": ["montserrat"]},
    "pulando": {"nome": "Palavra pulando", "agrupar": "bloco", "letras": 18, "linhas": 2,
                "descricao": "A frase inteira, com a palavra falada pulando e na cor de destaque.",
                "fontes": ["montserrat"]},
    "caixa_falada": {"nome": "Caixa na palavra falada", "agrupar": "bloco", "letras": 18, "linhas": 2,
                     "descricao": "A palavra falada ganha uma caixa colorida atrás.",
                     "fontes": ["montserrat"]},
    "caixas": {"nome": "Caixas coloridas", "agrupar": "bloco", "letras": 14, "linhas": 3,
               "descricao": "Cada palavra numa caixa, que entra girando um pouco.",
               "fontes": ["archivo_black"]},
    "digitacao": {"nome": "Digitação", "agrupar": "bloco", "letras": 20, "linhas": 2,
                  "descricao": "As letras aparecem no ritmo da fala, com o cursor piscando.",
                  "fontes": ["space_mono"]},
    "contorno": {"nome": "Contorno grosso", "agrupar": "bloco", "letras": 14, "linhas": 2,
                 "descricao": "Letras grossas com contorno preto; a palavra falada em amarelo.",
                 "fontes": ["anton"]},
    "neon": {"nome": "Néon", "agrupar": "bloco", "letras": 16, "linhas": 2,
             "descricao": "Letras com brilho de néon, acendendo uma a uma.",
             "fontes": ["montserrat"]},
}

# As fontes do motor: o arquivo, a família, o estilo e o peso. Montserrat vem de core/fontes; as outras, da biblioteca
# de fontes livres (core/fontes/biblioteca.json, OFL), que as imagens da API e do worker já baixam
FONTES = {
    "montserrat": ("nucleo", "Montserrat[wght].ttf", "Montserrat", "normal", "100 900"),
    "dm_serif": ("biblioteca", "DMSerifDisplay-Regular.ttf", "DM Serif Display", "normal", "400"),
    "playfair_italico": ("biblioteca", "PlayfairDisplay-Italic[wght].ttf", "Playfair Display", "italic", "400 900"),
    "archivo_black": ("biblioteca", "ArchivoBlack-Regular.ttf", "Archivo Black", "normal", "400"),
    "space_mono": ("biblioteca", "SpaceMono-Bold.ttf", "Space Mono", "normal", "700"),
    "anton": ("biblioteca", "Anton-Regular.ttf", "Anton", "normal", "400"),
}

# Um bloco fecha no fim da frase, numa pausa assim ou quando passa disto
PAUSA_DO_BLOCO = 0.45
DURACAO_DO_BLOCO = 2.6
# A última palavra de um bloco fica na tela até o próximo começar, mas não mais que isto depois de dita
SOBRA_DEPOIS = 0.6
_FIM_DE_FRASE = re.compile(r"[.!?…]['\"»”)]?$")


class ErroLegenda(ValueError):
    """Pedido inválido: a mensagem vai para a pessoa."""


def conferir_palavras(palavras: list[dict], duracao: float) -> list[dict]:
    """As palavras em ordem, dentro da duração, com o texto limpo e o fim depois do começo."""
    if not palavras:
        raise ErroLegenda("Não há palavras para a legenda.")
    if len(palavras) > PALAVRAS_NO_MAXIMO:
        raise ErroLegenda(f"A legenda pode ter no máximo {PALAVRAS_NO_MAXIMO} palavras.")
    if not 0 < duracao <= DURACAO_MAXIMA:
        raise ErroLegenda("A legenda animada vai até 5 minutos.")
    saida = []
    for palavra in sorted(palavras, key=lambda p: float(p["inicio"])):
        texto = " ".join(str(palavra.get("texto") or "").split())[:LETRAS_DA_PALAVRA]
        inicio = max(0.0, float(palavra["inicio"]))
        fim = min(duracao, max(inicio + 0.05, float(palavra.get("fim") or inicio)))
        if texto and inicio < duracao:
            saida.append({"texto": texto, "inicio": round(inicio, 3), "fim": round(fim, 3),
                          "enfase": bool(palavra.get("enfase"))})
    if not saida:
        raise ErroLegenda("Não há palavras dentro da duração da legenda.")
    return saida


def _linhas(textos: list[tuple[str, bool]], letras: int, estilo: str) -> list[list[int]]:
    """Os índices das palavras em linhas de até `letras` letras. No editorial, a palavra de ênfase fica sozinha na
    linha dela (é maior e de outra fonte), como no corte de referência ("QUANTO / MENOS / contato")."""
    linhas: list[list[int]] = []
    atual: list[int] = []
    tamanho = 0
    for i, (texto, enfase) in enumerate(textos):
        sozinha = estilo == "editorial" and enfase
        if atual and (sozinha or tamanho + 1 + len(texto) > letras):
            linhas.append(atual)
            atual, tamanho = [], 0
        atual.append(i)
        tamanho += len(texto) + (1 if tamanho else 0)
        if sozinha:
            linhas.append(atual)
            atual, tamanho = [], 0
    if atual:
        linhas.append(atual)
    return linhas


def blocos_da_fala(palavras: list[dict], estilo: str, duracao: float) -> list[dict]:
    """
    O que aparece junto na tela: cada bloco tem o começo, o fim e as linhas de palavras (com o tempo de cada uma).
    Nos estilos de uma palavra, cada palavra é um bloco. Nos outros, o bloco fecha no fim da frase, numa pausa, quando
    passa de 2,6 s ou quando as palavras não cabem mais nas linhas do estilo.
    """
    if estilo not in ESTILOS:
        raise ErroLegenda("Estilo de legenda desconhecido.")
    config = ESTILOS[estilo]
    grupos: list[list[dict]] = []
    atual: list[dict] = []
    for palavra in palavras:
        if atual:
            anterior = atual[-1]
            pausa = palavra["inicio"] - anterior["fim"] > PAUSA_DO_BLOCO
            longo = palavra["fim"] - atual[0]["inicio"] > DURACAO_DO_BLOCO
            textos = [(p["texto"], p["enfase"]) for p in [*atual, palavra]]
            nao_cabe = len(_linhas(textos, config["letras"], estilo)) > config["linhas"]
            if config["agrupar"] == "palavra" or pausa or longo or nao_cabe or _FIM_DE_FRASE.search(anterior["texto"]):
                grupos.append(atual)
                atual = []
        atual.append(palavra)
    if atual:
        grupos.append(atual)
    blocos = []
    for i, grupo in enumerate(grupos):
        proximo = grupos[i + 1][0]["inicio"] if i + 1 < len(grupos) else duracao
        fim = min(proximo, grupo[-1]["fim"] + SOBRA_DEPOIS, duracao)
        linhas = _linhas([(p["texto"], p["enfase"]) for p in grupo], config["letras"], estilo)
        blocos.append({"inicio": grupo[0]["inicio"], "fim": round(max(fim, grupo[-1]["fim"]), 3),
                       "linhas": [[grupo[j] for j in linha] for linha in linhas]})
    return blocos


def _json_no_script(dados) -> str:
    return json.dumps(dados, ensure_ascii=False).replace("</", "<\\/")


def montar_pagina(blocos: list[dict], estilo: str, proporcao: str, duracao: float, cores: dict, posicao: float,
                  base_das_fontes: str, base_do_motor: str) -> str:
    """A página que o worker grava (e a prévia do painel mostra): o motor desenha os blocos em cada instante.
    base_das_fontes tem as pastas nucleo/ (core/fontes) e biblioteca/ (a biblioteca de fontes livres)."""
    largura, altura = QUADROS[proporcao]
    fontes = []
    for nome in ESTILOS[estilo]["fontes"]:
        pasta, arquivo, familia, forma, peso = FONTES[nome]
        url = f"{base_das_fontes}/{pasta}/{arquivo.replace('[', '%5B').replace(']', '%5D')}"
        fontes.append({"url": url, "familia": familia, "estilo": forma, "peso": peso})
    dados = {"blocos": blocos, "estilo": estilo, "duracao": duracao, "posicao": posicao,
             "cores": cores, "largura": largura, "altura": altura, "fontes": fontes}
    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}
canvas{{display:block}}</style>
<script>window.LEGENDA={_json_no_script(dados)};</script>
</head><body><canvas id="tela" width="{largura}" height="{altura}"></canvas>
<script src="{base_do_motor}/motor.js"></script></body></html>"""


def quadros_da_legenda(duracao: float) -> int:
    return max(1, round(duracao * FPS))
