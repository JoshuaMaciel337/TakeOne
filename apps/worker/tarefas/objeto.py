# -----------------------------------------------
# Tarefas "selecao" e "objeto" — selecionar um objeto da foto com um clique e apagar ou recortar o que foi
# selecionado (core/utils/objeto.py)
#
# A seleção guarda a máscara na pasta da foto (selecao_<chave>.png, pela chave dos pontos) e o embedding do
# MobileSAM (sam.npy), para os cliques seguintes não refazerem o codificador. A edição do objeto cria uma mídia
# nova, como o texto em fala: a API já a pôs na biblioteca, processando; o resultado vira o original dela e segue
# para a ingestão. Sem os modelos (o CI) e fora do modo real, as contas simuladas testam o fluxo.
# -----------------------------------------------
import logging
import os
from collections.abc import Callable

import numpy as np
from bson import ObjectId
from PIL import Image

from core.config import MODELO_APAGAR, MODELO_SELECAO, MODO_IA
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import (
    ARQUIVO_EMBEDDING_SAM,
    ARQUIVO_IMAGEM,
    PRIORIDADE_INGESTAO,
    arquivo_da_selecao,
    chave_arquivo,
    pasta_da_midia,
)
from core.utils import storage
from core.utils.mongo import agora
from core.utils.objeto import apagar, imagem_para_o_sam, mascara_dos_pontos, mascara_simulada, recortar

CODIFICADOR = "mobile_sam_image_encoder.onnx"
DECODIFICADOR = "sam_mask_decoder_single.onnx"
LADO_MAIOR_DA_MASCARA = 2048
_sessoes: dict[str, object] = {}


def _sessao(caminho) -> object:
    """A sessão do onnxruntime de um modelo, aberta uma vez por processo."""
    import onnxruntime as ort

    chave = str(caminho)
    if chave not in _sessoes:
        opcoes = ort.SessionOptions()
        opcoes.intra_op_num_threads = os.cpu_count() or 4
        _sessoes[chave] = ort.InferenceSession(chave, opcoes, providers=["CPUExecutionProvider"])
    return _sessoes[chave]


def _modelos_da_selecao() -> bool:
    if (MODELO_SELECAO / CODIFICADOR).is_file() and (MODELO_SELECAO / DECODIFICADOR).is_file():
        return True
    if MODO_IA == "real":
        raise ErroDefinitivo("O modelo de seleção (MobileSAM) não está instalado no worker. Reconstrua a imagem.")
    return False


def _foto(midia: dict) -> Image.Image:
    caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], ARQUIVO_IMAGEM))
    if not caminho.is_file():
        raise ErroDefinitivo("A imagem desta mídia não foi encontrada.")
    with Image.open(caminho) as aberta:
        return aberta.convert("RGBA")


def _tamanho_da_mascara(largura: int, altura: int) -> tuple[int, int]:
    fator = min(1.0, LADO_MAIOR_DA_MASCARA / max(largura, altura))
    return max(1, round(largura * fator)), max(1, round(altura * fator))


def executar_selecao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia = db.midias.find_one({"_id": ObjectId(entrada["midia_id"])})
    if midia is None:
        raise ErroDefinitivo("A foto foi excluída antes da seleção.")
    pontos = entrada["pontos"]
    nome = arquivo_da_selecao(pontos)
    foto = _foto(midia)
    reportar(10, "Achando o objeto")
    if _modelos_da_selecao():
        guardado = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], ARQUIVO_EMBEDDING_SAM))
        if guardado.is_file():
            embedding = np.load(guardado)
        else:
            entrada_sam, _ = imagem_para_o_sam(foto)
            embedding = _sessao(MODELO_SELECAO / CODIFICADOR).run(None, {"input_image": entrada_sam})[0]
            np.save(guardado, embedding)
        reportar(70, "Desenhando a seleção")
        mascara = mascara_dos_pontos(_sessao(MODELO_SELECAO / DECODIFICADOR), embedding, pontos, foto.width,
                                     foto.height)
    else:
        mascara = mascara_simulada(pontos, foto.width, foto.height)
    imagem = Image.fromarray((mascara * 255).astype(np.uint8), "L")
    imagem = imagem.resize(_tamanho_da_mascara(foto.width, foto.height), Image.Resampling.BILINEAR)
    destino = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], nome))
    parcial = destino.with_name(f"{destino.stem}.parcial.png")
    imagem.save(parcial, optimize=True)
    parcial.replace(destino)
    db.midias.update_one({"_id": midia["_id"]}, {"$addToSet": {"arquivos": nome}, "$set": {"atualizado_em": agora()}})
    reportar(100, "Seleção pronta")
    return {"midia_id": str(midia["_id"]), "arquivo": nome, "cobertura": round(float(mascara.mean()), 4)}


