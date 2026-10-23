# -----------------------------------------------
# TakeOne — execução do FFmpeg e do ffprobe
# -----------------------------------------------
import json
import logging
import subprocess
import threading
from collections import deque
from collections.abc import Callable
from pathlib import Path

from core.config import FFMPEG, FFPROBE

TIMEOUT_FFPROBE_SEGUNDOS = 60
# Cor: a prévia (Chrome) lê vídeo sem marcação de cor como BT.709. O render e o proxy fazem igual, e
# tudo o que o TakeOne gera sai convertido para BT.709 e marcado, para todo player mostrar a mesma cor.
MARCAS_BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
# As mesmas marcas nos quadros, no fim do grafo: no FFmpeg 7 o codificador usa as dos quadros, e só com as opções
# acima as primárias e a curva saíam "unknown" (medido no ffprobe do vídeo exportado e da cópia leve)
FILTRO_MARCAS_BT709 = "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv"
LINHAS_ERRO_GUARDADAS = 15


class ErroFFmpeg(RuntimeError):
    pass


def sondar(caminho: Path) -> dict:
    """Metadados do arquivo pelo ffprobe (formato e streams)."""
    resultado = subprocess.run(
        [FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(caminho)],
        capture_output=True, text=True, timeout=TIMEOUT_FFPROBE_SEGUNDOS,
    )
    if resultado.returncode != 0:
        raise ErroFFmpeg(f"O arquivo não pôde ser lido como vídeo ou áudio: {resultado.stderr.strip()[-300:]}")
    return json.loads(resultado.stdout or "{}")


def _fracao(valor: str) -> float | None:
    """'30000/1001' → 29.97. None se inválido."""
    numerador, _, denominador = valor.partition("/")
    try:
        divisor = float(denominador) if denominador else 1.0
        return round(float(numerador) / divisor, 3) if divisor else None
    except ValueError:
        return None


def resumir_sondagem(sondagem: dict) -> dict:
    """Extrai duração e as características do primeiro vídeo e do primeiro áudio."""
    streams = sondagem.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"
                  and not (s.get("disposition") or {}).get("attached_pic")), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duracao = float((sondagem.get("format") or {}).get("duration") or 0) or None

    resumo = {"duracao": duracao, "video": None, "audio": None}
    if video:
        largura, altura = int(video.get("width") or 0), int(video.get("height") or 0)
        rotacao = _rotacao(video)
        if rotacao in (90, 270):
            largura, altura = altura, largura
        resumo["video"] = {
            "codec": video.get("codec_name"),
            "largura": largura,
            "altura": altura,
            "fps": _fracao(video.get("avg_frame_rate") or "") or _fracao(video.get("r_frame_rate") or ""),
            "rotacao": rotacao,
            # Matriz de cor marcada no arquivo (bt709, smpte170m...), ou None sem marcação
            "matriz": video.get("color_space") if video.get("color_space") not in (None, "unknown") else None,
            # HDR do celular (PQ ou HLG): a leitura converte para SDR (ler_como_bt709)
            "hdr": HDR_POR_TRANSFERENCIA.get(video.get("color_transfer") or ""),
            # A imagem pode acabar antes do contêiner (o som do celular passa uns quadros): o render repete o
            # último quadro até o fim, como a prévia, em vez de mostrar o fundo
            "duracao": float(video["duration"]) if video.get("duration") not in (None, "N/A") else None,
        }
    if audio:
        resumo["audio"] = {
            "codec": audio.get("codec_name"),
            "canais": int(audio.get("channels") or 0),
            "taxa": int(audio.get("sample_rate") or 0),
        }
    return resumo


HDR_POR_TRANSFERENCIA = {"smpte2084": "pq", "arib-std-b67": "hlg"}
TRANSFERENCIA_DO_HDR = {"pq": "smpte2084", "hlg": "arib-std-b67"}


