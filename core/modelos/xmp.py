# -----------------------------------------------
# TakeOne — as predefinições XMP de outros programas de fotos (onda 16.7), em Python: a conta de corDoXmp
# (apps/web/src/lib/album/estilos.ts), para ler o .xmp ao lado das fotos importadas "no lugar" e ensinar o estilo
# pessoal. Só os campos de revelação que têm par na aba Cor; os testes dos dois lados usam o mesmo exemplo.
# -----------------------------------------------
import math
import re

LIMITES = {"exposicao": (-2, 2), "contraste": (-1, 1), "realces": (-1, 1), "sombras": (-1, 1), "brancos": (-1, 1),
           "pretos": (-1, 1), "nevoa": (-1, 1), "vibracao": (-1, 1), "saturacao": (-1, 1), "temperatura": (-1, 1),
           "tom": (-1, 1)}
CAMPOS = (("Exposure2012", "exposicao", 1), ("Contrast2012", "contraste", 0.005), ("Highlights2012", "realces", 0.01),
          ("Shadows2012", "sombras", 0.01), ("Whites2012", "brancos", 0.01), ("Blacks2012", "pretos", 0.01),
          ("Dehaze", "nevoa", 0.01), ("Vibrance", "vibracao", 0.01), ("Saturation", "saturacao", 0.01),
          ("IncrementalTemperature", "temperatura", 0.01), ("IncrementalTint", "tom", 0.01))
FAIXAS = (("Red", "vermelho"), ("Orange", "laranja"), ("Yellow", "amarelo"), ("Green", "verde"), ("Aqua", "ciano"),
          ("Blue", "azul"), ("Purple", "roxo"), ("Magenta", "magenta"))
RODAS = ((("ColorGradeShadowHue", "SplitToningShadowHue"), "matiz_escuros", "forca_escuros"),
         (("ColorGradeMidtoneHue",), "matiz_medios", "forca_medios"),
         (("ColorGradeHighlightHue", "SplitToningHighlightHue"), "matiz_claros", "forca_claros"))


def _arredondar(valor: float) -> float:
    # Math.round(v * 1000) / 1000 do JavaScript
    return math.floor(valor * 1000 + 0.5) / 1000


def _campo(texto: str, nome: str) -> float | None:
    m = re.search(rf'crs:{nome}\s*=\s*"([^"]*)"', texto) or re.search(rf"<crs:{nome}>([^<]*)</crs:{nome}>", texto)
    if not m:
        return None
    try:
        valor = float(m.group(1).strip().lstrip("+"))
    except ValueError:
        return None
    return valor if math.isfinite(valor) else None


def _curva(texto: str, nome: str) -> list[list[float]] | None:
    bloco = re.search(rf"<crs:{nome}>([\s\S]*?)</crs:{nome}>", texto)
    if not bloco:
        return None
    pontos = [[float(x) / 255, float(y) / 255]
              for x, y in re.findall(r"<rdf:li>\s*([\d.]+)\s*,\s*([\d.]+)\s*</rdf:li>", bloco.group(1))]
    if len(pontos) < 2 or all(abs(x - y) < 1e-3 for x, y in pontos):
        return None
    if len(pontos) > 16:
        pontos = [pontos[math.floor(i * (len(pontos) - 1) / 15 + 0.5)] for i in range(16)]
    return [[_arredondar(x), _arredondar(y)] for x, y in pontos]


def cor_do_xmp(texto: str) -> dict:
    """A cor (os campos da aba Cor) de uma predefinição XMP. ValueError se o arquivo não tiver os ajustes."""
    if not re.search(r"crs:|camera-raw-settings", texto, re.IGNORECASE):
        raise ValueError("O arquivo não tem os ajustes de revelação de uma predefinição XMP.")
    cor: dict = {}
    for campo, chave, escala in CAMPOS:
        valor = _campo(texto, campo)
        if valor:
            minimo, maximo = LIMITES[chave]
            cor[chave] = _arredondar(min(maximo, max(minimo, valor * escala)))
    vinheta = _campo(texto, "PostCropVignetteAmount")
    if vinheta is not None and vinheta < 0:
        cor["vinheta"] = _arredondar(min(1, -vinheta / 100))
    hsl = {}
    for nome, faixa in FAIXAS:
        valores = [(_campo(texto, f"{tipo}Adjustment{nome}") or 0) / 100
                   for tipo in ("Hue", "Saturation", "Luminance")]
        if any(valores):
            hsl[faixa] = dict(zip(("matiz", "saturacao", "luminancia"), map(_arredondar, valores), strict=True))
    if hsl:
        cor["hsl"] = hsl
    for campos, matiz, forca in RODAS:
        for campo in campos:
            h = _campo(texto, campo)
            s = _campo(texto, campo.replace("Hue", "Sat" if campo.startswith("ColorGrade") else "Saturation"))
            if h is not None and s:
                cor[matiz] = _arredondar(h % 360)
                cor[forca] = _arredondar(min(1, s / 100))
                break
    curvas = {canal: _curva(texto, nome) for canal, nome in (("rgb", "ToneCurvePV2012"), ("r", "ToneCurvePV2012Red"),
                                                             ("g", "ToneCurvePV2012Green"),
                                                             ("b", "ToneCurvePV2012Blue"))}
    if any(curvas.values()):
        cor["curvas"] = {canal: pontos or [[0, 0], [1, 1]] for canal, pontos in curvas.items()}
    return cor
