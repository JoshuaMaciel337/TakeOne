# -----------------------------------------------
# TakeOne — planejamento do render com FFmpeg
#
# Lê o mesmo projeto que a prévia desenha e monta o grafo de filtros do FFmpeg, numa passada só.
# Generaliza o render do HolyCut (uma gravação cortada em partes) para várias faixas:
#
#   - cada clipe é uma entrada do FFmpeg, aberta já no trecho dele (-ss e -t antes do -i);
#   - o fundo é um quadro de cor do tamanho do vídeo, na taxa de quadros do projeto;
#   - as faixas de imagem são sobrepostas de baixo para cima, como na prévia, cada clipe com o
#     recorte, o tamanho, o giro e a opacidade da caixa de core/utils/geometria.py;
#   - a mistura é feita em RGB (overlay format=rgb), como o navegador faz na prévia;
#   - o som de cada clipe entra no instante dele (adelay em amostras), tudo é misturado sem
#     normalizar e o resultado vai para -14 LUFS, o padrão das redes sociais.
# -----------------------------------------------
import math
import re
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from functools import lru_cache

from core.config import FFMPEG
from core.utils.animacao import filtros_de_animacao
from core.utils.cor import ajustes_efetivos, cor_neutra, nome_da_lut
from core.utils.geometria import Caixa, caixa_do_clipe, caixa_do_texto
from core.utils.tempo import TICKS_POR_SEGUNDO

TAXA_AUDIO = 48000
LUFS_ALVO = -14
PICO_MAXIMO_DB = -1.5
# Abre e fecha o som do vídeo bem de leve, para não estalar no primeiro e no último quadro
FADE_ENTRADA = 0.02
FADE_SAIDA = 0.05
# Cada clipe é uma entrada do FFmpeg; muitas abertas ao mesmo tempo esgotam a memória
LIMITE_CLIPES_RENDER = 400
# O atempo aceita de 0,5 a 100 por filtro; velocidades menores viram uma cadeia
ATEMPO_MINIMO = 0.5

FAIXA_AUDIO = "audio"


@dataclass(frozen=True)
class MidiaDoRender:
    caminho: str
    largura: int
    altura: int
    video: bool
    audio: bool


@dataclass(frozen=True)
class ImagemDoTexto:
    """O PNG de um clipe de texto, desenhado no tamanho do vídeo, e o tamanho dele no lado de referência."""
    caminho: str
    largura_referencia: int
    altura_referencia: int


@dataclass(frozen=True)
class Entrada:
    """Um clipe aberto no FFmpeg: só o trecho da mídia que ele usa, ou uma imagem parada (texto)."""
    caminho: str
    inicio: float     # segundos dentro da mídia
    duracao: float    # segundos da mídia lidos (a duração no vídeo vezes a velocidade)
    imagem: bool = False
    taxa: str = ""

    def argumentos(self) -> list[str]:
        if self.imagem:
            return ["-loop", "1", "-framerate", self.taxa, "-t", f"{self.duracao:.6f}", "-i", self.caminho]
        return ["-ss", f"{self.inicio:.6f}", "-t", f"{self.duracao:.6f}", "-i", self.caminho]


@dataclass(frozen=True)
class ArquivoAuxiliar:
    """Arquivo que o worker gera antes de rodar o FFmpeg: a LUT da cor ou a imagem da vinheta."""
    caminho: str
    tipo: str          # "lut" ou "vinheta"
    ajustes: dict
    largura: int = 0
    altura: int = 0


@dataclass(frozen=True)
class PlanoDeRender:
    entradas: list[Entrada]
    filtro: str
    duracao: float
    taxa: str          # "30/1", "30000/1001"
    tem_som: bool
    auxiliares: tuple[ArquivoAuxiliar, ...] = ()


class ErroRender(ValueError):
    """O projeto não dá para renderizar (vazio, grande demais, mídia faltando). A mensagem é para a pessoa."""


def segundos(ticks: int) -> float:
    return ticks / TICKS_POR_SEGUNDO


def _numero(valor: float) -> str:
    """Número curto e sem notação científica para o grafo."""
    texto = f"{valor:.6f}".rstrip("0").rstrip(".")
    return "0" if texto in ("", "-0") else texto


def cadeia_atempo(velocidade: float) -> list[str]:
    """Filtros atempo que somam a velocidade (0,25 → atempo=0.5,atempo=0.5)."""
    if abs(velocidade - 1) < 1e-9:
        return []
    filtros = []
    restante = velocidade
    while restante < ATEMPO_MINIMO:
        filtros.append(f"atempo={_numero(ATEMPO_MINIMO)}")
        restante /= ATEMPO_MINIMO
    filtros.append(f"atempo={_numero(restante)}")
    return filtros


