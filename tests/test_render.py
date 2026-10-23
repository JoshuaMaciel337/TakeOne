# Planejamento do render e da exportação: funções puras, sem FFmpeg e sem banco
from datetime import datetime, timedelta

import pytest

from core.config import TZ
from core.modelos.exportacao import (
    hash_do_token,
    link_vencido,
    montar_exportacao,
    montar_link_celular,
    nome_de_arquivo,
    tamanho_de_saida,
)
from core.utils.render import (
    ErroRender,
    ImagemDoTexto,
    MidiaDoRender,
    argumentos_de_saida,
    argumentos_do_som,
    argumentos_do_video,
    cadeia_atempo,
    ganho_para_o_alvo,
    ler_loudness,
    planejar_render,
)
from core.utils.som import afir_sem_normalizar
from core.utils.tempo import TICKS_POR_SEGUNDO

S = TICKS_POR_SEGUNDO
PADRAO = {"transformacao": {"x": 0, "y": 0, "escala": 1, "rotacao": 0, "opacidade": 1},
          "recorte": {"x": 0, "y": 0, "largura": 1, "altura": 1}}


def clipe(id_, midia, inicio, duracao, entrada=0, **campos):
    return {"id": id_, "midia_id": midia, "inicio": inicio * S, "duracao": duracao * S, "entrada": entrada * S,
            "velocidade": 1, "volume": 1, **PADRAO, **campos}


def faixa(tipo, clipes, **campos):
    return {"id": f"f-{tipo}", "tipo": tipo, "oculta": False, "muda": False, "travada": False,
            "clipes": clipes, **campos}


def projeto(faixas, duracao=4):
    return {"proporcao": "9:16", "taxa": {"num": 30, "den": 1}, "fundo": {"cor": "#203040"},
            "faixas": faixas, "duracao": duracao * S}


MIDIAS = {
    "deitado": MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True),
    "empe": MidiaDoRender("/m/empe.mp4", 720, 1280, video=True, audio=False, matriz="smpte170m"),
    "musica": MidiaDoRender("/m/musica.m4a", 0, 0, video=False, audio=True),
}


@pytest.mark.parametrize(("proporcao", "resolucao", "esperado"), [
    ("9:16", "1080p", (1080, 1920)),
    ("16:9", "720p", (1280, 720)),
    ("1:1", "4k", (2160, 2160)),
    ("4:5", "1080p", (1080, 1350)),
    ("21:9", "1080p", (2520, 1080)),
])
def test_tamanho_de_saida_tem_a_resolucao_no_lado_menor(proporcao, resolucao, esperado):
    assert tamanho_de_saida(proporcao, resolucao) == esperado


def test_entradas_abrem_so_o_trecho_de_cada_clipe():
    rapido = clipe("c2", "deitado", 2, 2, entrada=1, velocidade=2)
    plano = planejar_render(projeto([faixa("principal", [clipe("c1", "deitado", 0, 2), rapido])]), MIDIAS, 1080, 1920)
    assert plano.duracao == 4
    assert plano.taxa == "30/1"
    # O segundo abre 0,1 s antes da entrada e a cadeia desconta (mais a folga de 0,5 ms da prévia)
    assert [e.argumentos() for e in plano.entradas] == [
        ["-ss", "0.000000", "-t", "2.000000", "-i", "/m/deitado.mp4"],
        ["-ss", "0.900000", "-t", "4.100000", "-i", "/m/deitado.mp4"],   # 2 s no vídeo, em dobro
    ]
    assert "setpts=(PTS-STARTPTS-0.0005/TB)/1" in plano.filtro
    assert "setpts=(PTS-0.1005/TB)/2" in plano.filtro
    assert "atrim=start=0.1:duration=4" in plano.filtro_som
    assert "atempo=2" in plano.filtro_som


