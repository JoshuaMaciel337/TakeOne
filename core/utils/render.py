# -----------------------------------------------
# TakeOne — planejamento do render com FFmpeg
#
# Lê o mesmo projeto que a prévia desenha e monta os grafos de filtros do FFmpeg: uma passada para
# o som e outra para o vídeo.
# Generaliza o render do HolyCut (uma gravação cortada em partes) para várias faixas:
#
#   - cada clipe é uma entrada do FFmpeg, aberta já no trecho dele (-ss e -t antes do -i);
#   - o fundo é um quadro de cor do tamanho do vídeo, na taxa de quadros do projeto;
#   - as faixas de imagem são sobrepostas de baixo para cima, como na prévia, cada clipe com o
#     recorte, o tamanho, o giro e a opacidade da caixa de core/utils/geometria.py;
#   - a mistura é feita em RGB (overlay format=rgb), como o navegador faz na prévia;
#   - o som de cada clipe entra no instante dele (adelay em amostras), tudo é misturado sem
#     normalizar e o resultado vai para -14 LUFS, o padrão das redes sociais. A mistura sai numa
#     primeira passada só do som, que também mede o loudness; na segunda ela leva um ganho fixo e um
#     limitador nos picos. (O loudnorm numa passada mexe no ganho ao longo do vídeo: uma introdução
#     baixa subia até quase o volume do resto, diferente da prévia.)
# -----------------------------------------------
import math
import re
import subprocess
from dataclasses import dataclass, replace
from fractions import Fraction
from functools import lru_cache

from core.config import FFMPEG
from core.modelos.midia import chave_da_estabilizacao, chave_do_tom
from core.utils.animacao import filtros_de_animacao, loop_gira, maior_zoom_do_loop
from core.utils.cantos import tem_cantos
from core.utils.cor import ajustes_efetivos, cor_neutra, curvas_neutras, hsl_neutro, nome_da_lut, somar_ajustes
from core.utils.efeitos import (
    BRILHO_SIGMA,
    GRAO_LINHAS,
    LUZ_PERIODO,
    ajustes_do_efeito,
    brilho_do_efeito,
    colunas_do_grao,
    contraste_local_do_efeito,
    desfoque_do_efeito,
    deslocamento_do_grao,
    desvio_de_cor,
    distorcao_do_efeito,
    efeito_do_clipe,
    grao_do_efeito,
    linhas_do_efeito,
    luz_do_efeito,
)
from core.utils.ffmpeg import FILTRO_MARCAS_BT709, MARCAS_BT709, ler_como_bt709
from core.utils.geometria import Caixa, caixa_do_clipe, caixa_do_texto, recorte_na_fonte
from core.utils.keyframes import (
    animadas,
    comandos_de_opacidade,
    expressao_da_propriedade,
    maior_escala,
    transformacao_de_base,
)
from core.utils.letras import comandos_das_letras, tem_letra_a_letra
from core.utils.som import (
    CURVA_PADRAO,
    CURVAS_DO_FADE,
    REVERB_DURACAO_S,
    afir_sem_normalizar,
    comandos_de_volume,
    filtros_de_voz,
    ganho_para_igualar,
)
from core.utils.tempo import TICKS_POR_SEGUNDO
from core.utils.transicao import desfoque_na_transicao, filtro_de_cortina, filtros_de_transicao, janelas_da_principal
from core.utils.velocidade import atempo_necessarios, comandos_do_andamento, expressao_do_tempo

TAXA_AUDIO = 48000
LUFS_ALVO = -14
PICO_MAXIMO_DB = -1.5
# Abaixo disso a mistura é silêncio (o ebur128 não mede menos que -70); e o ganho tem um teto
SILENCIO_LUFS = -70
GANHO_MAXIMO_DB = 30
# A mistura em ponto flutuante: antes do ganho, o volume ainda pode passar de 1
ARQUIVO_SOM = "som.mka"
ARQUIVO_REVERB = "reverb.wav"
# Abre e fecha o som do vídeo bem de leve, para não estalar no primeiro e no último quadro
FADE_ENTRADA = 0.02
FADE_SAIDA = 0.05
# Cada clipe é uma entrada do FFmpeg; muitas abertas ao mesmo tempo esgotam a memória
LIMITE_CLIPES_RENDER = 400
# O atempo aceita de 0,5 a 100 por filtro; velocidades menores viram uma cadeia
ATEMPO_MINIMO = 0.5

FAIXA_AUDIO = "audio"
# Mesclagem do clipe → modo do blend do FFmpeg
MODOS_DE_MESCLAGEM = {"multiplicar": "multiply", "tela": "screen", "somar": "addition"}


@dataclass(frozen=True)
class MidiaDoRender:
    caminho: str
    largura: int
    altura: int
    video: bool
    audio: bool
    duracao: float = 0     # segundos; 0 quando não se sabe (aí não há limite no fim)
    matriz: str | None = None   # matriz de cor marcada no arquivo; sem ela, o vídeo é lido como BT.709
    hdr: str | None = None      # "pq" ou "hlg": o HDR do celular, convertido para SDR na leitura
    voz_limpa: str | None = None   # a voz sem ruído, no mesmo tempo do original, quando já foi gerada
    tons: tuple = ()               # (chave do tom, arquivo) das vozes em outro tom já geradas
    mascara: str | None = None     # a máscara da pessoa (recorte do fundo), no tempo da cópia leve
    imagem_limpa: str | None = None  # a imagem sem ruído, em resolução cheia e já em BT.709
    # As imagens estáveis prontas, (chave, caminho): "estavel" e "estavel_limpo" (sobre a sem ruído)
    estaveis: tuple[tuple[str, str], ...] = ()
    lufs: float | None = None      # loudness medido na ingestão, para o "Igualar o volume"
    imagem: bool = False           # imagem parada (foto, logo): aberta em laço, sem tempo próprio
    duracao_video: float = 0       # onde a imagem acaba (pode ser antes do som); 0 quando não se sabe


@dataclass(frozen=True)
class Leitura:
    """
    O trecho de um clipe de mídia que o FFmpeg lê, contando as transições. Sem sobra na mídia antes ou
    depois, o primeiro ou o último quadro se repete (tpad), em segundos do vídeo final.
    """
    inicio: float           # janela no vídeo final
    fim: float
    pausa_inicio: float = 0
    pausa_fim: float = 0
    pular_audio: float = 0  # segundos da mídia lida antes de onde o som do clipe começa
    efeitos: tuple = ()     # efeitos das transições, com tempos em segundos
    congelar_fim: float = 0  # segundos do clipe depois do fim da imagem da mídia (o som dela vai além)
    antecipar: float = 0    # segundos da mídia abertos antes do trecho (veja ANTECIPAR_LEITURA)


@dataclass(frozen=True)
class ImagemDoTexto:
    """
    O PNG de um clipe de texto, desenhado no tamanho do vídeo, e o tamanho dele no lado de referência.
    layout: onde fica cada letra (texto letra a letra ou com destaque); destaque: o PNG na cor do destaque.
    """
    caminho: str
    largura_referencia: int
    altura_referencia: int
    layout: dict | None = None
    destaque: str | None = None


# O vídeo é aberto um pouco antes do trecho do clipe, e a cadeia desconta a diferença: assim o primeiro quadro é
# o último que começou até a entrada, como na prévia. Aberto na entrada, o FFmpeg descarta o quadro que começou
# antes dela e o render adiantava a mídia um quadro (em mídia de 24 ou 25 fps, em 4 de cada 5 entradas)
ANTECIPAR_LEITURA = 0.1
# A folga do decodificador da prévia (FOLGA_US em apps/web/src/lib/previa/amostras.ts), em segundos
FOLGA_DO_QUADRO = 0.0005
# A caixa do clipe é a mídia inteira na escala dele, e o render redimensiona até ela: com zoom alto, a 2000%
# num 1080p ela tinha 38400 × 21600 e o FFmpeg recusava o quadro; a 400% em 4K, cada quadro tinha 531 MB e a
# vinheta pedia uns 5 GB ao worker. Acima disto, a exportação para antes com uma mensagem
LADO_MAXIMO_DA_CAIXA = 16384
AREA_MAXIMA_DA_CAIXA = 7680 * 4320
# O deslocamento máximo do rgbashift (VHS e glitch), em pixels
RGBASHIFT_MAXIMO = 255


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
    """Arquivo que o worker gera antes do FFmpeg: a LUT da cor, a imagem da vinheta ou o roteiro do sendcmd."""
    caminho: str
    tipo: str          # "lut", "vinheta", "cantos", "anel", "comandos", "reverb", "luz" ou "grao"
    ajustes: dict
    largura: int = 0
    altura: int = 0
    conteudo: str = ""   # o texto do roteiro, nos "comandos"