def _video_do_clipe(entrada: int, clipe: dict, caixa: Caixa, taxa: str, quadro: tuple[int, int],
                    numero: int = 0, lut: str | None = None, vinheta: int | None = None) -> tuple[str, str]:
    """
    (cadeia que prepara a imagem do clipe, expressão do overlay que a coloca no quadro).
    lut: caminho da LUT da cor; vinheta: entrada do FFmpeg com a imagem da vinheta.
    """
    recorte = clipe["recorte"]
    inicio = segundos(clipe["inicio"])
    largura = max(1, round(caixa.largura))
    altura = max(1, round(caixa.altura))
    filtros = [
        f"setpts=(PTS-STARTPTS)/{_numero(clipe['velocidade'])}",
        f"fps={taxa}",
        # Recorte em frações da imagem, como o compositor da prévia faz nas coordenadas da textura
        f"crop=w=iw*{_numero(recorte['largura'])}:h=ih*{_numero(recorte['altura'])}"
        f":x=iw*{_numero(recorte['x'])}:y=ih*{_numero(recorte['y'])}",
        f"scale={largura}:{altura}:flags=bicubic",
        "setsar=1",
        "format=rgba",
    ]
    if lut:
        filtros.append(f"lut3d=file='{_escapar_caminho(lut)}':interp=tetrahedral")
    prefixo = ""
    if vinheta is not None:
        # Multiplica pela imagem cinza da vinheta, no tamanho do clipe, antes de girar (como a prévia)
        prefixo = (f"[{entrada}:v]{','.join(filtros)},format=gbrap[va{numero}];\n"
                   f"[{vinheta}:v]format=gbrap[vb{numero}];\n"
                   f"[va{numero}][vb{numero}]blend=all_mode=multiply,format=rgba")
        filtros = []
    if caixa.opacidade < 1:
        filtros.append(f"colorchannelmixer=aa={_numero(caixa.opacidade)}")
    if caixa.rotacao:
        # Sentido horário, como a prévia; os cantos que sobram ficam transparentes
        angulo = _numero(math.radians(caixa.rotacao))
        filtros.append(f"rotate=a={angulo}:ow=rotw({angulo}):oh=roth({angulo}):c=none")
    filtros.append(f"setpts=PTS+{_numero(inicio)}/TB")
    fim = segundos(clipe["inicio"] + clipe["duracao"])
    animacao = filtros_de_animacao({**clipe, "inicio": inicio, "duracao": fim - inicio,
                                    "animacao": _animacao_em_segundos(clipe.get("animacao"))}, inicio, fim)
    filtros += animacao["fades"]
    if animacao["escala"]:
        # O zoom muda o tamanho a cada quadro; o pad devolve sempre o mesmo tamanho para o overlay
        cos, sen = abs(math.cos(math.radians(caixa.rotacao))), abs(math.sin(math.radians(caixa.rotacao)))
        lado_l = math.ceil(largura * cos + altura * sen) + 2
        lado_a = math.ceil(largura * sen + altura * cos) + 2
        fator = animacao["escala"]
        filtros.append(f"scale=w='max(1,iw*{fator})':h='max(1,ih*{fator})':eval=frame")
        filtros.append(f"pad=w={lado_l}:h={lado_a}:x=(ow-iw)/2:y=(oh-ih)/2:color=black@0:eval=frame")
    # O clipe aparece nos quadros com início <= t < fim, como na prévia. Os limites ficam meio quadro
    # antes: nenhum quadro cai bem na fronteira, e o arredondamento não tira nem põe quadros
    meio = 0.5 / float(taxa_em_fracao(taxa))
    x = f"{_numero(caixa.cx)}" if animacao["dx"] == "0" else f"'{_numero(caixa.cx)}+{quadro[0]}*({animacao['dx']})"
    y = f"{_numero(caixa.cy)}" if animacao["dy"] == "0" else f"'{_numero(caixa.cy)}+{quadro[1]}*({animacao['dy']})"
    x += "-overlay_w/2" + ("'" if x.startswith("'") else "")
    y += "-overlay_h/2" + ("'" if y.startswith("'") else "")
    overlay = (f"overlay=x={x}:y={y}:format=rgb"
               f":eof_action=pass:enable='gte(t,{_numero(inicio - meio)})*lt(t,{_numero(fim - meio)})'")
    if prefixo:
        return prefixo + "".join(f",{filtro}" for filtro in filtros), overlay
    return f"[{entrada}:v]{','.join(filtros)}", overlay


