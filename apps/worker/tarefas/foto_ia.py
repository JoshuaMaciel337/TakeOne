# -----------------------------------------------
# Tarefas "ampliar", "expandir" e "foto_3d" — fotos com IA na CPU (core/utils/foto_ia.py)
#
# Como o "apagar objeto": a API já pôs a mídia nova na biblioteca, processando; o resultado vira o original dela
# (um PNG, ou um MP4 na foto em 3D) e segue para a ingestão, como um envio. A foto de origem não muda. Sem os
# modelos (o CI) e fora do modo real, as contas simuladas de foto_ia.py testam o fluxo.
# -----------------------------------------------
import logging
import subprocess
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId
from PIL import Image

from core.config import FFMPEG, MODELO_AMPLIAR, MODELO_APAGAR, MODELO_PROFUNDIDADE, MODO_IA
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import ARQUIVO_IMAGEM, ARQUIVO_PROFUNDIDADE, PRIORIDADE_INGESTAO, chave_arquivo, pasta_da_midia
from core.utils import storage
from core.utils.ffmpeg import FILTRO_MARCAS_BT709, MARCAS_BT709
from core.utils.foto_ia import FPS_3D, ampliar, conferir_expansao, expandir, preparar_3d, profundidade, quadro_3d
from core.utils.mongo import agora
from worker.tarefas.objeto import _sessao

NOMES_DOS_MODELOS = {MODELO_AMPLIAR: "para ampliar (Real-ESRGAN)", MODELO_APAGAR: "para expandir (LaMa)",
                     MODELO_PROFUNDIDADE: "de profundidade (Depth Anything)"}


def _sessao_de(modelo: Path):
    """A sessão do modelo, ou None no modo simulado sem ele (no real, a falta é um erro)."""
    if modelo.is_file():
        return _sessao(modelo)
    if MODO_IA == "real":
        raise ErroDefinitivo(f"O modelo {NOMES_DOS_MODELOS[modelo]} não está instalado no worker. Reconstrua a imagem.")
    return None


def _midias(db, entrada: dict) -> tuple[dict, dict]:
    midia = db.midias.find_one({"_id": ObjectId(entrada["midia_id"])})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de ficar pronta.")
    origem = db.midias.find_one({"_id": ObjectId(entrada["origem_id"])})
    if origem is None:
        raise ErroDefinitivo("A foto de origem foi excluída.")
    return midia, origem


def _foto(origem: dict) -> Image.Image:
    caminho = storage.caminho_local(chave_arquivo(origem["organizacao_id"], origem["_id"], ARQUIVO_IMAGEM))
    if not caminho.is_file():
        raise ErroDefinitivo("A imagem da foto de origem não foi encontrada.")
    with Image.open(caminho) as aberta:
        return aberta.convert("RGBA")


def _original(midia: dict, nome_parcial: str) -> tuple[Path, Path]:
    """(o original da mídia nova, o arquivo parcial ao lado dele), com a pasta criada."""
    if not midia.get("original"):
        raise ErroDefinitivo("A mídia nova está sem o nome do arquivo.")
    original = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], midia["original"]))
    original.parent.mkdir(parents=True, exist_ok=True)
    return original, original.with_name(nome_parcial)


