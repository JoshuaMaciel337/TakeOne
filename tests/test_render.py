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
from core.utils.render import ErroRender, ImagemDoTexto, MidiaDoRender, cadeia_atempo, planejar_render
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
    "empe": MidiaDoRender("/m/empe.mp4", 720, 1280, video=True, audio=False),
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
    assert [e.argumentos() for e in plano.entradas] == [
        ["-ss", "0.000000", "-t", "2.000000", "-i", "/m/deitado.mp4"],
        ["-ss", "1.000000", "-t", "4.000000", "-i", "/m/deitado.mp4"],   # 2 s no vídeo, em dobro
    ]
    assert "setpts=(PTS-STARTPTS)/2" in plano.filtro
    assert "atempo=2" in plano.filtro


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
    assert linhas[5] == "[base2]format=yuv420p[v]"


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
    ]), MIDIAS, 1080, 1920)
    assert plano.tem_som
    assert "[1:a]" in plano.filtro and "adelay=72000S:all=1" in plano.filtro and "volume=0.5" in plano.filtro
    assert "amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14" in plano.filtro

    sem_som = planejar_render(projeto([
        faixa("principal", [clipe("c1", "deitado", 0, 4)], muda=True),
        faixa("video", [clipe("c2", "deitado", 0, 4)], oculta=True),
    ]), MIDIAS, 1080, 1920)
    assert not sem_som.tem_som
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
    assert "volume=1,afade=t=in:st=0:d=0.5,afade=t=out:st=2:d=1,adelay=48000S:all=1" in plano.filtro


def test_texto_entra_como_imagem_parada_com_a_caixa_do_lado_de_referencia():
    titulo = {"id": "t1", "midia_id": None, "texto": {"conteudo": "Oi"}, "inicio": S, "duracao": 2 * S,
              "entrada": 0, "velocidade": 1, "volume": 1, **PADRAO}
    projeto_com_texto = projeto([faixa("texto", [titulo]), faixa("principal", [clipe("c1", "deitado", 0, 4)])])
    textos = {"t1": ImagemDoTexto("/tmp/texto_t1.png", 540, 120)}
    plano = planejar_render(projeto_com_texto, MIDIAS, 720, 1280, textos)
    assert plano.entradas[1].argumentos() == ["-loop", "1", "-framerate", "30/1", "-t", "2.000000",
                                              "-i", "/tmp/texto_t1.png"]
    # Em 720 de lado menor, o PNG medido em 1080 fica com dois terços: 360 × 80
    assert "scale=360:80" in plano.filtro and "setpts=PTS+1/TB" in plano.filtro
    assert "[1:a]" not in plano.filtro, "texto não tem som"
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


def test_transicao_estende_os_dois_clipes_e_repete_quadro_sem_sobra():
    # A mídia "deitado" tem 10 s; o primeiro clipe usa de 0 a 4 s, o segundo de 5 a 8 s
    midias = {**MIDIAS, "deitado": MidiaDoRender("/m/deitado.mp4", 1280, 720, video=True, audio=True, duracao=10)}
    primeiro = clipe("a", "deitado", 0, 4, transicao={"tipo": "fusao", "duracao": S})
    segundo = clipe("b", "deitado", 4, 3, entrada=5)
    plano = planejar_render(projeto([faixa("principal", [primeiro, segundo])], duracao=7), midias, 1080, 1920)
    # O primeiro lê meio segundo além do fim (até 4,5 s); o segundo, meio segundo antes (de 4,5 s)
    assert [e.argumentos()[:4] for e in plano.entradas] == [["-ss", "0.000000", "-t", "4.500000"],
                                                         ["-ss", "4.500000", "-t", "3.500000"]]
    assert "enable='gte(t,-0.016667)*lt(t,4.483333)'" in plano.filtro
    assert "enable='gte(t,3.483333)*lt(t,6.983333)'" in plano.filtro
    assert "fade=t=in:st=3.5:d=1:alpha=1" in plano.filtro, "quem entra aparece aos poucos na fusão"
    assert "setpts=PTS+3.5/TB" in plano.filtro
    # O som do segundo começa no corte: pula o meio segundo a mais que a imagem leu
    assert "[1:a]asetpts=PTS-STARTPTS,atrim=start=0.5:duration=3,asetpts=PTS-STARTPTS" in plano.filtro
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
    assert "x='540+1080*(-(1-pow(1-clip((t-3.5)/1,0,1),3)))-overlay_w/2'" in linhas[2]
    assert "x='540+1080*(pow(1-clip((t-3.5)/1,0,1),3))-overlay_w/2'" in linhas[4]
