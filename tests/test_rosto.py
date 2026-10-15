# Rosto: a escolha de quem está em quadro, entre os rostos achados em cada amostra
from core.modelos.rosto import escolher_rosto


def test_sem_ninguem_antes_fica_o_maior():
    assert escolher_rosto(None, [(0.2, 0.3, 0.01), (0.7, 0.4, 0.05)]) == (0.7, 0.4, 0.05)
    assert escolher_rosto(None, []) is None


def test_quem_ja_estava_em_quadro_continua_mesmo_com_outro_maior_longe():
    # Quem fala está em (0,5; 0,4); entra alguém maior no canto, longe: o enquadramento não pula
    assert escolher_rosto((0.5, 0.4), [(0.52, 0.41, 0.02), (0.1, 0.8, 0.09)]) == (0.52, 0.41, 0.02)
    # Se quem falava saiu, entra o maior que restou
    assert escolher_rosto((0.5, 0.4), [(0.1, 0.8, 0.09), (0.9, 0.2, 0.03)]) == (0.1, 0.8, 0.09)
