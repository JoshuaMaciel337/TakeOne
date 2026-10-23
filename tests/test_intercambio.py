# A linha do tempo em XML de intercâmbio: estrutura, quadros, velocidade, volume, transição e marcadores.
# Com o OpenTimelineIO e o adaptador dele instalados, o XML também é lido por eles (leitura independente).
import xml.etree.ElementTree as ET

import pytest

from core.utils.intercambio import NIVEL_MAXIMO, montar_xmeml

S = 254_016_000_000
FULL_HD, UHD = {"largura": 1920, "altura": 1080}, {"largura": 3840, "altura": 2160}
MIDIAS = {
    "v1": {"nome": "Entrevista", "arquivo": "entrevista.mp4", "duracao": 20.0, "video": FULL_HD, "audio": True},
    "v2": {"nome": "Cidade", "arquivo": "cidade à noite.mov", "duracao": 8.0, "video": UHD, "audio": True},
    "foto": {"nome": "Logo", "arquivo": "logo.png", "duracao": None, "video": {"largura": 400, "altura": 400},
             "audio": False, "imagem": True},
    "musica": {"nome": "Trilha", "arquivo": "trilha.mp3", "duracao": 60.0, "video": None, "audio": True},
}


def _clipe(id_, midia, inicio, duracao, entrada=0.0, **extra):
    return {"id": id_, "midia_id": midia, "inicio": round(inicio * S), "duracao": round(duracao * S),
            "entrada": round(entrada * S), "velocidade": 1, "volume": 1, **extra}


def _projeto(taxa=(30, 1)):
    taxa_do_projeto = {"num": taxa[0], "den": taxa[1]}
    return {"nome": "Teste", "proporcao": "16:9", "taxa": taxa_do_projeto, "duracao": 10 * S, "faixas": [
        {"id": "t", "tipo": "texto", "clipes": [
            {"id": "x", "midia_id": None, "texto": {"conteudo": "Olá mundo"}, "inicio": S, "duracao": 2 * S}]},
        {"id": "o", "tipo": "video", "clipes": [_clipe("l", "foto", 0, 10)]},
        {"id": "p", "tipo": "principal", "clipes": [
            _clipe("a", "v1", 0, 4, 5, transicao={"tipo": "fusao", "duracao": round(0.6 * S)}),
            _clipe("b", "v2", 4, 3, 1, velocidade=2), _clipe("d", "v1", 7, 3, 12)]},
        {"id": "m", "tipo": "audio", "muda": False, "clipes": [_clipe("t1", "musica", 0, 10, 2, volume=0.5)]},
    ]}


def _arvore(projeto):
    xml = montar_xmeml(projeto, MIDIAS)
    assert xml.startswith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n')
    return ET.fromstring(xml.split("\n", 2)[2])


def test_sequencia_tem_as_faixas_de_baixo_para_cima_e_os_quadros_certos():
    raiz = _arvore(_projeto())
    sequencia = raiz.find("sequence")
    assert raiz.get("version") == "4"
    assert sequencia.findtext("rate/timebase") == "30" and sequencia.findtext("rate/ntsc") == "FALSE"
    assert sequencia.findtext("duration") == "300"
    assert sequencia.findtext("media/video/format/samplecharacteristics/width") == "1920"
    faixas = sequencia.findall("media/video/track")
    assert [len(f.findall("clipitem")) for f in faixas] == [3, 1], "a principal primeiro, depois a sobreposição"
    a, b, d = faixas[0].findall("clipitem")
    assert [a.findtext(k) for k in ("start", "end", "in", "out")] == ["0", "120", "150", "270"]
    # A 2×: na linha, 90 quadros; na mídia, 180, com o filtro de velocidade em 200%
    assert [b.findtext(k) for k in ("start", "end", "in", "out")] == ["120", "210", "30", "210"]
    velocidade = b.find("filter/effect[effectid='timeremap']/parameter[parameterid='speed']")
    assert velocidade.findtext("value") == "200.0"
    assert d.findtext("in") == "360"
    # O arquivo completo só na primeira vez; depois, a referência pelo id
    assert a.find("file/pathurl").text == "file://localhost/midias/entrevista.mp4"
    assert d.find("file").get("id") == a.find("file").get("id") and d.find("file/pathurl") is None
    assert b.find("file/pathurl").text == "file://localhost/midias/cidade%20%C3%A0%20noite.mov"
    # A imagem dura o clipe
    logo = faixas[1].find("clipitem")
    assert logo.find("file/duration").text == "300" and logo.findtext("out") == "300"


