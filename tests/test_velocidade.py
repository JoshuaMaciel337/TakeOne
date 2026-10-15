# Velocidade com curva: os casos que a prévia confere em velocidade.test.ts, a expressão do setpts e o
# andamento do som no próprio FFmpeg
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from core.config import FFMPEG
from core.utils.velocidade import (
    atempo_necessarios,
    comandos_do_andamento,
    expressao_do_tempo,
    fator_na_curva,
    fracao_na_midia,
    velocidade_na_curva,
)

CASOS = json.loads((Path(__file__).parent / "casos" / "velocidade.json").read_text(encoding="utf-8"))["casos"]
TEM_FFMPEG = shutil.which("ffmpeg") is not None
HEROI = CASOS[0]["pontos"]


@pytest.mark.parametrize("caso", CASOS, ids=[c["nome"] for c in CASOS])
def test_conta_igual_a_da_previa(caso):
    pontos = caso["pontos"]
    assert [fator_na_curva(pontos, u) for u in caso["u"]] == pytest.approx(caso["fator"], abs=1e-12)
    assert [fracao_na_midia(pontos, u) for u in caso["u"]] == pytest.approx(caso["fracao"], abs=1e-12)
    assert [velocidade_na_curva(pontos, 2, u) for u in caso["u"]] == pytest.approx(caso["velocidade_2x"], abs=1e-12)


def avaliar(expressao: str, valor: float) -> float:
    ambiente = {"lt": lambda a, b: a < b, "T": valor, "_se": lambda c, a, b: a if c else b}
    return eval(re.sub(r"if\(", "_se(", expressao), {"__builtins__": {}}, ambiente)  # noqa: S307


def test_expressao_do_setpts_e_a_inversa_da_conta():
    # Clipe de 4 s, 8 s de mídia: o instante da mídia de cada instante do clipe volta para ele
    expressao = expressao_do_tempo(HEROI, 4, 8)
    for u in (0.05, 0.3, 0.5, 0.65, 0.95):
        midia = fracao_na_midia(HEROI, u) * 8
        assert avaliar(expressao, midia) == pytest.approx(u * 4, abs=0.01), u


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_som_com_curva_dura_o_clipe(tmp_path):
    """8 s de som numa curva de 4 s: o andamento por roteiro dá os 4 s, com a lentidão no meio."""
    roteiro = tmp_path / "andamento.txt"
    # A lentidão do meio fica acima de 0,5×: um atempo basta
    assert atempo_necessarios(HEROI, 2, 4) == 1 and atempo_necessarios(HEROI, 0.5, 4) == 3
    alvos = ["atempo@a"]
    roteiro.write_text(comandos_do_andamento(HEROI, 2, 4, alvos), encoding="utf-8")
    cadeia = f"asendcmd=f='{roteiro}'," + ",".join(f"{alvo}=tempo=1" for alvo in alvos)
    saida = subprocess.run([FFMPEG, "-hide_banner", "-f", "lavfi", "-i", "sine=f=440:r=48000:d=8", "-af", cadeia,
                            "-f", "null", "-"], capture_output=True, text=True, timeout=60).stderr
    duracao = re.findall(r"time=(\d+):(\d+):([\d.]+)", saida)[-1]
    segundos = int(duracao[0]) * 3600 + int(duracao[1]) * 60 + float(duracao[2])
    assert segundos == pytest.approx(4, abs=0.1), "o andamento muda em degraus de 50 ms"


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_render_mostra_o_mesmo_quadro_da_midia_que_a_previa():
    """Cada quadro da fonte tem o cinza do número dele: o render mostra o último que já chegou."""
    import math

    duracao, trecho = 4, 8
    fonte = f"color=c=black:s=16x16:r=30:d={trecho},format=gray,geq=lum='N'"
    cadeia = (f"settb=1/90000,setpts=PTS-STARTPTS,setpts='({expressao_do_tempo(HEROI, duracao, trecho)})/TB',"
              "fps=30:round=up")
    saida = subprocess.run([FFMPEG, "-loglevel", "error", "-f", "lavfi", "-i", fonte, "-vf", cadeia,
                            "-frames:v", str(duracao * 30), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                           capture_output=True, check=True, timeout=60).stdout
    mostrados = [saida[k * 256] for k in range(duracao * 30)]
    previa = [math.floor(fracao_na_midia(HEROI, k / (duracao * 30)) * trecho * 30 + 1e-6) for k in range(duracao * 30)]
    iguais = sum(a == b for a, b in zip(mostrados, previa, strict=True))
    assert iguais >= 115, f"{iguais} de 120 quadros iguais"
