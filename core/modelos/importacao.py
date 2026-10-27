# -----------------------------------------------
# TakeOne — importar um vídeo pelo link (o começo do Clipar, ADR 0004)
#
# Adaptado do HolyCut, sem as partes de igreja. Só os sites conhecidos entram, cada um pelo formato do
# endereço dele, e o link vira a url canônica do vídeo: o yt-dlp só usa o extrator daquele site (o genérico,
# que abriria qualquer endereço, inclusive os da rede interna, fica de fora). O vídeo baixado segue o caminho
# de um envio comum: a ingestão. Funções puras: leem e decidem, sem acessar o banco nem a rede.
# -----------------------------------------------
import re
from datetime import datetime
from urllib.parse import parse_qs, urlparse

from core.modelos.job import montar_job
from core.modelos.midia import PRIORIDADE_INGESTAO, STATUS_PROCESSANDO, montar_midia

# Origem → (nome na tela, extratores do yt-dlp que podem abrir o link)
ORIGENS = {
    "youtube": ("YouTube", ["youtube"]),
    "drive": ("Google Drive", ["GoogleDrive"]),
    "vimeo": ("Vimeo", ["vimeo"]),
    "twitch": ("Twitch", ["twitch:vod", "twitch:clips"]),
    "tiktok": ("TikTok", ["TikTok"]),
    "instagram": ("Instagram", ["Instagram"]),
}
DURACAO_MAXIMA = 4 * 3600          # até 4 h de vídeo por link
ESPERA_LIVE_MINUTOS = 10           # live no ar: tenta de novo daqui a 10 min
MAXIMO_ESPERAS_LIVE = 48           # 8 h esperando a live acabar
# Até 1080p, vídeo e áudio juntos num .mp4, que é o tamanho que o render usa. O H.264 com AAC vem primeiro: o
# YouTube manda AV1 quando pode, mais pesado de ler no render e na cópia leve
FORMATO_DOWNLOAD = ("bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=1080][vcodec^=avc1]+ba/"
                    "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b")
SITUACOES_ESPERAR = {"is_live", "is_upcoming", "post_live"}
MENSAGEM_SITES = "Cole o link de um vídeo do YouTube, do Google Drive, do Vimeo, da Twitch, do TikTok ou do Instagram."

_ID_YOUTUBE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_ID_DRIVE = re.compile(r"^[A-Za-z0-9_-]{20,}$")
_NUMERO = re.compile(r"^\d{5,20}$")
_SLUG = re.compile(r"^[A-Za-z0-9_-]{3,100}$")
_USUARIO_TIKTOK = re.compile(r"^@[A-Za-z0-9._]{1,40}$")


def _link(origem: str, identificador: str, url: str) -> dict:
    return {"origem": origem, "id": identificador, "url": url}