def _escapar_caminho(caminho: str) -> str:
    """
    Caminho dentro de aspas simples no grafo do FFmpeg: as aspas já protegem o ":". Os caminhos vêm do
    próprio worker (pasta da exportação e ids), sem aspas no nome.
    """
    if "'" in caminho:
        raise ErroRender("Caminho de arquivo com aspas não entra no grafo do FFmpeg.")
    return caminho.replace("\\", "/")


def _animacao_em_segundos(animacao: dict | None) -> dict | None:
    if not animacao:
        return None
    return {nome: {**item, "duracao": segundos(item["duracao"])} for nome, item in animacao.items()}


def _som_do_clipe(entrada: int, clipe: dict) -> str:
    atraso = round(segundos(clipe["inicio"]) * TAXA_AUDIO)
    duracao = segundos(clipe["duracao"])
    filtros = [
        "asetpts=PTS-STARTPTS",
        f"aresample={TAXA_AUDIO}",
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        *cadeia_atempo(clipe["velocidade"]),
        f"volume={_numero(clipe['volume'])}",
    ]
    # Fades no tempo do próprio clipe (depois da velocidade), antes de ir para o instante dele
    fade_entrada, fade_saida = segundos(clipe.get("fade_entrada", 0)), segundos(clipe.get("fade_saida", 0))
    if fade_entrada > 0:
        filtros.append(f"afade=t=in:st=0:d={_numero(fade_entrada)}")
    if fade_saida > 0:
        filtros.append(f"afade=t=out:st={_numero(max(duracao - fade_saida, 0))}:d={_numero(fade_saida)}")
    filtros.append(f"adelay={atraso}S:all=1")
    return f"[{entrada}:a]{','.join(filtros)}"


