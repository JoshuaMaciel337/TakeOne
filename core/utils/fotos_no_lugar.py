# -----------------------------------------------
# TakeOne — fotos "no lugar" (onda 16, ADR 0006): uma pasta do Nitro montada só para leitura em /fotos
#
# O fotógrafo já tem o ensaio no disco: importar a pasta não copia nada. A mídia guarda o caminho do arquivo dentro
# da pasta montada (`externo`), a ingestão lê dali e grava só a cópia leve, a capa e a imagem do render no
# armazenamento de sempre. Apagar a mídia nunca apaga o arquivo da pasta.
# -----------------------------------------------
from collections.abc import Iterator
from pathlib import Path, PurePosixPath

from core.config import EXTENSOES_IMAGEM, PASTA_DAS_FOTOS
from core.modelos.midia import chave_arquivo
from core.utils import storage

# O SVG é um desenho, não uma foto de ensaio
EXTENSOES_DA_PASTA = EXTENSOES_IMAGEM - {".svg"}


class CaminhoInvalido(ValueError):
    """O caminho sai da pasta das fotos ou não existe."""


def _raiz(raiz: Path | None) -> Path:
    """A pasta das fotos, lida na hora (os testes trocam a do módulo)."""
    return raiz if raiz is not None else PASTA_DAS_FOTOS


def disponivel(raiz: Path | None = None) -> bool:
    return _raiz(raiz).is_dir()


def caminho_externo(relativo: str, raiz: Path | None = None) -> Path:
    """O caminho de dentro da pasta das fotos ("Casamento/Cerimônia"), recusando o que tente sair dela."""
    raiz = _raiz(raiz)
    partes = [p for p in PurePosixPath(relativo.replace("\\", "/")).parts if p not in ("", "/", ".")]
    if ".." in partes or any(p.startswith("/") for p in partes):
        raise CaminhoInvalido("O caminho sai da pasta das fotos.")
    caminho = raiz.joinpath(*partes)
    try:
        caminho.resolve().relative_to(raiz.resolve())
    except ValueError as e:
        # Um atalho (link simbólico) que aponte para fora também não vale
        raise CaminhoInvalido("O caminho sai da pasta das fotos.") from e
    return caminho


def relativo_de(caminho: Path, raiz: Path | None = None) -> str:
    return caminho.relative_to(_raiz(raiz)).as_posix()


def e_foto(caminho: Path) -> bool:
    return caminho.suffix.lower() in EXTENSOES_DA_PASTA and not caminho.name.startswith(".")


def listar(relativo: str = "", raiz: Path | None = None) -> dict:
    """As subpastas (com quantas fotos cada uma tem logo dentro) e as fotos desta pasta."""
    raiz = _raiz(raiz)
    pasta = caminho_externo(relativo, raiz)
    if not pasta.is_dir():
        raise CaminhoInvalido("A pasta não existe.")
    pastas, fotos = [], 0
    for item in sorted(pasta.iterdir(), key=lambda p: p.name.lower()):
        if item.name.startswith("."):
            continue
        if item.is_dir():
            dentro = sum(1 for filho in item.iterdir() if filho.is_file() and e_foto(filho))
            pastas.append({"nome": item.name, "caminho": relativo_de(item, raiz), "fotos": dentro})
        elif item.is_file() and e_foto(item):
            fotos += 1
    return {"caminho": relativo_de(pasta, raiz) if pasta != raiz else "", "pastas": pastas, "fotos": fotos}


def fotos_da_pasta(relativo: str, subpastas: bool, raiz: Path | None = None) -> Iterator[Path]:
    """As fotos da pasta (e das de dentro, se pedido), na ordem dos nomes."""
    pasta = caminho_externo(relativo, raiz)
    if not pasta.is_dir():
        raise CaminhoInvalido("A pasta não existe.")
    itens = pasta.rglob("*") if subpastas else pasta.iterdir()
    for item in sorted(itens, key=lambda p: p.as_posix().lower()):
        if any(parte.startswith(".") for parte in item.relative_to(pasta).parts):
            continue
        if item.is_file() and e_foto(item):
            yield item


def caminho_do_original(midia: dict, raiz: Path | None = None) -> Path:
    """O arquivo original da mídia: o da pasta das fotos (importada no lugar) ou o do armazenamento."""
    if midia.get("externo"):
        return caminho_externo(midia["externo"], raiz)
    return storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], midia["original"]))