def _entregar(db, job: dict, midia: dict, original: Path, descricao: str):
    """Põe a mídia nova na ingestão, como um envio; excluída no meio do caminho, a pasta sai junto."""
    ingestao = montar_job("ingestao", midia["organizacao_id"], {"midia_id": str(midia["_id"])},
                          prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"))
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    momento = agora()
    tamanho = original.stat().st_size
    atualizado = db.midias.update_one({"_id": midia["_id"]}, {"$set": {
        "tamanho_total": tamanho, "bytes_recebidos": tamanho, "job_ingestao_id": ingestao_id, "enviado_em": momento,
        "atualizado_em": momento,
    }})
    if atualizado.matched_count == 0:
        db.jobs.delete_one({"_id": ingestao_id})
        storage.remover_pasta(pasta_da_midia(midia["organizacao_id"], midia["_id"]))
        raise ErroDefinitivo("A mídia foi excluída enquanto a foto era preparada.")
    logging.info(f"[{midia['organizacao_id']}] [midia {midia['_id']}] {descricao}; ingestão na fila.")


def _salvar_png(db, job: dict, midia: dict, imagem: Image.Image, descricao: str):
    if db.midias.count_documents({"_id": midia["_id"]}, limit=1) == 0:
        raise ErroDefinitivo("A mídia foi excluída enquanto a foto era preparada.")
    original, parcial = _original(midia, "foto.parcial.png")
    try:
        imagem.save(parcial, "PNG")
        parcial.replace(original)
    except BaseException:
        parcial.unlink(missing_ok=True)
        raise
    _entregar(db, job, midia, original, descricao)


def executar_ampliar(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia, origem = _midias(db, entrada)
    foto = _foto(origem)
    reportar(5, "Ampliando a foto")
    sessao = _sessao_de(MODELO_AMPLIAR)
    resultado = ampliar(foto, int(entrada["fator"]), sessao,
                        lambda fracao: reportar(5 + int(80 * fracao), "Ampliando a foto"))
    reportar(90, "Salvando a foto")
    _salvar_png(db, job, midia, resultado, f"Foto ampliada para {resultado.width}×{resultado.height}")
    reportar(100, "Pronto")
    return {"midia_id": str(midia["_id"]), "largura": resultado.width, "altura": resultado.height}


def executar_expandir(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia, origem = _midias(db, entrada)
    foto = _foto(origem)
    proporcao = float(entrada["proporcao"])
    problema = conferir_expansao(foto.width, foto.height, proporcao)
    if problema:
        raise ErroDefinitivo(problema)
    reportar(10, "Inventando o que falta em volta")
    resultado = expandir(foto, proporcao, _sessao_de(MODELO_APAGAR), _sessao_de(MODELO_AMPLIAR))
    reportar(90, "Salvando a foto")
    _salvar_png(db, job, midia, resultado, f"Foto expandida para {resultado.width}×{resultado.height}")
    reportar(100, "Pronto")
    return {"midia_id": str(midia["_id"]), "largura": resultado.width, "altura": resultado.height}


def executar_foto_3d(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia, origem = _midias(db, entrada)
    foto = _foto(origem)
    reportar(5, "Medindo a profundidade")
    disparidade = profundidade(foto, _sessao_de(MODELO_PROFUNDIDADE))
    imagem, disp, foco = preparar_3d(foto, disparidade)
    altura, largura = disp.shape
    total = max(2, round(float(entrada["duracao"]) * FPS_3D))
    if db.midias.count_documents({"_id": midia["_id"]}, limit=1) == 0:
        raise ErroDefinitivo("A mídia foi excluída antes de a foto em 3D ficar pronta.")
    original, parcial = _original(midia, "foto3d.parcial.mp4")
    escritor = subprocess.Popen(
        [FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{largura}x{altura}",
         "-framerate", str(FPS_3D), "-i", "-",
         "-vf", f"scale=out_color_matrix=bt709:out_range=tv,{FILTRO_MARCAS_BT709}", *MARCAS_BT709,
         "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
         "-g", str(FPS_3D * 2), "-movflags", "+faststart", "-f", "mp4", str(parcial)], stdin=subprocess.PIPE)
    try:
        for n in range(total):
            escritor.stdin.write(quadro_3d(imagem, disp, foco, entrada["movimento"], n / (total - 1)).tobytes())
            if n % 15 == 0:
                reportar(10 + int(85 * n / total), "Movendo a câmera")
        escritor.stdin.close()
        if escritor.wait(timeout=300) != 0:
            raise ErroDefinitivo("O vídeo da foto em 3D não pôde ser gravado.")
        parcial.replace(original)
    except BaseException:
        escritor.kill()
        parcial.unlink(missing_ok=True)
        raise
    _entregar(db, job, midia, original, f"Foto em 3D ({entrada['movimento']}, {total} quadros)")
    reportar(100, "Pronto")
    return {"midia_id": str(midia["_id"]), "quadros": total, "largura": largura, "altura": altura}


# A profundidade guardada tem o lado maior da cópia leve das fotos
LADO_DA_PROFUNDIDADE_GUARDADA = 1920


def executar_profundidade(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    """A profundidade da foto (Depth Anything V2 Small), guardada em cinza (255 perto, 0 longe) para o editor de
    imagem: o céu, o desfoque de profundidade e a substituição do céu."""
    midia = db.midias.find_one({"_id": ObjectId(job["entrada"]["midia_id"])})
    if midia is None:
        raise ErroDefinitivo("A foto foi excluída antes de a profundidade ser medida.")
    foto = _foto(midia)
    reportar(10, "Medindo a profundidade")
    disparidade = profundidade(foto, _sessao_de(MODELO_PROFUNDIDADE))
    imagem = Image.fromarray((disparidade * 255 + 0.5).astype("uint8"), "L")
    fator = min(1.0, LADO_DA_PROFUNDIDADE_GUARDADA / max(imagem.size))
    if fator < 1:
        imagem = imagem.resize((max(1, round(imagem.width * fator)), max(1, round(imagem.height * fator))),
                               Image.Resampling.BILINEAR)
    destino = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], ARQUIVO_PROFUNDIDADE))
    parcial = destino.with_name("profundidade.parcial.png")
    imagem.save(parcial, optimize=True)
    parcial.replace(destino)
    db.midias.update_one({"_id": midia["_id"]},
                         {"$addToSet": {"arquivos": ARQUIVO_PROFUNDIDADE}, "$set": {"atualizado_em": agora()}})
    reportar(100, "Profundidade pronta")
    return {"midia_id": str(midia["_id"]), "arquivo": ARQUIVO_PROFUNDIDADE}
