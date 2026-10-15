# Formato dos fades: a fórmula de core/utils/som.py, os casos que a prévia confere e o próprio afade
import json
import shutil
import subprocess
from array import array
from pathlib import Path

import pytest

from core.config import FFMPEG
from core.utils.som import CURVAS_DO_FADE, comandos_de_volume, ganho_do_fade

CASOS = json.loads((Path(__file__).parent / "casos" / "fades.json").read_text(encoding="utf-8"))["casos"]
TEM_FFMPEG = shutil.which("ffmpeg") is not None
TAXA = 48000


@pytest.mark.parametrize("caso", CASOS, ids=[f"{c['curva']}-{c['p']}" for c in CASOS])
def test_formula_igual_a_dos_casos(caso):
    assert ganho_do_fade(caso["curva"], caso["p"]) == pytest.approx(caso["ganho"], abs=1e-12)


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
@pytest.mark.parametrize("curva", list(CURVAS_DO_FADE))
def test_afade_do_ffmpeg_faz_a_mesma_curva(curva):
    """Um sinal constante de 1 passando pelo afade de 1 s: cada amostra é o ganho naquele ponto."""
    saida = subprocess.run(
        [FFMPEG, "-loglevel", "error", "-f", "lavfi", "-i", f"aevalsrc=1:s={TAXA}:d=1",
         "-af", f"afade=t=in:st=0:d=1:curve={CURVAS_DO_FADE[curva]}", "-f", "f32le", "-"],
        capture_output=True, check=True, timeout=60).stdout
    amostras = array("f", saida)
    for caso in (c for c in CASOS if c["curva"] == curva and c["p"] < 1):
        medido = amostras[round(caso["p"] * TAXA)]
        assert medido == pytest.approx(caso["ganho"], abs=1e-4), (curva, caso["p"], medido)


S = 254_016_000_000
# Música abaixada 12 dB de 1 s a 2 s, descendo de 0,7 a 1 s e voltando de 2 a 2,5 s
CURVA = [{"t": 0, "valor": 1, "curva": "linear"}, {"t": round(0.7 * S), "valor": 1, "curva": "linear"},
         {"t": S, "valor": 0.25, "curva": "linear"}, {"t": 2 * S, "valor": 0.25, "curva": "linear"},
         {"t": round(2.5 * S), "valor": 1, "curva": "linear"}]


def test_roteiro_da_curva_so_escreve_quando_muda():
    linhas = comandos_de_volume(CURVA, 3, "volume@ab0").splitlines()
    assert linhas[0] == "0.00 volume@ab0 volume 1.000000;"
    # Parado em 1 até 0,7 s, descendo até 1 s, parado, subindo de 2 a 2,5 s
    tempos = [float(linha.split(" ")[0]) for linha in linhas]
    assert tempos[1] == pytest.approx(0.71) and 1.0 in tempos and 2.01 in tempos and tempos[-1] == pytest.approx(2.5)
    assert "0.25" in next(linha for linha in linhas if linha.startswith("1.50 ") or linha.startswith("1.00 "))


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_volume_do_ffmpeg_segue_a_curva(tmp_path):
    roteiro = tmp_path / "volume.txt"
    roteiro.write_text(comandos_de_volume(CURVA, 3, "volume@ab0"), encoding="utf-8")
    saida = subprocess.run(
        [FFMPEG, "-loglevel", "error", "-f", "lavfi", "-i", f"aevalsrc=1:s={TAXA}:d=3",
         "-af", f"asetnsamples=n=480:p=0,asendcmd=f='{roteiro}',volume@ab0=volume=1", "-f", "f32le", "-"],
        capture_output=True, check=True, timeout=60).stdout
    amostras = array("f", saida)
    for segundos, esperado in ((0.5, 1), (0.855, 0.6250), (1.5, 0.25), (2.255, 0.6325), (2.8, 1)):
        # O ganho muda a cada bloco de 10 ms: no máximo um passo de diferença da curva
        assert amostras[round(segundos * TAXA)] == pytest.approx(esperado, abs=0.03), segundos
