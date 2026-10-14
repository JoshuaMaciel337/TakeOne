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