def _mascara_do_pedido(db, entrada: dict, largura: int, altura: int) -> np.ndarray:
    """A união da seleção (na pasta da foto) com o pincel (na pasta da mídia nova), no tamanho da foto."""
    mascara = np.zeros((altura, largura), dtype=bool)
    origem = db.midias.find_one({"_id": ObjectId(entrada["origem_id"])})
    partes = []
    if entrada.get("selecao") and origem:
        partes.append(storage.caminho_local(chave_arquivo(origem["organizacao_id"], origem["_id"], entrada["selecao"])))
    if entrada.get("pincel"):
        partes.append(storage.caminho_local(chave_arquivo(entrada["organizacao_id"], ObjectId(entrada["midia_id"]),
                                                          entrada["pincel"])))
    for caminho in partes:
        if not caminho.is_file():
            raise ErroDefinitivo("A seleção do objeto não foi encontrada. Selecione de novo.")
        with Image.open(caminho) as aberta:
            parte = aberta.convert("L").resize((largura, altura), Image.Resampling.BILINEAR)
        mascara |= np.asarray(parte) > 127
    return mascara


def executar_objeto(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de ficar pronta.")
    origem = db.midias.find_one({"_id": ObjectId(entrada["origem_id"])})
    if origem is None:
        raise ErroDefinitivo("A foto de origem foi excluída.")
    foto = _foto(origem)
    mascara = _mascara_do_pedido(db, {**entrada, "organizacao_id": midia["organizacao_id"]}, foto.width, foto.height)
    if not mascara.any():
        raise ErroDefinitivo("A seleção está vazia: marque o objeto antes.")
    if entrada["acao"] == "apagar":
        reportar(20, "Apagando o objeto")
        sessao = None
        if MODELO_APAGAR.is_file():
            sessao = _sessao(MODELO_APAGAR)
        elif MODO_IA == "real":
            raise ErroDefinitivo("O modelo para apagar objetos (LaMa) não está instalado no worker. "
                                 "Reconstrua a imagem.")
        resultado = apagar(foto, mascara, sessao)
        # A transparência da foto (um PNG com recorte) continua a mesma
        if foto.getchannel("A").getextrema()[0] < 255:
            resultado = resultado.convert("RGBA")
            resultado.putalpha(foto.getchannel("A"))
    else:
        reportar(20, "Recortando o objeto")
        resultado = recortar(foto, mascara)
    if db.midias.count_documents({"_id": midia_id}, limit=1) == 0:
        raise ErroDefinitivo("A mídia foi excluída enquanto o objeto era editado.")
    original = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia_id, midia["original"]))
    original.parent.mkdir(parents=True, exist_ok=True)
    parcial = original.with_name("objeto.parcial.png")
    resultado.save(parcial, "PNG")
    parcial.replace(original)
    # Daqui em diante é uma imagem enviada como outra qualquer
    ingestao = montar_job("ingestao", midia["organizacao_id"], {"midia_id": str(midia_id)},
                          prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"))
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    momento = agora()
    tamanho = original.stat().st_size
    atualizado = db.midias.update_one({"_id": midia_id}, {"$set": {
        "tamanho_total": tamanho, "bytes_recebidos": tamanho, "job_ingestao_id": ingestao_id, "enviado_em": momento,
        "atualizado_em": momento,
    }})
    if atualizado.matched_count == 0:
        db.jobs.delete_one({"_id": ingestao_id})
        storage.remover_pasta(pasta_da_midia(midia["organizacao_id"], midia_id))
        raise ErroDefinitivo("A mídia foi excluída enquanto o objeto era editado.")
    logging.info(f"[{midia['organizacao_id']}] [midia {midia_id}] Objeto: {entrada['acao']} ({resultado.size}).")
    reportar(100, "Pronto")
    return {"midia_id": str(midia_id), "largura": resultado.width, "altura": resultado.height}