def ler_link(url: str) -> dict | None:
    """O vídeo por trás do link: {"origem", "id", "url"} com a url canônica, ou None se o site não é aceito."""
    texto = (url or "").strip()
    if not texto or len(texto) > 2000 or any(letra.isspace() for letra in texto):
        return None
    if not re.match(r"^https?://", texto, re.IGNORECASE):
        texto = f"https://{texto}"
    partes = urlparse(texto)
    if partes.port not in (None, 80, 443):
        return None
    host = (partes.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    caminho = [pedaco for pedaco in partes.path.split("/") if pedaco]
    consulta = parse_qs(partes.query)

    if host in ("youtube.com", "music.youtube.com", "youtu.be"):
        candidato = None
        if host == "youtu.be" and caminho:
            candidato = caminho[0]
        elif caminho[:1] == ["watch"]:
            candidato = (consulta.get("v") or [""])[0]
        elif len(caminho) >= 2 and caminho[0] in ("live", "shorts", "embed", "v"):
            candidato = caminho[1]
        if candidato and _ID_YOUTUBE.fullmatch(candidato):
            return _link("youtube", candidato, f"https://www.youtube.com/watch?v={candidato}")
        return None
    if host in ("drive.google.com", "docs.google.com"):
        candidato = None
        if len(caminho) >= 3 and caminho[0] == "file" and caminho[1] == "d":
            candidato = caminho[2]
        elif consulta.get("id"):
            candidato = consulta["id"][0]
        if candidato and _ID_DRIVE.fullmatch(candidato):
            return _link("drive", candidato, f"https://drive.google.com/file/d/{candidato}/view")
        return None
    if host in ("vimeo.com", "player.vimeo.com"):
        if host == "vimeo.com":
            candidato = caminho[-1] if caminho else None
        else:
            candidato = caminho[1] if caminho[:1] == ["video"] and len(caminho) >= 2 else None
        if candidato and _NUMERO.fullmatch(candidato):
            return _link("vimeo", candidato, f"https://vimeo.com/{candidato}")
        return None
    if host == "twitch.tv" and len(caminho) >= 2 and caminho[0] == "videos" and _NUMERO.fullmatch(caminho[1]):
        return _link("twitch", caminho[1], f"https://www.twitch.tv/videos/{caminho[1]}")
    if host == "twitch.tv" and len(caminho) >= 3 and caminho[1] == "clip" and _SLUG.fullmatch(caminho[2]):
        return _link("twitch", caminho[2], f"https://clips.twitch.tv/{caminho[2]}")
    if host == "clips.twitch.tv" and caminho and _SLUG.fullmatch(caminho[0]):
        return _link("twitch", caminho[0], f"https://clips.twitch.tv/{caminho[0]}")
    if host == "tiktok.com" and len(caminho) >= 3 and _USUARIO_TIKTOK.fullmatch(caminho[0]) and caminho[1] == "video" \
            and _NUMERO.fullmatch(caminho[2]):
        return _link("tiktok", caminho[2], f"https://www.tiktok.com/{caminho[0]}/video/{caminho[2]}")
    instagram = host == "instagram.com" and len(caminho) >= 2 and caminho[0] in ("reel", "reels", "p", "tv")
    if instagram and _SLUG.fullmatch(caminho[1]):
        return _link("instagram", caminho[1], f"https://www.instagram.com/reel/{caminho[1]}/")
    return None


def nome_da_origem(origem: str) -> str:
    return ORIGENS[origem][0]


def extratores(origem: str) -> list[str]:
    """Os únicos extratores que o yt-dlp pode usar para essa origem (o genérico nunca)."""
    return list(ORIGENS[origem][1])


def precisa_esperar(metadados: dict) -> bool:
    """A live ainda está no ar (ou o site ainda prepara o vídeo dela)."""
    return metadados.get("live_status") in SITUACOES_ESPERAR or bool(metadados.get("is_live"))


def titulo_do_video(metadados: dict, padrao: str = "Vídeo importado") -> str:
    titulo = " ".join(str(metadados.get("title") or "").split())
    return titulo[:120] or padrao


def canal_do_video(metadados: dict) -> str:
    return " ".join(str(metadados.get("channel") or metadados.get("uploader") or "").split())[:120]


def nome_de_arquivo_do_video(titulo: str, extensao: str) -> str:
    """O título vira nome de arquivo: é o que o XML de intercâmbio procura."""
    base = re.sub(r'[\\/:*?"<>|]+', " ", titulo)
    base = " ".join(base.split())[:120].strip(" .") or "video"
    return f"{base}{extensao}"


def data_do_video(metadados: dict) -> str | None:
    """O dia em que o vídeo foi publicado, como 2026-09-28."""
    bruto = str(metadados.get("upload_date") or "")
    if re.fullmatch(r"\d{8}", bruto):
        return f"{bruto[:4]}-{bruto[4:6]}-{bruto[6:]}"
    valor = metadados.get("timestamp")
    if isinstance(valor, (int, float)) and valor > 0:
        return datetime.fromtimestamp(valor).date().isoformat()
    return None


def _miniatura(metadados: dict) -> str | None:
    """A miniatura em https (a página mostra a imagem do próprio site)."""
    candidatas = [metadados.get("thumbnail")] + [item.get("url") for item in reversed(metadados.get("thumbnails") or [])
                                                 if isinstance(item, dict)]
    for url in candidatas:
        if isinstance(url, str) and url.startswith("https://") and len(url) <= 2000:
            return url
    return None


def dados_do_video(link: dict, metadados: dict) -> dict:
    """O que a página mostra antes de importar. Só campos conhecidos: o resto do que o site devolve fica de fora."""
    duracao = metadados.get("duration")
    duracao = float(duracao) if isinstance(duracao, (int, float)) and duracao > 0 else None
    return {
        **link,
        "site": nome_da_origem(link["origem"]),
        "titulo": titulo_do_video(metadados),
        "canal": canal_do_video(metadados) or None,
        "duracao": duracao,
        "miniatura": _miniatura(metadados),
        "data": data_do_video(metadados),
        "ao_vivo": precisa_esperar(metadados),
    }


def problema_do_video(dados: dict) -> str | None:
    """Por que o vídeo não pode entrar, ou None."""
    if dados["duracao"] is not None and dados["duracao"] > DURACAO_MAXIMA:
        return f"O vídeo tem mais de {DURACAO_MAXIMA // 3600} horas. Corte o trecho que interessa e envie o arquivo."
    return None


def montar_importacao(organizacao_id, criado_por, link: dict, dados: dict | None = None,
                      momento: datetime | None = None) -> tuple[dict, dict]:
    """
    A mídia nova, ainda sem arquivo, e o job que baixa o vídeo. O job entra no lugar da ingestão
    (job_ingestao_id), então o cartão mostra o download; depois ele enfileira a ingestão.
    Quem insere preenche entrada.midia_id e job_ingestao_id com os ids gerados.
    """
    midia = montar_midia(organizacao_id, criado_por, f"{link['origem']}-{link['id']}.mp4", 0, momento=momento)
    titulo = (dados or {}).get("titulo") or f"Importando do {nome_da_origem(link['origem'])}"
    importacao = {**link}
    for campo in ("titulo", "canal", "duracao", "miniatura", "data"):
        if (dados or {}).get(campo) is not None:
            importacao[campo] = dados[campo]
    midia.update({"status": STATUS_PROCESSANDO, "nome": titulo, "importacao": importacao})
    job = montar_job("importar_link", organizacao_id, {"midia_id": "", **link}, prioridade=PRIORIDADE_INGESTAO,
                     criado_por=criado_por, momento=momento)
    return midia, job
