# -----------------------------------------------
# TakeOne — a linha do tempo em XML de intercâmbio (xmeml versão 4), para abrir em outros editores
#
# O formato clássico que os editores profissionais importam: uma sequência com as faixas de vídeo (de
# baixo para cima: a principal primeiro, depois as sobreposições) e de áudio, cada clipe com o arquivo
# de origem, o trecho usado, a velocidade e o volume. As transições viram fusões centradas no corte; os
# textos e as legendas viram marcadores com o conteúdo. Posição, cor, efeitos e animações ficam de fora:
# cada editor faz essas contas do seu jeito, e uma posição pela metade poria as sobreposições no lugar
# errado. Os tempos vão em quadros da taxa do projeto. Funções puras.
# -----------------------------------------------
import xml.etree.ElementTree as ET
from urllib.parse import quote

from core.modelos.exportacao import tamanho_de_saida
from core.utils.tempo import TICKS_POR_SEGUNDO

# O volume do clipe no filtro de nível de áudio do formato: ganho linear, de 0 a +12 dB
NIVEL_MAXIMO = 3.98109
TAXA_DO_SOM = 48000


def _quadros(ticks: int, num: int, den: int) -> int:
    return round(ticks * num / (den * TICKS_POR_SEGUNDO))


def _texto(pai: ET.Element, nome: str, valor) -> ET.Element:
    filho = ET.SubElement(pai, nome)
    filho.text = str(valor)
    return filho


def _taxa(pai: ET.Element, num: int, den: int):
    taxa = ET.SubElement(pai, "rate")
    _texto(taxa, "timebase", round(num / den))
    _texto(taxa, "ntsc", "TRUE" if den == 1001 else "FALSE")


def _filtro(pai: ET.Element, nome: str, efeito: str, tipo: str, midia: str,
            parametros: list[tuple[str, str, float, float, float]]):
    filtro = ET.SubElement(pai, "filter")
    efeito_xml = ET.SubElement(filtro, "effect")
    _texto(efeito_xml, "name", nome)
    _texto(efeito_xml, "effectid", efeito)
    _texto(efeito_xml, "effectcategory", tipo)
    _texto(efeito_xml, "effecttype", tipo)
    _texto(efeito_xml, "mediatype", midia)
    for parametro_id, rotulo, minimo, maximo, valor in parametros:
        parametro = ET.SubElement(efeito_xml, "parameter")
        _texto(parametro, "parameterid", parametro_id)
        _texto(parametro, "name", rotulo)
        _texto(parametro, "valuemin", minimo)
        _texto(parametro, "valuemax", maximo)
        _texto(parametro, "value", round(valor, 5))


class _Arquivos:
    """O <file> completo na primeira vez que a mídia aparece; depois, só a referência pelo id."""

    def __init__(self, midias: dict, num: int, den: int):
        self.midias, self.num, self.den = midias, num, den
        self.ids: dict[str, str] = {}

    def no(self, pai: ET.Element, midia_id: str, duracao_do_clipe: int) -> None:
        if midia_id in self.ids:
            ET.SubElement(pai, "file", id=self.ids[midia_id])
            return
        self.ids[midia_id] = f"arquivo-{len(self.ids) + 1}"
        midia = self.midias[midia_id]
        arquivo = ET.SubElement(pai, "file", id=self.ids[midia_id])
        _texto(arquivo, "name", midia["arquivo"])
        _texto(arquivo, "pathurl", "file://localhost/midias/" + quote(midia["arquivo"]))
        _taxa(arquivo, self.num, self.den)
        # Imagem parada não tem fim: o arquivo dura o que o clipe dura
        duracao = (duracao_do_clipe if midia.get("imagem")
                   else round(float(midia.get("duracao") or 0) * self.num / self.den))
        _texto(arquivo, "duration", max(1, duracao))
        conteudo = ET.SubElement(arquivo, "media")
        if midia.get("video"):
            caracteristicas = ET.SubElement(ET.SubElement(conteudo, "video"), "samplecharacteristics")
            _texto(caracteristicas, "width", midia["video"]["largura"])
            _texto(caracteristicas, "height", midia["video"]["altura"])
        if midia.get("audio"):
            _texto(ET.SubElement(conteudo, "audio"), "channelcount", 2)


