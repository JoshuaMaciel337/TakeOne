# O texto do vídeo com uma fonte da biblioteca de fontes livres ("lib:<família>", ADR 0007, 17.4): o arquivo sem
# itálico, o peso do negrito no eixo da fonte variável e a de títulos quando a família não está na pasta.
import shutil

from core.modelos.fontes import PASTA_DAS_FONTES, arquivo_para_o_texto
from core.utils import texto


def test_a_familia_da_biblioteca_vira_o_arquivo_reto_e_o_peso(tmp_path):
    shutil.copy(PASTA_DAS_FONTES / "Montserrat[wght].ttf", tmp_path / "Roboto[wdth,wght].ttf")
    shutil.copy(PASTA_DAS_FONTES / "Montserrat[wght].ttf", tmp_path / "Roboto-Italic[wdth,wght].ttf")
    caminho, peso = arquivo_para_o_texto("lib:roboto", True, tmp_path)
    assert caminho.name == "Roboto[wdth,wght].ttf" and peso == 700
    assert arquivo_para_o_texto("lib:roboto", False, tmp_path)[1] == 400
    assert arquivo_para_o_texto("lib:nao-existe", False, tmp_path) is None
    assert arquivo_para_o_texto("display", False, tmp_path) is None


def test_o_texto_desenha_com_a_fonte_da_biblioteca_e_o_negrito_pesa(tmp_path, monkeypatch):
    shutil.copy(PASTA_DAS_FONTES / "Montserrat[wght].ttf", tmp_path / "Roboto[wdth,wght].ttf")
    monkeypatch.setattr(texto, "FONTES_DA_BIBLIOTECA", tmp_path)
    texto.carregar_fonte.cache_clear()
    try:
        fino = texto.carregar_fonte("lib:roboto", False, 80)
        grosso = texto.carregar_fonte("lib:roboto", True, 80)
        assert grosso.getlength("Mundo") > fino.getlength("Mundo")
        # Sem a família na pasta, a de títulos
        sem = texto.carregar_fonte("lib:nao-existe", True, 80)
        assert sem.getlength("Mundo") == texto.carregar_fonte("display", True, 80).getlength("Mundo")
    finally:
        texto.carregar_fonte.cache_clear()
