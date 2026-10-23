# -----------------------------------------------
# Tarefa "esconder_rostos" — a máscara de todos os rostos de cada quadro, para pixelizar ou desfocar
#
# YuNet (o detector do "Seguir o rosto", modelo MIT) em todo quadro da cópia leve, a 480 de largura. Cada rosto
# vira uma elipse um pouco maior que a caixa dele (pega a testa e o queixo), de borda suave, num vídeo cinza do
# tamanho e do ritmo da máscara do recorte do fundo (rostos_mascara.mp4): a prévia e o render usam o mesmo arquivo
# pelo mesmo caminho dela. Quem o detector perde por uns quadros (de perfil, com a mão na frente) continua coberto
# no último lugar em que apareceu, para o rosto não piscar descoberto.
# -----------------------------------------------
import logging
import subprocess
from collections.abc import Callable
from fractions import Fraction

import cv2
import numpy as np
from bson import ObjectId

from core.config import FFMPEG, MODELO_ROSTO
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_MASCARA_ROSTOS, ARQUIVO_PROXY_VIDEO, chave_arquivo, e_imagem
from core.utils import storage
from core.utils.mongo import agora
from worker.tarefas.recorte_fundo import _sondar, tamanhos

LARGURA_DE_ANALISE = 480
CONFIANCA_MINIMA = 0.5
# Quadros em que um rosto perdido continua coberto (meio segundo a 30 por segundo)
QUADROS_DE_MEMORIA = 15
# A elipse sobre a caixa do detector: um pouco mais larga e mais alta (a caixa corta a testa e o queixo)
FOLGA_LARGURA = 1.35
FOLGA_ALTURA = 1.6
# A borda suave, em frações do lado menor da máscara
SUAVIDADE = 0.012


def marcar_com_erro(db, job: dict, mensagem: str):
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {
            "esconder_rostos": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def _mesmo_rosto(a: tuple, b: tuple) -> bool:
    """Dois rostos (cx, cy, l, a) são o mesmo quando os centros ficam a menos de meia caixa um do outro."""
    return abs(a[0] - b[0]) < 0.5 * max(a[2], b[2]) and abs(a[1] - b[1]) < 0.5 * max(a[3], b[3])


def seguir(lembrados: list[list], achados: list[tuple]) -> list[list]:
    """
    Os rostos a cobrir neste quadro: os achados agora, e os lembrados que não foram achados há até
    QUADROS_DE_MEMORIA quadros. `lembrados` é [cx, cy, l, a, idade]; devolve a lista nova.
    """
    novos = [[*achado, 0] for achado in achados]
    for rosto in lembrados:
        if rosto[4] + 1 <= QUADROS_DE_MEMORIA and not any(_mesmo_rosto(rosto, achado) for achado in achados):
            novos.append([*rosto[:4], rosto[4] + 1])
    return novos


def desenhar(rostos: list[list], tamanho: tuple[int, int], escala: float) -> np.ndarray:
    """A máscara cinza: uma elipse de borda suave em cada rosto (em pixels da análise, vezes `escala`)."""
    largura, altura = tamanho
    mascara = np.zeros((altura, largura), np.uint8)
    for cx, cy, largura_do_rosto, altura_do_rosto, _idade in rostos:
        eixos = (max(1, round(largura_do_rosto * escala * FOLGA_LARGURA / 2)),
                 max(1, round(altura_do_rosto * escala * FOLGA_ALTURA / 2)))
        cv2.ellipse(mascara, (round(cx * escala), round(cy * escala)), eixos,
                    0, 0, 360, 255, -1, cv2.LINE_AA)
    sigma = SUAVIDADE * min(largura, altura)
    return cv2.GaussianBlur(mascara, (0, 0), sigma) if sigma > 0.3 else mascara


def executar_esconder_rostos(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de esconder os rostos.")
    if not midia.get("video") or e_imagem(midia):
        raise ErroDefinitivo("Esconder os rostos vale em vídeos.")
    if not MODELO_ROSTO.is_file():
        raise ErroDefinitivo("O modelo de rostos (YuNet) não está instalado no worker.")
    organizacao_id = midia["organizacao_id"]
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_PROXY_VIDEO))
    if not proxy.is_file():
        raise ErroDefinitivo("A cópia leve desta mídia não foi encontrada.")
    largura, altura, taxa, duracao = _sondar(proxy)
    _modelo, (lk, ak) = tamanhos(largura, altura)
    la = LARGURA_DE_ANALISE
    aa = max(2, round(altura * la / largura / 2) * 2)
    escala = lk / la
    total = max(1, round(duracao * float(Fraction(taxa))))
    detector = cv2.FaceDetectorYN.create(str(MODELO_ROSTO), "", (la, aa), CONFIANCA_MINIMA, 0.3, 5000)
    destino = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_MASCARA_ROSTOS))
    parcial = destino.with_name("rostos_mascara.parcial.mp4")
    leitor = subprocess.Popen([FFMPEG, "-v", "error", "-i", str(proxy), "-an", "-fps_mode", "passthrough",
                               "-vf", f"scale={la}:{aa}:flags=area", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                              stdout=subprocess.PIPE)
    escritor = subprocess.Popen([FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{lk}x{ak}",
                                 "-framerate", taxa, "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
                                 "-pix_fmt", "yuv420p", "-color_range", "tv", "-g", "60", "-movflags", "+faststart",
                                 str(parcial)], stdin=subprocess.PIPE)
    tamanho_do_quadro = la * aa * 3
    feitos, com_rosto = 0, 0
    lembrados: list[list] = []
    try:
        while True:
            dados = leitor.stdout.read(tamanho_do_quadro)
            if len(dados) < tamanho_do_quadro:
                break
            _, faces = detector.detect(np.frombuffer(dados, np.uint8).reshape(aa, la, 3))
            caixas = (f[:4] for f in (faces if faces is not None else []))
            achados = [(x + w / 2, y + h / 2, w, h) for x, y, w, h in caixas if w > 0 and h > 0]
            lembrados = seguir(lembrados, achados)
            com_rosto += bool(lembrados)
            escritor.stdin.write(desenhar(lembrados, (lk, ak), escala).tobytes())
            feitos += 1
            if feitos % 30 == 0:
                reportar(min(95, 2 + int(93 * feitos / total)), "Procurando os rostos")
    except BaseException:
        leitor.kill()
        escritor.kill()
        leitor.wait(timeout=60)
        escritor.wait(timeout=60)
        parcial.unlink(missing_ok=True)
        raise
    finally:
        for fluxo in (leitor.stdout, escritor.stdin):
            try:
                fluxo.close()
            except OSError:
                pass
        codigo_do_leitor = leitor.wait(timeout=60)
        codigo = escritor.wait(timeout=600)
    if codigo != 0 or feitos == 0 or codigo_do_leitor != 0 or feitos < 0.9 * total:
        parcial.unlink(missing_ok=True)
        raise RuntimeError(f"O vídeo da máscara dos rostos não foi gravado (leitor {codigo_do_leitor}, "
                           f"{feitos} de {total} quadros).")
    parcial.replace(destino)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {"esconder_rostos": {"status": "pronta", "erro": None, "quadros_com_rosto": com_rosto},
                 "atualizado_em": agora()},
        "$addToSet": {"arquivos": ARQUIVO_MASCARA_ROSTOS},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Rostos escondidos: {com_rosto} de {feitos} quadros.")
    reportar(100, "Rostos encontrados" if com_rosto else "Nenhum rosto encontrado")
    return {"midia_id": str(midia_id), "quadros": feitos, "com_rosto": com_rosto}