def _clipe(pai: ET.Element, clipe: dict, midia: dict, arquivos: _Arquivos, num: int, den: int, tipo: str,
           ativo: bool, volume: float | None) -> ET.Element:
    """Um <clipitem>: na linha do tempo de start a end, na mídia de in a out (com a velocidade)."""
    velocidade = 1.0 if midia.get("imagem") else float(clipe.get("velocidade") or 1)
    inicio = _quadros(clipe["inicio"], num, den)
    fim = _quadros(clipe["inicio"] + clipe["duracao"], num, den)
    entrada = 0 if midia.get("imagem") else _quadros(clipe.get("entrada") or 0, num, den)
    saida = entrada + round((fim - inicio) * velocidade)
    item = ET.SubElement(pai, "clipitem", id=f"{tipo}-{clipe['id']}")
    _texto(item, "name", midia["nome"])
    _texto(item, "enabled", "TRUE" if ativo else "FALSE")
    duracao_da_midia = round(float(midia.get("duracao") or 0) * num / den)
    _texto(item, "duration", max(saida, 1) if midia.get("imagem") else duracao_da_midia)
    _taxa(item, num, den)
    _texto(item, "start", inicio)
    _texto(item, "end", fim)
    _texto(item, "in", entrada)
    _texto(item, "out", saida)
    arquivos.no(item, clipe["midia_id"], saida)
    if tipo == "audio":
        fonte = ET.SubElement(item, "sourcetrack")
        _texto(fonte, "mediatype", "audio")
        _texto(fonte, "trackindex", 1)
    if abs(velocidade - 1) > 1e-6:
        # O filtro de velocidade do formato, com os parâmetros que ele sempre leva (a curva de velocidade vai
        # como a média: o formato só tem velocidade constante)
        _filtro(item, "Time Remap", "timeremap", "motion", "video" if tipo == "video" else "audio",
                [("variablespeed", "variablespeed", 0, 1, 0), ("speed", "speed", -100000, 100000, velocidade * 100),
                 ("reverse", "reverse", 0, 1, 0), ("frameblending", "frameblending", 0, 1, 0)])
    if volume is not None:
        _filtro(item, "Audio Levels", "audiolevels", "audiolevels", "audio",
                [("level", "Level", 0, NIVEL_MAXIMO, min(max(volume, 0.0), NIVEL_MAXIMO))])
    return item


