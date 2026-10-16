# A biblioteca de animações (core/animacoes): cada desenho, em três proporções, abre sem erro de script,
# mostra algo no meio, não corta nada na borda (a menos que cubra o quadro de propósito) e dá sempre o
# mesmo quadro para o mesmo instante. As versões dos temas (core/animacoes/temas) só trocam textos e cores:
# basta conferir que cabem em 9:16, a proporção mais estreita. No CI vai uma versão a cada quatro, para o
# push não demorar; com TAKEONE_TESTAR_TUDO=1 vão todas (rode assim a cada lote novo de modelos).
import os

import numpy as np
import pytest

from core.modelos.animacao_html import CATEGORIAS, DESENHOS, MODELOS, QUADROS, TEMAS, conferir_campos, montar_html
from tests.test_animacao_html import PODE_GRAVAR

PROPORCOES = ("16:9", "9:16", "1:1")
VERSOES = sorted(set(MODELOS) - set(DESENHOS))
if not os.environ.get("TAKEONE_TESTAR_TUDO"):
    VERSOES = VERSOES[::4]


def test_dados_de_todo_modelo_sao_validos():
    assert len(MODELOS) >= 8
    for chave, modelo in MODELOS.items():
        assert modelo["categoria"] in CATEGORIAS, chave
        assert all(tema in TEMAS for tema in modelo["temas"]), chave
        assert 1.5 <= modelo["duracao"] <= 10, chave
        ids = [c[0] for c in modelo["campos"]]
        assert len(ids) == len(set(ids)), chave
        # Os valores de partida passam na própria conferência
        conferir_campos(chave, {})
        # Todo {{campo}} usado no HTML existe
        for nome in __import__("re").findall(r"\{\{(\w+)(?::\w+)?\}\}", modelo["corpo"]):
            assert nome == "base" or nome in ids, (chave, nome)


@pytest.fixture(scope="module")
def navegador():
    if not PODE_GRAVAR:
        pytest.skip("FFmpeg ou o Chromium do Playwright não instalados")
    from worker.tarefas.animacao_html import abrir_navegador

    playwright, navegador = abrir_navegador()
    yield navegador
    navegador.close()
    playwright.stop()


def _conferir_quadro(modelo: str, proporcao: str, quadro: np.ndarray):
    """Algo aparece e, a menos que o modelo cubra a tela, nada encosta na borda."""
    alfa = quadro[:, :, 3]
    assert alfa.max() > 200, f"{modelo} {proporcao}: nada aparece no meio da animação"
    if not MODELOS[modelo]["tela_cheia"]:
        altura, largura = alfa.shape
        margem = max(2, round(min(largura, altura) * 0.006))
        borda = np.concatenate([alfa[:margem].ravel(), alfa[-margem:].ravel(),
                                alfa[:, :margem].ravel(), alfa[:, -margem:].ravel()])
        assert borda.max() <= 40, f"{modelo} {proporcao}: algo encosta na borda (cortado)"


@pytest.mark.parametrize("modelo", sorted(DESENHOS))
def test_desenho_funciona_em_toda_proporcao(navegador, modelo):
    from worker.tarefas.animacao_html import Estudio

    dur = MODELOS[modelo]["duracao"]
    for proporcao in PROPORCOES:
        largura, altura = QUADROS[proporcao]
        with Estudio(montar_html(modelo, {}, dur, proporcao, "/fontes", "/animacoes"), largura, altura,
                     navegador) as estudio:
            meio = estudio.quadro(dur * 0.5)
            _conferir_quadro(modelo, proporcao, meio)
            # O mesmo instante, depois de passar por outro, dá o mesmo quadro
            estudio.quadro(dur * 0.2)
            de_novo = estudio.quadro(dur * 0.5)
            diferenca = np.abs(de_novo.astype(int) - meio.astype(int)).max()
            assert diferenca <= 2, f"{modelo} {proporcao}: o mesmo instante mudou (não é determinístico)"


@pytest.mark.parametrize("modelo", VERSOES)
def test_versao_do_tema_cabe_no_quadro(navegador, modelo):
    from worker.tarefas.animacao_html import Estudio

    dur = MODELOS[modelo]["duracao"]
    largura, altura = QUADROS["9:16"]
    with Estudio(montar_html(modelo, {}, dur, "9:16", "/fontes", "/animacoes"), largura, altura, navegador) as estudio:
        _conferir_quadro(modelo, "9:16", estudio.quadro(dur * 0.5))


def test_todo_modelo_tem_miniatura():
    from pathlib import Path

    pasta = Path(__file__).resolve().parents[1] / "apps" / "web" / "public" / "animacoes"
    faltam = [m for m in MODELOS if not (pasta / f"{m}.webp").is_file()]
    assert not faltam, f"Rode apps/worker/miniaturas_animacoes.py: faltam {faltam}"
