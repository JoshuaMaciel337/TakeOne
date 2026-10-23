# -----------------------------------------------
# TakeOne API — objetos de uma foto: selecionar com um clique e apagar ou recortar o que foi selecionado
#
# A seleção é rápida e pela chave dos pontos: os mesmos pontos devolvem a mesma máscara, sem outro job. A edição
# cria uma mídia nova na biblioteca (processando), como o texto em fala; o pincel desenhado no editor vem em PNG
# (base64) e fica na pasta dela, para o worker.
# -----------------------------------------------
import base64
import binascii
import io
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import MidiaSaida, ObjetoEntrada, SelecaoEntrada, SelecaoSaida
from api.rotas.midias import buscar_midia, para_saida
from core.modelos.job import montar_job
from core.modelos.midia import (
    PRIORIDADE_INGESTAO,
    STATUS_PROCESSANDO,
    STATUS_PRONTA,
    arquivo_da_selecao,
    chave_arquivo,
    e_imagem,
    montar_midia,
)
from core.utils import storage

router = APIRouter(prefix="/api/midias", tags=["objetos"])

ARQUIVO_DO_PINCEL = "pincel.png"
NOMES = {"apagar": "sem o objeto", "recortar": "objeto"}


async def _foto_pronta(db, midia_id: str, usuario: dict) -> dict:
    midia = await buscar_midia(db, midia_id, usuario)
    if midia["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "A foto ainda está sendo preparada.")
    if not e_imagem(midia) or (midia.get("elemento") or midia.get("animacao")):
        raise HTTPException(status.HTTP_409_CONFLICT, "Selecionar e apagar objetos vale em fotos.")
    return midia


@router.post("/{midia_id}/selecao", response_model=SelecaoSaida)
async def selecionar(midia_id: str, dados: SelecaoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A máscara do objeto nos pontos (MobileSAM no worker de CPU). Os mesmos pontos devolvem a mesma máscara."""
    midia = await _foto_pronta(db, midia_id, usuario)
    pontos = [[p.x, p.y, p.incluir] for p in dados.pontos]
    if not any(incluir for _, _, incluir in pontos):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Marque pelo menos um ponto no objeto.")
    arquivo = arquivo_da_selecao(pontos)
    if arquivo in midia.get("arquivos", []):
        return SelecaoSaida(arquivo=arquivo, job_id=None)
    # Na frente da fila: a pessoa está esperando com o dedo na tela
    job = montar_job("selecao", usuario["organizacao_id"], {"midia_id": str(midia["_id"]), "pontos": pontos},
                     prioridade=PRIORIDADE_INGESTAO + 1, criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    return SelecaoSaida(arquivo=arquivo, job_id=str(job_id))


def _ler_pincel(texto: str) -> Image.Image:
    try:
        dados = base64.b64decode(texto.split(",", 1)[-1], validate=True)
        with Image.open(io.BytesIO(dados)) as aberta:
            if aberta.format != "PNG" or max(aberta.size) > 8192:
                raise ValueError
            return aberta.convert("L")
    except (binascii.Error, UnidentifiedImageError, ValueError, OSError) as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "O desenho do pincel não é um PNG válido.") from erro


@router.post("/{midia_id}/objeto", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def editar_objeto(midia_id: str, dados: ObjetoEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """
    Apaga (LaMa) ou recorta, com o fundo transparente, o que a seleção e o pincel marcam. O resultado é uma
    imagem nova na biblioteca; a foto de origem não muda.
    """
    origem = await _foto_pronta(db, midia_id, usuario)
    if dados.selecao and dados.selecao not in origem.get("arquivos", []):
        raise HTTPException(status.HTTP_409_CONFLICT, "A seleção ainda não ficou pronta. Espere ela aparecer.")
    pincel = await run_in_threadpool(_ler_pincel, dados.pincel) if dados.pincel else None
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "objeto.png", 0, "image/png")
    nome = f"{origem['nome']} ({NOMES[dados.acao]})"
    midia["nome"] = midia["nome_original"] = nome[:200]
    midia["status"] = STATUS_PROCESSANDO
    midia_id_novo = (await db.midias.insert_one(midia)).inserted_id
    if pincel is not None:
        caminho = storage.caminho_local(chave_arquivo(usuario["organizacao_id"], midia_id_novo, ARQUIVO_DO_PINCEL))
        caminho.parent.mkdir(parents=True, exist_ok=True)
        await run_in_threadpool(pincel.save, caminho, "PNG")
    entrada = {"midia_id": str(midia_id_novo), "origem_id": str(origem["_id"]), "acao": dados.acao,
               "selecao": dados.selecao, "pincel": ARQUIVO_DO_PINCEL if pincel is not None else None}
    job = montar_job("objeto", usuario["organizacao_id"], entrada, criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    # O progresso aparece como o da ingestão; ao terminar, o worker troca pelo job da ingestão
    await db.midias.update_one({"_id": midia_id_novo}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Objeto pedido: {dados.acao} em {origem['nome']}")
    return (await para_saida(db, [{**midia, "_id": midia_id_novo, "job_ingestao_id": job_id}]))[0]