def _transicao(pai: ET.Element, clipe: dict, num: int, den: int):
    """A transição do clipe que sai, centrada no corte, como uma fusão."""
    corte = _quadros(clipe["inicio"] + clipe["duracao"], num, den)
    metade = max(1, _quadros(clipe["transicao"]["duracao"], num, den) // 2)
    item = ET.SubElement(pai, "transitionitem")
    _taxa(item, num, den)
    _texto(item, "start", corte - metade)
    _texto(item, "end", corte + metade)
    _texto(item, "alignment", "center")
    efeito = ET.SubElement(item, "effect")
    _texto(efeito, "name", "Cross Dissolve")
    _texto(efeito, "effectid", "Cross Dissolve")
    _texto(efeito, "effectcategory", "Dissolve")
    _texto(efeito, "effecttype", "transition")
    _texto(efeito, "mediatype", "video")


def montar_xmeml(projeto: dict, midias: dict[str, dict]) -> str:
    """
    O XML da linha do tempo. midias: id → {nome, arquivo (nome do arquivo na pasta midias/), duracao,
    video {largura, altura} ou None, audio (bool), imagem (bool)}.
    """
    num, den = projeto["taxa"]["num"], projeto["taxa"]["den"]
    largura, altura = tamanho_de_saida(projeto["proporcao"], "1080p")
    raiz = ET.Element("xmeml", version="4")
    sequencia = ET.SubElement(raiz, "sequence", id="sequencia")
    _texto(sequencia, "name", projeto.get("nome") or "Projeto")
    _texto(sequencia, "duration", _quadros(projeto.get("duracao") or 0, num, den))
    _taxa(sequencia, num, den)
    codigo = ET.SubElement(sequencia, "timecode")
    _taxa(codigo, num, den)
    _texto(codigo, "string", "00:00:00:00")
    _texto(codigo, "frame", 0)
    _texto(codigo, "displayformat", "NDF")
    conteudo = ET.SubElement(sequencia, "media")
    video = ET.SubElement(conteudo, "video")
    caracteristicas = ET.SubElement(ET.SubElement(video, "format"), "samplecharacteristics")
    _taxa(caracteristicas, num, den)
    _texto(caracteristicas, "width", largura)
    _texto(caracteristicas, "height", altura)
    _texto(caracteristicas, "pixelaspectratio", "square")
    audio = ET.SubElement(conteudo, "audio")
    _texto(audio, "numOutputChannels", 2)
    formato_do_som = ET.SubElement(ET.SubElement(audio, "format"), "samplecharacteristics")
    _texto(formato_do_som, "depth", 16)
    _texto(formato_do_som, "samplerate", TAXA_DO_SOM)

    arquivos = _Arquivos(midias, num, den)
    faixas = projeto["faixas"]
    principal = [f for f in faixas if f["tipo"] == "principal"]
    sobreposicoes = [f for f in faixas if f["tipo"] == "video"][::-1]
    # Vídeo: de baixo para cima. O som dos vídeos vai em faixas de áudio próprias, uma por faixa de vídeo
    faixas_de_som: list[tuple[dict, list[dict]]] = []
    for faixa in principal + sobreposicoes:
        trilha = ET.SubElement(video, "track")
        clipes = sorted((c for c in faixa["clipes"] if c.get("midia_id") in midias), key=lambda c: c["inicio"])
        for clipe in clipes:
            _clipe(trilha, clipe, midias[clipe["midia_id"]], arquivos, num, den, "video", not faixa.get("oculta"), None)
            if clipe.get("transicao") and faixa["tipo"] == "principal":
                _transicao(trilha, clipe, num, den)
        com_som = [c for c in clipes if midias[c["midia_id"]].get("audio") and not c.get("som_separado")]
        if com_som:
            faixas_de_som.append((faixa, com_som))
    for faixa in (f for f in faixas if f["tipo"] == "audio"):
        clipes = sorted((c for c in faixa["clipes"] if c.get("midia_id") in midias), key=lambda c: c["inicio"])
        faixas_de_som.append((faixa, clipes))
    for faixa, clipes in faixas_de_som:
        trilha = ET.SubElement(audio, "track")
        # No TakeOne, esconder uma faixa de vídeo também tira o som dela (como silenciar)
        calada = faixa.get("muda") or (faixa["tipo"] != "audio" and faixa.get("oculta"))
        for clipe in clipes:
            volume = 0.0 if calada else float(clipe.get("volume", 1))
            _clipe(trilha, clipe, midias[clipe["midia_id"]], arquivos, num, den, "audio", not calada, volume)

    # Textos e legendas: marcadores com o conteúdo, onde cada um aparece
    for faixa in (f for f in faixas if f["tipo"] in ("texto", "legenda")):
        for clipe in sorted(faixa["clipes"], key=lambda c: c["inicio"]):
            conteudo_do_texto = ((clipe.get("texto") or {}).get("conteudo") or "").strip()
            if not conteudo_do_texto:
                continue
            marcador = ET.SubElement(sequencia, "marker")
            _texto(marcador, "name", " ".join(conteudo_do_texto.split())[:60])
            _texto(marcador, "comment", ("Legenda: " if faixa["tipo"] == "legenda" else "Texto: ") + conteudo_do_texto)
            _texto(marcador, "in", _quadros(clipe["inicio"], num, den))
            _texto(marcador, "out", _quadros(clipe["inicio"] + clipe["duracao"], num, den))
    # Os marcadores da régua, num instante só (out = -1, como os editores marcam um ponto)
    for marcador in sorted(projeto.get("marcadores") or [], key=lambda m: m["t"]):
        ponto = ET.SubElement(sequencia, "marker")
        _texto(ponto, "name", marcador["nome"])
        _texto(ponto, "comment", "")
        _texto(ponto, "in", _quadros(marcador["t"], num, den))
        _texto(ponto, "out", "-1")
    ET.indent(raiz, "  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + ET.tostring(raiz, encoding="unicode") + "\n"
