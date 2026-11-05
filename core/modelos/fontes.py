"""O catálogo de fontes do editor de imagem (ADR 0003, onda 13.8): as três do servidor (core/fontes, as do vídeo) e a
biblioteca de fontes livres (core/fontes/biblioteca.json, baixada na construção da imagem). Cada estilo diz se é
itálico, os eixos da fonte variável (pelo nome do arquivo, como o google/fonts escreve: "Roboto[wdth,wght].ttf") e o
peso da estática. Só entram os arquivos que estão na pasta."""

import json
import re
from pathlib import Path

PASTA_DAS_FONTES = Path(__file__).resolve().parent.parent / "fontes"

# As fontes que o vídeo usa (core/utils/texto.py) também ficam no editor de imagem
DO_SERVIDOR = [
    {
        "id": "inter",
        "nome": "Inter",
        "categoria": "sem-serifa",
        "licenca": "OFL-1.1",
        "arquivos": ["Inter[opsz,wght].ttf"],
    },
    {
        "id": "montserrat",
        "nome": "Montserrat",
        "categoria": "sem-serifa",
        "licenca": "OFL-1.1",
        "arquivos": ["Montserrat[wght].ttf"],
    },
    {
        "id": "caveat",
        "nome": "Caveat",
        "categoria": "manuscrita",
        "licenca": "OFL-1.1",
        "arquivos": ["Caveat[wght].ttf"],
    },
]

PESOS = {
    "Thin": 100,
    "ExtraLight": 200,
    "Light": 300,
    "Regular": 400,
    "Medium": 500,
    "SemiBold": 600,
    "Bold": 700,
    "ExtraBold": 800,
    "Black": 900,
}
ARQUIVO_VALIDO = re.compile(r"[A-Za-z0-9_\-\[\],.]+\.ttf")


def estilo_do_arquivo(arquivo: str) -> dict:
    """O que o nome do arquivo diz: itálico, os eixos (variável) e o peso (estática)."""
    sem_extensao = arquivo.removesuffix(".ttf")
    eixos = re.search(r"\[([^\]]+)\]", sem_extensao)
    nome = re.sub(r"\[[^\]]+\]", "", sem_extensao)
    sufixo = nome.rsplit("-", 1)[-1] if "-" in nome else ""
    italico = "Italic" in sufixo
    peso = PESOS.get(sufixo.replace("Italic", "") or "Regular", 400)
    return {"arquivo": arquivo, "italico": italico, "eixos": eixos.group(1).split(",") if eixos else [], "peso": peso}


def catalogo(pasta_da_biblioteca: Path) -> list[dict]:
    """As famílias com os estilos presentes, as do servidor primeiro e as da biblioteca pelo nome."""
    familias = []
    for familia in DO_SERVIDOR:
        estilos = [estilo_do_arquivo(a) for a in familia["arquivos"] if (PASTA_DAS_FONTES / a).is_file()]
        if estilos:
            familias.append({**{k: v for k, v in familia.items() if k != "arquivos"}, "estilos": estilos})
    manifesto = json.loads((PASTA_DAS_FONTES / "biblioteca.json").read_text(encoding="utf-8"))
    da_biblioteca = []
    for familia in manifesto["familias"]:
        estilos = [
            estilo_do_arquivo(a["arquivo"])
            for a in familia["arquivos"]
            if (pasta_da_biblioteca / a["arquivo"]).is_file()
        ]
        if estilos:
            da_biblioteca.append(
                {
                    "id": familia["id"],
                    "nome": familia["nome"],
                    "categoria": familia["categoria"],
                    "licenca": familia["licenca"],
                    "estilos": estilos,
                }
            )
    return familias + sorted(da_biblioteca, key=lambda familia: familia["nome"].lower())


PREFIXO_DA_BIBLIOTECA = "lib:"


def arquivo_para_o_texto(familia: str, negrito: bool, pasta_da_biblioteca: Path) -> tuple[Path, int] | None:
    """A fonte da biblioteca para o texto do vídeo ("lib:roboto"): o arquivo sem itálico e o peso pedido (700 no
    negrito, 400 sem), que a variável recebe no eixo e a estática escolhe pelo nome do arquivo mais perto. None se a
    família não está na pasta."""
    if not familia.startswith(PREFIXO_DA_BIBLIOTECA):
        return None
    ident = familia.removeprefix(PREFIXO_DA_BIBLIOTECA)
    try:
        manifesto = json.loads((PASTA_DAS_FONTES / "biblioteca.json").read_text(encoding="utf-8"))
    except OSError:
        return None
    alvo = 700 if negrito else 400
    for entrada in manifesto["familias"]:
        if entrada["id"] != ident:
            continue
        estilos = [estilo_do_arquivo(a["arquivo"]) for a in entrada["arquivos"]
                   if (pasta_da_biblioteca / a["arquivo"]).is_file()]
        retos = [e for e in estilos if not e["italico"]] or estilos
        if not retos:
            return None
        variavel = next((e for e in retos if "wght" in e["eixos"]), None)
        escolhido = variavel or min(retos, key=lambda e: abs(e["peso"] - alvo))
        return pasta_da_biblioteca / escolhido["arquivo"], alvo
    return None


def caminho_da_fonte(arquivo: str, pasta_da_biblioteca: Path) -> Path | None:
    """O arquivo de uma fonte do catálogo (as do servidor ou as da biblioteca), ou None (nada fora das duas pastas)."""
    if not ARQUIVO_VALIDO.fullmatch(arquivo):
        return None
    for pasta in (PASTA_DAS_FONTES, pasta_da_biblioteca):
        caminho = pasta / arquivo
        if caminho.is_file() and caminho.resolve().parent == pasta.resolve():
            return caminho
    return None
