# -----------------------------------------------
# TakeOne — formas (retângulo, círculo, seta, estrela, balão...) desenhadas em PNG transparente
#
# Cada forma vira uma imagem da biblioteca, como as animações: o clipe dela usa o caminho das imagens
# paradas, então prévia e render mostram o mesmo arquivo, e keyframes, animações, efeitos e "Seguir um
# objeto" já funcionam. O desenho é feito no dobro do tamanho e reduzido (o Pillow não suaviza bordas).
# O contorno fica todo por dentro da forma, com a mesma espessura em toda a volta. Nas formas simples
# (retângulos, elipse, linha) são duas camadas: a forma na cor do contorno e, por cima, a forma recuada na
# cor do preenchimento (ou transparente, quando a forma é vazada). Nos polígonos (triângulo, estrela,
# seta, coração, balão) o contorno é uma linha grossa sobre a borda, cortada pela própria forma.
# -----------------------------------------------
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from core.utils.gradiente import imagem_do_degrade

TIPOS = ("retangulo", "arredondado", "elipse", "triangulo", "estrela", "seta", "linha", "balao", "coracao")
# As formas que esticam com a proporção (as outras ficam com a proporção do desenho)
ESTICAM = {"retangulo", "arredondado", "elipse", "seta", "linha", "balao"}
LADO_MAIOR = 2048
SUPERAMOSTRA = 2
# Folga em volta da forma, em fração do lado menor: as bordas suavizadas não encostam na beira do PNG
FOLGA = 0.02
PROPORCAO_PADRAO = {"linha": 12.0, "seta": 2.5, "balao": 1.4}


def _cor(texto: str, alfa: int = 255) -> tuple[int, int, int, int]:
    texto = texto.lstrip("#")
    return int(texto[0:2], 16), int(texto[2:4], 16), int(texto[4:6], 16), alfa


def _poligono(tipo: str, x0: float, y0: float, x1: float, y1: float) -> list[tuple[float, float]]:
    """O contorno da forma dentro da caixa, no sentido horário."""
    largura, altura = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if tipo == "triangulo":
        return [(cx, y0), (x1, y1), (x0, y1)]
    if tipo == "estrela":
        pontos = []
        for k in range(10):
            raio = 1.0 if k % 2 == 0 else 0.4
            angulo = -math.pi / 2 + k * math.pi / 5
            pontos.append((cx + raio * largura / 2 * math.cos(angulo), cy + raio * altura / 2 * math.sin(angulo)))
        # A estrela regular não enche a caixa embaixo: desce o centro para ocupar a altura toda
        baixo = max(y for _, y in pontos)
        return [(x, y + (y1 - baixo) / 2) for x, y in pontos]
    if tipo == "seta":
        cabeca = min(largura * 0.45, altura * 1.0)
        haste = altura * 0.42
        return [(x0, cy - haste / 2), (x1 - cabeca, cy - haste / 2), (x1 - cabeca, y0), (x1, cy),
                (x1 - cabeca, y1), (x1 - cabeca, cy + haste / 2), (x0, cy + haste / 2)]
    if tipo == "coracao":
        pontos = []
        for k in range(120):
            t = 2 * math.pi * k / 120
            x = 16 * math.sin(t) ** 3
            y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
            pontos.append((x, y))
        xs, ys = [p[0] for p in pontos], [p[1] for p in pontos]
        menor_x, maior_x, menor_y, maior_y = min(xs), max(xs), min(ys), max(ys)
        return [(x0 + (x - menor_x) / (maior_x - menor_x) * largura, y0 + (y - menor_y) / (maior_y - menor_y) * altura)
                for x, y in pontos]
    raise ValueError(tipo)


def _cantos_arredondados(x0: float, y0: float, x1: float, y1: float, raio: float) -> list[tuple[float, float]]:
    """O retângulo arredondado como polígono, no sentido horário, a partir do canto de cima à esquerda."""
    pontos = []
    for cx, cy, inicio in ((x1 - raio, y0 + raio, -90), (x1 - raio, y1 - raio, 0), (x0 + raio, y1 - raio, 90),
                           (x0 + raio, y0 + raio, 180)):
        for k in range(17):
            angulo = math.radians(inicio + 90 * k / 16)
            pontos.append((cx + raio * math.cos(angulo), cy + raio * math.sin(angulo)))
    return pontos


def _balao(x0: float, y0: float, x1: float, y1: float) -> list[tuple[float, float]]:
    """O balão de fala num polígono só: o corpo arredondado com a ponta emendada embaixo, à esquerda."""
    largura, altura = x1 - x0, y1 - y0
    base = y0 + altura * 0.78
    raio = min(largura, base - y0) * 0.22
    corpo = _cantos_arredondados(x0, y0, x1, base, raio)
    # Os cantos têm 17 pontos cada; o terceiro (embaixo, à esquerda) começa no índice 34. A ponta entra
    # entre o fim do canto de baixo à direita e esse, na base reta, sem encostar na curva do canto.
    esquerda = x0 + max(largura * 0.18, raio * 1.05)
    direita = min(esquerda + largura * 0.18, x1 - raio * 1.05)
    ponta = [(direita, base), (x0 + largura * 0.12, y1), (esquerda, base)]
    return corpo[:34] + ponta + corpo[34:]