@dataclass(frozen=True)
class PlanoDeRender:
    entradas: list[Entrada]
    filtro: str
    duracao: float
    taxa: str          # "30/1", "30000/1001"
    tem_som: bool
    auxiliares: tuple[ArquivoAuxiliar, ...] = ()
    # Primeira passada: o som de todos os clipes, misturado no arquivo `som` e medido pelo ebur128.
    # Fica fora do grafo do vídeo porque, num grafo só, o FFmpeg 7 trava em projetos com transição:
    # o som de um clipe que entra depois (adelay) e o vídeo ficam esperando um pelo outro.
    filtro_som: str = ""
    som: str = ""


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
                    numero: int = 0, lut: str | None = None, vinheta: int | None = None,
                    leitura: Leitura | None = None, entrada_de_cor: list[str] | None = None,
                    roteiro_de_opacidade: str | None = None,
                    mascara: tuple[str, str] | None = None, desfoque: list[str] | None = None,
                    luz: tuple[int, float] | None = None, grao: tuple[int, str, int] | None = None,
                    mascara_do_fundo: int | None = None, alfa_na_fonte: bool = False,
                    cantos: tuple[int, int | None] | None = None) -> tuple[str, str]:
    """
    (cadeia que prepara a imagem do clipe, expressão do overlay que a coloca no quadro).
    lut: caminho da LUT da cor; vinheta: entrada do FFmpeg com a imagem da vinheta.
    leitura: a janela do clipe com as transições (só na faixa principal).
    entrada_de_cor: filtros do começo que dizem como ler a cor do vídeo (ler_como_bt709).
    roteiro_de_opacidade: o roteiro do sendcmd com a opacidade por quadro, quando ela tem keyframes.
    mascara: (roteiro do sendcmd, nome das caixas) que escondem as letras fora do trecho (letras.py).
    desfoque: os filtros do desfoque (veja _desfoque), logo depois do tamanho, como na prévia.
    luz: (entrada com a tira de luz, segundos do começo da janela até o começo do clipe).
    grao: (entrada com a imagem do grão, roteiro do sendcmd do recorte, colunas de células).
    mascara_do_fundo: entrada com o vídeo da máscara da pessoa (recorte do fundo), lida como o clipe.
    alfa_na_fonte: a imagem já chega com transparência (texto, logo, forma).
    cantos: (entrada com a máscara dos cantos, entrada com o anel da borda ou None), quando o clipe os tem.
    A caixa vem da transformação de base (core/utils/keyframes.py); o que tem keyframes muda por quadro aqui.
    """
    com_keyframes = animadas(clipe)
    # O recorte do clipe é do que aparece; na mídia, o virado lê o pedaço espelhado (a prévia faz a mesma conta)
    recorte = recorte_na_fonte(clipe["recorte"], clipe.get("virar"))
    leitura = leitura or Leitura(segundos(clipe["inicio"]), segundos(clipe["inicio"] + clipe["duracao"]))
    inicio = leitura.inicio
    largura = max(1, round(caixa.largura))
    altura = max(1, round(caixa.altura))
    curva = clipe.get("curva_velocidade")
    # O começo do trecho vai a zero: o que foi aberto antes dele (antecipar) sai, e a mídia anda a folga da
    # prévia para trás (um quadro que começa até 0,5 ms depois do instante já vale nele, como em amostras.ts):
    # sem ela, o quadro que começa bem na entrada perdia para o anterior por arredondamento
    if leitura.antecipar:
        zerar = f"PTS-{_numero(leitura.antecipar + FOLGA_DO_QUADRO)}/TB"
    else:
        zerar = f"PTS-STARTPTS-{_numero(FOLGA_DO_QUADRO)}/TB"
    if curva:
        # Velocidade com curva: o tempo da mídia vai ao do clipe pela inversa da conta (velocidade.py)
        duracao_s = segundos(clipe["duracao"])
        # A base de tempo fina não deixa o setpts arredondar para a grade da mídia, e o fps com
        # round=up mostra o último quadro que já chegou: o mesmo que o decodificador da prévia
        tempo = ["settb=1/90000", f"setpts={zerar}",
                 f"setpts='({expressao_do_tempo(curva, duracao_s, duracao_s * clipe['velocidade'])})/TB'"]
        fps = f"fps={taxa}:round=up:start_time=0"
    else:
        tempo = [f"setpts=({zerar})/{_numero(clipe['velocidade'])}"]
        # round=up: cada quadro do vídeo mostra o último quadro da mídia que já chegou, como o
        # decodificador da prévia. Com o padrão (o mais próximo), um vídeo de 29,97 num projeto de 30
        # saía sempre um quadro adiantado (medido: 1 de 200 quadros iguais; com round=up, 200 de 200)
        # start_time=0: o que foi aberto antes da entrada fica de fora, e o quadro que estava na tela nela entra
        fps = f"fps={taxa}:round=up:start_time=0"
    filtros = [
        *(entrada_de_cor or []),
        *tempo,
        fps,
        # Recorte em frações da imagem, como o compositor da prévia faz nas coordenadas da textura
        f"crop=w=iw*{_numero(recorte['largura'])}:h=ih*{_numero(recorte['altura'])}"
        f":x=iw*{_numero(recorte['x'])}:y=ih*{_numero(recorte['y'])}",
        *_sem_aro(f"scale={largura}:{altura}:flags=bicubic", alfa_na_fonte),
        "setsar=1",
        "format=rgba",
    ]
    if leitura.pausa_inicio > 0 or leitura.pausa_fim > 0 or leitura.congelar_fim > 0:
        # Sem sobra na mídia para a transição, ou com a imagem acabando antes do clipe: repete o primeiro ou
        # o último quadro (o tpad só repete depois que a imagem acaba; a sobra é cortada pelo overlay)
        parar = leitura.pausa_fim + leitura.congelar_fim
        filtros.insert(filtros.index(fps) + 1, f"tpad=start_mode=clone:start_duration={_numero(leitura.pausa_inicio)}"
                                              f":stop_mode=clone:stop_duration={_numero(parar)}")
    cabeca = f"[{entrada}:v]"
    if mascara:
        # Quatro caixas transparentes escondem as letras que ainda não apareceram (ou já saíram)
        roteiro, alvo = mascara
        filtros.append(f"sendcmd=f='{_escapar_caminho(roteiro)}'")
        filtros += [f"drawbox@{alvo}{i}=x=-2:y=-2:w=1:h=1:color=black@0:t=fill:replace=1" for i in range(4)]
    filtros += desfoque or []
    if mascara_do_fundo is not None:
        # Recorte do fundo: o alfa vem do vídeo da máscara, lido, cortado e redimensionado como o clipe
        # (depois do desfoque e das cores separadas, antes da lente: como o shader da prévia)
        inicio_da_mascara = len(entrada_de_cor or [])
        da_mascara = ["scale=in_range=tv:out_range=pc", "format=gray",
                      *[f for f in filtros[inicio_da_mascara:filtros.index("format=rgba")]]]
        cabeca = (f"{_continuar(cabeca, filtros)}[vf{numero}];\n"
                  f"[{mascara_do_fundo}:v]{','.join(da_mascara)}[mf{numero}];\n"
                  f"[vf{numero}][mf{numero}]alphamerge")
        filtros = []
    distorcao = distorcao_do_efeito(clipe)
    com_alfa = alfa_na_fonte or mascara_do_fundo is not None
    if distorcao:
        # Olho de peixe: a lente do FFmpeg e um zoom de (1 + k) no meio, para não sobrar canto vazio
        maior_l, maior_a = round(largura * (1 + distorcao)), round(altura * (1 + distorcao))
        filtros += _sem_aro(f"lenscorrection=k1={_numero(distorcao)}:k2=0:i=bilinear,"
                            f"scale={maior_l}:{maior_a}:flags=bilinear", com_alfa)
        filtros.append(f"crop={largura}:{altura}")
    chroma = clipe.get("chroma")
    if chroma and not clipe.get("texto"):
        # Tela verde: o alfa vira a distância à cor em RGB (o shader da prévia faz a mesma conta)
        semelhanca = _numero(max(chroma["semelhanca"], 1e-5))
        colorkey = (f"colorkey=color=0x{chroma['cor'].lstrip('#')}:similarity={semelhanca}"
                    f":blend={_numero(chroma['suavidade'])}")
        if com_alfa:
            # O colorkey troca o alfa: com transparência antes (logo, recorte do fundo), o alfa dele é
            # multiplicado pelo que já havia, senão o transparente voltava opaco
            cabeca = (f"{_continuar(cabeca, [*filtros, 'format=rgba', 'split'])}[ka{numero}][kb{numero}];\n"
                      f"[kb{numero}]alphaextract[kc{numero}];\n"
                      f"[ka{numero}]{colorkey},split[kd{numero}][ke{numero}];\n"
                      f"[ke{numero}]alphaextract[kf{numero}];\n"
                      f"[kf{numero}][kc{numero}]blend=all_mode=multiply[kg{numero}];\n"
                      f"[kd{numero}][kg{numero}]alphamerge")
            filtros = []
        else:
            filtros.append(colorkey)
    chave_luma = clipe.get("chave_luma")
    if chave_luma and not clipe.get("texto"):
        # Chave de luminância: a luma BT.709 (colorchannelmixer) vira o fator do alfa numa rampa (lutrgb, com
        # +0,5 porque a tabela trunca), que multiplica o alfa que já havia. O shader da prévia faz a mesma conta
        limiar = chave_luma["limiar"] * 255
        if chave_luma["suavidade"] > 0.0001:
            ganho = 255 / (chave_luma["suavidade"] * 255)
            distancia = f"(val-{_numero(limiar)})" if chave_luma["tirar"] == "escuro" else f"({_numero(limiar)}-val)"
            rampa = f"clip({distancia}*{_numero(ganho)}+0.5,0,255)"
        else:
            corte = "gt" if chave_luma["tirar"] == "escuro" else "lt"
            rampa = f"{corte}(val,{_numero(limiar)})*255"
        cabeca = (f"{_continuar(cabeca, [*filtros, 'format=rgba', 'split=3'])}[ya{numero}][yb{numero}][yc{numero}];\n"
                  f"[yb{numero}]colorchannelmixer=rr=0.2126:rg=0.7152:rb=0.0722,lutrgb=r='{rampa}',format=gbrap,"
                  f"extractplanes=r[yd{numero}];\n"
                  f"[yc{numero}]alphaextract[ye{numero}];\n"
                  f"[ye{numero}][yd{numero}]blend=all_mode=multiply[yf{numero}];\n"
                  f"[ya{numero}][yf{numero}]alphamerge")
        filtros = []
    brilho = brilho_do_efeito(clipe)
    if brilho:
        # Brilho: o clipe desfocado, na força do brilho, somado em "tela" ao clipe (no alfa
        # pré-multiplicado, como a prévia), antes da cor
        sigma = BRILHO_SIGMA * altura
        k = _numero(brilho)
        desfocar = _filtros_do_gblur(f"gblur=sigma={sigma:.4f}:steps=6", sigma, False)
        cabeca = (f"{_continuar(cabeca, [*filtros, 'premultiply=inplace=1', 'split'])}[ba{numero}][bb{numero}];\n"
                  f"[bb{numero}]{','.join(desfocar)},colorchannelmixer=rr={k}:gg={k}:bb={k}:aa={k}[bc{numero}];\n"
                  f"[ba{numero}][bc{numero}]blend=all_mode=screen,unpremultiply=inplace=1")
        filtros = []
    contraste_local = contraste_local_do_efeito(clipe)
    if contraste_local:
        # Nitidez e clareza: o clipe mais (clipe - cópia desfocada) vezes a força, no alfa pré-multiplicado como o
        # brilho (a clareza pesa pelos meios-tons). A conta vai por um lut2 (uma tabela de 256 × 256 por plano, não
        # uma expressão por pixel)
        fracao, forca, meios_tons = contraste_local
        sigma = fracao * altura
        peso = "*4*x/255*(1-x/255)" if meios_tons else ""
        conta = f"clip(x+(x-y)*{_numero(forca)}{peso},0,255)"
        desfocar = _filtros_do_gblur(f"gblur=sigma={sigma:.4f}:steps=6", sigma, False)
        cabeca = (f"{_continuar(cabeca, [*filtros, 'premultiply=inplace=1', 'format=gbrap', 'split'])}"
                  f"[na{numero}][nb{numero}];\n"
                  f"[nb{numero}]{','.join(desfocar)},format=gbrap[nc{numero}];\n"
                  f"[na{numero}][nc{numero}]lut2=c0='{conta}':c1='{conta}':c2='{conta}':c3=x,unpremultiply=inplace=1")
        filtros = []
    if lut:
        filtros.append(f"lut3d=file='{_escapar_caminho(lut)}':interp=tetrahedral")
    # Virar: o que veio antes (recorte, letras, desfoque, lente, cores separadas, tela verde, brilho) é da imagem
    # como ela é; a cortina, a vinheta, a luz e o grão ficam no clipe como aparece. O shader faz a mesma divisão
    virar = clipe.get("virar") or {}
    if virar.get("horizontal"):
        filtros.append("hflip")
    if virar.get("vertical"):
        filtros.append("vflip")
    if cantos:
        # Cantos arredondados (core/utils/cantos.py): o alfa multiplicado pela parte de dentro e a borda por cima,
        # no clipe como aparece e antes da cortina (que esconde a borda junto); o shader faz isso entre as curvas
        # e a vinheta
        mascara_dos_cantos, anel = cantos
        cabeca = (f"{_continuar(cabeca, [*filtros, 'format=rgba', 'split'])}[qa{numero}][qb{numero}];\n"
                  f"[qb{numero}]alphaextract[qc{numero}];\n"
                  f"[{mascara_dos_cantos}:v]format=gray[qd{numero}];\n"
                  f"[qc{numero}][qd{numero}]blend=all_mode=multiply[qe{numero}];\n"
                  f"[qa{numero}][qe{numero}]alphamerge")
        if anel is not None:
            cabeca += (f"[qf{numero}];\n[{anel}:v]format=rgba[qg{numero}];\n"
                       f"[qf{numero}][qg{numero}]overlay=format=rgb,format=rgba")
        filtros = []
    # Cortina: some o que ainda não foi revelado, nas coordenadas do clipe (antes de girar, como a prévia)
    cortina = filtro_de_cortina(list(leitura.efeitos), inicio) if leitura.efeitos else None
    if cortina:
        filtros.append(cortina)
    if vinheta is not None:
        # Multiplica pela imagem cinza da vinheta, no tamanho do clipe, antes de girar (como a prévia)
        cabeca = (f"{_continuar(cabeca, [*filtros, 'format=gbrap'])}[va{numero}];\n"
                  f"[{vinheta}:v]format=gbrap[vb{numero}];\n"
                  f"[va{numero}][vb{numero}]blend=all_mode=multiply,format=rgba")
        filtros = []
    if luz:
        # A faixa de luz anda pela tira (3 vezes a largura) a cada quadro; somada em "tela" depois da cor
        entrada_luz, ate_o_clipe = luz
        posicao = f"(-0.3+1.6*mod((t-{_numero(ate_o_clipe)})/{_numero(LUZ_PERIODO)},1))"
        cabeca = (f"{_continuar(cabeca, [*filtros, 'format=gbrap'])}[la{numero}];\n"
                  f"[{entrada_luz}:v]crop=w={largura}:h={altura}:x='floor((1.5-{posicao})*{largura})':y=0,"
                  f"format=gbrap[lz{numero}];\n"
                  f"[la{numero}][lz{numero}]blend=c0_mode=screen:c1_mode=screen:c2_mode=screen:c3_mode=normal,"
                  f"format=rgba")
        filtros = []
    if grao:
        # O recorte da imagem do grão muda a cada quadro (roteiro); as células crescem até o clipe
        entrada_grao, roteiro_grao, colunas = grao
        # Com alfa (gbrap), a luz e o grão misturam só os três planos de cor e o alfa do clipe passa (o modo
        # normal no 4º plano devolve o de cima), como a prévia. Misturando o alfa também, logos, formas,
        # animações e recortes do fundo viravam um retângulo opaco
        cabeca = (f"{_continuar(cabeca, [*filtros, 'format=gbrap'])}[ga{numero}];\n"
                  f"[{entrada_grao}:v]sendcmd=f='{_escapar_caminho(roteiro_grao)}',"
                  f"crop@gr{numero}=w={colunas}:h={GRAO_LINHAS}:x=0:y=0,scale={largura}:{altura}:flags=neighbor,"
                  f"format=gbrap[gz{numero}];\n"
                  f"[ga{numero}][gz{numero}]blend=c0_mode=grainmerge:c1_mode=grainmerge:c2_mode=grainmerge"
                  f":c3_mode=normal,format=rgba")
        filtros = []
    if roteiro_de_opacidade:
        # A opacidade com keyframes muda por quadro, pelo roteiro (no tempo da janela do clipe)
        filtros.append(f"sendcmd=f='{_escapar_caminho(roteiro_de_opacidade)}'")
        filtros.append(f"colorchannelmixer@op{numero}=aa=1")
    elif caixa.opacidade < 1:
        filtros.append(f"colorchannelmixer=aa={_numero(caixa.opacidade)}")
    if caixa.rotacao:
        # Sentido horário, como a prévia; os cantos que sobram ficam transparentes
        angulo = _numero(math.radians(caixa.rotacao))
        filtros += _sem_aro(f"rotate=a={angulo}:ow=rotw({angulo}):oh=roth({angulo}):c=black@0", com_alfa)
    # O clipe vai para o lugar dele em quadros inteiros do projeto. Com `PTS+segundos/TB` o setpts truncava:
    # um clipe no quadro 31 a 30 fps dava 30,99999 → 30, a mídia saía um quadro adiantada e o último quadro
    # do clipe ficava vazio (preto na principal). O round() dentro da expressão vale para qualquer base de tempo
    taxa_do_projeto = taxa_em_fracao(taxa)
    quadros_ate_o_clipe = math.floor(inicio * taxa_do_projeto.numerator / taxa_do_projeto.denominator + 0.5)
    filtros.append(f"setpts=PTS+round({quadros_ate_o_clipe}*{taxa_do_projeto.denominator}"
                   f"/{taxa_do_projeto.numerator}/TB)")
    fim = leitura.fim
    # As animações seguem o começo e o fim do próprio clipe; as transições, a janela delas
    inicio_clipe = segundos(clipe["inicio"])
    fim_clipe = segundos(clipe["inicio"] + clipe["duracao"])
    animacao = filtros_de_animacao({**clipe, "inicio": inicio_clipe, "duracao": fim_clipe - inicio_clipe,
                                    "animacao": _animacao_em_segundos(clipe.get("animacao"))}, inicio_clipe, fim_clipe)
    gira = "rotacao" in com_keyframes or animacao["rotacao"] is not None
    if gira:
        # Giro por quadro (graus, sentido horário); a saída é um quadrado na diagonal, cabe qualquer ângulo.
        # O que sobra fora do clipe é pintado de transparente a cada quadro: com c=none ficava o rastro
        # dos ângulos anteriores. O balanço do loop soma ao giro dos keyframes (ou ao fixo)
        giro = (expressao_da_propriedade(clipe, "rotacao", inicio_clipe) if "rotacao" in com_keyframes
                else _numero(clipe["transformacao"]["rotacao"]))
        if animacao["rotacao"]:
            giro = f"{giro}+{animacao['rotacao']}"
        filtros += _sem_aro(f"rotate=a='({giro})*PI/180':ow='hypot(iw,ih)':oh=ow:c=black@0", com_alfa)
    if leitura.efeitos:
        transicao = filtros_de_transicao(list(leitura.efeitos))
        escalas = [e for e in (animacao["escala"], transicao["escala"]) if e]
        animacao = {
            "fades": animacao["fades"] + transicao["fades"],
            "escala": "*".join(escalas) or None,
            "dx": transicao["dx"] if animacao["dx"] == "0" else f"{animacao['dx']}+{transicao['dx']}",
            "dy": animacao["dy"],
            "rotacao": animacao["rotacao"],
        }
    # Keyframes de posição e escala: somam às animações e transições (partem do valor de base)
    base = clipe["transformacao"]
    termos = {"dx": [animacao["dx"]], "dy": [animacao["dy"]],
              "escala": [animacao["escala"]] if animacao["escala"] else []}
    if "x" in com_keyframes:
        termos["dx"].append(f"({expressao_da_propriedade(clipe, 'x', inicio_clipe)})-({_numero(base['x'])})")
    if "y" in com_keyframes:
        termos["dy"].append(f"({expressao_da_propriedade(clipe, 'y', inicio_clipe)})-({_numero(base['y'])})")
    if "escala" in com_keyframes:
        termos["escala"].append(f"({expressao_da_propriedade(clipe, 'escala', inicio_clipe)})"
                                f"/{_numero(maior_escala(clipe))}")
    zoom_do_loop = maior_zoom_do_loop(clipe)
    if zoom_do_loop != 1:
        # O pulsar cresce até zoom_do_loop: a caixa já tem esse tamanho e o fator volta ao normal
        termos["escala"].append(f"(1/{_numero(zoom_do_loop)})")
    animacao = {
        **animacao,
        "dx": "+".join(termo for termo in termos["dx"] if termo != "0") or "0",
        "dy": "+".join(termo for termo in termos["dy"] if termo != "0") or "0",
        "escala": "*".join(termos["escala"]) or None,
    }
    filtros += animacao["fades"]
    if animacao["escala"]:
        # O zoom muda o tamanho a cada quadro; o pad devolve sempre o mesmo tamanho para o overlay
        cos, sen = abs(math.cos(math.radians(caixa.rotacao))), abs(math.sin(math.radians(caixa.rotacao)))
        lado_l = math.ceil(largura * cos + altura * sen) + 2
        lado_a = math.ceil(largura * sen + altura * cos) + 2
        if gira:
            lado_l = lado_a = math.ceil(math.hypot(largura, altura)) + 2
        fator = animacao["escala"]
        # No alfa pré-multiplicado (_sem_aro), a volta ao alfa reto fica depois do pad: o unpremultiply só aceita
        # quadros do tamanho do primeiro, e logo depois do scale ele prendia o zoom no tamanho inicial (textos,
        # imagens e formas com zoom animado saíam parados)
        redimensionar = f"scale=w='max(1,iw*{fator})':h='max(1,ih*{fator})':eval=frame"
        encaixar = f"pad=w={lado_l}:h={lado_a}:x=(ow-iw)/2:y=(oh-ih)/2:color=black@0:eval=frame"
        filtros += _sem_aro(f"{redimensionar},{encaixar}", com_alfa)
    # O clipe aparece nos quadros com início <= t < fim, como na prévia. Os limites ficam meio quadro
    # antes: nenhum quadro cai bem na fronteira, e o arredondamento não tira nem põe quadros
    meio = 0.5 / float(taxa_em_fracao(taxa))
    x = f"{_numero(caixa.cx)}" if animacao["dx"] == "0" else f"'{_numero(caixa.cx)}+{quadro[0]}*({animacao['dx']})"
    y = f"{_numero(caixa.cy)}" if animacao["dy"] == "0" else f"'{_numero(caixa.cy)}+{quadro[1]}*({animacao['dy']})"
    x += "-overlay_w/2" + ("'" if x.startswith("'") else "")
    y += "-overlay_h/2" + ("'" if y.startswith("'") else "")
    overlay = (f"overlay=x={x}:y={y}:format=rgb"
               f":eof_action=pass:enable='gte(t,{_numero(inicio - meio)})*lt(t,{_numero(fim - meio)})'")
    return _continuar(cabeca, filtros), overlay


