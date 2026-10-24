"""As fontes que o espaço envia para o editor de imagem (ADR 0003, onda 13.8). O arquivo (TrueType ou OpenType) é
aberto pelo FreeType do Pillow, que confere se é uma fonte e dá o nome da família e o do estilo; o peso e o itálico
vêm da tabela OS/2 (usWeightClass e fsSelection) e os eixos da variável da tabela fvar, lidas aqui direto do arquivo."""

import io
import struct

from PIL import ImageFont

BYTES_MAXIMOS = 10 * 1024 * 1024
EXTENSOES = {".ttf": "font/ttf", ".otf": "font/otf"}


class ErroFonte(ValueError):
    pass


def _tabelas(dados: bytes) -> dict[str, tuple[int, int]]:
    """O diretório de tabelas do sfnt: etiqueta -> (posição, tamanho)."""
    if len(dados) < 12:
        raise ErroFonte("O arquivo não é uma fonte.")
    versao = dados[:4]
    if versao not in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
        raise ErroFonte("Envie uma fonte TrueType (.ttf) ou OpenType (.otf).")
    (quantas,) = struct.unpack(">H", dados[4:6])
    tabelas = {}
    for i in range(quantas):
        inicio = 12 + 16 * i
        if inicio + 16 > len(dados):
            raise ErroFonte("O arquivo da fonte está cortado.")
        etiqueta, _soma, posicao, tamanho = struct.unpack(">4sIII", dados[inicio:inicio + 16])
        if posicao + tamanho > len(dados):
            raise ErroFonte("O arquivo da fonte está cortado.")
        tabelas[etiqueta.decode("latin-1")] = (posicao, tamanho)
    return tabelas


def _eixos(dados: bytes, tabelas: dict) -> list[str]:
    if "fvar" not in tabelas:
        return []
    posicao, tamanho = tabelas["fvar"]
    fvar = dados[posicao:posicao + tamanho]
    if len(fvar) < 16:
        return []
    _maior, _menor, deslocamento, _reservado, quantos, tamanho_do_eixo = struct.unpack(">HHHHHH", fvar[:12])
    eixos = []
    for i in range(quantos):
        inicio = deslocamento + i * tamanho_do_eixo
        if inicio + 4 > len(fvar):
            break
        eixos.append(fvar[inicio:inicio + 4].decode("latin-1"))
    return eixos


def ler_fonte(dados: bytes) -> dict:
    """A família, o estilo, o peso (100 a 900), o itálico e os eixos da variável; ErroFonte quando não é uma fonte."""
    if len(dados) > BYTES_MAXIMOS:
        raise ErroFonte("O arquivo passa de 10 MB.")
    tabelas = _tabelas(dados)
    try:
        fonte = ImageFont.truetype(io.BytesIO(dados), 20)
        familia, estilo = fonte.getname()
    except OSError as e:
        raise ErroFonte("O arquivo não é uma fonte que dê para abrir.") from e
    peso = 400
    italico = "italic" in (estilo or "").lower() or "oblique" in (estilo or "").lower()
    if "OS/2" in tabelas:
        posicao, tamanho = tabelas["OS/2"]
        if tamanho >= 64:
            (classe,) = struct.unpack(">H", dados[posicao + 4:posicao + 6])
            (selecao,) = struct.unpack(">H", dados[posicao + 62:posicao + 64])
            if 1 <= classe <= 1000:
                peso = min(900, max(100, int(round(classe / 100.0)) * 100))
            italico = italico or bool(selecao & 0b1)
    return {"familia": (familia or "Fonte").strip()[:80], "estilo": (estilo or "").strip()[:80], "peso": peso,
            "italico": italico, "eixos": _eixos(dados, tabelas)}