def filtros_de_hdr_para_sdr(hdr: str) -> list[str]:
    """
    HDR (BT.2020, PQ ou HLG) para SDR BT.709: luz linear com 100 nits em 1, primárias BT.709 e o tonemap
    hable (sem dessaturar), de volta a BT.709 em faixa de TV. A cópia leve e o render passam pelo mesmo
    filtro, então a prévia e o vídeo exportado saem iguais.
    """
    return [f"zscale=tin={TRANSFERENCIA_DO_HDR[hdr]}:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100",
            "format=gbrpf32le", "zscale=p=bt709", "tonemap=tonemap=hable:desat=0",
            "zscale=t=bt709:m=bt709:r=tv", "format=yuv420p"]


def ler_como_bt709(matriz: str | None, hdr: str | None = None) -> list[str]:
    """
    Filtros para o começo da cadeia de um vídeo: o HDR do celular vira SDR, e o vídeo sem marcação de cor é
    lido como BT.709.
    """
    if hdr in TRANSFERENCIA_DO_HDR:
        return filtros_de_hdr_para_sdr(hdr)
    return [] if matriz else ["setparams=colorspace=bt709"]


def _rotacao(video: dict) -> int:
    """Rotação gravada pelo celular, em graus positivos (0, 90, 180 ou 270)."""
    rotacao = (video.get("tags") or {}).get("rotate")
    for dado in video.get("side_data_list") or []:
        if "rotation" in dado:
            rotacao = dado["rotation"]
    try:
        return int(float(rotacao or 0)) % 360
    except (TypeError, ValueError):
        return 0


def ler_progresso(linha: str) -> float | None:
    """Segundos já processados, a partir de uma linha do -progress do FFmpeg."""
    chave, _, valor = linha.strip().partition("=")
    if chave in ("out_time_us", "out_time_ms") and valor.isdigit():
        return int(valor) / 1_000_000  # as duas chaves vêm em microssegundos
    return None


def executar_ffmpeg(argumentos: list[str], duracao: float | None = None,
                    reportar: Callable[[float], None] | None = None) -> str:
    """
    Roda o FFmpeg com os argumentos dados. Se houver duração e reportar,
    chama reportar(fração de 0 a 1) conforme o arquivo avança.
    Devolve as últimas linhas da saída de erro, onde ficam os resumos de filtros como o ebur128.
    Lança ErroFFmpeg com o final da saída de erro se o comando falhar.
    """
    comando = [FFMPEG, "-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", *argumentos]
    logging.debug("FFmpeg: " + " ".join(comando))
    processo = subprocess.Popen(comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8", errors="replace")
    ultimas_linhas: deque[str] = deque(maxlen=LINHAS_ERRO_GUARDADAS)
    # O resumo do ebur128 sai antes das estatísticas que o libx264 e o AAC escrevem ao fechar: guardado à parte,
    # ele não some das últimas linhas quando a mesma chamada também codifica vídeo (a ingestão perdia o LUFS)
    linhas_de_loudness: deque[str] = deque(maxlen=LINHAS_ERRO_GUARDADAS)

    def guardar_erros():
        for linha in processo.stderr:
            if linha.strip():
                ultimas_linhas.append(linha.rstrip())
                if "LUFS" in linha:
                    linhas_de_loudness.append(linha.rstrip())

    leitor = threading.Thread(target=guardar_erros, daemon=True)
    leitor.start()
    try:
        for linha in processo.stdout:
            segundos = ler_progresso(linha)
            if segundos is not None and duracao and reportar:
                reportar(min(max(segundos / duracao, 0.0), 1.0))
    except BaseException as erro:
        # Quem acompanha mandou parar (o job foi cancelado, por exemplo): o FFmpeg não segue até o fim sozinho.
        # Vira ErroFFmpeg para as tarefas apagarem o arquivo pela metade pelo caminho de sempre
        processo.kill()
        processo.wait()
        leitor.join(timeout=5)
        if isinstance(erro, Exception):
            raise ErroFFmpeg(f"FFmpeg interrompido: {erro}") from erro
        raise
    codigo = processo.wait()
    leitor.join(timeout=5)
    if codigo != 0:
        raise ErroFFmpeg(f"FFmpeg terminou com código {codigo}: " + " | ".join(ultimas_linhas)[-600:])
    # As linhas de loudness vão no fim: quem procura o resumo (ler_loudness) pega a última ocorrência
    return "\n".join([*ultimas_linhas, *linhas_de_loudness])