def _desfoque(clipe: dict, leitura: Leitura | None, altura: int, fps: float, alvo: str,
              roteiro: str, transparente: bool = False) -> tuple[list[str], str | None]:
    """
    (filtros, conteúdo do roteiro do sendcmd) do desfoque do clipe, ou ([], None) sem desfoque. O
    sigma é uma fração da altura do clipe (a mesma conta da prévia, que desfoca a textura) e muda por
    quadro na transição. A imagem ganha bordas repetidas antes do gblur e perde depois: assim a borda
    se comporta como o CLAMP_TO_EDGE da prévia. Com transparência (textos, logos, formas), o desfoque
    é feito no alfa pré-multiplicado, como na textura da prévia.
    """
    efeitos = list(leitura.efeitos) if leitura else []
    fixo = desfoque_do_efeito(clipe)
    if not fixo and not any(efeito["tipo"] == "desfoque" for efeito in efeitos):
        return [], None
    inicio = leitura.inicio if leitura else segundos(clipe["inicio"])
    fim = leitura.fim if leitura else segundos(clipe["inicio"] + clipe["duracao"])
    quadros = round((fim - inicio) * fps) + 1
    sigmas = [(fixo + desfoque_na_transicao(efeitos, inicio + n / fps)) * altura for n in range(quadros)]
    maior = max(sigmas)
    if maior < 0.05:
        return [], None
    if max(sigmas) - min(sigmas) < 1e-3:
        # Sigma fixo (só o efeito): sem roteiro
        return _filtros_do_gblur(f"gblur=sigma={maior:.4f}:steps=6", maior, transparente), None
    linhas, anterior = [], None
    for n, sigma in enumerate(sigmas):
        if anterior is None or abs(sigma - anterior) > 1e-3:
            linhas.append(f"{n / fps:.6f} gblur@{alvo} sigma {sigma:.4f}, gblur@{alvo} sigmaV {sigma:.4f};")
            anterior = sigma
    gblur = f"sendcmd=f='{_escapar_caminho(roteiro)}',gblur@{alvo}=sigma=0:steps=6"
    return _filtros_do_gblur(gblur, maior, transparente), "\n".join(linhas) + "\n"


