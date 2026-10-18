# Formas desenhadas em PNG: tamanho, preenchimento, contorno por dentro e forma vazada
import pytest

from core.utils.forma import LADO_MAIOR, TIPOS, desenhar_forma

LARANJA, BRANCO = (255, 98, 74), (255, 255, 255)


def _perto(cor, esperada, folga=6):
    return all(abs(a - b) <= folga for a, b in zip(cor[:3], esperada, strict=True))


@pytest.mark.parametrize("tipo", TIPOS)
def test_toda_forma_tem_o_meio_cheio_e_os_cantos_transparentes(tipo):
    imagem = desenhar_forma({"tipo": tipo, "cor": "#ff624a"})
    assert max(imagem.size) == LADO_MAIOR and imagem.mode == "RGBA"
    largura, altura = imagem.size
    assert imagem.getpixel((2, 2))[3] == 0 and imagem.getpixel((largura - 3, altura - 3))[3] == 0
    # O meio é cheio (no balão, o meio do corpo; na estrela e no coração, um pouco abaixo do centro)
    meio = imagem.getpixel((largura // 2, round(altura * (0.4 if tipo == "balao" else 0.55))))
    assert meio[3] == 255 and _perto(meio, LARANJA), (tipo, meio)


def test_proporcao_estica_so_as_formas_que_esticam():
    assert desenhar_forma({"tipo": "retangulo", "cor": "#ff624a", "proporcao": 2}).size == (2048, 1024)
    assert desenhar_forma({"tipo": "elipse", "cor": "#ff624a", "proporcao": 0.5}).size == (1024, 2048)
    assert desenhar_forma({"tipo": "estrela", "cor": "#ff624a", "proporcao": 3}).size == (2048, 2048)
    assert desenhar_forma({"tipo": "linha", "cor": "#ff624a"}).size == (2048, 171), "a linha nasce fina"


@pytest.mark.parametrize("tipo", ["retangulo", "triangulo", "estrela"])
def test_contorno_fica_por_dentro_com_a_espessura_pedida(tipo):
    imagem = desenhar_forma({"tipo": tipo, "cor": "#ff624a", "contorno_cor": "#ffffff", "contorno": 0.1})
    largura, altura = imagem.size
    # Subindo pelo meio a partir da base: transparente, depois o contorno (uns 10% da altura), depois a cor
    coluna = [imagem.getpixel((largura // 2, y)) for y in range(altura - 1, altura // 2, -1)]
    inicio = next(i for i, c in enumerate(coluna) if c[3] > 250)
    fim = next(i for i, c in enumerate(coluna[inicio:], inicio) if _perto(c, LARANJA, 20))
    assert all(_perto(c, BRANCO, 20) for c in coluna[inicio + 3:fim - 3])
    assert abs((fim - inicio) - 0.1 * altura) < 0.02 * altura, (tipo, fim - inicio)


def test_forma_vazada_tem_o_meio_transparente():
    imagem = desenhar_forma({"tipo": "coracao", "cor": None, "contorno_cor": "#ffffff", "contorno": 0.05})
    largura, altura = imagem.size
    assert imagem.getpixel((largura // 2, altura // 2))[3] == 0
    with pytest.raises(ValueError, match="contorno"):
        desenhar_forma({"tipo": "elipse", "cor": None, "contorno": 0})
    with pytest.raises(ValueError):
        desenhar_forma({"tipo": "hexagono", "cor": "#ff624a"})
