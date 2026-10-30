# -----------------------------------------------
# Ler e baixar um link pelo yt-dlp (API e worker). Só com o extrator do site do link
# (core/modelos/importacao.py): o genérico abriria qualquer endereço, inclusive os da rede interna.
# -----------------------------------------------
from collections.abc import Callable
from pathlib import Path

from core.modelos.importacao import FORMATO_DOWNLOAD, extratores
from core.modelos.job import ErroDefinitivo

FALHAS_DEFINITIVAS = ("private video", "video unavailable", "this video is not available", "members-only",
                      "has been removed", "does not exist", "sign in to confirm your age", "requested format is not",
                      "unsupported url")


class ErroImportacao(RuntimeError):
    pass


def _yt_dlp():
    try:
        import yt_dlp
    except ImportError as erro:
        raise ErroDefinitivo("O worker ainda não tem o yt-dlp. Reconstrua a imagem do worker.") from erro
    return yt_dlp


def _opcoes(origem: str, **extra) -> dict:
    # Só o extrator do site do link: o genérico abriria qualquer endereço que a página do vídeo apontasse
    return {"quiet": True, "no_warnings": True, "noplaylist": True, "allowed_extractors": extratores(origem),
            "socket_timeout": 30, **extra}


def ler_metadados(url: str, origem: str) -> dict:
    """Os dados do vídeo, sem baixar: título, canal, duração e se a live ainda está no ar."""
    yt_dlp = _yt_dlp()
    try:
        with yt_dlp.YoutubeDL(_opcoes(origem, skip_download=True)) as cliente:
            return cliente.extract_info(url, download=False) or {}
    except yt_dlp.utils.DownloadError as erro:
        raise ErroImportacao(str(erro).removeprefix("ERROR: ")[:300]) from erro


def resolver_canal(handle: str) -> tuple[str, str]:
    """O id UC... e o nome do canal, a partir do @ (o feed RSS só aceita o id). Só o extrator das páginas de canal."""
    yt_dlp = _yt_dlp()
    opcoes = {"quiet": True, "no_warnings": True, "skip_download": True, "extract_flat": True, "playlistend": 1,
              "allowed_extractors": ["youtube:tab"], "socket_timeout": 30}
    try:
        with yt_dlp.YoutubeDL(opcoes) as cliente:
            info = cliente.extract_info(f"https://www.youtube.com/{handle}", download=False) or {}
    except yt_dlp.utils.DownloadError as erro:
        raise ErroImportacao(f"Não encontrei o canal {handle} no YouTube.") from erro
    canal_id = str(info.get("channel_id") or "")
    if not canal_id.startswith("UC"):
        raise ErroImportacao(f"Não encontrei o canal {handle} no YouTube.")
    return canal_id, " ".join(str(info.get("channel") or info.get("uploader") or handle).split())[:120]


def mensagem_definitiva(erro: Exception) -> str | None:
    """A falha que não melhora tentando de novo (vídeo privado, removido, com idade), na língua da pessoa."""
    texto = str(erro).lower()
    if "private" in texto:
        return "O vídeo é privado. Peça ao dono para deixar público ou não listado, ou envie o arquivo."
    if "members-only" in texto or "sign in" in texto:
        return "O vídeo pede login (só para membros ou com restrição de idade). Envie o arquivo."
    if any(trecho in texto for trecho in FALHAS_DEFINITIVAS):
        return f"O vídeo não está disponível para baixar: {str(erro)[:200]}"
    return None


def baixar(url: str, origem: str, pasta: Path, reportar: Callable[[int, str], None]) -> Path:
    """Baixa para pasta/original.<ext> e devolve o caminho. Vídeo e áudio vêm juntos num .mp4."""
    yt_dlp = _yt_dlp()

    def progresso(estado: dict):
        total = estado.get("total_bytes") or estado.get("total_bytes_estimate") or 0
        if estado.get("status") == "downloading" and total:
            reportar(5 + int(85 * min(estado.get("downloaded_bytes", 0) / total, 1)), "Baixando o vídeo")

    opcoes = _opcoes(origem, format=FORMATO_DOWNLOAD, merge_output_format="mp4",
                     outtmpl=str(pasta / "original.%(ext)s"), progress_hooks=[progresso], overwrites=True)
    try:
        with yt_dlp.YoutubeDL(opcoes) as cliente:
            cliente.extract_info(url, download=True)
    except yt_dlp.utils.DownloadError as erro:
        raise ErroImportacao(str(erro).removeprefix("ERROR: ")[:300]) from erro
    prontos = [arquivo for arquivo in pasta.glob("original.*")
               if arquivo.suffix.lower() not in (".part", ".ytdl", ".temp") and arquivo.is_file()]
    if not prontos:
        raise ErroImportacao("O download terminou sem arquivo.")
    return max(prontos, key=lambda arquivo: arquivo.stat().st_size)