def _cores_separadas(clipe: dict, leitura: Leitura | None, largura: int, fps: float, alvo: str,
                     roteiro: str) -> tuple[list[str], str | None]:
    """
    (filtros, roteiro) do vermelho e do azul separados (VHS e glitch): o rgbashift anda em pixels
    inteiros da largura do clipe; no glitch, o roteiro muda o desvio nos quadros em que ele salta.
    """
    if not efeito_do_clipe(clipe) or clipe["efeito"]["tipo"] not in ("vhs", "glitch"):
        return [], None
    inicio_clipe = segundos(clipe["inicio"])
    inicio = leitura.inicio if leitura else inicio_clipe
    fim = leitura.fim if leitura else segundos(clipe["inicio"] + clipe["duracao"])
    desvios = []
    for n in range(round((fim - inicio) * fps) + 1):
        quadro = math.floor((inicio + n / fps - inicio_clipe) * fps + 1e-6)
        # O rgbashift só aceita ±255 px: num clipe ampliado, 4% da largura passava disso e o filtro não abria
        desvios.append(max(-RGBASHIFT_MAXIMO, min(RGBASHIFT_MAXIMO, round(desvio_de_cor(clipe, quadro) * largura))))
    if len(set(desvios)) == 1:
        desvio = desvios[0]
        return ([f"rgbashift=rh={desvio}:bh={-desvio}:edge=smear"] if desvio else []), None
    linhas, anterior = [], None
    for n, desvio in enumerate(desvios):
        if desvio != anterior:
            linhas.append(f"{n / fps:.6f} rgbashift@{alvo} rh {desvio}, rgbashift@{alvo} bh {-desvio};")
            anterior = desvio
    return ([f"sendcmd=f='{_escapar_caminho(roteiro)}'", f"rgbashift@{alvo}=rh=0:bh=0:edge=smear"],
            "\n".join(linhas) + "\n")