def _poligono_da_forma(tipo: str, caixa: tuple[float, float, float, float]) -> list[tuple[float, float]] | None:
    """O polígono das formas que não são desenhadas direto pelo Pillow."""
    if tipo == "balao":
        return _balao(*caixa)
    if tipo in ("triangulo", "estrela", "seta", "coracao"):
        return _poligono(tipo, *caixa)
    return None


def _desenhar_simples(desenho: ImageDraw.ImageDraw, tipo: str, caixa: tuple[float, float, float, float], cor,
                      recuo: float):
    """Retângulo, retângulo arredondado, elipse e linha: o recuo é exato com as primitivas do Pillow."""
    x0, y0, x1, y1 = (caixa[0] + recuo, caixa[1] + recuo, caixa[2] - recuo, caixa[3] - recuo)
    if x1 - x0 <= 1 or y1 - y0 <= 1:
        return
    menor = min(caixa[2] - caixa[0], caixa[3] - caixa[1])
    if tipo == "retangulo":
        desenho.rectangle((x0, y0, x1, y1), fill=cor)
    elif tipo in ("arredondado", "linha"):
        raio = (menor / 2 if tipo == "linha" else menor * 0.18) - recuo
        desenho.rounded_rectangle((x0, y0, x1, y1), radius=max(0.0, raio), fill=cor)
    else:
        desenho.ellipse((x0, y0, x1, y1), fill=cor)


def desenhar_forma(forma: dict) -> Image.Image:
    """
    forma: {tipo, cor (ou None, vazada), contorno_cor, contorno (espessura em fração do lado menor),
    proporcao (largura/altura, só nas que esticam), degrade (o preenchimento em degradê, sobre a caixa da forma,
    no lugar da cor)}. Devolve a imagem RGBA com o lado maior em LADO_MAIOR.
    """
    tipo = forma["tipo"]
    if tipo not in TIPOS:
        raise ValueError(f"Forma desconhecida: {tipo}")
    proporcao = float(forma.get("proporcao") or PROPORCAO_PADRAO.get(tipo, 1.0)) if tipo in ESTICAM else 1.0
    if tipo == "coracao":
        proporcao = 1.1
    proporcao = min(max(proporcao, 0.05), 20.0)
    largura = LADO_MAIOR if proporcao >= 1 else max(8, round(LADO_MAIOR * proporcao))
    altura = LADO_MAIOR if proporcao < 1 else max(8, round(LADO_MAIOR / proporcao))
    escala = SUPERAMOSTRA
    grande = (largura * escala, altura * escala)
    menor = min(grande)
    folga = FOLGA * menor
    espessura = max(0.0, float(forma.get("contorno") or 0)) * menor
    cor = forma.get("cor")
    cor_contorno = forma.get("contorno_cor") or "#000000"
    if not cor and espessura <= 0:
        raise ValueError("Uma forma vazada precisa de contorno.")
    # O fundo transparente leva a cor da borda, para a redução não escurecer a beira
    base = _cor(cor_contorno if espessura > 0 else cor, 0)
    imagem = Image.new("RGBA", grande, base)
    caixa = (folga, folga, grande[0] - folga, grande[1] - folga)
    poligono = _poligono_da_forma(tipo, caixa)
    degrade = imagem_do_degrade(forma["degrade"], grande[0], grande[1], caixa) if cor and forma.get("degrade") else None
    if poligono is None:
        desenho = ImageDraw.Draw(imagem)
        if espessura > 0:
            _desenhar_simples(desenho, tipo, caixa, _cor(cor_contorno), 0)
            # Por cima, a forma recuada: o preenchimento, ou o transparente que vaza o meio
            _desenhar_simples(desenho, tipo, caixa, _cor(cor) if cor else base, espessura)
        else:
            _desenhar_simples(desenho, tipo, caixa, _cor(cor), 0)
        if degrade is not None:
            # O degradê só no preenchimento (a forma recuada pelo contorno)
            miolo = Image.new("L", grande, 0)
            _desenhar_simples(ImageDraw.Draw(miolo), tipo, caixa, 255, espessura)
            imagem.paste(degrade, mask=miolo)
    else:
        # A forma é a máscara; o contorno é uma linha com o dobro da espessura sobre a borda, cortada pela
        # máscara: sobra a metade de dentro, igual em toda a volta, até nas pontas
        mascara = Image.new("L", grande, 0)
        ImageDraw.Draw(mascara).polygon(poligono, fill=255)
        if cor:
            imagem.paste(degrade if degrade is not None else _cor(cor), mask=mascara)
        if espessura > 0:
            linha = Image.new("L", grande, 0)
            # Fecha o contorno passando de novo pelo segundo ponto, para a primeira quina também ser redonda
            ImageDraw.Draw(linha).line([*poligono, poligono[0], poligono[1]], fill=255,
                                       width=max(1, round(2 * espessura)), joint="curve")
            imagem.paste(_cor(cor_contorno), mask=ImageChops.multiply(linha, mascara))
    return imagem.resize((largura, altura), Image.Resampling.LANCZOS)


def gravar_forma(forma: dict, destino: Path) -> None:
    desenhar_forma(forma).save(destino, "PNG")
