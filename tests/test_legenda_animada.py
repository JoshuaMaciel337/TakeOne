# Legendas animadas (Clipar, 14.12a): as palavras em blocos, a página do motor e a gravação com transparência
import json
import re
import subprocess

import numpy as np
import pytest

from core.modelos.animacao_html import QUADROS
from core.modelos.legenda_animada import (
    CATEGORIAS,
    ESTILOS,
    FONTES,
    ErroLegenda,
    blocos_da_fala,
    conferir_palavras,
    montar_pagina,
    papel_da_palavra,
    receita_do_estilo,
)
from tests.test_animacao_html import PODE_GRAVAR


def _palavras(texto: str, passo: float = 0.3, comeco: float = 0.0, enfase: set[str] = frozenset()) -> list[dict]:
    saida, t = [], comeco
    for p in texto.split():
        saida.append({"texto": p, "inicio": round(t, 3), "fim": round(t + passo - 0.04, 3), "enfase": p in enfase})
        t += passo
    return saida


def test_conferir_palavras_ordena_limpa_e_recusa():
    palavras = conferir_palavras([{"texto": " b  ", "inicio": 1.0, "fim": 0.5}, {"texto": "a", "inicio": 0.2},
                                  {"texto": "   ", "inicio": 0.4, "fim": 0.6}, {"texto": "c", "inicio": 9, "fim": 9.5}],
                                 duracao=5)
    assert [p["texto"] for p in palavras] == ["a", "b"]
    assert palavras[1]["fim"] == pytest.approx(1.05) and palavras[0]["fim"] > palavras[0]["inicio"]
    with pytest.raises(ErroLegenda):
        conferir_palavras([], 5)
    with pytest.raises(ErroLegenda, match="5 minutos"):
        conferir_palavras([{"texto": "a", "inicio": 0}], 400)


def test_blocos_fecham_na_frase_na_pausa_e_no_tamanho():
    fala = _palavras("Quanto menos contato. Mais longe")
    fala += _palavras("você fica", comeco=3.0)
    blocos = blocos_da_fala(conferir_palavras(fala, 6), "pulando", 6)
    textos = [[" ".join(p["texto"] for p in linha) for linha in b["linhas"]] for b in blocos]
    assert textos == [["Quanto menos", "contato."], ["Mais longe"], ["você fica"]]
    # A última palavra fica até 0,6 s depois de dita, sem passar do bloco seguinte
    assert blocos[1]["fim"] == pytest.approx(fala[4]["fim"] + 0.6)
    assert all(a["fim"] <= b["inicio"] for a, b in zip(blocos, blocos[1:], strict=False))
    # Uma palavra por vez: um bloco por palavra
    assert len(blocos_da_fala(conferir_palavras(fala, 6), "uma_palavra", 6)) == len(fala)
    # Fala corrida longa: nenhum bloco passa das linhas do estilo nem de 2,6 s
    corrida = conferir_palavras(_palavras(" ".join(["palavra"] * 40), passo=0.25), 12)
    for estilo, config in ESTILOS.items():
        for bloco in blocos_da_fala(corrida, estilo, 12):
            assert len(bloco["linhas"]) <= config["linhas"]
            assert bloco["linhas"][-1][-1]["fim"] - bloco["inicio"] <= 2.6 + 1e-9


def test_editorial_poe_a_enfase_sozinha_na_linha():
    fala = conferir_palavras(_palavras("menos contato com a", enfase={"contato"}), 3)
    bloco = blocos_da_fala(fala, "editorial", 3)[0]
    assert [[p["texto"] for p in linha] for linha in bloco["linhas"]] == [["menos"], ["contato"], ["com", "a"]]