def _roteiro_do_grao(clipe: dict, inicio: float, fim: float, fps: float, alvo: str, colunas: int) -> str:
    """Onde o recorte do grão começa em cada quadro da janela (sorteado pelo quadro do clipe)."""
    linhas = []
    for n in range(round((fim - inicio) * fps) + 1):
        quadro = math.floor((inicio + n / fps - segundos(clipe["inicio"])) * fps + 1e-6)
        x, y = deslocamento_do_grao(quadro, colunas)
        linhas.append(f"{n / fps:.6f} {alvo} x {x}, {alvo} y {y};")
    return "\n".join(linhas) + "\n"


def _sem_aro(filtro: str, com_alfa: bool) -> list[str]:
    """
    O filtro que interpola pixels (redimensionar, girar, a lente) no alfa pré-multiplicado, quando a imagem
    tem transparência, como a textura da prévia. Em alfa reto, a cor dos pixels transparentes (preta nos
    PNG) entrava na borda: um aro escuro em volta de logos, formas e textos. Num clipe opaco não faz
    diferença (medido: girar um vídeo branco sobre branco não escurece a borda), e fica de fora.
    """
    if not com_alfa:
        return [filtro]
    return ["format=gbrap", "premultiply=inplace=1", filtro, "unpremultiply=inplace=1"]


def _filtros_do_gblur(gblur: str, maior: float, transparente: bool) -> list[str]:
    """
    O gblur com bordas repetidas antes (pad + fillborders) e cortadas depois, como o CLAMP_TO_EDGE
    da prévia. Com transparência, no alfa pré-multiplicado.
    """
    borda = math.ceil(3 * maior) + 2
    filtros = [f"pad=w=iw+{2 * borda}:h=ih+{2 * borda}:x={borda}:y={borda}:color=black@0",
               f"fillborders=left={borda}:right={borda}:top={borda}:bottom={borda}:mode=smear",
               gblur,
               f"crop=w=iw-{2 * borda}:h=ih-{2 * borda}:x={borda}:y={borda}"]
    if transparente:
        filtros = ["premultiply=inplace=1", *filtros, "unpremultiply=inplace=1"]
    return filtros


def _continuar(cabeca: str, filtros: list[str]) -> str:
    """A cadeia `cabeca` (um rótulo como [3:v] ou uma cadeia já começada) seguida dos filtros."""
    if not filtros:
        return cabeca
    return cabeca + ("" if cabeca.endswith("]") else ",") + ",".join(filtros)


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
    resultado = {nome: {**animacao[nome], "duracao": segundos(animacao[nome]["duracao"])}
                 for nome in ("entrada", "saida")}
    if animacao.get("loop"):
        resultado["loop"] = {**animacao["loop"], "periodo": segundos(animacao["loop"]["periodo"])}
    return resultado


def _clipe_em_segundos(clipe: dict) -> dict:
    """O clipe de texto com início, duração, animações e tempos das palavras em segundos."""
    texto = clipe["texto"]
    tempos = texto.get("tempos")
    return {**clipe, "inicio": segundos(clipe["inicio"]), "duracao": segundos(clipe["duracao"]),
            "animacao": _animacao_em_segundos(clipe.get("animacao")),
            "texto": {**texto, "tempos": [segundos(t) for t in tempos] if tempos else None}}


def base_do_render(clipe: dict) -> dict:
    """
    A transformação que dá o tamanho da caixa no render: a dos keyframes (transformacao_de_base), no
    maior tamanho do pulsar e sem o giro, quando o balanço gira o clipe por quadro.
    """
    base = transformacao_de_base(clipe)
    base["escala"] *= maior_zoom_do_loop(clipe)
    if loop_gira(clipe):
        base["rotacao"] = 0
    return base


def _som_do_clipe(entrada: int, clipe: dict, pular: float = 0, abaixar: tuple[str, str] | None = None,
                  igualar_db: float = 0, reverb: tuple[int, str] | None = None,
                  andamento: tuple[str, list[str]] | None = None) -> str:
    """
    pular: segundos da mídia lida antes do começo do clipe (a sobra que a transição usa na imagem).
    abaixar: (roteiro do asendcmd, nome do volume) da curva do abaixar na fala.
    igualar_db: o ganho que leva a mídia a -14 LUFS, com o "Igualar o volume" ligado.
    reverb: (entrada do FFmpeg com a resposta ao impulso, nome único) quando o clipe tem reverb.
    andamento: (roteiro do asendcmd, nomes dos atempo) da velocidade com curva.
    Os efeitos de voz vêm depois da velocidade e antes do volume, como os nós da prévia, que ficam
    entre o elemento (já na velocidade) e o ganho.
    """
    atraso = round(segundos(clipe["inicio"]) * TAXA_AUDIO)
    duracao = segundos(clipe["duracao"])
    # Só o trecho do clipe soa: a sobra lida para a transição (antes, `pular`, e depois do fim, no clipe que
    # sai) fica de fora. Sem o corte no fim, o som do clipe que sai continuava pela transição.
    filtros = ["asetpts=PTS-STARTPTS",
               f"atrim=start={_numero(pular)}:duration={_numero(duracao * clipe['velocidade'])}",
               "asetpts=PTS-STARTPTS"]
    filtros += [
        f"aresample={TAXA_AUDIO}",
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        *(_atempo_com_roteiro(*andamento) if andamento else cadeia_atempo(clipe["velocidade"])),
    ]
    efeitos = clipe.get("efeitos_voz") or {}
    filtros += filtros_de_voz(efeitos)
    prefixo = ""
    if reverb:
        # A cauda da sala somada ao som seco: a convolução sem normalizar (afir) num ramo, depois a soma
        entrada_ir, nome = reverb
        mistura = f"amix=inputs=2:weights='1 {_numero(efeitos['reverb'])}':normalize=0:duration=first"
        prefixo = (f"[{entrada}:a]{','.join(filtros)},asplit=2[{nome}s][{nome}c];\n"
                   f"[{nome}c][{entrada_ir}:a]{afir_sem_normalizar()}[{nome}r];\n"
                   f"[{nome}s][{nome}r]{mistura}")
        filtros = []
    filtros.append(f"volume={_numero(clipe['volume'])}")
    if igualar_db:
        filtros.append(f"volume={_numero(igualar_db)}dB")
    if abaixar:
        # Abaixar na fala: o fator da curva muda a cada 10 ms (blocos de 480 amostras), pelo roteiro
        roteiro, alvo = abaixar
        filtros += ["asetnsamples=n=480:p=0", f"asendcmd=f='{_escapar_caminho(roteiro)}'", f"volume@{alvo}=volume=1"]
    # Fades no tempo do próprio clipe (depois da velocidade), antes de ir para o instante dele
    fade_entrada, fade_saida = segundos(clipe.get("fade_entrada", 0)), segundos(clipe.get("fade_saida", 0))
    curva = CURVAS_DO_FADE[clipe.get("curva_fade") or CURVA_PADRAO]
    if fade_entrada > 0:
        filtros.append(f"afade=t=in:st=0:d={_numero(fade_entrada)}:curve={curva}")
    if fade_saida > 0:
        filtros.append(f"afade=t=out:st={_numero(max(duracao - fade_saida, 0))}:d={_numero(fade_saida)}:curve={curva}")
    filtros.append(f"adelay={atraso}S:all=1")
    if prefixo:
        return prefixo + "".join(f",{filtro}" for filtro in filtros)
    return f"[{entrada}:a]{','.join(filtros)}"


def _atempo_com_roteiro(roteiro: str, alvos: list[str]) -> list[str]:
    """Os atempo em série que recebem o andamento da curva pelo roteiro (no tempo da mídia)."""
    return [f"asendcmd=f='{_escapar_caminho(roteiro)}'", *(f"{alvo}=tempo=1" for alvo in alvos)]


