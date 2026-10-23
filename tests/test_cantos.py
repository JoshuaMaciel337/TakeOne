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


def test_desenho_quadrado_cobre_como_o_retangulo_e_o_triangulo_tem_sinal_certo():
    import numpy as np

    from core.utils.cantos import cobertura_da_mascara, distancia_ao_poligono

    retangulo = {"forma": "retangulo", "x": 0.5, "y": 0.5, "largura": 0.5, "altura": 0.5, "suavidade": 0.05}
    quadrado = {"forma": "desenho", "pontos": [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
                "suavidade": 0.05}
    a, b = cobertura_da_mascara(80, 60, retangulo), cobertura_da_mascara(80, 60, quadrado)
    # Iguais longe dos cantos (nos cantos o retângulo arredonda a distância por fora, como o desenho)
    assert np.abs(a - b).max() < 1e-6
    triangulo = distancia_ao_poligono(100, 100, [[0.1, 0.9], [0.5, 0.1], [0.9, 0.9]])
    assert triangulo[60, 50] < 0 and triangulo[5, 5] > 0 and abs(triangulo[95, 50] - 5.5) < 1e-6
    invertido = cobertura_da_mascara(80, 60, {**quadrado, "inverter": True})
    assert invertido[30, 40] == 0 and invertido[2, 2] == 1
    assert cobertura_da_mascara(80, 60, {"forma": "desenho", "pontos": [[0, 0], [1, 1]]}) == 1.0


def test_desenho_conta_como_mascara_no_render():
    from core.utils.cantos import tem_mascara

    assert tem_mascara({"mascara": {"forma": "desenho", "pontos": [[0, 0], [1, 0], [0, 1]]}})
    assert not tem_mascara({"mascara": {"forma": "desenho", "pontos": [[0, 0]]}})
