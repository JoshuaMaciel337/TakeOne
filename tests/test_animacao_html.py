# Animações em HTML: campos, página e a gravação nos dois vídeos (cor e transparência)
import json
import shutil
import subprocess

import numpy as np
import pytest

from core.modelos.animacao_html import (
    MODELOS,
    QUADROS,
    ErroAnimacao,
    conferir_campos,
    lista_de_modelos,
    montar_html,
)


def _tem_chromium() -> bool:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            p.chromium.launch().close()
        return True
    except Exception:
        return False


PODE_GRAVAR = shutil.which("ffmpeg") is not None and _tem_chromium()


def test_campos_usam_o_padrao_e_recusam_o_que_nao_serve():
    campos = conferir_campos("tarja", {"nome": "  Joana   Lima "})
    assert campos["nome"] == "Joana Lima" and campos["funcao"] == "Fundadora" and campos["cor_1"] == "#ff624a"
    with pytest.raises(ErroAnimacao, match="#rrggbb"):
        conferir_campos("tarja", {"cor_1": "red"})
    with pytest.raises(ErroAnimacao, match="no máximo 40"):
        conferir_campos("tarja", {"nome": "x" * 41})
    with pytest.raises(ErroAnimacao, match="número inteiro"):
        conferir_campos("contador", {"valor": "12a"})
    with pytest.raises(ErroAnimacao):
        conferir_campos("nao-existe", {})
    assert conferir_campos("citacao", {"texto": "um\r\ndois"})["texto"] == "um\ndois"


def test_todo_modelo_monta_em_toda_proporcao_e_escapa_o_texto():
    assert {m["id"] for m in lista_de_modelos()} == set(MODELOS)
    for modelo in MODELOS:
        for proporcao in QUADROS:
            pagina = montar_html(modelo, {}, 3, proporcao, "file:///fontes")
            assert "{{" not in pagina and "--dur:3.000s" in pagina
    pagina = montar_html("titulo", {"texto": "<b>Oi</b> mundo"}, 3, "9:16", "/f")
    assert "<b>" not in pagina and "&lt;b&gt;Oi&lt;/b&gt;" in pagina
    assert pagina.count('class="palavra"') == 2 and "width:1080px;height:1920px" in pagina
    assert pagina.count('class="linha"') == 0
    assert montar_html("citacao", {"texto": "a\nb\nc"}, 3, "1:1", "/f").count('class="linha"') == 3


def _quadro(caminho, segundos: float, largura: int, altura: int) -> np.ndarray:
    dados = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{segundos}", "-i", str(caminho), "-frames:v", "1",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(dados, np.uint8).reshape(altura, largura, 3)


