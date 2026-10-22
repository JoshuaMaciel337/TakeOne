# Cantos arredondados e borda: a mesma conta do shader da prévia (compositor.ts, coberturaDoCanto)
import numpy as np

from core.utils.cantos import coberturas, desenhar_cantos, tem_cantos


def test_canto_fica_de_fora_e_o_meio_fica_inteiro():
    dentro, anel = coberturas(200, 100, {"raio": 0.3, "borda": 0})
    assert dentro[0, 0] == 0 and dentro[50, 100] == 1
    # No meio da borda de cima não há arredondamento: a linha de cima é inteira
    assert dentro[0, 100] == 1
    assert not anel.any(), "sem borda não há anel"


def test_borda_e_um_anel_por_dentro_do_clipe():
    # Borda de 10% do lado menor (100): 10 pixels por dentro
    dentro, anel = coberturas(200, 100, {"raio": 0.2, "borda": 0.1, "cor": "#ff0000"})
    assert anel[50, 0] == 1 and anel[50, 9] == 1 and anel[50, 10] == 0
    assert dentro[50, 9] == 0 and dentro[50, 10] == 1
    # Juntos cobrem o retângulo arredondado de fora (o de dentro sem borda), sem buraco nem sobra
    fora, _ = coberturas(200, 100, {"raio": 0.2, "borda": 0})
    assert np.allclose(dentro + anel, fora)


def test_imagens_do_render():
    mascara, anel = desenhar_cantos(64, 32, {"raio": 0.5, "borda": 0.125, "cor": "#00ff00"})
    assert mascara.mode == "L" and mascara.size == (64, 32)
    assert anel.mode == "RGBA" and anel.getpixel((32, 1)) == (0, 255, 0, 255)
    assert desenhar_cantos(64, 32, {"raio": 0.1, "borda": 0})[1] is None
    assert tem_cantos({"cantos": {"raio": 0, "borda": 0.02}}) and not tem_cantos({"cantos": None})