def test_camadas_de_baixo_para_cima_com_a_caixa_da_geometria():
    sobre = clipe("c2", "empe", 0, 4, transformacao={"x": 0.1, "y": -0.25, "escala": 0.5, "rotacao": 30,
                                                     "opacidade": 0.5},
                  recorte={"x": 0.25, "y": 0, "largura": 0.5, "altura": 1})
    plano = planejar_render(projeto([faixa("video", [sobre]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            MIDIAS, 1080, 1920)
    linhas = plano.filtro.split(";\n")
    assert linhas[0] == "color=c=0x203040:s=1080x1920:r=30/1:d=4,format=gbrp[base0]"
    # A principal (entrada 0) entra primeiro; a sobreposição (entrada 1) por cima dela
    assert linhas[1].startswith("[0:v]") and linhas[3].startswith("[1:v]")
    assert "[base0][c1]overlay=x=540-overlay_w/2:y=960-overlay_h/2" in linhas[2]
    sobreposicao = linhas[3]
    assert "crop=w=iw*0.5:h=ih*1:x=iw*0.25:y=ih*0" in sobreposicao
    # 360 × 1280 recortado cabe em 1080 × 1920 com encaixe 1,5 (540 × 1920); com escala 0,5 fica 270 × 960
    assert "scale=270:960" in sobreposicao
    assert "colorchannelmixer=aa=0.5" in sobreposicao
    assert "rotate=a=0.523599" in sobreposicao
    assert "overlay=x=648-overlay_w/2:y=480-overlay_h/2:format=rgb" in linhas[4]
    # A saída marca a cor nos quadros também: só com as opções, o FFmpeg 7 deixava as primárias "unknown"
    assert linhas[5] == ("[base2]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
                         "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv[v]")
    # Sem marcação de cor, o vídeo é lido como BT.709 (como o Chrome na prévia); com marcação, como ela diz
    assert linhas[1].startswith("[0:v]setparams=colorspace=bt709,setpts=")
    assert linhas[3].startswith("[1:v]setpts=")
    # E o vídeo final sai marcado como BT.709
    saida = argumentos_de_saida(plano, "/tmp/v.mp4", 1920)
    assert saida[saida.index("-colorspace") + 1] == "bt709" and saida[saida.index("-color_range") + 1] == "tv"


def test_clipe_aparece_do_inicio_ao_fim_com_meio_quadro_de_folga():
    plano = planejar_render(projeto([faixa("principal", [clipe("c1", "deitado", 0, 2), clipe("c2", "deitado", 2, 2)])]),
                            MIDIAS, 1080, 1920)
    assert "enable='gte(t,-0.016667)*lt(t,1.983333)'" in plano.filtro
    assert "enable='gte(t,1.983333)*lt(t,3.983333)'" in plano.filtro


def test_som_entra_no_instante_do_clipe_e_respeita_faixa_muda_e_oculta():
    musica = clipe("m1", "musica", 1.5, 2.5, volume=0.5)
    plano = planejar_render(projeto([
        faixa("principal", [clipe("c1", "deitado", 0, 4)]),
        faixa("audio", [musica]),
    ]), MIDIAS, 1080, 1920, pasta="/tmp/exp")
    assert plano.tem_som
    # O som é misturado na primeira passada, só de áudio, e medido pelo ebur128
    som = plano.filtro_som
    assert "[1:a]" in som and "adelay=72000S:all=1" in som and "volume=0.5" in som and "[0:v]" not in som
    assert som.endswith("amix=inputs=2:duration=longest:normalize=0,aresample=48000,ebur128=framelog=quiet[m]")
    assert plano.som == "/tmp/exp/som.mka"
    assert argumentos_do_som(plano, "f.txt")[-4:] == ["[m]", "-c:a", "pcm_f32le", "/tmp/exp/som.mka"]
    # No vídeo, a mistura entra depois das mídias, com ganho fixo e limitador; sem loudnorm, que sobe os trechos baixos
    assert argumentos_do_video(plano, "f.txt").count("-i") == len(plano.entradas) + 1
    assert "[2:a]volume=0dB,alimiter=limit=0.841395:level=0:latency=1,apad" in plano.filtro
    assert "[1:a]" not in plano.filtro and "loudnorm" not in plano.filtro
    com_ganho = planejar_render(projeto([
        faixa("principal", [clipe("c1", "deitado", 0, 4)]),
        faixa("audio", [musica]),
    ]), MIDIAS, 1080, 1920, ganho_db=-3.25)
    assert "[2:a]volume=-3.25dB," in com_ganho.filtro

    sem_som = planejar_render(projeto([
        faixa("principal", [clipe("c1", "deitado", 0, 4)], muda=True),
        faixa("video", [clipe("c2", "deitado", 0, 4)], oculta=True),
    ]), MIDIAS, 1080, 1920)
    assert not sem_som.tem_som and sem_som.filtro_som == ""
    assert argumentos_do_video(sem_som, "f.txt").count("-i") == len(sem_som.entradas)
    assert "anullsrc" in sem_som.filtro
    assert "[1:v]" not in sem_som.filtro, "faixa oculta não aparece"


def test_atempo_em_cadeia_abaixo_de_meio():
    assert cadeia_atempo(1) == []
    assert cadeia_atempo(0.25) == ["atempo=0.5", "atempo=0.5"]
    assert cadeia_atempo(0.3) == ["atempo=0.5", "atempo=0.6"]
    assert cadeia_atempo(3) == ["atempo=3"]


def test_projeto_vazio_ou_com_midia_faltando_nao_renderiza():
    with pytest.raises(ErroRender, match="vazio"):
        planejar_render(projeto([faixa("principal", [])], duracao=0), MIDIAS, 1080, 1920)
    with pytest.raises(ErroRender, match="excluída"):
        planejar_render(projeto([faixa("principal", [clipe("c1", "sumiu", 0, 4)])]), MIDIAS, 1080, 1920)


def test_exportacao_guarda_uma_copia_do_projeto():
    doc = {"_id": "p1", "nome": "Lançamento", **projeto([faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
           "versao": 7, "midias_usadas": ["deitado"]}
    exportacao = montar_exportacao("org", "usuario", doc, "720p")
    assert (exportacao["largura"], exportacao["altura"], exportacao["status"]) == (720, 1280, "processando")
    assert exportacao["projeto"]["versao"] == 7 and "midias_usadas" not in exportacao["projeto"]
    assert nome_de_arquivo("Reels · Lançamento!") == "reels-lancamento.mp4"
    assert nome_de_arquivo("!!!") == "takeone.mp4"


def test_link_do_celular_vale_24_horas_e_guarda_so_o_hash():
    agora = datetime(2026, 10, 13, 12, 0, tzinfo=TZ)
    token, link = montar_link_celular(agora)
    assert link["token_hash"] == hash_do_token(token) and token not in str(link)
    assert not link_vencido(link, agora + timedelta(hours=23))
    assert link_vencido(link, agora + timedelta(hours=24))
    assert link_vencido(None)


def test_fades_no_tempo_do_clipe_antes_do_atraso():
    com_fade = clipe("c1", "deitado", 1, 3, fade_entrada=S // 2, fade_saida=S)
    plano = planejar_render(projeto([faixa("principal", [com_fade])]), MIDIAS, 1080, 1920)
    fades = "afade=t=in:st=0:d=0.5:curve=tri,afade=t=out:st=2:d=1:curve=tri"
    assert f"volume=1,{fades},adelay=48000S:all=1" in plano.filtro_som


def test_texto_entra_como_imagem_parada_com_a_caixa_do_lado_de_referencia():
    titulo = {"id": "t1", "midia_id": None, "texto": {"conteudo": "Oi"}, "inicio": S, "duracao": 2 * S,
              "entrada": 0, "velocidade": 1, "volume": 1, **PADRAO}
    projeto_com_texto = projeto([faixa("texto", [titulo]), faixa("principal", [clipe("c1", "deitado", 0, 4)])])
    textos = {"t1": ImagemDoTexto("/tmp/texto_t1.png", 540, 120)}
    plano = planejar_render(projeto_com_texto, MIDIAS, 720, 1280, textos)
    assert plano.entradas[1].argumentos() == ["-loop", "1", "-framerate", "30/1", "-t", "2.000000",
                                              "-i", "/tmp/texto_t1.png"]
    # Em 720 de lado menor, o PNG medido em 1080 fica com dois terços: 360 × 80
    assert "scale=360:80" in plano.filtro and "setpts=PTS+round(30*1/30/TB)" in plano.filtro
    assert "[1:a]" not in plano.filtro_som, "texto não tem som"
    with pytest.raises(ErroRender, match="texto"):
        planejar_render(projeto_com_texto, MIDIAS, 720, 1280, {})


def test_legenda_sai_como_texto_por_cima_de_tudo():
    legenda = {"id": "l1", "midia_id": None, "texto": {"conteudo": "Oi"}, "inicio": 0, "duracao": 2 * S,
               "entrada": 0, "velocidade": 1, "volume": 1, **PADRAO}
    plano = planejar_render(projeto([faixa("legenda", [legenda]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            MIDIAS, 720, 1280, {"l1": ImagemDoTexto("/tmp/l1.png", 300, 80)})
    linhas = plano.filtro.split(";\n")
    assert linhas[1].startswith("[0:v]") and linhas[3].startswith("[1:v]"), "a legenda é a última camada"


def test_animacao_vira_fade_zoom_e_movimento_no_grafo():
    animado = {"id": "t1", "midia_id": None, "texto": {"conteudo": "Oi"}, "inicio": S, "duracao": 3 * S,
               "entrada": 0, "velocidade": 1, "volume": 1, **PADRAO,
               "animacao": {"entrada": {"tipo": "subir", "duracao": S // 2}, "saida": {"tipo": "zoom", "duracao": S}}}
    plano = planejar_render(projeto([faixa("texto", [animado]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            MIDIAS, 720, 1280, {"t1": ImagemDoTexto("/tmp/t1.png", 540, 120)})
    assert "fade=t=in:st=1:d=0.5:alpha=1" in plano.filtro
    assert "fade=t=out:st=3:d=1:alpha=1" in plano.filtro
    assert "scale=w='max(1,iw*(0.6+0.4*(1-pow(1-clip((4-t)/1,0,1),3))))'" in plano.filtro
    assert ":eval=frame" in plano.filtro and "pad=w=" in plano.filtro
    assert "y='640+1280*(1*pow(1-clip((t-1)/0.5,0,1),3)*0.08)-overlay_h/2'" in plano.filtro


def test_loop_vira_seno_no_giro_no_zoom_e_na_posicao():
    def animado(id_, tipo, intensidade=1.0):
        nada = {"tipo": "nenhuma", "duracao": 0}
        loop = {"tipo": tipo, "periodo": 2 * S, "intensidade": intensidade}
        return clipe(id_, "deitado", 0, 4, animacao={"entrada": nada, "saida": nada, "loop": loop})
    faixas = [faixa("video", [animado("c2", "balancar")]), faixa("video", [animado("c3", "flutuar")]),
              faixa("principal", [animado("c1", "pulsar")])]
    plano = planejar_render(projeto(faixas), MIDIAS, 1080, 1920)
    # Pulsar: a caixa nasce 6% maior e o fator por quadro volta ao tamanho normal
    assert "scale=1145:644" in plano.filtro
    assert "(1+0.03*(1-cos(2*PI*((t-0)/2))))*(1/1.06)" in plano.filtro
    # Balançar: giro por quadro, na diagonal; flutuar: seno no y do overlay
    assert "rotate=a='(0+6*sin(2*PI*1*((t-0)/2)))*PI/180':ow='hypot(iw,ih)'" in plano.filtro
    assert "-0.02*sin(2*PI*1*((t-0)/2))" in plano.filtro


def test_letra_a_letra_e_destaque_viram_caixas_transparentes_por_roteiro():
    layout = {"n": 2, "palavras": [[0, 2]], "linhas": [{"y0": 0, "y1": 1, "xs": [0, 0.5, 1]}]}
    legenda = {"id": "t1", "midia_id": None, "inicio": S, "duracao": 2 * S, "entrada": 0, "velocidade": 1, "volume": 1,
               **PADRAO, "texto": {"conteudo": "Oi", "destaque": {"modo": "karaoke", "cor": "#ffd400"}, "tempos": [0]},
               "animacao": {"entrada": {"tipo": "letras", "duracao": S}, "saida": {"tipo": "nenhuma", "duracao": 0}}}
    imagem = ImagemDoTexto("/tmp/t1.png", 540, 120, layout=layout, destaque="/tmp/t1_destaque.png")
    plano = planejar_render(projeto([faixa("legenda", [legenda]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            MIDIAS, 720, 1280, {"t1": imagem}, pasta="/trabalho")
    # O texto e o destaque entram como imagens, um por cima do outro, cada um com a sua máscara
    assert [e.caminho for e in plano.entradas if e.imagem] == ["/tmp/t1.png", "/tmp/t1_destaque.png"]
    roteiros = sorted(a.caminho for a in plano.auxiliares if a.tipo == "comandos")
    assert roteiros == ["/trabalho/letras_t1.txt", "/trabalho/letras_t1_destaque.txt"]
    caixa = "drawbox@m2c0=x=-2:y=-2:w=1:h=1:color=black@0:t=fill:replace=1"
    assert f"sendcmd=f='/trabalho/letras_t1.txt',{caixa}" in plano.filtro
    assert "drawbox@m3c3" in plano.filtro and "[base2][c3]overlay" in plano.filtro
    # Letra a letra: no começo some tudo; na metade da entrada, só a segunda letra
    letras = next(a.conteudo for a in plano.auxiliares if a.caminho.endswith("letras_t1.txt")).splitlines()
    assert letras[0].startswith("0.000000 ") and letras[1].startswith("0.500000 ")


def test_abaixar_na_fala_vira_roteiro_de_volume_no_som():
    pontos = [{"t": 0, "valor": 1, "curva": "linear"}, {"t": S, "valor": 0.25, "curva": "linear"}]
    musica = clipe("m1", "deitado", 0, 4, abaixamento={"db": -12, "pontos": pontos})
    plano = planejar_render(projeto([faixa("principal", [clipe("c1", "deitado", 0, 4)]), faixa("audio", [musica])]),
                            MIDIAS, 720, 1280, pasta="/trabalho")
    roteiro = next(a for a in plano.auxiliares if a.caminho == "/trabalho/volume_m1.txt")
    assert roteiro.conteudo.startswith("0.00 volume@ab2 volume 1.000000;")
    assert "asetnsamples=n=480:p=0,asendcmd=f='/trabalho/volume_m1.txt',volume@ab2=volume=1" in plano.filtro_som
    assert "asendcmd" not in plano.filtro_som.split(";")[0], "o clipe sem curva fica como estava"


def test_efeitos_de_voz_viram_filtros_e_reverb_com_a_sala():
    efeitos = {"grave": -4, "medio": 0, "agudo": 3, "eco": 0.5, "reverb": 0.4}
    voz = clipe("c1", "deitado", 0, 4, efeitos_voz=efeitos)
    plano = planejar_render(projeto([faixa("principal", [voz])]), MIDIAS, 720, 1280, pasta="/trabalho")
    # A sala entra como mais uma entrada, escrita pelo worker; o efeito vem antes do volume
    assert [a.tipo for a in plano.auxiliares] == ["reverb"]
    assert plano.entradas[-1].caminho == "/trabalho/reverb.wav"
    assert "lowshelf=f=120:g=-4:t=s:w=1,highshelf=f=6000:g=3:t=s:w=1,aecho=" in plano.filtro_som
    assert "equalizer" not in plano.filtro_som, "faixa em 0 dB fica de fora"
    assert f"[{len(plano.entradas) - 1}:a]{afir_sem_normalizar()}" in plano.filtro_som
    assert "amix=inputs=2:weights='1 0.4':normalize=0:duration=first,volume=1," in plano.filtro_som


def test_transicao_de_desfoque_vira_gblur_por_roteiro_com_borda_repetida():
    principal = [clipe("c1", "deitado", 0, 4, transicao={"tipo": "desfoque", "duracao": S}), clipe("c2", "empe", 4, 4)]
    plano = planejar_render(projeto([faixa("principal", principal)], duracao=8), MIDIAS, 1080, 1920, pasta="/trabalho")
    roteiros = {a.caminho: a.conteudo for a in plano.auxiliares if a.tipo == "comandos"}
    assert set(roteiros) == {"/trabalho/desfoque_c1_1.txt", "/trabalho/desfoque_c2_2.txt"}
    # O mais desfocado é no corte, no meio da janela: 3% da altura do clipe (608 px no deitado)
    linhas = roteiros["/trabalho/desfoque_c1_1.txt"].splitlines()
    sigmas = [float(linha.split(" sigma ")[1].split(",")[0]) for linha in linhas]
    assert max(sigmas) == pytest.approx(0.03 * 608, abs=0.01) and sigmas[0] == 0
    assert "gblur@d1 sigmaV" in linhas[1], "o vertical muda junto"
    assert "fillborders=" in plano.filtro and "gblur@d1=sigma=0:steps=6,crop=" in plano.filtro
    assert "premultiply" not in plano.filtro, "vídeo sem transparência não precisa"


def test_mesclagem_achata_a_camada_na_cor_neutra_e_usa_o_blend():
    sobre = [clipe("s1", "empe", 0, 2, mesclagem="multiplicar"), clipe("s2", "empe", 2, 2, mesclagem="tela")]
    faixas = [faixa("video", sobre), faixa("principal", [clipe("c1", "deitado", 0, 4)])]
    plano = planejar_render(projeto(faixas), MIDIAS, 720, 1280)
    assert "color=c=white:s=720x1280:r=30/1:d=4,format=gbrp[n2]" in plano.filtro
    assert "[n2][c2]overlay=" in plano.filtro
    assert "[base1][l2]blend=all_mode=multiply,format=gbrp[base2]" in plano.filtro
    assert "color=c=black:" in plano.filtro and "[base2][l3]blend=all_mode=screen" in plano.filtro
    assert "[base0][c1]overlay=" in plano.filtro, "o normal continua no overlay"


def test_efeitos_desfoque_brilho_e_olho_de_peixe_no_grafo():
    sobre = [clipe("s1", "empe", 0, 2, efeito={"tipo": "desfoque", "intensidade": 0.8}),
             clipe("s2", "empe", 2, 2, efeito={"tipo": "distorcao", "intensidade": 1})]
    principal = clipe("c1", "deitado", 0, 4, efeito={"tipo": "brilho", "intensidade": 0.5})
    plano = planejar_render(projeto([faixa("video", sobre), faixa("principal", [principal])]), MIDIAS, 1080, 1920)
    # Desfoque fixo: gblur sem roteiro, sigma de 2% da altura do clipe (1920)
    assert "gblur=sigma=38.4000:steps=6" in plano.filtro and "sendcmd" not in plano.filtro
    # Brilho: o clipe desfocado na força 0,5, somado em tela no alfa pré-multiplicado
    assert "premultiply=inplace=1,split[ba1][bb1]" in plano.filtro
    assert "colorchannelmixer=rr=0.5:gg=0.5:bb=0.5:aa=0.5[bc1]" in plano.filtro
    assert "[ba1][bc1]blend=all_mode=screen,unpremultiply=inplace=1" in plano.filtro
    # Olho de peixe: a lente e o zoom de 1,5 que tira o canto vazio
    assert "lenscorrection=k1=0.5:k2=0:i=bilinear,scale=1620:2880:flags=bilinear,crop=1080:1920" in plano.filtro


def test_nitidez_soma_a_diferenca_da_copia_pouco_desfocada_por_um_lut2():
    principal = clipe("c1", "deitado", 0, 4, efeito={"tipo": "nitidez", "intensidade": 0.5})
    plano = planejar_render(projeto([faixa("principal", [principal])]), MIDIAS, 1080, 1920)
    # Sigma de 0,25% da altura do clipe (o vídeo deitado tem 608 de altura no 9:16) e força de 1,5 × 0,5, no alfa
    # pré-multiplicado
    assert "gblur=sigma=1.5200:steps=6" in plano.filtro
    assert "premultiply=inplace=1,format=gbrap,split[na1][nb1]" in plano.filtro
    assert "[na1][nc1]lut2=c0='clip(x+(x-y)*0.75,0,255)'" in plano.filtro and ":c3=x,unpremultiply" in plano.filtro


def test_clareza_e_a_nitidez_com_a_copia_bem_desfocada_e_o_peso_nos_meios_tons():
    principal = clipe("c1", "deitado", 0, 4, efeito={"tipo": "clareza", "intensidade": 0.5})
    plano = planejar_render(projeto([faixa("principal", [principal])]), MIDIAS, 1080, 1920)
    # Sigma de 2% da altura do clipe (608) e força de 1 × 0,5, pesada por 4·x·(1 − x)
    assert "gblur=sigma=12.1600:steps=6" in plano.filtro
    assert "lut2=c0='clip(x+(x-y)*0.5*4*x/255*(1-x/255),0,255)'" in plano.filtro


def test_tela_verde_vira_colorkey_so_na_midia():
    verde = {"cor": "#00ff00", "semelhanca": 0.3, "suavidade": 0.1}
    sobre = clipe("s1", "empe", 0, 4, chroma=verde)
    plano = planejar_render(projeto([faixa("video", [sobre]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            MIDIAS, 720, 1280)
    assert plano.filtro.count("colorkey=color=0x00ff00:similarity=0.3:blend=0.1") == 1


def test_tom_da_voz_usa_o_arquivo_do_tom():
    voz = clipe("c1", "deitado", 0, 4, tom=-3)
    midias = {**MIDIAS, "deitado": MidiaDoRender("/m/deitado.mp4", 1920, 1080, video=True, audio=True,
                                                 tons=(("tom_m3", "/m/tom_m3.m4a"),))}
    plano = planejar_render(projeto([faixa("principal", [voz])]), midias, 720, 1280)
    assert plano.entradas[-1].caminho == "/m/tom_m3.m4a"
    with pytest.raises(ErroRender, match="tom da voz"):
        planejar_render(projeto([faixa("principal", [clipe("c1", "deitado", 0, 4, tom=2)])]), midias, 720, 1280)


def test_remover_fundo_le_a_mascara_como_o_clipe_e_usa_alphamerge():
    com_mascara = MidiaDoRender("/m/empe.mp4", 1080, 1920, video=True, audio=True, mascara="/m/mascara.mp4")
    midias = {**MIDIAS, "empe": com_mascara}
    sobre = clipe("s1", "empe", 0, 4, entrada=1, remover_fundo=True)
    plano = planejar_render(projeto([faixa("video", [sobre]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            midias, 720, 1280)
    mascara = next(e for e in plano.entradas if e.caminho == "/m/mascara.mp4")
    video = next(e for e in plano.entradas if e.caminho == "/m/empe.mp4")
    assert (mascara.inicio, mascara.duracao) == (video.inicio, video.duracao), "o mesmo trecho"
    # A máscara abre com o clipe (0,1 s antes da entrada) e desconta o mesmo tanto
    assert ("scale=in_range=tv:out_range=pc,format=gray,setpts=(PTS-0.1005/TB)/1,"
            "fps=30/1:round=up:start_time=0,crop=") in plano.filtro
    assert "[vf2][mf2]alphamerge" in plano.filtro
    sem_mascara = {**MIDIAS}
    with pytest.raises(ErroRender, match="recorte do fundo"):
        planejar_render(projeto([faixa("principal", [clipe("c1", "empe", 0, 4, remover_fundo=True)])]), sem_mascara,
                        720, 1280)


def test_imagem_sem_ruido_le_o_video_limpo_e_o_som_do_original():
    limpa = MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True, matriz=None, imagem_limpa="/m/limpo.mp4")
    plano = planejar_render(projeto([faixa("principal", [clipe("c1", "deitado", 0, 4, imagem_limpa=True)])]),
                            {**MIDIAS, "deitado": limpa}, 720, 1280)
    assert [e.caminho for e in plano.entradas] == ["/m/deitado.mp4", "/m/limpo.mp4"]
    assert "[1:v]setpts=" in plano.filtro, "a imagem vem do limpo, já em BT.709 (sem setparams)"
    assert "[0:a]" in plano.filtro_som, "o som continua vindo do original"


def test_imagem_estavel_le_o_video_estavel_e_sobre_a_limpa_quando_ela_esta_ligada():
    estaveis = (("estavel", "/m/estavel.mp4"), ("estavel_limpo", "/m/estavel_limpo.mp4"))
    midia = MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True, matriz=None,
                          imagem_limpa="/m/limpo.mp4", estaveis=estaveis)
    for extra, esperado in (({}, "/m/estavel.mp4"), ({"imagem_limpa": True}, "/m/estavel_limpo.mp4")):
        estavel = clipe("c1", "deitado", 0, 4, estabilizar=True, **extra)
        plano = planejar_render(projeto([faixa("principal", [estavel])]), {**MIDIAS, "deitado": midia}, 720, 1280)
        assert [e.caminho for e in plano.entradas] == ["/m/deitado.mp4", esperado]
        assert "[1:v]setpts=" in plano.filtro, "a imagem vem do estável, já em BT.709 (sem setparams)"
        assert "[0:a]" in plano.filtro_som, "o som continua vindo do original"
    so_a_comum = MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True, matriz=None, estaveis=estaveis[:1])
    with pytest.raises(ErroRender, match="estável"):
        estavel = clipe("c1", "deitado", 0, 4, estabilizar=True, imagem_limpa=True)
        planejar_render(projeto([faixa("principal", [estavel])]), {**MIDIAS, "deitado": so_a_comum}, 720, 1280)


def test_cor_vira_lut_e_vinheta_vira_blend_multiplicando():
    com_cor = clipe("c1", "deitado", 0, 4, cor={"saturacao": -0.5, "vinheta": 0.6, "filtro": None, "intensidade": 1})
    so_vinheta = clipe("c2", "empe", 0, 4, cor={"vinheta": 0.3})
    neutro = clipe("c3", "empe", 0, 4, cor={"filtro": None, "intensidade": 1})
    faixas = [faixa("video", [neutro]), faixa("video", [so_vinheta]), faixa("principal", [com_cor])]
    plano = planejar_render(projeto(faixas), MIDIAS, 1080, 1920, pasta="/trabalho")
    luts = [a for a in plano.auxiliares if a.tipo == "lut"]
    vinhetas = [a for a in plano.auxiliares if a.tipo == "vinheta"]
    assert len(luts) == 1 and luts[0].caminho.startswith("/trabalho/cor_") and luts[0].caminho.endswith(".cube")
    assert f"lut3d=file='{luts[0].caminho}':interp=tetrahedral" in plano.filtro
    assert sorted(v.caminho for v in vinhetas) == ["/trabalho/vinheta_c1.png", "/trabalho/vinheta_c2.png"]
    # A vinheta do vídeo deitado tem o tamanho da caixa dele no quadro: 1080 x 607,5 → 1080 x 608
    assert next(v for v in vinhetas if v.caminho.endswith("c1.png")).largura == 1080
    assert plano.filtro.count("blend=all_mode=multiply") == 2
    assert plano.filtro.count("lut3d") == 1, "só a cor que muda alguma coisa vira LUT"
    # As imagens das vinhetas entram como imagens paradas, depois dos clipes
    assert [e.imagem for e in plano.entradas] == [False, False, False, True, True]


def test_zoom_animado_com_transparencia_volta_ao_alfa_reto_so_depois_do_pad():
    # O unpremultiply só aceita quadros do tamanho do primeiro: logo depois do scale, o zoom ficava parado
    logo = MidiaDoRender("/m/logo.png", 800, 400, video=True, audio=False, imagem=True)
    pontos = [{"t": 0, "valor": 0.3, "curva": "frear"}, {"t": 4 * S, "valor": 0.6, "curva": "linear"}]
    zoom = clipe("l1", "logo", 0, 4, keyframes={"escala": pontos})
    faixas = [faixa("video", [zoom]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]
    plano = planejar_render(projeto(faixas), {**MIDIAS, "logo": logo}, 720, 1280)
    cadeia = next(parte for parte in plano.filtro.split(";") if "eval=frame" in parte)
    assert "premultiply=inplace=1,scale=w='max(1,iw*" in cadeia
    assert ":eval=frame,pad=w=" in cadeia and cadeia.index("pad=w=") < cadeia.index("eval=frame,unpremultiply")


def test_chave_de_luminancia_vira_rampa_na_luma_e_multiplica_o_alfa():
    escuro = clipe("c1", "deitado", 0, 2, chave_luma={"tirar": "escuro", "limiar": 0.2, "suavidade": 0.1})
    claro = clipe("c2", "deitado", 2, 2, chave_luma={"tirar": "claro", "limiar": 0.8, "suavidade": 0})
    plano = planejar_render(projeto([faixa("principal", [escuro, claro])]), MIDIAS, 720, 1280)
    assert plano.filtro.count("colorchannelmixer=rr=0.2126:rg=0.7152:rb=0.0722") == 2
    # 20% de 255 = 51; a rampa de 10% (25,5 níveis) vai de 0 a 255
    assert "lutrgb=r='clip((val-51)*10+0.5,0,255)'" in plano.filtro
    assert "lutrgb=r='lt(val,204)*255'" in plano.filtro
    assert plano.filtro.count("alphaextract") == 2 and plano.filtro.count("alphamerge") == 2


def test_cantos_multiplicam_o_alfa_e_a_borda_vai_por_cima_antes_da_cortina():
    com_borda = clipe("c1", "deitado", 0, 2, cantos={"raio": 0.2, "borda": 0.05, "cor": "#ff0000"})
    so_cantos = clipe("c2", "deitado", 2, 2, cantos={"raio": 0.2, "borda": 0, "cor": "#ffffff"})
    plano = planejar_render(projeto([faixa("principal", [com_borda, so_cantos])]), MIDIAS, 720, 1280, pasta="/t")
    tipos = sorted(a.tipo for a in plano.auxiliares if a.tipo in ("cantos", "anel"))
    assert tipos == ["anel", "cantos", "cantos"]
    cantos = next(a for a in plano.auxiliares if a.caminho == "/t/cantos_c1.png")
    assert (cantos.largura, cantos.altura) == (720, 405)
    assert plano.filtro.count("alphaextract") == 2 and plano.filtro.count("overlay=format=rgb,format=rgba") == 1


def test_virar_le_o_recorte_espelhado_e_vira_depois_da_cor_e_antes_da_vinheta():
    recorte = {"x": 0.1, "y": 0, "largura": 0.5, "altura": 1}
    virado = clipe("c1", "deitado", 0, 4, recorte=recorte, virar={"horizontal": True, "vertical": True},
                   cor={"saturacao": -0.5, "vinheta": 0.6, "filtro": None, "intensidade": 1})
    plano = planejar_render(projeto([faixa("principal", [virado])]), MIDIAS, 720, 1280, pasta="/trabalho")
    # O recorte é do que aparece: na mídia, o pedaço espelhado (x = 1 - 0,1 - 0,5)
    assert "crop=w=iw*0.5:h=ih*1:x=iw*0.4:y=ih*0" in plano.filtro
    cadeia = plano.filtro
    ordem = [cadeia.index(filtro) for filtro in ("lut3d", "hflip", "vflip", "blend=all_mode=multiply")]
    assert ordem == sorted(ordem)
    # Sem virar, nada muda
    reto = clipe("c1", "deitado", 0, 4, recorte=recorte)
    reto = planejar_render(projeto([faixa("principal", [reto])]), MIDIAS, 720, 1280)
    assert "hflip" not in reto.filtro and "vflip" not in reto.filtro and "x=iw*0.1:" in reto.filtro


def test_transicao_estende_os_dois_clipes_e_repete_quadro_sem_sobra():
    # A mídia "deitado" tem 10 s; o primeiro clipe usa de 0 a 4 s, o segundo de 5 a 8 s
    midias = {**MIDIAS, "deitado": MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True, duracao=10)}
    primeiro = clipe("a", "deitado", 0, 4, transicao={"tipo": "fusao", "duracao": S})
    segundo = clipe("b", "deitado", 4, 3, entrada=5)
    plano = planejar_render(projeto([faixa("principal", [primeiro, segundo])], duracao=7), midias, 1080, 1920)
    # O primeiro lê meio segundo além do fim (até 4,5 s); o segundo, meio segundo antes (de 4,5 s)
    assert [e.argumentos()[:4] for e in plano.entradas] == [["-ss", "0.000000", "-t", "4.500000"],
                                                         ["-ss", "4.400000", "-t", "3.600000"]]
    assert "enable='gte(t,-0.016667)*lt(t,4.483333)'" in plano.filtro
    assert "enable='gte(t,3.483333)*lt(t,6.983333)'" in plano.filtro
    assert "fade=t=in:st=3.5:d=1:alpha=1" in plano.filtro, "quem entra aparece aos poucos na fusão"
    assert "setpts=PTS+round(105*1/30/TB)" in plano.filtro
    # O som do segundo começa no corte: pula o meio segundo a mais que a imagem leu
    assert "[1:a]asetpts=PTS-STARTPTS,atrim=start=0.6:duration=3,asetpts=PTS-STARTPTS" in plano.filtro_som
    # E o do primeiro para no corte: o meio segundo lido depois do fim, para a imagem, não soa
    assert "[0:a]asetpts=PTS-STARTPTS,atrim=start=0:duration=4,asetpts=PTS-STARTPTS" in plano.filtro_som
    assert "tpad" not in plano.filtro, "havia sobra nos dois lados"


def test_transicao_sem_sobra_na_midia_repete_o_quadro():
    midias = {**MIDIAS, "deitado": MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True, duracao=4)}
    primeiro = clipe("a", "deitado", 0, 4, transicao={"tipo": "empurrar", "duracao": S})
    segundo = clipe("b", "deitado", 4, 3)
    plano = planejar_render(projeto([faixa("principal", [primeiro, segundo])], duracao=7), midias, 1080, 1920)
    linhas = plano.filtro.split(";\n")
    # O primeiro clipe acaba junto com a mídia: o último quadro fica meio segundo
    assert "tpad=start_mode=clone:start_duration=0:stop_mode=clone:stop_duration=0.5" in linhas[1]
    # O segundo começa no zero da mídia: o primeiro quadro fica meio segundo antes
    assert "tpad=start_mode=clone:start_duration=0.5:stop_mode=clone:stop_duration=0" in linhas[3]
    assert "x='540+1080*((pow(1-clip((t-3.5)/1,0,1),3)-1))-overlay_w/2'" in linhas[2]
    assert "x='540+1080*(pow(1-clip((t-3.5)/1,0,1),3))-overlay_w/2'" in linhas[4]


def test_clipe_entre_dois_empurroes_soma_os_dois_sem_menos_antes_do_parentese():
    # O avaliador do FFmpeg recusa "+-(": o clipe do meio de dois empurrões derrubava a exportação inteira
    midias = {**MIDIAS, "deitado": MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True, duracao=10)}
    empurrar = {"tipo": "empurrar", "duracao": S // 2}
    clipes = [clipe("a", "deitado", 0, 2, transicao=empurrar),
              clipe("b", "deitado", 2, 2, entrada=2, transicao=empurrar),
              clipe("c", "deitado", 4, 2, entrada=4)]
    plano = planejar_render(projeto([faixa("principal", clipes)], duracao=6), midias, 720, 1280)
    assert "+-(" not in plano.filtro and "*(-(" not in plano.filtro
    meio = next(linha for linha in plano.filtro.split(";\n") if linha.count("pow(1-clip(") == 2)
    assert "+(pow(1-clip(" in meio


def test_ganho_ate_o_alvo_de_loudness():
    assert ganho_para_o_alvo(-20.5) == 6.5
    assert ganho_para_o_alvo(-9) == -5
    assert ganho_para_o_alvo(-70) == 0, "silêncio não ganha volume"
    assert ganho_para_o_alvo(None) == 0
    assert ganho_para_o_alvo(-65) == 30, "o ganho tem teto"


def test_le_o_loudness_do_resumo_do_ebur128():
    saida = """[Parsed_ebur128_3 @ 0x5] t: 1.9  TARGET:-23 LUFS    M: -20.1 S: -21.0     I: -21.4 LUFS
[Parsed_ebur128_3 @ 0x5] Summary:

  Integrated loudness:
    I:         -21.7 LUFS
    Threshold: -31.7 LUFS"""
    assert ler_loudness(saida) == -21.7
    assert ler_loudness("    I:         -inf LUFS") is None
    assert ler_loudness("nada aqui") is None


def test_voz_limpa_entra_no_lugar_do_som_original():
    com_voz = {**MIDIAS, "deitado": MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True,
                                                  voz_limpa="/m/voz_limpa.m4a")}
    plano = planejar_render(projeto([faixa("principal", [clipe("c1", "deitado", 0, 4, entrada=1, voz_limpa=True)])]),
                            com_voz, 1080, 1920)
    # O mesmo trecho da voz limpa, numa entrada a mais; o som do clipe sai dela, não do vídeo
    assert plano.entradas[1].argumentos() == ["-ss", "0.900000", "-t", "4.100000", "-i", "/m/voz_limpa.m4a"]
    assert "[1:a]asetpts" in plano.filtro_som and "[0:a]" not in plano.filtro_som
    with pytest.raises(ErroRender, match="voz limpa"):
        sem_voz = projeto([faixa("principal", [clipe("c1", "deitado", 0, 4, voz_limpa=True)])])
        planejar_render(sem_voz, MIDIAS, 1080, 1920)


def test_zoom_alto_demais_para_antes_com_uma_mensagem():
    # A 2000% num 1080p a caixa teria 38400 × 21600 e o FFmpeg recusaria o quadro (erro -22)
    grande = clipe("c1", "deitado", 0, 4, transformacao={"x": 0, "y": 0, "escala": 20, "rotacao": 0, "opacidade": 1})
    with pytest.raises(ErroRender, match="grande demais"):
        planejar_render({**projeto([faixa("principal", [grande])]), "proporcao": "16:9"}, MIDIAS, 1920, 1080)
    # 400% num 1080p ainda exporta
    normal = clipe("c1", "deitado", 0, 4, transformacao={"x": 0, "y": 0, "escala": 4, "rotacao": 0, "opacidade": 1})
    assert planejar_render({**projeto([faixa("principal", [normal])]), "proporcao": "16:9"}, MIDIAS, 1920, 1080).filtro


def test_glitch_num_clipe_ampliado_fica_no_limite_do_rgbashift():
    # 4% da largura de uma caixa ampliada passava dos ±255 px que o rgbashift aceita
    glitch = clipe("c1", "deitado", 0, 4, efeito={"tipo": "glitch", "intensidade": 1},
                   transformacao={"x": 0, "y": 0, "escala": 6, "rotacao": 0, "opacidade": 1})
    # Em 720p, a 600% a caixa tem 7680 de largura: 4% dela são 307 px
    plano = planejar_render({**projeto([faixa("principal", [glitch])]), "proporcao": "16:9"}, MIDIAS, 1280, 720)
    roteiros = [a for a in plano.auxiliares if a.tipo == "comandos" and "rgbashift" in (a.conteudo or "")]
    valores = [int(v.rstrip(";,")) for r in roteiros for v in r.conteudo.split()
               if v.rstrip(";,").lstrip("-").isdigit()]
    assert valores and max(abs(v) for v in valores) <= 255


def test_mascara_de_forma_entra_na_imagem_dos_cantos():
    from core.utils.cantos import coberturas

    mascara = {"forma": "elipse", "x": 0.5, "y": 0.5, "largura": 0.5, "altura": 0.5, "suavidade": 0, "inverter": False}
    sobre = clipe("s1", "empe", 0, 4, mascara=mascara)
    plano = planejar_render(projeto([faixa("video", [sobre]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            MIDIAS, 720, 1280)
    auxiliar = next(a for a in plano.auxiliares if a.tipo == "cantos")
    assert auxiliar.ajustes["mascara"] == mascara and "alphamerge" in plano.filtro
    # Dentro da elipse aparece, fora some; invertida, o contrário
    dentro, _ = coberturas(200, 100, {"mascara": mascara})
    assert dentro[50, 100] == 1 and dentro[5, 5] == 0
    invertida, _ = coberturas(200, 100, {"mascara": {**mascara, "inverter": True}})
    assert invertida[50, 100] == 0 and invertida[5, 5] == 1


def test_camada_de_ajuste_passa_o_que_esta_embaixo_pela_lut_e_volta_por_cima_no_tempo_dela():
    ajuste = {"id": "aj", "midia_id": None, "ajuste": True, "inicio": 1 * S, "duracao": 2 * S, "entrada": 0,
              "velocidade": 1, "volume": 1,
              "transformacao": {"x": 0, "y": 0, "escala": 1, "rotacao": 0, "opacidade": 0.5},
              "recorte": {"x": 0, "y": 0, "largura": 1, "altura": 1}, "cor": {"saturacao": -1}}
    plano = planejar_render(projeto([faixa("video", [ajuste]), faixa("principal", [clipe("c1", "deitado", 0, 4)])]),
                            MIDIAS, 720, 1280)
    assert "[base1]split[ja2][jb2]" in plano.filtro and "lut3d=" in plano.filtro
    assert "[ja2][jg2]overlay=format=rgb:eof_action=pass:enable='gte(t,0.983333)*lt(t,2.983333)'[base2]" in plano.filtro
    alfa = next(a for a in plano.auxiliares if a.tipo == "cantos")
    assert alfa.ajustes["opacidade"] == 0.5 and (alfa.largura, alfa.altura) == (720, 1280)


def test_keyframes_de_volume_entram_no_roteiro_no_lugar_do_volume_fixo():
    # Sobe de 0 a 2 (200%) no primeiro segundo e fica; o volume fixo (0,5) não vale mais
    pontos = [{"t": 0, "valor": 0, "curva": "linear"}, {"t": S, "valor": 2, "curva": "linear"}]
    musica = clipe("m1", "deitado", 0, 4, volume=0.5, keyframes={"volume": pontos})
    plano = planejar_render(projeto([faixa("principal", [clipe("c1", "deitado", 0, 4)]), faixa("audio", [musica])]),
                            MIDIAS, 720, 1280, pasta="/trabalho")
    roteiro = next(a for a in plano.auxiliares if a.caminho == "/trabalho/volume_m1.txt").conteudo.splitlines()
    assert roteiro[0] == "0.00 volume@ab2 volume 0.000000;"
    assert next(linha for linha in roteiro if linha.startswith("0.50 ")) == "0.50 volume@ab2 volume 1.000000;"
    assert roteiro[-1] == "1.00 volume@ab2 volume 2.000000;"
    cadeia = next(parte for parte in plano.filtro_som.split(";") if "volume_m1" in parte)
    assert "volume=0.5" not in cadeia and "volume@ab2=volume=1" in cadeia