def test_pagina_traz_o_motor_as_fontes_e_escapa_o_texto():
    fala = conferir_palavras(_palavras("</script><b>oi</b> mundo"), 2)
    pagina = montar_pagina(blocos_da_fala(fala, "editorial", 2), "editorial", "9:16", 2, {"enfase": "#ff0000"}, 0.7,
                           "/f", "/m")
    assert "</script><b>" not in pagina and '<script src="/m/motor.js">' in pagina
    dados = json.loads(re.search(r"window\.LEGENDA=(.*?);</script>", pagina).group(1).replace("<\\/", "</"))
    assert (dados["largura"], dados["altura"]) == QUADROS["9:16"] and dados["cores"] == {"enfase": "#ff0000"}
    assert [f["url"] for f in dados["fontes"]] == ["/f/biblioteca/DMSerifDisplay-Regular.ttf",
                                                   "/f/biblioteca/PlayfairDisplay-Italic%5Bwght%5D.ttf"]


def _quadro(caminho, segundos: float, largura: int, altura: int) -> np.ndarray:
    dados = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{segundos}", "-i", str(caminho), "-frames:v", "1",
                            "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(dados, np.uint8).reshape(altura, largura)


@pytest.mark.skipif(not PODE_GRAVAR, reason="FFmpeg ou o Chromium do Playwright não instalados")
def test_legenda_gravada_aparece_na_hora_da_palavra_e_reaproveita_os_quadros(tmp_path):
    from worker.tarefas.legenda_animada import gravar_legenda

    largura, altura = QUADROS["1:1"]
    fala = conferir_palavras([{"texto": "Olá", "inicio": 0.5, "fim": 0.9}, {"texto": "mundo", "inicio": 2.0,
                                                                              "fim": 2.4}], 3)
    pagina = montar_pagina(blocos_da_fala(fala, "uma_palavra", 3), "uma_palavra", "1:1", 3, {}, 0.5,
                           "/fontes", "/legendas")
    cor, mascara = tmp_path / "cor.mp4", tmp_path / "mascara.mp4"
    resultado = gravar_legenda(pagina, largura, altura, 3, cor, mascara)
    assert resultado["quadros"] == 90
    # Entre uma entrada e outra nada se mexe: bem menos da metade dos quadros passa pelo navegador
    assert resultado["desenhados"] < 45
    # Antes da primeira palavra e na pausa (a palavra fica 0,6 s depois de dita), nada; com a palavra na tela, a
    # transparência no meio do quadro
    assert _quadro(mascara, 0.2, largura, altura).max() <= 20
    meio = _quadro(mascara, 0.8, largura, altura)
    assert meio[altura // 3: altura * 2 // 3].max() >= 230 and meio[: altura // 4].max() <= 20
    assert _quadro(mascara, 1.7, largura, altura).max() <= 20
    assert _quadro(mascara, 2.3, largura, altura).max() >= 230


@pytest.mark.skipif(not PODE_GRAVAR, reason="FFmpeg ou o Chromium do Playwright não instalados")
def test_legenda_gravada_em_partes_e_igual_a_gravada_de_uma_vez(tmp_path):
    from worker.tarefas.legenda_animada import gravar_legenda

    largura, altura = QUADROS["1:1"]
    fala = conferir_palavras(_palavras("uma duas três quatro cinco seis sete oito nove dez onze doze", passo=0.8), 10)
    pagina = montar_pagina(blocos_da_fala(fala, "uma_palavra", 10), "uma_palavra", "1:1", 10, {}, 0.5,
                           "/fontes", "/legendas")
    inteira = gravar_legenda(pagina, largura, altura, 10, tmp_path / "c1.mp4", tmp_path / "m1.mp4", processos=1)
    partes = gravar_legenda(pagina, largura, altura, 10, tmp_path / "c2.mp4", tmp_path / "m2.mp4", processos=2)
    assert inteira["quadros"] == partes["quadros"] == 300
    # Uma parte começa no meio (5 s): o quadro de cada lado da emenda e o resto ficam iguais aos da gravação inteira
    for segundos in (0.5, 4.9, 5.0, 5.1, 9.5):
        a = _quadro(tmp_path / "m1.mp4", segundos, largura, altura).astype(int)
        b = _quadro(tmp_path / "m2.mp4", segundos, largura, altura).astype(int)
        assert np.abs(a - b).mean() < 0.5, segundos
    assert not list(tmp_path.glob("*.0.mp4")) and not list(tmp_path.glob("*.1.mp4"))


# -----------------------------------------------
# A biblioteca (14.11): as receitas de core/legendas/estilos.json
# -----------------------------------------------
def test_cada_estilo_tem_categoria_agrupamento_e_as_fontes_que_desenha():
    assert len(ESTILOS) >= 40
    for chave, estilo in ESTILOS.items():
        assert estilo["categoria"] in CATEGORIAS, chave
        assert estilo["agrupar"] in ("bloco", "palavra") and estilo["letras"] >= 1 and estilo["linhas"] >= 1, chave
        assert estilo["nome"] and estilo["descricao"], chave
        carregadas = {(FONTES[nome][2], FONTES[nome][3] == "italic") for nome in estilo["fontes"]}
        receita = receita_do_estilo(chave)
        base = receita.get("base", {})
        for papel in ("base", "enfase", "conectivo", "numero"):
            r = {**base, **receita.get(papel, {})}
            familia = (r.get("familia") or "Montserrat", bool(r.get("italico")))
            assert familia in carregadas, (chave, papel, familia)
        # O motor só recebe a receita: os campos do agrupamento ficam no Python
        assert "letras" not in receita and "fontes" not in receita


def test_o_papel_de_cada_palavra():
    assert papel_da_palavra("30", False) == "numero" and papel_da_palavra("R$1.500,", True) == "numero"
    assert papel_da_palavra("rotina", True) == "enfase"
    assert papel_da_palavra("com", False) == "conectivo" and papel_da_palavra("Que,", False) == "conectivo"
    assert papel_da_palavra("hábito", False) == "normal"
    fala = conferir_palavras(_palavras("Em 30 dias mudei a rotina", enfase={"rotina"}), 3)
    assert [p["papel"] for p in fala] == ["conectivo", "numero", "normal", "normal", "conectivo", "enfase"]


def test_empilhado_poe_uma_palavra_por_linha():
    fala = conferir_palavras(_palavras("um dois três quatro cinco"), 2)
    blocos = blocos_da_fala(fala, "empilhado", 2)
    assert all(len(linha) == 1 for bloco in blocos for linha in bloco["linhas"])
    assert all(len(bloco["linhas"]) <= 4 for bloco in blocos)


@pytest.mark.skipif(not PODE_GRAVAR, reason="FFmpeg ou o Chromium do Playwright não instalados")
def test_cada_estilo_desenha_sem_erro_dentro_da_faixa_e_igual_no_mesmo_instante():
    from worker.tarefas.animacao_html import Estudio, abrir_navegador
    from worker.tarefas.legenda_animada import arquivos_da_pagina

    texto = "Em 30 dias eu mudei a minha rotina inteira com um hábito simples. Ninguém acredita."
    fala = conferir_palavras(_palavras(texto, passo=0.34, comeco=0.2, enfase={"rotina", "hábito"}), 6.5)
    largura, altura = QUADROS["9:16"]
    instantes = (1.2, 2.05, 4.4)
    playwright, navegador = abrir_navegador()
    try:
        for estilo in ESTILOS:
            pagina = montar_pagina(blocos_da_fala(fala, estilo, 6.5), estilo, "9:16", 6.5, {}, 0.7, "/fontes",
                                   "/legendas")
            with Estudio(pagina, largura, altura, navegador, extras=arquivos_da_pagina()) as estudio:
                y0, y1 = (int(v) for v in estudio.avaliar("() => window.faixaDaLegenda()"))
                algo = 0
                for t in instantes:
                    quadro = estudio.quadro(t)
                    alfa = quadro[:, :, 3]
                    # Fora da faixa que o worker fotografa, nada (senão a gravação cortaria o desenho)
                    assert alfa[:y0].max(initial=0) == 0 and alfa[y1:].max(initial=0) == 0, (estilo, t)
                    algo += int(alfa.max() > 200)
                # O mesmo instante desenha o mesmo quadro
                assert np.abs(estudio.quadro(1.2).astype(int) - estudio.quadro(1.2).astype(int)).max() <= 2, estilo
                assert algo >= 2, estilo
    finally:
        navegador.close()
        playwright.stop()
