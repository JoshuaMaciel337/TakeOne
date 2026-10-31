# As medidas do vídeo na nota de cada corte (o Clipar, ADR 0004, decisão 3)
import numpy as np

from core.modelos.clipagem import pontuar
from core.modelos.medidas_do_corte import MedidasDoVideo


def _corte(inicio, fim):
    return {"trechos": [{"inicio": inicio, "fim": fim}], "duracao": fim - inicio,
            "notas": {"gancho": 7, "fluxo": 7, "valor": 7, "autonomia": 7}, "propaganda": False}


def test_a_voz_e_o_percentil_do_volume_na_fala_do_proprio_video():
    # 60 s de fala a -20 dB e, de 30 a 40 s, mais alta (-10 dB); de 50 a 60 s, silêncio
    niveis = np.full(6000, -20, dtype=np.int8)
    niveis[3000:4000] = -10
    niveis[5000:] = -90
    video = MedidasDoVideo(niveis.tobytes())
    # Os 10 s altos são o quinto mais alto da fala: o meio deles fica no percentil 90
    assert video.voz(_corte(30, 40)) == 0.9
    assert 0.3 < video.voz(_corte(0, 20)) < 0.6
    # Só silêncio: não há o que medir
    assert video.voz(_corte(51, 59)) is None


def test_o_rosto_e_a_imagem_dentro_do_corte():
    rostos = [{"t": n / 2} for n in range(40)]          # rosto nos primeiros 20 s
    qualidade = {"t": [n / 4 for n in range(160)], "nota": [1.0] * 80 + [0.2] * 80}
    video = MedidasDoVideo(None, rostos, qualidade)
    assert video.rosto(_corte(0, 10)) == 1.0
    assert video.rosto(_corte(15, 25)) == 0.5
    assert video.rosto(_corte(30, 40)) == 0.0
    assert video.imagem(_corte(0, 10)) == 1.0
    assert video.imagem(_corte(25, 35)) == 0.2
    assert video.voz(_corte(0, 10)) is None


def test_a_nota_sobe_com_as_medidas_boas_e_ignora_as_que_faltam():
    palavras = [{"texto": "a", "inicio": t / 2, "fim": t / 2 + 0.4} for t in range(80)]
    bom = MedidasDoVideo(None, [{"t": n / 2} for n in range(80)], {"t": [0, 10, 20, 30], "nota": [1, 1, 1, 1]})
    ruim = MedidasDoVideo(None, [], {"t": [0, 10, 20, 30], "nota": [0, 0, 0, 0]})
    com_bom = pontuar(_corte(0, 30), palavras, bom)
    com_ruim = pontuar(_corte(0, 30), palavras, ruim)
    sem = pontuar(_corte(0, 30), palavras)
    assert set(com_bom["medidas"]) == {"ritmo", "rosto", "imagem"} and set(sem["medidas"]) == {"ritmo"}
    assert com_ruim["nota"] < sem["nota"] < com_bom["nota"]
