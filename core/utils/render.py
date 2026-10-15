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
from dataclasses import dataclass
from fractions import Fraction
from functools import lru_cache

from core.config import FFMPEG
from core.utils.animacao import filtros_de_animacao
from core.utils.cor import ajustes_efetivos, cor_neutra, nome_da_lut
from core.utils.ffmpeg import MARCAS_BT709, ler_como_bt709
from core.utils.geometria import Caixa, caixa_do_clipe, caixa_do_texto
from core.utils.tempo import TICKS_POR_SEGUNDO
from core.utils.transicao import filtro_de_cortina, filtros_de_transicao, janelas_da_principal

TAXA_AUDIO = 48000
LUFS_ALVO = -14
PICO_MAXIMO_DB = -1.5
# Abaixo disso a mistura é silêncio (o ebur128 não mede menos que -70); e o ganho tem um teto
SILENCIO_LUFS = -70
GANHO_MAXIMO_DB = 30
# A mistura em ponto flutuante: antes do ganho, o volume ainda pode passar de 1
ARQUIVO_SOM = "som.mka"
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
    duracao: float = 0     # segundos; 0 quando não se sabe (aí não há limite no fim)
    matriz: str | None = None   # matriz de cor marcada no arquivo; sem ela, o vídeo é lido como BT.709
    voz_limpa: str | None = None   # a voz sem ruído, no mesmo tempo do original, quando já foi gerada


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
                    leitura: Leitura | None = None, entrada_de_cor: list[str] | None = None) -> tuple[str, str]:
    """
    (cadeia que prepara a imagem do clipe, expressão do overlay que a coloca no quadro).
    lut: caminho da LUT da cor; vinheta: entrada do FFmpeg com a imagem da vinheta.
    leitura: a janela do clipe com as transições (só na faixa principal).
    entrada_de_cor: filtros do começo que dizem como ler a cor do vídeo (ler_como_bt709).
    """
    recorte = clipe["recorte"]
    leitura = leitura or Leitura(segundos(clipe["inicio"]), segundos(clipe["inicio"] + clipe["duracao"]))
    inicio = leitura.inicio
    largura = max(1, round(caixa.largura))
    altura = max(1, round(caixa.altura))
    filtros = [
        *(entrada_de_cor or []),
        f"setpts=(PTS-STARTPTS)/{_numero(clipe['velocidade'])}",
        f"fps={taxa}",
        # Recorte em frações da imagem, como o compositor da prévia faz nas coordenadas da textura
        f"crop=w=iw*{_numero(recorte['largura'])}:h=ih*{_numero(recorte['altura'])}"
        f":x=iw*{_numero(recorte['x'])}:y=ih*{_numero(recorte['y'])}",
        f"scale={largura}:{altura}:flags=bicubic",
        "setsar=1",
        "format=rgba",
    ]
    if leitura.pausa_inicio > 0 or leitura.pausa_fim > 0:
        # Sem sobra na mídia para a transição: repete o primeiro ou o último quadro
        depois_do_fps = len(entrada_de_cor or []) + 2
        filtros.insert(depois_do_fps, f"tpad=start_mode=clone:start_duration={_numero(leitura.pausa_inicio)}"
                          f":stop_mode=clone:stop_duration={_numero(leitura.pausa_fim)}")
    if lut:
        filtros.append(f"lut3d=file='{_escapar_caminho(lut)}':interp=tetrahedral")
    # Cortina: some o que ainda não foi revelado, nas coordenadas do clipe (antes de girar, como a prévia)
    cortina = filtro_de_cortina(list(leitura.efeitos), inicio) if leitura.efeitos else None
    if cortina:
        filtros.append(cortina)
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
    fim = leitura.fim
    # As animações seguem o começo e o fim do próprio clipe; as transições, a janela delas
    inicio_clipe = segundos(clipe["inicio"])
    fim_clipe = segundos(clipe["inicio"] + clipe["duracao"])
    animacao = filtros_de_animacao({**clipe, "inicio": inicio_clipe, "duracao": fim_clipe - inicio_clipe,
                                    "animacao": _animacao_em_segundos(clipe.get("animacao"))}, inicio_clipe, fim_clipe)
    if leitura.efeitos:
        transicao = filtros_de_transicao(list(leitura.efeitos))
        escalas = [e for e in (animacao["escala"], transicao["escala"]) if e]
        animacao = {
            "fades": animacao["fades"] + transicao["fades"],
            "escala": "*".join(escalas) or None,
            "dx": transicao["dx"] if animacao["dx"] == "0" else f"{animacao['dx']}+{transicao['dx']}",
            "dy": animacao["dy"],
        }
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


