# -----------------------------------------------
# Tarefa "esconder_objeto" — a máscara de um objeto seguido (uma placa, um logo, uma tela), para pixelizar
#
# A pessoa marca o objeto e o VitTrack segue (tarefa "rastreio"); aqui, o caminho vira um vídeo cinza do tamanho e
# do ritmo da máscara do recorte (objeto_<rastreio>.mp4): um retângulo de cantos redondos e borda suave, um pouco
# maior que a caixa seguida, em cada quadro do trecho seguido. Pontos de pouca confiança (o objeto passou atrás de
# algo) ficam com a última caixa boa; fora do trecho, a máscara é preta.
# -----------------------------------------------
import bisect
import logging
import subprocess
from collections.abc import Callable
from fractions import Fraction

import cv2
import numpy as np
from bson import ObjectId

from core.config import FFMPEG
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_PROXY_VIDEO, arquivo_da_mascara_do_objeto, chave_arquivo
from core.utils import storage
from core.utils.mongo import agora
from worker.tarefas.recorte_fundo import _sondar, tamanhos

NOTA_MINIMA = 0.3
# A caixa um pouco maior que a do rastreador (ele aperta o objeto)
FOLGA = 1.4
SUAVIDADE = 0.008


def marcar_com_erro(db, job: dict, mensagem: str):
    entrada = job.get("entrada") or {}
    if entrada.get("midia_id") and entrada.get("rastreio_id"):
        db.midias.update_one({"_id": ObjectId(entrada["midia_id"])}, {"$set": {
            f"objetos_escondidos.{entrada['rastreio_id']}": {"status": "erro", "erro": mensagem},
            "atualizado_em": agora(),
        }})


def caixa_no_instante(pontos: list[list[float]], t: float, quadro: float) -> tuple[float, float, float, float] | None:
    """A caixa (cx, cy, l, a em frações) no instante t: o último ponto bom até t; fora do trecho seguido, None."""
    if not pontos or t < pontos[0][0] - quadro or t > pontos[-1][0] + quadro:
        return None
    tempos = [p[0] for p in pontos]
    i = bisect.bisect_right(tempos, t + 1e-6) - 1
    while i >= 0 and pontos[i][5] < NOTA_MINIMA:
        i -= 1
    if i < 0:
        bons = [p for p in pontos if p[5] >= NOTA_MINIMA]
        if not bons:
            return None
        return tuple(bons[0][1:5])
    return tuple(pontos[i][1:5])


def desenhar(caixa: tuple[float, float, float, float] | None, tamanho: tuple[int, int]) -> np.ndarray:
    largura, altura = tamanho
    mascara = np.zeros((altura, largura), np.uint8)
    if caixa is None:
        return mascara
    cx, cy, cl, ca = caixa
    meia_l, meia_a = cl * largura * FOLGA / 2, ca * altura * FOLGA / 2
    x0, y0, x1, y1 = (round(cx * largura - meia_l), round(cy * altura - meia_a),
                      round(cx * largura + meia_l), round(cy * altura + meia_a))
    raio = max(1, round(min(meia_l, meia_a) * 0.25))
    cv2.rectangle(mascara, (x0 + raio, y0), (x1 - raio, y1), 255, -1)
    cv2.rectangle(mascara, (x0, y0 + raio), (x1, y1 - raio), 255, -1)
    for canto in ((x0 + raio, y0 + raio), (x1 - raio, y0 + raio), (x0 + raio, y1 - raio), (x1 - raio, y1 - raio)):
        cv2.circle(mascara, canto, raio, 255, -1, cv2.LINE_AA)
    sigma = SUAVIDADE * min(largura, altura)
    return cv2.GaussianBlur(mascara, (0, 0), sigma) if sigma > 0.3 else mascara


def executar_esconder_objeto(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    rastreio_id = ObjectId(job["entrada"]["rastreio_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de esconder o objeto.")
    rastreio = db.rastreios.find_one({"_id": rastreio_id, "midia_id": midia_id})
    if rastreio is None or rastreio.get("status") != "pronto":
        raise ErroDefinitivo("O caminho do objeto não foi encontrado. Marque o objeto de novo.")
    organizacao_id = midia["organizacao_id"]
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_PROXY_VIDEO))
    if not proxy.is_file():
        raise ErroDefinitivo("A cópia leve desta mídia não foi encontrada.")
    largura, altura, taxa, duracao = _sondar(proxy)
    _modelo, (lk, ak) = tamanhos(largura, altura)
    fps = float(Fraction(taxa))
    total = max(1, round(duracao * fps))
    pontos = sorted(rastreio.get("pontos") or [], key=lambda p: p[0])
    arquivo = arquivo_da_mascara_do_objeto(str(rastreio_id))
    destino = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, arquivo))
    parcial = destino.with_name(f"{destino.stem}.parcial.mp4")
    escritor = subprocess.Popen([FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{lk}x{ak}",
                                 "-framerate", taxa, "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
                                 "-pix_fmt", "yuv420p", "-color_range", "tv", "-g", "60", "-movflags", "+faststart",
                                 str(parcial)], stdin=subprocess.PIPE)
    preta = desenhar(None, (lk, ak)).tobytes()
    try:
        for n in range(total):
            caixa = caixa_no_instante(pontos, n / fps, 1 / fps)
            escritor.stdin.write(preta if caixa is None else desenhar(caixa, (lk, ak)).tobytes())
            if n % 60 == 0:
                reportar(min(95, 2 + int(93 * n / total)), "Gravando a máscara do objeto")
    except BaseException:
        escritor.kill()
        escritor.wait(timeout=60)
        parcial.unlink(missing_ok=True)
        raise
    finally:
        try:
            escritor.stdin.close()
        except OSError:
            pass
        codigo = escritor.wait(timeout=600)
    if codigo != 0:
        parcial.unlink(missing_ok=True)
        raise RuntimeError(f"O vídeo da máscara do objeto não foi gravado (código {codigo}).")
    parcial.replace(destino)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {f"objetos_escondidos.{rastreio_id}": {"status": "pronta", "erro": None}, "atualizado_em": agora()},
        "$addToSet": {"arquivos": arquivo},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Objeto escondido ({len(pontos)} pontos, {total} quadros).")
    reportar(100, "Objeto escondido")
    return {"midia_id": str(midia_id), "rastreio_id": str(rastreio_id), "quadros": total}
