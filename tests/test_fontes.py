# O catálogo de fontes do editor de imagem: o que o nome do arquivo diz e só os arquivos que estão na pasta.
from pathlib import Path

from core.modelos.fontes import caminho_da_fonte, catalogo, estilo_do_arquivo


def test_estilo_pelo_nome_do_arquivo():
    assert estilo_do_arquivo("Roboto-Italic[wdth,wght].ttf") == {
        "arquivo": "Roboto-Italic[wdth,wght].ttf",
        "italico": True,
        "eixos": ["wdth", "wght"],
        "peso": 400,
    }
    assert estilo_do_arquivo("IBMPlexMono-SemiBoldItalic.ttf")["peso"] == 600
    assert estilo_do_arquivo("IBMPlexMono-SemiBoldItalic.ttf")["italico"] is True
    assert estilo_do_arquivo("ShadowsIntoLight.ttf") == {
        "arquivo": "ShadowsIntoLight.ttf",
        "italico": False,
        "eixos": [],
        "peso": 400,
    }


def test_catalogo_so_com_o_que_esta_na_pasta(tmp_path: Path):
    # Sem a biblioteca baixada, só as do servidor
    familias = catalogo(tmp_path)
    assert [f["id"] for f in familias] == ["inter", "montserrat", "caveat"]
    assert familias[0]["estilos"][0]["eixos"] == ["opsz", "wght"]
    # Com um arquivo da biblioteca na pasta, a família dela aparece (só com ele)
    (tmp_path / "Lobster-Regular.ttf").write_bytes(b"\x00\x01\x00\x00")
    lobster = next(f for f in catalogo(tmp_path) if f["id"] == "lobster")
    assert lobster["categoria"] == "decorativa" and [e["arquivo"] for e in lobster["estilos"]] == [
        "Lobster-Regular.ttf"
    ]
    # O arquivo só sai das duas pastas, pelo nome
    assert caminho_da_fonte("Lobster-Regular.ttf", tmp_path) == tmp_path / "Lobster-Regular.ttf"
    assert caminho_da_fonte("Inter[opsz,wght].ttf", tmp_path).name == "Inter[opsz,wght].ttf"
    assert caminho_da_fonte("../config.py", tmp_path) is None
    assert caminho_da_fonte("Nada.ttf", tmp_path) is None