def _leitura_do_clipe(clipe: dict, janela: dict | None, midia: MidiaDoRender) -> Leitura:
    """O trecho a ler, contando a janela da transição e o que a mídia tem de sobra."""
    inicio, fim = segundos(clipe["inicio"]), segundos(clipe["inicio"] + clipe["duracao"])
    velocidade = clipe["velocidade"]
    entrada = segundos(clipe["entrada"])
    fim_na_midia = entrada + clipe["duracao"] / TICKS_POR_SEGUNDO * velocidade
    # A imagem pode acabar antes do contêiner (o som passa): o fim dela limita a sobra, e o que falta no
    # clipe é o último quadro repetido, com uma folga de 0,1 s (a mais é cortada pelo overlay)
    limite = midia.duracao_video or midia.duracao
    congelar = (fim_na_midia - midia.duracao_video) / velocidade + 0.1 if midia.duracao_video and \
        fim_na_midia > midia.duracao_video else 0
    if not janela:
        return Leitura(inicio, fim, congelar_fim=congelar)
    janela_inicio, janela_fim = segundos(janela["inicio"]), segundos(janela["fim"])
    # Antes do começo: quanto a mídia tem, e o resto vira quadro repetido
    antes = (inicio - janela_inicio) * velocidade
    sobra_antes = min(antes, entrada)
    pausa_inicio = (antes - sobra_antes) / velocidade
    # Depois do fim: o mesmo, com o fim da mídia (se for conhecido)
    depois = (janela_fim - fim) * velocidade
    sobra_depois = min(depois, max(limite - fim_na_midia, 0)) if limite else depois
    pausa_fim = (depois - sobra_depois) / velocidade
    efeitos = tuple({**e, "inicio": segundos(e["inicio"]), "duracao": segundos(e["duracao"])}
                    for e in janela["efeitos"])
    return Leitura(janela_inicio, janela_fim, pausa_inicio, pausa_fim, sobra_antes, efeitos, congelar)


