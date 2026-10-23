# -----------------------------------------------
# Tarefa "recorte_fundo" — a máscara da pessoa em cada quadro, para recortar o fundo do vídeo
#
# MODNet (Apache-2.0, recorte de retrato sem tela verde) pelo onnxruntime na CPU. Os quadros vêm da
# cópia leve, a mesma que a prévia decodifica, e a máscara sai num vídeo cinza (mascara.mp4) com o
# mesmo tempo dela: a prévia lê os dois juntos e multiplica o alfa; o render usa o mesmo arquivo com
# o alphamerge. No Nitro, uns 65 ms por quadro com o modelo a 256 pixels no lado menor. Numa imagem parada,
# o modelo vê a imagem a 512 no lado menor (o tamanho em que foi treinado) e a máscara sai em mascara.png.
# -----------------------------------------------
import json
import logging
import os
import subprocess
from collections.abc import Callable
from fractions import Fraction

import cv2
import numpy as np
from bson import ObjectId

from core.config import FFMPEG, FFPROBE, MODELO_RECORTE
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import (
    ARQUIVO_IMAGEM,
    ARQUIVO_MASCARA,
    ARQUIVO_MASCARA_IMAGEM,
    ARQUIVO_PROXY_VIDEO,
    chave_arquivo,
    e_imagem,
)
from core.utils import storage
from core.utils.mongo import agora

LADO_DO_MODELO = 256     # lado menor da imagem que o modelo vê (múltiplo de 32)
LADO_DA_MASCARA = 360    # lado menor do vídeo da máscara
LADO_DO_MODELO_FOTO = 512        # numa imagem parada, o modelo vê mais (é um quadro só)
LADO_MAIOR_DA_MASCARA_FOTO = 2048


def marcar_recorte_com_erro(db, job: dict, mensagem: str):
    """Chamado quando o recorte falha de vez: a aba Básico mostra o erro."""
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {
            "recorte_fundo": {"status": "erro", "erro": mensagem}, "atualizado_em": agora(),
        }})


def _multiplo(valor: float, passo: int) -> int:
    return max(passo, round(valor / passo) * passo)


def tamanhos(largura: int, altura: int) -> tuple[tuple[int, int], tuple[int, int]]:
    """(tamanho que o modelo vê, tamanho do vídeo da máscara), na proporção do vídeo."""
    menor = min(largura, altura)
    modelo = (_multiplo(largura * LADO_DO_MODELO / menor, 32), _multiplo(altura * LADO_DO_MODELO / menor, 32))
    mascara = (_multiplo(largura * LADO_DA_MASCARA / menor, 2), _multiplo(altura * LADO_DA_MASCARA / menor, 2))
    return modelo, mascara


def tamanhos_da_foto(largura: int, altura: int) -> tuple[tuple[int, int], tuple[int, int]]:
    """(tamanho que o modelo vê, tamanho do mascara.png), na proporção da imagem."""
    menor = min(largura, altura)
    modelo = (_multiplo(largura * LADO_DO_MODELO_FOTO / menor, 32), _multiplo(altura * LADO_DO_MODELO_FOTO / menor, 32))
    fator = min(1.0, LADO_MAIOR_DA_MASCARA_FOTO / max(largura, altura))
    return modelo, (max(1, round(largura * fator)), max(1, round(altura * fator)))


def _recortar_foto(db, midia: dict, sessao, reportar: Callable[[int, str], None]) -> dict:
    """A máscara de uma imagem parada: um quadro só, gravado em PNG cinza."""
    from PIL import Image

    organizacao_id, midia_id = midia["organizacao_id"], midia["_id"]
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_IMAGEM))
    if not original.is_file():
        raise ErroDefinitivo("A imagem desta mídia não foi encontrada.")
    reportar(10, "Recortando o fundo")
    with Image.open(original) as aberta:
        imagem = aberta.convert("RGBA")
    # A parte transparente vira cinza médio para o modelo; o alfa do arquivo continua valendo por cima da máscara
    fundo = Image.new("RGBA", imagem.size, (128, 128, 128, 255))
    rgb = Image.alpha_composite(fundo, imagem).convert("RGB")
    (lm, am), (lk, ak) = tamanhos_da_foto(*imagem.size)
    quadro = np.asarray(rgb.resize((lm, am), Image.Resampling.BOX), dtype=np.float32)
    x = ((quadro - 127.5) / 127.5).transpose(2, 0, 1)[None]
    alfa = sessao.run(None, {sessao.get_inputs()[0].name: x})[0][0, 0]
    mascara = cv2.resize(alfa, (lk, ak), interpolation=cv2.INTER_LINEAR)
    destino = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_MASCARA_IMAGEM))
    parcial = destino.with_name("mascara.parcial.png")
    Image.fromarray(np.clip(np.round(mascara * 255), 0, 255).astype(np.uint8), "L").save(parcial, optimize=True)
    parcial.replace(destino)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {"recorte_fundo": {"status": "pronta", "erro": None}, "atualizado_em": agora()},
        "$addToSet": {"arquivos": ARQUIVO_MASCARA_IMAGEM},
    })
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Fundo da imagem recortado ({lk}x{ak}).")
    reportar(100, "Fundo recortado")
    return {"midia_id": str(midia_id), "quadros": 1}