@pytest.mark.skipif(not PODE_GRAVAR, reason="FFmpeg ou o Chromium do Playwright não instalados")
def test_tarja_gravada_tem_transparencia_no_lugar_e_cor_sem_borda_preta(tmp_path):
    from worker.tarefas.animacao_html import gravar_animacao

    largura, altura = QUADROS["16:9"]
    pagina = montar_html("tarja", {"nome": "Ana Souza", "cor_texto": "#ffffff"}, 2, "16:9", "/fontes", "/animacoes")
    cor, mascara = tmp_path / "cor.mp4", tmp_path / "mascara.mp4"
    assert gravar_animacao(pagina, largura, altura, 2, cor, mascara) == 60
    sonda = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
                                       "-show_entries", "stream=width,height,nb_read_frames,color_space",
                                       "-of", "json", str(cor)], capture_output=True, text=True).stdout)["streams"][0]
    resumo = (sonda["width"], sonda["height"], int(sonda["nb_read_frames"]), sonda["color_space"])
    assert resumo == (1920, 1080, 60, "bt709")

    # No começo a barra ainda não cresceu: tudo transparente (o preto da máscara é 16, faixa limitada)
    assert _quadro(mascara, 0, largura, altura).max() <= 20
    # No meio a tarja está inteira, embaixo à esquerda; o resto do quadro continua transparente
    alfa = _quadro(mascara, 1.0, largura, altura)[:, :, 0].astype(int)
    canto = alfa[altura // 2:, : largura // 2]
    assert canto.max() >= 230, "o nome aparece na transparência"
    assert alfa[: altura // 3].max() <= 20 and alfa[:, largura * 2 // 3:].max() <= 20
    # Onde o nome é opaco a cor é branca
    rgb = _quadro(cor, 1.0, largura, altura)[altura // 2:, : largura // 2].astype(int)
    assert rgb[canto >= 200].mean() >= 220


def test_espalhar_cor_leva_a_cor_para_fora_da_forma():
    pytest.importorskip("cv2")
    from worker.tarefas.animacao_html import espalhar_cor

    quadro = np.zeros((40, 40, 4), np.uint8)
    quadro[10:30, 10:30] = (40, 200, 255, 255)   # laranja opaco (BGRA)
    quadro[10:30, 30] = (40, 200, 255, 128)      # borda meio transparente
    rgb, alfa = espalhar_cor(quadro)
    assert tuple(rgb[20, 20]) == (255, 200, 40) and alfa[20, 20] == 255
    # Fora da forma, perto dela, a cor é a da forma (não o preto do fundo transparente)
    for coluna in (30, 31, 33):
        assert np.abs(rgb[20, coluna].astype(int) - (255, 200, 40)).max() <= 2, coluna
    assert alfa[20, 31] == 0
    vazio = np.zeros((10, 10, 4), np.uint8)
    assert espalhar_cor(vazio)[0].max() == 0


def test_animacao_descrita_so_passa_html_e_css_de_animacao():
    from core.modelos.animacao_descrita import limpar_css, limpar_html, separar_resposta

    html = limpar_html('<div class="a" onclick="x()" style="color:red">Oi <script>alert(1)</script><img src=x>'
                       '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg></div><iframe src="//x"></iframe>')
    assert "script" not in html and "onclick" not in html and "<img" not in html and "iframe" not in html
    assert html.startswith('<div class="a" style="color:red">Oi ') and "<path" in html
    css = limpar_css("@import url(x.css); .a{color:red;background:url(http://x/y.png);width:1px}"
                     "@font-face{font-family:X;src:url(x)} </style><script>")
    assert "url" not in css and "@import" not in css and "font-face" not in css and "<" not in css
    assert "color:red" in css and "width:1px" in css
    # O <style> dentro do html vai para o CSS; sem @keyframes não é animação
    css, html = separar_resposta({"css": "", "html": "<style>@keyframes a{to{opacity:0}}</style><p>x</p>"})
    assert "@keyframes a" in css and html == "<p>x</p>"
    with pytest.raises(ErroAnimacao):
        separar_resposta({"css": ".a{color:red}", "html": "<p>x</p>"})


def test_modelo_livre_monta_a_pagina_limpa():
    pagina = montar_html("livre", {"css": "@keyframes a{to{opacity:0}} .x{animation:a 1s}",
                                   "html": '<div class="x">Oi</div><script>alert(1)</script>'}, 3, "9:16", "/f")
    assert '<div class="x">Oi</div>' in pagina and "alert" not in pagina and "@keyframes a" in pagina


def test_classes_sem_ponto_ganham_o_ponto():
    from core.modelos.animacao_descrita import corrigir_seletores, separar_resposta

    css = ("body{position:absolute}contador{left:1px;animation:a 1s}barra{width:2px} .num, num:hover{color:red}"
           "@keyframes a{from{opacity:0}to{opacity:1}} span{color:blue}")
    html = '<div class="contador"><div class="barra"></div><span class="num">0</span></div>'
    corrigido = corrigir_seletores(css, html)
    assert "body" not in corrigido and ".contador{" in corrigido and ".barra{" in corrigido
    assert ".num, .num:hover{" in corrigido and " span{" in corrigido and "@keyframes a{from{" in corrigido
    with pytest.raises(ErroAnimacao, match="sem preencher"):
        separar_resposta({"css": "@keyframes a{}", "html": "<div>{{titulo}}</div>"})
