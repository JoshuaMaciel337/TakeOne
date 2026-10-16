# A biblioteca de animações (core/animacoes): cada modelo, em três proporções, abre sem erro de script,
# mostra algo no meio, não corta nada na borda (a menos que cubra o quadro de propósito) e dá sempre o
# mesmo quadro para o mesmo instante. Também confere os dados de cada modelo.
import numpy as np
import pytest

from core.modelos.animacao_html import CATEGORIAS, MODELOS, QUADROS, conferir_campos, montar_html
from tests.test_animacao_html import PODE_GRAVAR

PROPORCOES = ("16:9", "9:16", "1:1")


def test_dados_de_todo_modelo_sao_validos():
    assert len(MODELOS) >= 8
    for chave, modelo in MODELOS.items():
        assert modelo["categoria"] in CATEGORIAS, chave
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


@pytest.mark.parametrize("modelo", sorted(MODELOS))
def test_modelo_funciona_em_toda_proporcao(navegador, modelo):
    from worker.tarefas.animacao_html import Estudio

    dados = MODELOS[modelo]
    dur = dados["duracao"]
    for proporcao in PROPORCOES:
        largura, altura = QUADROS[proporcao]
        with Estudio(montar_html(modelo, {}, dur, proporcao, "/fontes", "/animacoes"), largura, altura,
                     navegador) as estudio:
            meio = estudio.quadro(dur * 0.5)
            alfa = meio[:, :, 3]
            assert alfa.max() > 200, f"{modelo} {proporcao}: nada aparece no meio da animação"
            if not dados["tela_cheia"]:
                margem = max(2, round(min(largura, altura) * 0.006))
                borda = np.concatenate([alfa[:margem].ravel(), alfa[-margem:].ravel(),
                                        alfa[:, :margem].ravel(), alfa[:, -margem:].ravel()])
                assert borda.max() <= 40, f"{modelo} {proporcao}: algo encosta na borda (cortado)"
            # O mesmo instante, depois de passar por outro, dá o mesmo quadro
            estudio.quadro(dur * 0.2)
            de_novo = estudio.quadro(dur * 0.5)
            diferenca = np.abs(de_novo.astype(int) - meio.astype(int)).max()
            assert diferenca <= 2, f"{modelo} {proporcao}: o mesmo instante mudou (não é determinístico)"


def test_todo_modelo_tem_miniatura():
    from pathlib import Path

    pasta = Path(__file__).resolve().parents[1] / "apps" / "web" / "public" / "animacoes"
    faltam = [m for m in MODELOS if not (pasta / f"{m}.webp").is_file()]
    assert not faltam, f"Rode apps/worker/miniaturas_animacoes.py: faltam {faltam}"