def planejar_render(projeto: dict, midias: dict[str, MidiaDoRender], largura: int, altura: int,
                    textos: dict[str, ImagemDoTexto] | None = None, pasta: str = ".") -> PlanoDeRender:
    """
    projeto: a cópia guardada na exportação (proporcao, taxa, fundo, faixas, duracao).
    midias: id → arquivo e tamanho da imagem de cada mídia usada.
    textos: id do clipe → PNG de cada clipe de texto.
    pasta: onde o worker grava as LUTs e as imagens de vinheta listadas em `auxiliares`.
    """
    textos = textos or {}
    duracao = segundos(projeto["duracao"])
    if duracao <= 0:
        raise ErroRender("O projeto está vazio. Coloque alguma mídia na linha do tempo antes de exportar.")
    taxa = f"{projeto['taxa']['num']}/{projeto['taxa']['den']}"
    quadro = (largura, altura)

    # Imagem: faixas visíveis de baixo para cima (a lista do projeto vai de cima para baixo)
    visuais = [f for f in reversed(projeto["faixas"]) if f["tipo"] != FAIXA_AUDIO and not f.get("oculta")]
    # Som: faixas de áudio e as de imagem visíveis, menos as silenciadas (a prévia faz igual)
    com_som = [f for f in projeto["faixas"] if not f.get("muda") and (f["tipo"] == FAIXA_AUDIO or not f.get("oculta"))]
    clipes = [c for f in visuais for c in f["clipes"]]
    vistos = {c["id"] for c in clipes}
    clipes += [c for f in com_som for c in f["clipes"] if c["id"] not in vistos]
    if len(clipes) > LIMITE_CLIPES_RENDER:
        raise ErroRender(f"O projeto tem mais de {LIMITE_CLIPES_RENDER} clipes para exportar de uma vez.")

    entradas: list[Entrada] = []
    indice_da_entrada: dict[str, int] = {}
    for clipe in clipes:
        indice_da_entrada[clipe["id"]] = len(entradas)
        if clipe.get("texto"):
            imagem = textos.get(clipe["id"])
            if imagem is None:
                raise ErroRender("Faltou a imagem de um texto do projeto.")
            entradas.append(Entrada(imagem.caminho, 0, segundos(clipe["duracao"]), imagem=True, taxa=taxa))
            continue
        midia = midias.get(clipe["midia_id"])
        if midia is None:
            raise ErroRender("Uma mídia usada no projeto foi excluída ou não está pronta.")
        entradas.append(Entrada(midia.caminho, segundos(clipe["entrada"]),
                                segundos(clipe["duracao"]) * clipe["velocidade"]))

    auxiliares: dict[str, ArquivoAuxiliar] = {}
    cor = projeto["fundo"]["cor"].lstrip("#")
    linhas = [f"color=c=0x{cor}:s={largura}x{altura}:r={taxa}:d={_numero(duracao)},format=gbrp[base0]"]
    anterior = "base0"
    for numero, clipe in enumerate((c for f in visuais for c in f["clipes"]), start=1):
        if clipe.get("texto"):
            imagem = textos[clipe["id"]]
            referencia = (imagem.largura_referencia, imagem.altura_referencia)
            caixa = caixa_do_texto(clipe["transformacao"], referencia, quadro)
        else:
            midia = midias[clipe["midia_id"]]
            if not midia.video:
                continue
            caixa = caixa_do_clipe(clipe["transformacao"], clipe["recorte"], (midia.largura, midia.altura), quadro)
        ajustes = ajustes_efetivos(clipe.get("cor"))
        lut = vinheta = None
        if not cor_neutra({**ajustes, "vinheta": 0}):
            lut = f"{pasta}/{nome_da_lut(ajustes)}"
            auxiliares.setdefault(lut, ArquivoAuxiliar(lut, "lut", ajustes))
        if ajustes["vinheta"] > 0:
            imagem_vinheta = f"{pasta}/vinheta_{clipe['id']}.png"
            tamanho = (max(1, round(caixa.largura)), max(1, round(caixa.altura)))
            auxiliares[imagem_vinheta] = ArquivoAuxiliar(imagem_vinheta, "vinheta", ajustes, *tamanho)
            vinheta = len(entradas)
            entradas.append(Entrada(imagem_vinheta, 0, segundos(clipe["duracao"]) * clipe["velocidade"],
                                    imagem=True, taxa=taxa))
        cadeia, overlay = _video_do_clipe(indice_da_entrada[clipe["id"]], clipe, caixa, taxa, quadro,
                                          numero, lut, vinheta)
        linhas.append(f"{cadeia}[c{numero}]")
        linhas.append(f"[{anterior}][c{numero}]{overlay}[base{numero}]")
        anterior = f"base{numero}"
    linhas.append(f"[{anterior}]format=yuv420p[v]")

    sons = []
    for faixa in com_som:
        for clipe in faixa["clipes"]:
            if clipe.get("midia_id") and midias[clipe["midia_id"]].audio:
                sons.append(f"a{len(sons)}")
                linhas.append(f"{_som_do_clipe(indice_da_entrada[clipe['id']], clipe)}[{sons[-1]}]")
    inicio_fade_saida = _numero(max(duracao - FADE_SAIDA, 0))
    fim_do_som = (f"apad,atrim=0:{_numero(duracao)},"
                  f"afade=t=in:d={FADE_ENTRADA},afade=t=out:st={inicio_fade_saida}:d={FADE_SAIDA}[a]")
    if sons:
        linhas.append(
            "".join(f"[{rotulo}]" for rotulo in sons)
            + f"amix=inputs={len(sons)}:duration=longest:normalize=0,"
            + f"loudnorm=I={LUFS_ALVO}:TP={PICO_MAXIMO_DB}:LRA=11,aresample={TAXA_AUDIO},{fim_do_som}"
        )
    else:
        linhas.append(f"anullsrc=r={TAXA_AUDIO}:cl=stereo,{fim_do_som}")

    return PlanoDeRender(entradas=entradas, filtro=";\n".join(linhas), duracao=duracao, taxa=taxa, tem_som=bool(sons),
                         auxiliares=tuple(auxiliares.values()))


def argumentos_de_saida(plano: PlanoDeRender, caminho_saida: str, lado_maior: int) -> list[str]:
    """Codificação do vídeo final: H.264 e AAC, com o índice no começo para tocar enquanto baixa."""
    # O 4K demora muito no preset medium; o fast fica perto na qualidade com o CRF baixo
    preset = "fast" if lado_maior > 2000 else "medium"
    return [
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", preset, "-crf", "18", "-pix_fmt", "yuv420p", "-r", plano.taxa,
        "-c:a", "aac", "-b:a", "192k", "-ar", str(TAXA_AUDIO),
        "-t", _numero(plano.duracao), "-movflags", "+faststart", caminho_saida,
    ]


def taxa_em_fracao(taxa: str) -> Fraction:
    num, den = taxa.split("/")
    return Fraction(int(num), int(den))


@lru_cache(maxsize=1)
def versao_principal_ffmpeg() -> int:
    saida = subprocess.run([FFMPEG, "-version"], capture_output=True, text=True, timeout=30).stdout
    encontrada = re.search(r"ffmpeg version n?(\d+)", saida)
    return int(encontrada.group(1)) if encontrada else 0


def opcao_filtro_em_arquivo(caminho: str) -> list[str]:
    """O FFmpeg 7 lê opções de arquivo com '-/opção'. O 6 só tinha -filter_complex_script."""
    if versao_principal_ffmpeg() >= 7:
        return ["-/filter_complex", caminho]
    return ["-filter_complex_script", caminho]