def test_transicao_volume_e_marcadores():
    sequencia = _arvore(_projeto()).find("sequence")
    transicao = sequencia.find("media/video/track/transitionitem")
    assert (transicao.findtext("start"), transicao.findtext("end")) == ("111", "129"), "0,6 s centrados no corte"
    assert transicao.findtext("effect/effectid") == "Cross Dissolve"
    trilhas = sequencia.findall("media/audio/track")
    assert [len(t.findall("clipitem")) for t in trilhas] == [3, 1], "o som da principal e a música"
    musica = trilhas[1].find("clipitem")
    nivel = musica.find("filter/effect[effectid='audiolevels']/parameter")
    assert float(nivel.findtext("value")) == 0.5 and float(nivel.findtext("valuemax")) == NIVEL_MAXIMO
    assert musica.findtext("in") == "60"
    marcador = sequencia.find("marker")
    assert (marcador.findtext("name"), marcador.findtext("in"), marcador.findtext("out")) == ("Olá mundo", "30", "90")


def test_marcadores_da_regua_viram_pontos():
    projeto = {**_projeto(), "marcadores": [{"id": "b", "t": 5 * S, "nome": "Final", "cor": "#ffd400"},
                                           {"id": "a", "t": round(1.5 * S), "nome": "Meio", "cor": "#ff624a"}]}
    pontos = [m for m in _arvore(projeto).find("sequence").findall("marker") if m.findtext("out") == "-1"]
    assert [(m.findtext("name"), m.findtext("in")) for m in pontos] == [("Meio", "45"), ("Final", "150")]


def test_faixa_muda_sai_desligada_e_taxa_ntsc_e_marcada():
    projeto = _projeto((30000, 1001))
    projeto["faixas"][3]["muda"] = True
    sequencia = _arvore(projeto).find("sequence")
    assert sequencia.findtext("rate/timebase") == "30" and sequencia.findtext("rate/ntsc") == "TRUE"
    musica = sequencia.findall("media/audio/track")[1].find("clipitem")
    assert musica.findtext("enabled") == "FALSE"
    assert float(musica.find("filter/effect/parameter").findtext("value")) == 0



def test_faixa_de_video_oculta_sai_sem_som():
    # No TakeOne, esconder a principal também tira o som dela: no XML, o áudio dela sai desligado e no zero
    projeto = _projeto()
    projeto["faixas"][2]["oculta"] = True
    sequencia = _arvore(projeto).find("sequence")
    som_da_principal = sequencia.findall("media/audio/track")[0].findall("clipitem")
    assert som_da_principal and all(item.findtext("enabled") == "FALSE" for item in som_da_principal)
    musica = sequencia.findall("media/audio/track")[1].find("clipitem")
    assert musica.findtext("enabled") == "TRUE"

def test_leitura_independente_pelo_opentimelineio():
    otio = pytest.importorskip("opentimelineio")
    pytest.importorskip("otio_fcp_adapter")
    linha = otio.adapters.read_from_string(montar_xmeml(_projeto(), MIDIAS), "fcp_xml")
    videos = [t for t in linha.tracks if t.kind == "Video"]
    clipes = [c for c in videos[0] if isinstance(c, otio.schema.Clip)]
    lidos = [(videos[0].range_of_child(c).start_time.to_frames(), c.source_range.start_time.to_frames())
             for c in clipes]
    assert lidos == [(0, 150), (120, 30), (210, 360)]
    transicao = next(c for c in videos[0] if isinstance(c, otio.schema.Transition))
    assert (transicao.in_offset.to_frames(), transicao.out_offset.to_frames()) == (9, 9)
    assert [m.name for m in linha.tracks.markers] == ["Olá mundo"]
