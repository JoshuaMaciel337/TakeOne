# A saída das fotos do álbum (onda 16.10): nomes, subpastas, o XMP ao lado e as contas da marca e do tamanho
from core.modelos.saida_do_album import (
    lado_para_o_limite,
    nome_do_arquivo,
    posicao_da_marca,
    qualidade_para_o_tamanho,
    sem_repetir,
    subpasta,
    xmp_da_foto,
)
from core.modelos.xmp import cor_do_xmp


def test_nomes_e_subpastas():
    foto = {"nome": "IMG_0001", "nota": 4, "cor": "verde", "categoria": "destaque", "pasta": "Festa/Pista",
            "exif": {"data": "2026-10-10T15:00:00"}}
    assert nome_do_arquivo("{album}_{n}", foto, 7, "Casamento: Ana/Leo", "jpg") == "Casamento_ Ana_Leo_0007.jpg"
    assert nome_do_arquivo("{data} {original}", foto, 1, "x", "png") == "2026-10-10 IMG_0001.png"
    assert nome_do_arquivo("", foto, 1, "x", "jpg") == "IMG_0001.jpg"
    assert [subpasta(foto, d) for d in ("nenhuma", "nota", "cor", "categoria", "pasta")] == [
        "", "4 estrelas", "Verde", "Destaques", "Festa/Pista"]
    assert subpasta({"nota": 0}, "nota") == "Sem nota" and subpasta({}, "cor") == "Sem cor"
    usados: set[str] = set()
    assert [sem_repetir("a/x.jpg", usados) for _ in range(3)] == ["a/x.jpg", "a/x (2).jpg", "a/x (3).jpg"]


def test_xmp_volta_pelo_leitor():
    cor = {"exposicao": 0.5, "contraste": 0.2, "saturacao": -0.1, "temperatura": 0.15, "vinheta": 0.25}
    xmp = xmp_da_foto({"nome": "IMG <1>", "nota": 5, "cor": "azul"}, cor)
    assert 'xmp:Rating="5"' in xmp and 'xmp:Label="Blue"' in xmp and "IMG &lt;1&gt;" in xmp
    # O que sai daqui volta igual pelo leitor de XMP
    lido = cor_do_xmp(xmp)
    assert {k: lido[k] for k in cor} == cor
    assert 'xmp:Rating="-1"' in xmp_da_foto({"marcacao": "rejeitada", "nota": 3})


def test_contas_da_marca_e_do_tamanho():
    assert lado_para_o_limite(6000, 4000, 2048) == (2048, 1365) and lado_para_o_limite(800, 600, 2048) == (800, 600)
    assert posicao_da_marca(1000, 800, 200, 50, "baixo-direita") == (776, 726)
    assert posicao_da_marca(1000, 800, 200, 50, "cima-esquerda") == (24, 24)
    assert posicao_da_marca(1000, 800, 200, 50, "meio") == (400, 375)
    # O tamanho cresce com a qualidade: a maior que cabe em 500
    assert qualidade_para_o_tamanho(lambda q: q * 10, 500) == 50
    assert qualidade_para_o_tamanho(lambda q: q * 10, 5000) == 95
