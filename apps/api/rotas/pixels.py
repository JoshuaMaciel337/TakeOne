# -----------------------------------------------
# TakeOne API — camadas de pixels do editor de imagem (ADR 0003, decisão 2)
#
#   POST /api/camadas-pixels                      cria a camada (uma mídia fora da biblioteca, vazia: versão 0)
#   POST /api/midias/{id}/pixels?envio=&parte=&total=
#                                                 uma parte (até 8 MB) do PNG de uma versão nova; na última, o PNG
#                                                 é conferido, vira v<n>.png e a resposta traz o número da versão
#
# A edição é no navegador: ao soltar o traço, o canvas da camada vira PNG e sobe em partes (o proxy do Next corta o
# corpo em 10 MB). Cada versão fica no servidor, para o desfazer voltar a anterior trocando só o número no clipe.
# -----------------------------------------------
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import CamadaPixelsEntrada, MidiaSaida, VersaoDePixelsSaida
from api.rotas.midias import buscar_midia, para_saida
from core.modelos.midia import STATUS_PRONTA, arquivo_da_versao, chave_arquivo, montar_midia
from core.utils import storage
from core.utils.mongo import agora
from core.utils.pixels import BYTES_DA_PARTE, BYTES_MAXIMOS, ErroPixels, conferir_png

router = APIRouter(tags=["pixels"])

_ENVIO = re.compile(r"[0-9a-f]{16}")


@router.post("/api/camadas-pixels", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def criar_camada(dados: CamadaPixelsEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Uma camada vazia (transparente) do tamanho pedido. Não aparece na biblioteca, como as formas."""
    momento = agora()
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "camada.png", 0, "image/png", momento)
    nome = dados.nome or "Camada"
    midia.update({
        "nome": nome, "nome_original": nome, "status": STATUS_PRONTA, "imagem": True, "original": "v0.png",
        "video": {"codec": "imagem", "largura": dados.largura, "altura": dados.altura, "fps": None, "rotacao": 0,
                  "matriz": None, "transparente": True},
        "camada_pixels": {"largura": dados.largura, "altura": dados.altura, "ultima": 0},
        "processado_em": momento,
    })
    midia["_id"] = (await db.midias.insert_one(midia)).inserted_id
    return (await para_saida(db, [midia]))[0]


@router.post("/api/midias/{midia_id}/pixels", response_model=VersaoDePixelsSaida)
async def enviar_versao(midia_id: str, request: Request, envio: str = Query(), parte: int = Query(ge=0),
                        total: int = Query(ge=1, le=BYTES_MAXIMOS // BYTES_DA_PARTE + 1),
                        usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """As partes vão em ordem; cada uma, menos a última, tem exatamente 8 MB. Repetir uma parte já recebida
    (a rede caiu antes da resposta) não estraga o envio."""
    if not _ENVIO.fullmatch(envio) or parte >= total:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Envio inválido.")
    midia = await buscar_midia(db, midia_id, usuario)
    camada = midia.get("camada_pixels")
    if not camada:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Esta mídia não é uma camada de pixels.")
    corpo = await request.body()
    ultima_parte = parte == total - 1
    if len(corpo) > BYTES_DA_PARTE or (not ultima_parte and len(corpo) != BYTES_DA_PARTE) or not corpo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Parte com o tamanho errado.")
    temporario = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], f"envio_{envio}.png"))

    def gravar() -> None:
        temporario.parent.mkdir(parents=True, exist_ok=True)
        recebido = temporario.stat().st_size if temporario.exists() else 0
        inicio = parte * BYTES_DA_PARTE
        if recebido < inicio:
            raise ErroPixels("Faltam partes antes desta. Envie de novo desde o começo.")
        with open(temporario, "r+b" if temporario.exists() else "wb") as arquivo:
            arquivo.seek(inicio)
            arquivo.write(corpo)
            arquivo.truncate()

    try:
        await run_in_threadpool(gravar)
        if not ultima_parte:
            return VersaoDePixelsSaida(versao=None)
        await run_in_threadpool(conferir_png, temporario, camada["largura"], camada["altura"])
    except ErroPixels as erro:
        if ultima_parte:
            await run_in_threadpool(temporario.unlink, True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(erro)) from erro
    # O número da versão é do servidor: duas abas pintando a mesma camada não brigam pelo nome do arquivo
    atualizada = await db.midias.find_one_and_update({"_id": midia["_id"]}, {"$inc": {"camada_pixels.ultima": 1}},
                                                     return_document=True)
    versao = atualizada["camada_pixels"]["ultima"]
    nome = arquivo_da_versao(versao)
    destino = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], nome))
    await run_in_threadpool(temporario.replace, destino)
    tamanho = destino.stat().st_size
    await db.midias.update_one({"_id": midia["_id"]}, {"$addToSet": {"arquivos": nome},
                                                       "$inc": {"tamanho_total": tamanho},
                                                       "$set": {"atualizado_em": agora()}})
    logging.info(f"[{midia['organizacao_id']}] Camada de pixels {midia['_id']}: versão {versao} ({tamanho} bytes)")
    return VersaoDePixelsSaida(versao=versao)
