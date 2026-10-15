# Formato dos fades: a fórmula de core/utils/som.py, os casos que a prévia confere e o próprio afade
import json
import shutil
import subprocess
from array import array
from pathlib import Path

import pytest

from core.config import FFMPEG
from core.utils.som import CURVAS_DO_FADE, ganho_do_fade

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
