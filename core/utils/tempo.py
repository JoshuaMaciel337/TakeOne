# -----------------------------------------------
# TakeOne — base de tempo exata (ticks)
#
# Portado do crate `time` do FilmCraft (https://github.com/storytold/filmcraft, crates/time/src/lib.rs,
# commit 5231852), licença MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team and the FilmCraft
# contributors. Textos em licencas/filmcraft. Modificado pelo TakeOne (2026): traduzido de Rust para
# Python, só com a parte que a API e o render usam.
#
# Espelha apps/web/src/lib/tempo.ts: o projeto salvo guarda tudo em ticks, e os dois lados precisam
# fazer a mesma conta.
# -----------------------------------------------
from fractions import Fraction

TICKS_POR_SEGUNDO = 254_016_000_000
# Maior posição aceita na linha do tempo (6 horas). No navegador o tick é um `number`, exato até ~9 h 50 min.
TICK_MAXIMO = 6 * 3600 * TICKS_POR_SEGUNDO

TAXA_PADRAO = (30, 1)


def taxa_valida(num: int, den: int) -> tuple[int, int]:
    """A taxa, se for positiva; senão a padrão (projeto danificado não pode dividir por zero)."""
    return (num, den) if num > 0 and den > 0 else TAXA_PADRAO


def taxa_de_fps(fps: float) -> tuple[int, int]:
    """A taxa exata mais próxima de um fps decimal, como o que o ffprobe devolve."""
    comuns = [(24000, 1001), (24, 1), (25, 1), (30000, 1001), (30, 1), (48, 1), (50, 1),
              (60000, 1001), (60, 1), (120000, 1001), (120, 1)]
    if not fps or fps <= 0:
        return TAXA_PADRAO
    for num, den in comuns:
        if abs(num / den - fps) < 0.005:
            return num, den
    fracao = Fraction(round(fps * 1000), 1000)
    return fracao.numerator, fracao.denominator


def segundos_para_ticks(segundos: float) -> int:
    return round(segundos * TICKS_POR_SEGUNDO)


def ticks_para_segundos(ticks: int) -> float:
    return ticks / TICKS_POR_SEGUNDO


def duracao_do_quadro(num: int, den: int) -> int:
    num, den = taxa_valida(num, den)
    return TICKS_POR_SEGUNDO * den // num


def quadro_em(num: int, den: int, ticks: int) -> int:
    """Índice do quadro que contém o instante (arredondado para baixo)."""
    num, den = taxa_valida(num, den)
    return ticks * num // (TICKS_POR_SEGUNDO * den)


def tick_do_quadro(num: int, den: int, quadro: int) -> int:
    num, den = taxa_valida(num, den)
    return quadro * TICKS_POR_SEGUNDO * den // num
