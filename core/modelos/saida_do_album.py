# -----------------------------------------------
# TakeOne — a saída das fotos do álbum (onda 16.10, docs/decisoes/0006-album-de-fotos.md)
#
# As contas puras da exportação: o nome de cada arquivo pelo padrão, a subpasta pela divisão (nota, cor, categoria
# ou a pasta de origem), o XMP ao lado de cada foto (a nota, a cor e os ajustes da aba Cor nos campos de revelação
# que os programas de fotos leem; a volta de core/modelos/xmp.py) e a marca d'água (texto ou logo).
# -----------------------------------------------
import math
import re
from datetime import datetime
from xml.sax.saxutils import escape

DIVISOES = ("nenhuma", "nota", "cor", "categoria", "pasta")
NOMES_DAS_CORES = {"vermelho": "Vermelho", "amarelo": "Amarelo", "verde": "Verde", "azul": "Azul", "roxo": "Roxo"}
# Os rótulos de cor que os programas de fotos entendem no XMP
ROTULOS_DO_XMP = {"vermelho": "Red", "amarelo": "Yellow", "verde": "Green", "azul": "Blue", "roxo": "Purple"}
NOMES_DAS_CATEGORIAS = {"destaque": "Destaques", "escolhida": "Escolhidas", "talvez": "Talvez",
                        "parecida": "Parecidas", "desfocada": "Desfocadas", "olhos_fechados": "Olhos fechados"}
# A volta das escalas de core/modelos/xmp.py (o valor da aba Cor dividido pela escala dá o do XMP)
CAMPOS_DO_XMP = (("exposicao", "Exposure2012", 1), ("contraste", "Contrast2012", 0.005),
                 ("realces", "Highlights2012", 0.01), ("sombras", "Shadows2012", 0.01), ("brancos", "Whites2012", 0.01),
                 ("pretos", "Blacks2012", 0.01), ("nevoa", "Dehaze", 0.01), ("vibracao", "Vibrance", 0.01),
                 ("saturacao", "Saturation", 0.01), ("temperatura", "IncrementalTemperature", 0.01),
                 ("tom", "IncrementalTint", 0.01))
_PROIBIDOS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def limpar(nome: str) -> str:
    """Um nome de arquivo ou pasta que vale em qualquer sistema."""
    limpo = _PROIBIDOS.sub("_", nome).strip(" .")
    return limpo[:120] or "foto"


def nome_do_arquivo(padrao: str, foto: dict, numero: int, album: str, extensao: str) -> str:
    """O nome pelo padrão: {original} (sem a extensão), {album}, {n} (com zeros), {data} (AAAA-MM-DD), {nota}."""
    original = foto.get("nome") or "foto"
    data = (foto.get("exif") or {}).get("data") or ""
    valores = {"original": original, "album": album, "n": f"{numero:04d}", "data": data[:10],
               "nota": str(foto.get("nota") or 0)}
    nome = re.sub(r"\{(\w+)\}", lambda m: valores.get(m.group(1), m.group(0)), padrao or "{original}")
    return f"{limpar(nome)}.{extensao}"


def subpasta(foto: dict, divisao: str) -> str:
    """A pasta dentro do ZIP pela divisão pedida ("" na raiz)."""
    if divisao == "nota":
        nota = foto.get("nota") or 0
        return f"{nota} estrela{'s' if nota != 1 else ''}" if nota else "Sem nota"
    if divisao == "cor":
        return NOMES_DAS_CORES.get(foto.get("cor") or "", "Sem cor")
    if divisao == "categoria":
        return NOMES_DAS_CATEGORIAS.get(foto.get("categoria") or "", "Sem categoria")
    if divisao == "pasta":
        return "/".join(limpar(p) for p in (foto.get("pasta") or "").split("/") if p)
    return ""


def sem_repetir(caminho: str, usados: set[str]) -> str:
    """O caminho com " (2)", " (3)"... antes da extensão quando já existe no ZIP."""
    if caminho.lower() not in usados:
        usados.add(caminho.lower())
        return caminho
    base, _, extensao = caminho.rpartition(".")
    for k in range(2, 100000):
        candidato = f"{base} ({k}).{extensao}"
        if candidato.lower() not in usados:
            usados.add(candidato.lower())
            return candidato
    raise ValueError("Nomes demais iguais.")


def xmp_da_foto(foto: dict, cor: dict | None = None) -> str:
    """O XMP ao lado da foto: a nota (xmp:Rating; rejeitada é -1), o rótulo de cor e os ajustes que têm par."""
    nota = -1 if foto.get("marcacao") == "rejeitada" else int(foto.get("nota") or 0)
    atributos = [f'xmp:Rating="{nota}"', f'xmp:MetadataDate="{datetime.now().strftime("%Y-%m-%dT%H:%M:%S")}"']
    rotulo = ROTULOS_DO_XMP.get(foto.get("cor") or "")
    if rotulo:
        atributos.append(f'xmp:Label="{rotulo}"')
    for chave, campo, escala in CAMPOS_DO_XMP:
        valor = (cor or {}).get(chave)
        if valor:
            numero = valor / escala
            atributos.append(f'crs:{campo}="{numero:+.2f}"' if campo == "Exposure2012" else
                             f'crs:{campo}="{round(numero):+d}"')
    vinheta = (cor or {}).get("vinheta")
    if vinheta:
        atributos.append(f'crs:PostCropVignetteAmount="{-round(vinheta * 100):d}"')
    corpo = "\n    ".join(atributos)
    titulo = escape(foto.get("nome") or "")
    return ('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
            '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
            '  <rdf:Description rdf:about=""\n    xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n'
            '    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"\n    xmlns:dc="http://purl.org/dc/elements/1.1/"\n'
            f'    {corpo}>\n   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">{titulo}</rdf:li></rdf:Alt></dc:title>\n'
            '  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>\n')


def lado_para_o_limite(largura: int, altura: int, lado_maximo: int | None) -> tuple[int, int]:
    """O tamanho com o lado maior até o limite (sem aumentar)."""
    if not lado_maximo or max(largura, altura) <= lado_maximo:
        return largura, altura
    escala = lado_maximo / max(largura, altura)
    return max(1, round(largura * escala)), max(1, round(altura * escala))


def posicao_da_marca(largura: int, altura: int, marca_l: int, marca_a: int, canto: str, margem: float = 0.03
                     ) -> tuple[int, int]:
    """O canto de cima à esquerda da marca d'água no canto pedido (ou no meio), com a margem em fração do lado."""
    m = round(min(largura, altura) * margem)
    x = {"esquerda": m, "meio": (largura - marca_l) // 2, "direita": largura - marca_l - m}
    y = {"cima": m, "meio": (altura - marca_a) // 2, "baixo": altura - marca_a - m}
    vertical, _, horizontal = canto.partition("-") if "-" in canto else ("meio", "", "meio")
    return x.get(horizontal, x["direita"]), y.get(vertical, y["baixo"])


def qualidade_para_o_tamanho(tamanho_em_qualidade, limite_bytes: int, minimo: int = 40, maximo: int = 95) -> int:
    """A maior qualidade de JPEG cujo arquivo cabe no limite (busca binária sobre `tamanho_em_qualidade(q)`)."""
    if tamanho_em_qualidade(maximo) <= limite_bytes:
        return maximo
    baixo, alto = minimo, maximo
    while baixo < alto:
        meio = math.ceil((baixo + alto) / 2)
        if tamanho_em_qualidade(meio) <= limite_bytes:
            baixo = meio
        else:
            alto = meio - 1
    return baixo
