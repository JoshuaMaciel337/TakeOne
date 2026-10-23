# Formato dos fades: a fórmula de core/utils/som.py, os casos que a prévia confere e o próprio afade
import cmath
import json
import math
import shutil
import subprocess
from array import array
from pathlib import Path

import pytest

from core.config import FFMPEG
from core.utils.som import (
    CURVAS_DO_FADE,
    ECO_ATRASO_S,
    afir_sem_normalizar,
    comandos_de_volume,
    filtros_de_voz,
    ganho_do_fade,
    ganho_para_igualar,
    resposta_do_reverb,
    wav_do_reverb,
)

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


def test_ganho_para_igualar_leva_a_14_lufs_com_limite():
    assert ganho_para_igualar(-23) == 9
    assert ganho_para_igualar(-8.5) == -5.5
    assert ganho_para_igualar(-60) == 20, "no máximo 20 dB"
    assert ganho_para_igualar(None) == 0 and ganho_para_igualar(-80) == 0, "sem medida ou silêncio: nada"


# -----------------------------------------------
# Efeitos de voz: o impulso passado pelos filtros do FFmpeg, medido
# -----------------------------------------------
EQ = json.loads((Path(__file__).parent / "casos" / "eq.json").read_text(encoding="utf-8"))
IMPULSO = f"aevalsrc='if(eq(n,0),1,0)':s={TAXA}:d=2"


def resposta_ao_impulso(filtros: str, entradas: list[str] | None = None, grafo: bool = False) -> array:
    argumentos = [FFMPEG, "-loglevel", "error", "-f", "lavfi", "-i", IMPULSO]
    for entrada in entradas or []:
        argumentos += ["-i", entrada]
    argumentos += (["-filter_complex", filtros] if grafo else ["-af", filtros]) + ["-ac", "1", "-f", "f64le", "-"]
    return array("d", subprocess.run(argumentos, capture_output=True, check=True, timeout=60).stdout)


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
@pytest.mark.parametrize("caso", EQ["casos"], ids=[json.dumps(c["efeitos"]) for c in EQ["casos"]])
def test_equalizador_do_ffmpeg_tem_a_resposta_do_web_audio(caso):
    h = resposta_ao_impulso(",".join(filtros_de_voz(caso["efeitos"])))
    for frequencia, esperado in zip(caso["frequencias"], caso["db"], strict=True):
        w = 2 * math.pi * frequencia / TAXA
        medido = 20 * math.log10(abs(sum(v * cmath.exp(-1j * w * n) for n, v in enumerate(h))))
        assert medido == pytest.approx(esperado, abs=0.05), frequencia


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_eco_repete_tres_vezes_cada_uma_mais_fraca():
    h = resposta_ao_impulso(",".join(filtros_de_voz({"eco": 0.5})))
    atraso = round(ECO_ATRASO_S * TAXA)
    assert h[0] == pytest.approx(1)
    assert [round(h[atraso * i], 6) for i in (1, 2, 3)] == [0.5, 0.25, 0.125]
    assert max(abs(v) for i, v in enumerate(h) if i % atraso) < 1e-9


@pytest.mark.skipif(not TEM_FFMPEG, reason="FFmpeg não instalado")
def test_reverb_soma_a_resposta_da_sala_sem_normalizar(tmp_path):
    ir = tmp_path / "reverb.wav"
    ir.write_bytes(wav_do_reverb())
    grafo = (f"[0:a]asplit=2[s][c];[c][1:a]{afir_sem_normalizar()}[r];"
             "[s][r]amix=inputs=2:weights='1 0.5':normalize=0:duration=first")
    h = resposta_ao_impulso(grafo, [str(ir)], grafo=True)
    sala = resposta_do_reverb()
    assert sum(v * v for v in sala) == pytest.approx(1)
    # O som seco no começo e, depois, a cauda da sala com metade do volume
    assert h[0] == pytest.approx(1 + 0.5 * sala[0], abs=1e-4)
    for n in (round(0.03 * TAXA), round(0.2 * TAXA), round(0.8 * TAXA)):
        assert h[n] == pytest.approx(0.5 * sala[n], abs=1e-4), n


def test_tirar_o_ronco_e_o_passa_altas_de_80_hz_antes_do_equalizador():
    from core.utils.som import filtros_de_voz

    filtros = filtros_de_voz({"ronco": 1, "grave": 3})
    assert filtros[0] == "highpass=f=80:t=q:w=0.7071" and filtros[1].startswith("lowshelf=")
    assert filtros_de_voz({"ronco": 0}) == []


def test_keyframes_de_volume_multiplicam_o_abaixar_no_mesmo_roteiro():
    volume = [{"t": 0, "valor": 2, "curva": "linear"}, {"t": 2 * S, "valor": 0, "curva": "linear"}]
    linhas = comandos_de_volume(CURVA, 3, "volume@ab0", volume).splitlines()
    valores = {linha.split(" ")[0]: float(linha.split(" ")[3].rstrip(";")) for linha in linhas}
    # Em 1,5 s: o abaixar em 0,25 e o volume em 0,5
    assert valores["1.50"] == pytest.approx(0.125, abs=1e-6)
    assert valores["0.00"] == 2 and valores["2.00"] == 0
    # Sem abaixar, só os keyframes
    sozinho = comandos_de_volume(None, 3, "volume@ab0", volume).splitlines()
    assert sozinho[0] == "0.00 volume@ab0 volume 2.000000;" and "1.00 volume@ab0 volume 1.000000;" in sozinho


def test_nivelamento_multiplica_no_mesmo_roteiro():
    nivelar = [{"t": 0, "valor": 2, "curva": "linear"}, {"t": S, "valor": 2, "curva": "linear"},
               {"t": 2 * S, "valor": 0.5, "curva": "linear"}]
    linhas = comandos_de_volume(CURVA, 3, "volume@ab0", nivelamento=nivelar).splitlines()
    valores = {linha.split(" ")[0]: float(linha.split(" ")[3].rstrip(";")) for linha in linhas}
    # Em 0,5 s só o nivelamento (2); em 1,5 s, o abaixar (0,25) vezes o nivelamento no meio da reta (1,25)
    assert valores["0.00"] == 2 and valores["1.50"] == pytest.approx(0.3125, abs=1e-6)