def _som_do_clipe(entrada: int, clipe: dict, pular: float = 0) -> str:
    """pular: segundos da mídia lida antes do começo do clipe (a sobra que a transição usa na imagem)."""
    atraso = round(segundos(clipe["inicio"]) * TAXA_AUDIO)
    duracao = segundos(clipe["duracao"])
    filtros = ["asetpts=PTS-STARTPTS"]
    if pular > 0:
        filtros += [f"atrim=start={_numero(pular)}:duration={_numero(duracao * clipe['velocidade'])}",
                    "asetpts=PTS-STARTPTS"]
    filtros += [
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


def _leitura_do_clipe(clipe: dict, janela: dict | None, midia: MidiaDoRender) -> Leitura:
    """O trecho a ler, contando a janela da transição e o que a mídia tem de sobra."""
    inicio, fim = segundos(clipe["inicio"]), segundos(clipe["inicio"] + clipe["duracao"])
    if not janela:
        return Leitura(inicio, fim)
    velocidade = clipe["velocidade"]
    janela_inicio, janela_fim = segundos(janela["inicio"]), segundos(janela["fim"])
    entrada = segundos(clipe["entrada"])
    # Antes do começo: quanto a mídia tem, e o resto vira quadro repetido
    antes = (inicio - janela_inicio) * velocidade
    sobra_antes = min(antes, entrada)
    pausa_inicio = (antes - sobra_antes) / velocidade
    # Depois do fim: o mesmo, com o fim da mídia (se for conhecido)
    depois = (janela_fim - fim) * velocidade
    fim_na_midia = entrada + clipe["duracao"] / TICKS_POR_SEGUNDO * velocidade
    sobra_depois = min(depois, max(midia.duracao - fim_na_midia, 0)) if midia.duracao else depois
    pausa_fim = (depois - sobra_depois) / velocidade
    efeitos = tuple({**e, "inicio": segundos(e["inicio"]), "duracao": segundos(e["duracao"])}
                    for e in janela["efeitos"])
    return Leitura(janela_inicio, janela_fim, pausa_inicio, pausa_fim, sobra_antes, efeitos)


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
    janelas = janelas_da_principal(sorted(principal["clipes"], key=lambda c: c["inicio"])) if principal else {}
    leituras: dict[str, Leitura] = {}

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
        leitura = _leitura_do_clipe(clipe, janelas.get(clipe["id"]), midia)
        leituras[clipe["id"]] = leitura
        velocidade = clipe["velocidade"]
        ss = segundos(clipe["entrada"]) - leitura.pular_audio
        lido = (leitura.fim - leitura.inicio - leitura.pausa_inicio - leitura.pausa_fim) * velocidade
        entradas.append(Entrada(midia.caminho, ss, max(lido, 1 / 1000)))

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
            leitura = leituras.get(clipe["id"])
            janela = (leitura.fim - leitura.inicio) if leitura else segundos(clipe["duracao"])
            # A vinheta encontra o clipe já na velocidade dele: dura a janela no vídeo final
            entradas.append(Entrada(imagem_vinheta, 0, janela, imagem=True, taxa=taxa))
        entrada_de_cor = None if clipe.get("texto") else ler_como_bt709(midias[clipe["midia_id"]].matriz)
        cadeia, overlay = _video_do_clipe(indice_da_entrada[clipe["id"]], clipe, caixa, taxa, quadro,
                                          numero, lut, vinheta, leituras.get(clipe["id"]), entrada_de_cor)
        linhas.append(f"{cadeia}[c{numero}]")
        linhas.append(f"[{anterior}][c{numero}]{overlay}[base{numero}]")
        anterior = f"base{numero}"
    # A saída é sempre BT.709, marcada (argumentos_de_saida): todo player mostra a cor da prévia
    linhas.append(f"[{anterior}]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]")

    sons, linhas_som = [], []
    for faixa in com_som:
        for clipe in faixa["clipes"]:
            if clipe.get("midia_id") and midias[clipe["midia_id"]].audio:
                sons.append(f"a{len(sons)}")
                pular = leituras[clipe["id"]].pular_audio if clipe["id"] in leituras else 0
                entrada_do_som = indice_da_entrada[clipe["id"]]
                if clipe.get("voz_limpa"):
                    # A voz limpa tem o mesmo tempo do original: abre o mesmo trecho dela
                    midia = midias[clipe["midia_id"]]
                    if not midia.voz_limpa:
                        raise ErroRender("A voz limpa de um clipe ainda está sendo preparada. Espere terminar "
                                         "ou desligue \"Limpar a voz\" para exportar.")
                    lida = entradas[entrada_do_som]
                    entrada_do_som = len(entradas)
                    entradas.append(Entrada(midia.voz_limpa, lida.inicio, lida.duracao))
                linhas_som.append(f"{_som_do_clipe(entrada_do_som, clipe, pular)}[{sons[-1]}]")
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
