# -----------------------------------------------
# TakeOne — as legendas de um projeto em .srt e .vtt (o pacote dos cortes do Clipar, ADR 0004, 14.9)
#
# A mesma conta de legendasDasFaixas, escreverSrt e escreverVtt (apps/web/src/lib/projeto/legendas.ts): as legendas
# são os clipes de texto das faixas de legenda, em ordem, e o tempo vai em milissegundos arredondados como o
# Math.round do navegador. Funções puras.
# -----------------------------------------------
import math

from core.utils.tempo import TICKS_POR_SEGUNDO


def legendas_das_faixas(faixas: list[dict]) -> list[dict]:
    """As legendas de todas as faixas de legenda, em ordem: {inicio, fim, conteudo}, em ticks."""
    legendas = [{"inicio": clipe["inicio"], "fim": clipe["inicio"] + clipe["duracao"],
                 "conteudo": clipe["texto"]["conteudo"]}
                for faixa in faixas if faixa.get("tipo") == "legenda"
                for clipe in faixa.get("clipes") or [] if clipe.get("texto")]
    return sorted(legendas, key=lambda legenda: legenda["inicio"])


def _tempo(t: int, separador: str) -> str:
    ms = max(0, math.floor(t * 1000 / TICKS_POR_SEGUNDO + 0.5))
    horas, resto = divmod(ms, 3_600_000)
    minutos, resto = divmod(resto, 60_000)
    segundos, ms = divmod(resto, 1000)
    return f"{horas:02d}:{minutos:02d}:{segundos:02d}{separador}{ms:03d}"


def escrever_srt(legendas: list[dict]) -> str:
    return "\n".join(f"{i}\n{_tempo(legenda['inicio'], ',')} --> {_tempo(legenda['fim'], ',')}\n{legenda['conteudo']}\n"
                     for i, legenda in enumerate(legendas, 1))


def escrever_vtt(legendas: list[dict]) -> str:
    blocos = [f"{_tempo(legenda['inicio'], '.')} --> {_tempo(legenda['fim'], '.')}\n{legenda['conteudo']}\n"
              for legenda in legendas]
    return "\n".join(["WEBVTT\n", *blocos])