def planejar_render(projeto: dict, midias: dict[str, MidiaDoRender], largura: int, altura: int,
                    textos: dict[str, ImagemDoTexto] | None = None, pasta: str = ".",
                    ganho_db: float = 0.0) -> PlanoDeRender:
    """
    projeto: a cópia guardada na exportação (proporcao, taxa, fundo, faixas, duracao).
    midias: id → arquivo e tamanho da imagem de cada mídia usada.
    textos: id do clipe → PNG de cada clipe de texto.
    pasta: onde o worker grava as LUTs e as imagens de vinheta listadas em `auxiliares`.
    ganho_db: o ganho da mistura, medido na primeira passada (veja ganho_para_o_alvo).
    """
    textos = textos or {}
    duracao = segundos(projeto["duracao"])
    if duracao <= 0:
        raise ErroRender("O projeto está vazio. Coloque alguma mídia na linha do tempo antes de exportar.")
    taxa = f"{projeto['taxa']['num']}/{projeto['taxa']['den']}"
    quadro = (largura, altura)
    # Imagem parada não tem tempo próprio: velocidade 1 e sem curva, seja o que for que o clipe guardou
    paradas = {i for i, m in midias.items() if m.imagem}
    if paradas:
        projeto = {**projeto, "faixas": [
            {**f, "clipes": [{**c, "velocidade": 1, "curva_velocidade": None} if c.get("midia_id") in paradas else c
                             for c in f["clipes"]]} for f in projeto["faixas"]]}

    # Imagem: faixas visíveis de baixo para cima (a lista do projeto vai de cima para baixo)
    visuais = [f for f in reversed(projeto["faixas"]) if f["tipo"] != FAIXA_AUDIO and not f.get("oculta")]
    # Som: faixas de áudio e as de imagem visíveis, menos as silenciadas (a prévia faz igual)
    com_som = [f for f in projeto["faixas"] if not f.get("muda") and (f["tipo"] == FAIXA_AUDIO or not f.get("oculta"))]
    clipes = [c for f in visuais for c in f["clipes"]]
    vistos = {c["id"] for c in clipes}
    clipes += [c for f in com_som for c in f["clipes"] if c["id"] not in vistos]
    if len(clipes) > LIMITE_CLIPES_RENDER:
        raise ErroRender(f"O projeto tem mais de {LIMITE_CLIPES_RENDER} clipes para exportar de uma vez.")

    # Na principal, as transições estendem a janela dos clipes vizinhos
    principal = next((f for f in projeto["faixas"] if f["tipo"] == "principal"), None)
    quadro_em_ticks = TICKS_POR_SEGUNDO * projeto["taxa"]["den"] / projeto["taxa"]["num"]
    janelas = (janelas_da_principal(sorted(principal["clipes"], key=lambda c: c["inicio"]), quadro_em_ticks)
               if principal else {})
    leituras: dict[str, Leitura] = {}

    entradas: list[Entrada] = []
    indice_da_entrada: dict[str, int] = {}
    indice_do_destaque: dict[str, int] = {}
    for clipe in clipes:
        indice_da_entrada[clipe["id"]] = len(entradas)
        if clipe.get("texto"):
            imagem = textos.get(clipe["id"])
            if imagem is None:
                raise ErroRender("Faltou a imagem de um texto do projeto.")
            entradas.append(Entrada(imagem.caminho, 0, segundos(clipe["duracao"]), imagem=True, taxa=taxa))
            if imagem.destaque:
                indice_do_destaque[clipe["id"]] = len(entradas)
                entradas.append(Entrada(imagem.destaque, 0, segundos(clipe["duracao"]), imagem=True, taxa=taxa))
            continue
        midia = midias.get(clipe["midia_id"])
        if midia is None:
            raise ErroRender("Uma mídia usada no projeto foi excluída ou não está pronta.")
        leitura = _leitura_do_clipe(clipe, janelas.get(clipe["id"]), midia)
        leituras[clipe["id"]] = leitura
        velocidade = clipe["velocidade"]
        lido = (leitura.fim - leitura.inicio - leitura.pausa_inicio - leitura.pausa_fim) * velocidade
        if midia.imagem:
            # A imagem em laço só na janela do clipe; antes do começo, o tpad repete o mesmo quadro
            entradas.append(Entrada(midia.caminho, 0, max(lido, 1 / 1000), imagem=True, taxa=taxa))
            continue
        ss = segundos(clipe["entrada"]) - leitura.pular_audio
        antecipar = min(ANTECIPAR_LEITURA, max(ss, 0))
        leituras[clipe["id"]] = replace(leitura, antecipar=antecipar)
        entradas.append(Entrada(midia.caminho, ss - antecipar, max(lido, 1 / 1000) + antecipar))

    auxiliares: dict[str, ArquivoAuxiliar] = {}
    cor = projeto["fundo"]["cor"].lstrip("#")
    linhas = [f"color=c=0x{cor}:s={largura}x{altura}:r={taxa}:d={_numero(duracao)},format=gbrp[base0]"]
    anterior = "base0"
    # Cada clipe é uma camada; o texto com destaque ganha outra por cima, com a imagem do destaque
    camadas = [(c, destaque) for f in visuais for c in f["clipes"]
               for destaque in ((False, True) if c["id"] in indice_do_destaque else (False,))]
    for numero, (clipe, destaque) in enumerate(camadas, start=1):
        if clipe.get("texto"):
            imagem = textos[clipe["id"]]
            referencia = (imagem.largura_referencia, imagem.altura_referencia)
            caixa = caixa_do_texto(base_do_render(clipe), referencia, quadro)
        else:
            midia = midias[clipe["midia_id"]]
            if not midia.video:
                continue
            midia_tamanho = (midia.largura, midia.altura)
            caixa = caixa_do_clipe(base_do_render(clipe), clipe["recorte"], midia_tamanho, quadro)
        if max(caixa.largura, caixa.altura) > LADO_MAXIMO_DA_CAIXA or \
                caixa.largura * caixa.altura > AREA_MAXIMA_DA_CAIXA:
            raise ErroRender(f"Um clipe ficou grande demais para exportar em {largura} × {altura} (zoom de "
                             f"{round(base_do_render(clipe)['escala'] * 100)}%). Diminua a escala dele ou exporte "
                             f"numa resolução menor.")
        # O efeito (VHS) soma aos ajustes de cor do clipe
        ajustes = somar_ajustes(ajustes_efetivos(clipe.get("cor")), ajustes_do_efeito(clipe))
        curvas = (clipe.get("cor") or {}).get("curvas")
        hsl = (clipe.get("cor") or {}).get("hsl")
        linhas_vhs = linhas_do_efeito(clipe)
        lut = vinheta = None
        if not cor_neutra({**ajustes, "vinheta": 0}) or not curvas_neutras(curvas) or not hsl_neutro(hsl):
            # A cor por matiz e as curvas entram na mesma LUT, depois dos ajustes
            com_curvas = {**ajustes, "curvas": None if curvas_neutras(curvas) else curvas,
                          "hsl": None if hsl_neutro(hsl) else hsl}
            lut = f"{pasta}/{nome_da_lut(com_curvas)}"
            auxiliares.setdefault(lut, ArquivoAuxiliar(lut, "lut", com_curvas))
        if ajustes["vinheta"] > 0 or linhas_vhs > 0:
            # As linhas do VHS entram na mesma imagem multiplicada da vinheta
            imagem_vinheta = f"{pasta}/vinheta_{clipe['id']}.png"
            tamanho = (max(1, round(caixa.largura)), max(1, round(caixa.altura)))
            auxiliares[imagem_vinheta] = ArquivoAuxiliar(imagem_vinheta, "vinheta", {**ajustes, "linhas": linhas_vhs},
                                                         *tamanho)
            vinheta = len(entradas)
            leitura = leituras.get(clipe["id"])
            janela = (leitura.fim - leitura.inicio) if leitura else segundos(clipe["duracao"])
            # A vinheta encontra o clipe já na velocidade dele: dura a janela no vídeo final
            entradas.append(Entrada(imagem_vinheta, 0, janela, imagem=True, taxa=taxa))
        cantos = None
        if tem_cantos(clipe):
            # A máscara dos cantos (com a máscara de forma, se houver) e, com borda, o anel na cor dela: imagens do
            # tamanho do clipe, como a vinheta
            tamanho = (max(1, round(caixa.largura)), max(1, round(caixa.altura)))
            leitura = leituras.get(clipe["id"])
            janela = (leitura.fim - leitura.inicio) if leitura else segundos(clipe["duracao"])
            imagens = []
            com_mascara = {**(clipe.get("cantos") or {}), "mascara": clipe.get("mascara")}
            for parte in ("cantos", "anel") if com_mascara.get("borda") else ("cantos",):
                caminho = f"{pasta}/{parte}_{clipe['id']}.png"
                auxiliares[caminho] = ArquivoAuxiliar(caminho, parte, com_mascara, *tamanho)
                imagens.append(len(entradas))
                entradas.append(Entrada(caminho, 0, janela, imagem=True, taxa=taxa))
            cantos = (imagens[0], imagens[1] if len(imagens) > 1 else None)
        e_imagem_parada = not clipe.get("texto") and midias[clipe["midia_id"]].imagem
        # Texto e imagem parada são PNG em RGB: entram como estão, como a prévia desenha
        entrada_de_cor = None
        if not clipe.get("texto") and not e_imagem_parada:
            entrada_de_cor = ler_como_bt709(midias[clipe["midia_id"]].matriz, midias[clipe["midia_id"]].hdr)
        roteiro = None
        if "opacidade" in animadas(clipe):
            # A opacidade por quadro, contando do começo da janela do clipe (com a sobra das transições)
            leitura = leituras.get(clipe["id"])
            fim_do_clipe = segundos(clipe["inicio"] + clipe["duracao"])
            janela = (leitura.inicio, leitura.fim) if leitura else (segundos(clipe["inicio"]), fim_do_clipe)
            roteiro = f"{pasta}/opacidade_{clipe['id']}_{numero}.txt"
            conteudo = comandos_de_opacidade(clipe, segundos(clipe["inicio"]), janela,
                                             float(taxa_em_fracao(taxa)), f"colorchannelmixer@op{numero}")
            auxiliares[roteiro] = ArquivoAuxiliar(roteiro, "comandos", {}, conteudo=conteudo)
        mascara = None
        if clipe.get("texto") and (destaque or tem_letra_a_letra(clipe)):
            # O trecho de letras que aparece muda por quadro, pelo roteiro (no tempo do clipe)
            mascara = (f"{pasta}/letras_{clipe['id']}{'_destaque' if destaque else ''}.txt", f"m{numero}c")
            conteudo = comandos_das_letras(_clipe_em_segundos(clipe), textos[clipe["id"]].layout,
                                           (segundos(clipe["inicio"]), segundos(clipe["inicio"] + clipe["duracao"])),
                                           float(taxa_em_fracao(taxa)), f"drawbox@{mascara[1]}",
                                           max(1, round(caixa.largura)), max(1, round(caixa.altura)), destaque)
            auxiliares[mascara[0]] = ArquivoAuxiliar(mascara[0], "comandos", {}, conteudo=conteudo)
        entrada = indice_do_destaque[clipe["id"]] if destaque else indice_da_entrada[clipe["id"]]
        if clipe.get("estabilizar") and not clipe.get("texto") and not e_imagem_parada:
            # A imagem estável no lugar da original (sobre a sem ruído, se ela está ligada; o som não muda)
            midia = midias[clipe["midia_id"]]
            chave = chave_da_estabilizacao(bool(clipe.get("imagem_limpa")))
            caminho = dict(midia.estaveis).get(chave)
            if not caminho:
                raise ErroRender("A imagem estável de um clipe ainda está sendo preparada. Espere terminar "
                                 "ou desligue \"Estabilizar\" para exportar.")
            lida = entradas[entrada]
            entrada = len(entradas)
            entradas.append(Entrada(caminho, lida.inicio, lida.duracao))
            entrada_de_cor = []
        elif clipe.get("imagem_limpa") and not clipe.get("texto") and not e_imagem_parada:
            # A imagem sem ruído no lugar da original (o som continua vindo da original)
            midia = midias[clipe["midia_id"]]
            if not midia.imagem_limpa:
                raise ErroRender("A imagem sem ruído de um clipe ainda está sendo preparada. Espere terminar "
                                 "ou desligue \"Tirar o ruído\" para exportar.")
            lida = entradas[entrada]
            entrada = len(entradas)
            entradas.append(Entrada(midia.imagem_limpa, lida.inicio, lida.duracao))
            entrada_de_cor = []
        caminho_desfoque = f"{pasta}/desfoque_{clipe['id']}_{numero}.txt"
        # Texto e imagem parada podem ter transparência: desfocados no alfa pré-multiplicado
        alfa_na_fonte = bool(clipe.get("texto")) or e_imagem_parada
        desfoque, roteiro_desfoque = _desfoque(clipe, leituras.get(clipe["id"]), max(1, round(caixa.altura)),
                                               float(taxa_em_fracao(taxa)), f"d{numero}", caminho_desfoque,
                                               alfa_na_fonte)
        if roteiro_desfoque:
            auxiliares[caminho_desfoque] = ArquivoAuxiliar(caminho_desfoque, "comandos", {}, conteudo=roteiro_desfoque)
        caminho_cores = f"{pasta}/cores_{clipe['id']}_{numero}.txt"
        cores, roteiro_cores = _cores_separadas(clipe, leituras.get(clipe["id"]), max(1, round(caixa.largura)),
                                                float(taxa_em_fracao(taxa)), f"g{numero}", caminho_cores)
        if roteiro_cores:
            auxiliares[caminho_cores] = ArquivoAuxiliar(caminho_cores, "comandos", {}, conteudo=roteiro_cores)
        desfoque += cores
        leitura = leituras.get(clipe["id"])
        inicio_janela = leitura.inicio if leitura else segundos(clipe["inicio"])
        fim_janela = leitura.fim if leitura else segundos(clipe["inicio"] + clipe["duracao"])
        luz = grao = None
        if luz_do_efeito(clipe):
            tira = f"{pasta}/luz_{clipe['id']}.png"
            auxiliares[tira] = ArquivoAuxiliar(tira, "luz", {"forca": luz_do_efeito(clipe)},
                                               max(1, round(caixa.largura)), max(1, round(caixa.altura)))
            luz = (len(entradas), segundos(clipe["inicio"]) - inicio_janela)
            entradas.append(Entrada(tira, 0, fim_janela - inicio_janela, imagem=True, taxa=taxa))
        if grao_do_efeito(clipe):
            imagem_grao = f"{pasta}/grao_{clipe['id']}.png"
            auxiliares[imagem_grao] = ArquivoAuxiliar(imagem_grao, "grao", {"forca": grao_do_efeito(clipe)})
            colunas = colunas_do_grao(caixa.largura, caixa.altura)
            roteiro_grao = f"{pasta}/grao_{clipe['id']}_{numero}.txt"
            auxiliares[roteiro_grao] = ArquivoAuxiliar(roteiro_grao, "comandos", {}, conteudo=_roteiro_do_grao(
                clipe, inicio_janela, fim_janela, float(taxa_em_fracao(taxa)), f"crop@gr{numero}", colunas))
            grao = (len(entradas), roteiro_grao, colunas)
            entradas.append(Entrada(imagem_grao, 0, fim_janela - inicio_janela, imagem=True, taxa=taxa))
        mascara_do_fundo = None
        if clipe.get("remover_fundo") and not clipe.get("texto") and not e_imagem_parada:
            midia = midias[clipe["midia_id"]]
            if not midia.mascara:
                raise ErroRender("O recorte do fundo de um clipe ainda está sendo preparado. Espere terminar "
                                 "ou desligue \"Remover o fundo\" para exportar.")
            lida = entradas[indice_da_entrada[clipe["id"]]]
            mascara_do_fundo = len(entradas)
            entradas.append(Entrada(midia.mascara, lida.inicio, lida.duracao))
        cadeia, overlay = _video_do_clipe(entrada, clipe, caixa, taxa, quadro, numero, lut, vinheta,
                                          leitura, entrada_de_cor, roteiro, mascara, desfoque, luz, grao,
                                          mascara_do_fundo, alfa_na_fonte, cantos)
        linhas.append(f"{cadeia}[c{numero}]")
        mesclagem = clipe.get("mesclagem") or "normal"
        if mesclagem == "normal":
            linhas.append(f"[{anterior}][c{numero}]{overlay}[base{numero}]")
        else:
            # A camada achatada num quadro da cor que não muda nada no modo (a opacidade vira mistura
            # com essa cor), depois o blend com o que está embaixo: a conta das funções de mistura da prévia
            neutra = "white" if mesclagem == "multiplicar" else "black"
            linhas.append(f"color=c={neutra}:s={largura}x{altura}:r={taxa}:d={_numero(duracao)},format=gbrp[n{numero}]")
            linhas.append(f"[n{numero}][c{numero}]{overlay}[l{numero}]")
            linhas.append(f"[{anterior}][l{numero}]blend=all_mode={MODOS_DE_MESCLAGEM[mesclagem]},format=gbrp[base{numero}]")
        anterior = f"base{numero}"
    # A saída é sempre BT.709, marcada (argumentos_de_saida): todo player mostra a cor da prévia
    linhas.append(f"[{anterior}]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,{FILTRO_MARCAS_BT709}[v]")

    sons, linhas_som = [], []
    for faixa in com_som:
        for clipe in faixa["clipes"]:
            if clipe.get("midia_id") and midias[clipe["midia_id"]].audio:
                sons.append(f"a{len(sons)}")
                # O som pula a sobra da transição e o que foi aberto antes do trecho
                leitura = leituras.get(clipe["id"])
                pular = leitura.pular_audio + leitura.antecipar if leitura else 0
                entrada_do_som = indice_da_entrada[clipe["id"]]
                if clipe.get("tom"):
                    # A voz em outro tom (sobre a voz limpa, se ela está ligada) tem o mesmo tempo do original
                    midia = midias[clipe["midia_id"]]
                    caminho_tom = dict(midia.tons).get(chave_do_tom(clipe["tom"], bool(clipe.get("voz_limpa"))))
                    if not caminho_tom:
                        raise ErroRender("O tom da voz de um clipe ainda está sendo preparado. Espere terminar "
                                         "ou volte o tom ao original para exportar.")
                    lida = entradas[entrada_do_som]
                    entrada_do_som = len(entradas)
                    entradas.append(Entrada(caminho_tom, lida.inicio, lida.duracao))
                elif clipe.get("voz_limpa"):
                    # A voz limpa tem o mesmo tempo do original: abre o mesmo trecho dela
                    midia = midias[clipe["midia_id"]]
                    if not midia.voz_limpa:
                        raise ErroRender("A voz limpa de um clipe ainda está sendo preparada. Espere terminar "
                                         "ou desligue \"Limpar a voz\" para exportar.")
                    lida = entradas[entrada_do_som]
                    entrada_do_som = len(entradas)
                    entradas.append(Entrada(midia.voz_limpa, lida.inicio, lida.duracao))
                abaixar = None
                if (clipe.get("abaixamento") or {}).get("pontos"):
                    abaixar = (f"{pasta}/volume_{clipe['id']}.txt", f"ab{len(sons)}")
                    conteudo = comandos_de_volume(clipe["abaixamento"]["pontos"], segundos(clipe["duracao"]),
                                                  f"volume@{abaixar[1]}")
                    auxiliares[abaixar[0]] = ArquivoAuxiliar(abaixar[0], "comandos", {}, conteudo=conteudo)
                igualar = ganho_para_igualar(midias[clipe["midia_id"]].lufs) if clipe.get("igualar_volume") else 0
                reverb = None
                if ((clipe.get("efeitos_voz") or {}).get("reverb") or 0) > 0:
                    # A resposta ao impulso da sala: o mesmo arquivo, uma entrada para cada clipe
                    caminho_ir = f"{pasta}/{ARQUIVO_REVERB}"
                    auxiliares[caminho_ir] = ArquivoAuxiliar(caminho_ir, "reverb", {})
                    reverb = (len(entradas), f"rv{len(sons)}")
                    entradas.append(Entrada(caminho_ir, 0, REVERB_DURACAO_S))
                andamento = None
                if clipe.get("curva_velocidade"):
                    # O som segue a curva: o andamento muda a cada 50 ms, dividido pelos atempo que fazem falta
                    necessarios = atempo_necessarios(clipe["curva_velocidade"], clipe["velocidade"],
                                                     segundos(clipe["duracao"]))
                    alvos = [f"atempo@an{len(sons)}{letra}" for letra in "abc"[:necessarios]]
                    roteiro_andamento = f"{pasta}/andamento_{clipe['id']}.txt"
                    auxiliares[roteiro_andamento] = ArquivoAuxiliar(roteiro_andamento, "comandos", {}, conteudo=(
                        comandos_do_andamento(clipe["curva_velocidade"], clipe["velocidade"],
                                              segundos(clipe["duracao"]), alvos)))
                    andamento = (roteiro_andamento, alvos)
                cadeia = _som_do_clipe(entrada_do_som, clipe, pular, abaixar, igualar, reverb, andamento)
                linhas_som.append(f"{cadeia}[{sons[-1]}]")
    inicio_fade_saida = _numero(max(duracao - FADE_SAIDA, 0))
    fim_do_som = (f"apad,atrim=0:{_numero(duracao)},"
                  f"afade=t=in:d={FADE_ENTRADA},afade=t=out:st={inicio_fade_saida}:d={FADE_SAIDA}[a]")
    filtro_som = som = ""
    if sons:
        # O som é misturado e medido antes, num arquivo (filtro_som); aqui ele entra depois das mídias.
        # Ganho fixo e limitador só nos picos: o equilíbrio e os fades ficam iguais aos da prévia.
        som = f"{pasta}/{ARQUIVO_SOM}"
        filtro_som = ";\n".join([*linhas_som, "".join(f"[{rotulo}]" for rotulo in sons)
                                 + f"amix=inputs={len(sons)}:duration=longest:normalize=0,"
                                 + f"aresample={TAXA_AUDIO},ebur128=framelog=quiet[m]"])
        limite = 10 ** (PICO_MAXIMO_DB / 20)
        linhas.append(f"[{len(entradas)}:a]volume={_numero(ganho_db)}dB,"
                      f"alimiter=limit={_numero(limite)}:level=0:latency=1,{fim_do_som}")
    else:
        linhas.append(f"anullsrc=r={TAXA_AUDIO}:cl=stereo,{fim_do_som}")

    return PlanoDeRender(entradas=entradas, filtro=";\n".join(linhas), duracao=duracao, taxa=taxa, tem_som=bool(sons),
                         auxiliares=tuple(auxiliares.values()), filtro_som=filtro_som, som=som)


