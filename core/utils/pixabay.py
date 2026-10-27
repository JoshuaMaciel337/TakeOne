# -----------------------------------------------
# TakeOne — o banco de imagens e vídeos da Pixabay (o Clipar, ADR 0004, 14.12f)
#
# A busca vai para a API da Pixabay com a chave do dono (PIXABAY_CHAVE, no .env) e cada resposta fica 24 h no Mongo
# (`pixabay_cache`), como as regras da API pedem. O que a pessoa usa é baixado para a biblioteca (nada fica
# apontando para a Pixabay depois), e só dos endereços da própria Pixabay: o pedido de importar traz só o id, e o
# endereço do arquivo vem da resposta da API. A fonte aparece onde os resultados aparecem.
# -----------------------------------------------
import hashlib
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from collections.abc import Callable
from pathlib import Path

from core.config import PIXABAY_CHAVE

API_IMAGENS = "https://pixabay.com/api/"
API_VIDEOS = "https://pixabay.com/api/videos/"
FONTE = {"nome": "Pixabay", "url": "https://pixabay.com/"}
POR_PAGINA = 24
# A API deixa 100 pedidos por minuto; aqui fica uma folga
PEDIDOS_POR_MINUTO = 80
HOSTS_DOS_ARQUIVOS = ("pixabay.com", "cdn.pixabay.com")
TAMANHO_MAXIMO = {"imagem": 40 * 1024**2, "video": 400 * 1024**2}
_pedidos: deque[float] = deque()


class ErroPixabay(Exception):
    """A mensagem vai para a pessoa."""


def ligada() -> bool:
    return bool(PIXABAY_CHAVE)


def parametros(tipo: str, busca: str = "", pagina: int = 1, orientacao: str = "", item_id: int | None = None) -> dict:
    """Os parâmetros do pedido, sem a chave (a chave do cache usa estes)."""
    if tipo not in ("imagem", "video"):
        raise ErroPixabay("Tipo desconhecido: use imagem ou vídeo.")
    if item_id is not None:
        return {"id": int(item_id)}
    saida = {"lang": "pt", "safesearch": "true", "per_page": POR_PAGINA, "page": max(1, min(pagina, 20)),
             "q": " ".join(busca.split())[:100]}
    if tipo == "imagem":
        saida["image_type"] = "photo"
        if orientacao in ("horizontal", "vertical"):
            saida["orientation"] = orientacao
    return saida


def chave_do_cache(tipo: str, params: dict) -> str:
    return hashlib.sha1(json.dumps([tipo, params], sort_keys=True).encode()).hexdigest()


def _esperar_a_vez():
    agora = time.monotonic()
    while _pedidos and agora - _pedidos[0] > 60:
        _pedidos.popleft()
    if len(_pedidos) >= PEDIDOS_POR_MINUTO:
        raise ErroPixabay("Muitas buscas no último minuto. Espere um pouco e tente de novo.")
    _pedidos.append(agora)


def pedir(tipo: str, params: dict) -> dict:
    """A resposta da API (sem cache). Lança ErroPixabay com a mensagem para a pessoa."""
    if not ligada():
        raise ErroPixabay("O banco da Pixabay não está ligado: falta a chave no .env do servidor.")
    _esperar_a_vez()
    url = (API_VIDEOS if tipo == "video" else API_IMAGENS) + "?" + urllib.parse.urlencode(
        {"key": PIXABAY_CHAVE, **params})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TakeOne"}),
                                    timeout=15) as resposta:
            return json.loads(resposta.read())
    except urllib.error.HTTPError as erro:
        logging.warning(f"A Pixabay respondeu {erro.code} a uma busca de {tipo}.")
        if erro.code == 429:
            raise ErroPixabay("A Pixabay pediu para esperar um pouco. Tente de novo em um minuto.") from erro
        if erro.code == 400 and "id" in params:
            raise ErroPixabay("Esse item não existe mais na Pixabay.") from erro
        raise ErroPixabay("A Pixabay não respondeu à busca agora.") from erro
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as erro:
        raise ErroPixabay("Não foi possível falar com a Pixabay agora.") from erro


def _video_escolhido(videos: dict) -> dict | None:
    """O maior arquivo até 1920 de largura (o large tem 1920 × 1080, quando existe; o 4K não vale o peso)."""
    for nome in ("large", "medium", "small", "tiny"):
        arquivo = videos.get(nome) or {}
        if arquivo.get("url") and 0 < (arquivo.get("width") or 0) <= 1920:
            return arquivo
    return None


def resumir(tipo: str, item: dict) -> dict | None:
    """Um resultado no formato do TakeOne: o que mostrar (prévia e crédito) e o arquivo para baixar."""
    comum = {"id": item.get("id"), "tipo": tipo, "usuario": item.get("user") or "",
             "pagina": item.get("pageURL") or "", "tags": item.get("tags") or ""}
    if tipo == "imagem":
        arquivo = item.get("largeImageURL") or item.get("webformatURL")
        if not arquivo:
            return None
        return {**comum, "previa": item.get("webformatURL") or item.get("previewURL"), "arquivo": arquivo,
                "video_previa": None, "largura": item.get("imageWidth"), "altura": item.get("imageHeight"),
                "duracao": None}
    escolhido = _video_escolhido(item.get("videos") or {})
    if not escolhido:
        return None
    pequeno = (item.get("videos") or {}).get("tiny") or escolhido
    return {**comum, "previa": escolhido.get("thumbnail") or pequeno.get("thumbnail"), "arquivo": escolhido["url"],
            "video_previa": pequeno.get("url"), "largura": escolhido.get("width"), "altura": escolhido.get("height"),
            "duracao": item.get("duration")}


def endereco_permitido(url: str) -> bool:
    partes = urllib.parse.urlsplit(url or "")
    return partes.scheme == "https" and partes.hostname in HOSTS_DOS_ARQUIVOS


def extensao_do_arquivo(url: str, tipo: str) -> str:
    sufixo = Path(urllib.parse.urlsplit(url).path).suffix.lower()
    if tipo == "imagem":
        return sufixo if sufixo in (".jpg", ".jpeg", ".png", ".webp") else ".jpg"
    return ".mp4"


def baixar(url: str, destino: Path, tipo: str, reportar: Callable[[int, str], None] = lambda *_: None) -> int:
    """Baixa o arquivo da Pixabay em pedaços, com limite de tamanho. Devolve o tamanho."""
    if not endereco_permitido(url):
        raise ErroPixabay("O endereço do arquivo não é da Pixabay.")
    limite = TAMANHO_MAXIMO[tipo]
    parcial = destino.with_name(destino.name + ".parcial")
    total = 0
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TakeOne"}),
                                    timeout=30) as resposta, parcial.open("wb") as arquivo:
            if not endereco_permitido(resposta.geturl()):
                raise ErroPixabay("O endereço do arquivo não é da Pixabay.")
            esperado = int(resposta.headers.get("Content-Length") or 0)
            while pedaco := resposta.read(1024 * 1024):
                total += len(pedaco)
                if total > limite:
                    raise ErroPixabay("O arquivo da Pixabay é grande demais.")
                arquivo.write(pedaco)
                if esperado:
                    reportar(min(90, 5 + int(85 * total / esperado)), "Baixando da Pixabay")
        parcial.replace(destino)
    except BaseException:
        parcial.unlink(missing_ok=True)
        raise
    return total
