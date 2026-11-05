# Uma predefinição XMP vira a cor da aba Cor (core/modelos/xmp.py): o mesmo exemplo e os mesmos números do teste do
# leitor do navegador (apps/web/src/lib/album/estilos.test.ts)
import pytest

from core.modelos.xmp import cor_do_xmp

XMP = """<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description crs:Version="15.0"
    crs:Exposure2012="+0.50" crs:Contrast2012="+40" crs:Highlights2012="-60" crs:Shadows2012="+30" crs:Vibrance="+20"
    crs:Saturation="-10" crs:IncrementalTemperature="+15" crs:PostCropVignetteAmount="-25"
    crs:HueAdjustmentOrange="-8" crs:SaturationAdjustmentBlue="-40" crs:LuminanceAdjustmentGreen="+20"
    crs:SplitToningShadowHue="210" crs:SplitToningShadowSaturation="20" crs:ColorGradeHighlightHue="45"
    crs:ColorGradeHighlightSat="15">
    <crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 20</rdf:li><rdf:li>128, 132</rdf:li><rdf:li>255, 245</rdf:li></rdf:Seq>
    </crs:ToneCurvePV2012>
    <crs:ToneCurvePV2012Red><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012Red>
    </rdf:Description></rdf:RDF></x:xmpmeta>"""


def test_cor_do_xmp_igual_a_do_navegador():
    cor = cor_do_xmp(XMP)
    assert {k: cor[k] for k in ("exposicao", "contraste", "realces", "sombras", "vibracao", "saturacao",
                                "temperatura", "vinheta")} == {
        "exposicao": 0.5, "contraste": 0.2, "realces": -0.6, "sombras": 0.3, "vibracao": 0.2, "saturacao": -0.1,
        "temperatura": 0.15, "vinheta": 0.25}
    assert cor["hsl"] == {"laranja": {"matiz": -0.08, "saturacao": 0, "luminancia": 0},
                          "verde": {"matiz": 0, "saturacao": 0, "luminancia": 0.2},
                          "azul": {"matiz": 0, "saturacao": -0.4, "luminancia": 0}}
    assert [cor[k] for k in ("matiz_escuros", "forca_escuros", "matiz_claros", "forca_claros")] == [210, 0.2, 45, 0.15]
    assert cor["curvas"]["rgb"] == [[0, 0.078], [0.502, 0.518], [1, 0.961]]
    assert cor["curvas"]["r"] == [[0, 0], [1, 1]]
    with pytest.raises(ValueError):
        cor_do_xmp("<html></html>")