def ganho_para_o_alvo(lufs_medido: float | None) -> float:
    """Quanto subir ou descer a mistura inteira para chegar em -14 LUFS. Silêncio não ganha nada."""
    if lufs_medido is None or lufs_medido <= SILENCIO_LUFS:
        return 0.0
    return min(max(LUFS_ALVO - lufs_medido, -GANHO_MAXIMO_DB), GANHO_MAXIMO_DB)


def ler_loudness(saida_ebur128: str) -> float | None:
    """O loudness integrado (I) do resumo que o ebur128 escreve no fim."""
    encontrados = re.findall(r"I:\s+(-?\d+(?:\.\d+)?|-inf) LUFS", saida_ebur128)
    if not encontrados or encontrados[-1] == "-inf":
        return None
    return float(encontrados[-1])


def argumentos_do_som(plano: PlanoDeRender, caminho_filtro: str) -> list[str]:
    """
    Primeira passada: mistura o som de todos os clipes no arquivo `plano.som` e mede o loudness dele.
    O `filtro_som` fica no arquivo caminho_filtro.
    """
    entradas = [argumento for entrada in plano.entradas for argumento in entrada.argumentos()]
    return [*entradas, *opcao_filtro_em_arquivo(caminho_filtro), "-map", "[m]", "-c:a", "pcm_f32le", plano.som]


def argumentos_do_video(plano: PlanoDeRender, caminho_filtro: str) -> list[str]:
    """Segunda passada: as mídias, o som já misturado (se houver) e o grafo em caminho_filtro."""
    entradas = [argumento for entrada in plano.entradas for argumento in entrada.argumentos()]
    if plano.tem_som:
        entradas += ["-i", plano.som]
    return [*entradas, *opcao_filtro_em_arquivo(caminho_filtro)]


def argumentos_de_saida(plano: PlanoDeRender, caminho_saida: str, lado_maior: int) -> list[str]:
    """Codificação do vídeo final: H.264 e AAC, com o índice no começo para tocar enquanto baixa."""
    # O 4K demora muito no preset medium; o fast fica perto na qualidade com o CRF baixo
    preset = "fast" if lado_maior > 2000 else "medium"
    return [
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", preset, "-crf", "18", "-pix_fmt", "yuv420p", *MARCAS_BT709, "-r", plano.taxa,
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