def _sondar(caminho) -> tuple[int, int, str, float]:
    saida = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=width,height,r_frame_rate,duration:format=duration", "-of", "json", str(caminho)],
                           capture_output=True, text=True, check=True, timeout=60).stdout
    dados = json.loads(saida)
    fluxo = dados["streams"][0]
    # A duração da imagem, não a do contêiner (que segue o som): é por ela que se conta os quadros
    duracao = fluxo.get("duration") if fluxo.get("duration") not in (None, "N/A") else dados["format"]["duration"]
    return int(fluxo["width"]), int(fluxo["height"]), fluxo["r_frame_rate"], float(duracao)


def executar_recorte_fundo(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    import onnxruntime as ort

    midia_id = ObjectId(job["entrada"]["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes do recorte do fundo.")
    if not midia.get("video"):
        raise ErroDefinitivo("Esta mídia não tem imagem para recortar.")
    organizacao_id = midia["organizacao_id"]
    if not MODELO_RECORTE.is_file():
        raise ErroDefinitivo("O modelo de recorte (MODNet) não está instalado no worker.")
    opcoes = ort.SessionOptions()
    opcoes.intra_op_num_threads = os.cpu_count() or 4
    sessao = ort.InferenceSession(str(MODELO_RECORTE), opcoes, providers=["CPUExecutionProvider"])
    if e_imagem(midia):
        return _recortar_foto(db, midia, sessao, reportar)
    proxy = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_PROXY_VIDEO))
    if not proxy.is_file():
        raise ErroDefinitivo("A cópia leve desta mídia não foi encontrada.")
    largura, altura, taxa, duracao = _sondar(proxy)
    (lm, am), (lk, ak) = tamanhos(largura, altura)
    total = max(1, round(duracao * float(Fraction(taxa))))
    destino = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_MASCARA))
    parcial = destino.with_name("mascara.parcial.mp4")
    entrada_do_modelo = sessao.get_inputs()[0].name
    rotulo = f"[{organizacao_id}] [midia {midia_id}]"

    # Cada quadro da cópia leve, no tamanho do modelo; a máscara sai num vídeo no mesmo ritmo
    leitor = subprocess.Popen([FFMPEG, "-v", "error", "-i", str(proxy), "-an", "-fps_mode", "passthrough",
                               "-vf", f"scale={lm}:{am}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                              stdout=subprocess.PIPE)
    escritor = subprocess.Popen([FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{lk}x{ak}",
                                 "-framerate", taxa, "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
                                 "-pix_fmt", "yuv420p", "-color_range", "tv", "-g", "60", "-movflags", "+faststart",
                                 str(parcial)], stdin=subprocess.PIPE)
    tamanho_do_quadro = lm * am * 3
    feitos = 0
    try:
        while True:
            dados = leitor.stdout.read(tamanho_do_quadro)
            if len(dados) < tamanho_do_quadro:
                break
            quadro = np.frombuffer(dados, np.uint8).reshape(am, lm, 3).astype(np.float32)
            x = ((quadro - 127.5) / 127.5).transpose(2, 0, 1)[None]
            alfa = sessao.run(None, {entrada_do_modelo: x})[0][0, 0]
            mascara = cv2.resize(alfa, (lk, ak), interpolation=cv2.INTER_LINEAR)
            escritor.stdin.write(np.clip(np.round(mascara * 255), 0, 255).astype(np.uint8).tobytes())
            feitos += 1
            if feitos % 30 == 0:
                reportar(min(95, 2 + int(93 * feitos / total)), "Recortando o fundo")
    except BaseException:
        # Parou no meio (o job foi cancelado, o modelo falhou): os dois FFmpeg saem e a máscara pela metade também
        leitor.kill()
        escritor.kill()
        leitor.wait(timeout=60)
        escritor.wait(timeout=60)
        parcial.unlink(missing_ok=True)
        raise
    finally:
        # Fechar o stdin de um escritor que morreu lança BrokenPipeError: o código dele, conferido abaixo, já diz
        for fluxo in (leitor.stdout, escritor.stdin):
            try:
                fluxo.close()
            except OSError:
                pass
        codigo_do_leitor = leitor.wait(timeout=60)
        codigo = escritor.wait(timeout=600)
    # O laço também acaba quando o leitor morre no meio: sem conferir o código dele (e quantos quadros vieram),
    # a máscara pela metade era gravada como pronta e o fim do clipe ficava sem recorte
    if codigo != 0 or feitos == 0 or codigo_do_leitor != 0 or feitos < 0.9 * total:
        parcial.unlink(missing_ok=True)
        raise RuntimeError(f"O vídeo da máscara não foi gravado (leitor {codigo_do_leitor}, "
                           f"{feitos} de {total} quadros).")
    parcial.replace(destino)
    db.midias.update_one({"_id": midia_id}, {
        "$set": {"recorte_fundo": {"status": "pronta", "erro": None}, "atualizado_em": agora()},
        "$addToSet": {"arquivos": ARQUIVO_MASCARA},
    })
    logging.info(f"{rotulo} Fundo recortado: {feitos} quadros.")
    reportar(100, "Fundo recortado")
    return {"midia_id": str(midia_id), "quadros": feitos}
