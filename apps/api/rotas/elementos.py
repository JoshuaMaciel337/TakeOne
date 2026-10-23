# -----------------------------------------------
# TakeOne API — elementos: formas desenhadas na hora
#
# Cada forma (retângulo, elipse, estrela, seta, balão...) vira uma imagem transparente da biblioteca,
# desenhada pelo core/utils/forma.py e preparada como qualquer imagem enviada. A mídia guarda o pedido
# (`elemento`), para o editor mudar a cor ou o contorno pedindo outra. O mesmo pedido no mesmo espaço
# devolve a mídia que já existe, para a biblioteca não encher de cópias. A prévia dos modelos de imagem pede só
# o desenho (GET /formas/imagem), sem criar mídia: a biblioteca mostra o modelo sem mexer no espaço de ninguém.
# -----------------------------------------------
import hashlib
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import FormaEntrada, MidiaSaida
from api.rotas.midias import para_saida
from core.modelos.midia import STATUS_PRONTA, campos_da_imagem, chave_arquivo, montar_midia, pasta_da_midia
from core.utils import storage
from core.utils.forma import desenhar_forma, gravar_forma
from core.utils.imagem import preparar_imagem
from core.utils.mongo import agora
from core.utils.texto import para_png

router = APIRouter(prefix="/api/elementos", tags=["elementos"])

NOMES = {"retangulo": "Retângulo", "arredondado": "Retângulo arredondado", "elipse": "Elipse",
         "triangulo": "Triângulo", "estrela": "Estrela", "seta": "Seta", "linha": "Linha", "balao": "Balão de fala",
         "coracao": "Coração"}


def _desenhar(forma: dict, original) -> dict:
    """Desenha a forma como o original da mídia e prepara as cópias, como numa imagem enviada."""
    pasta = original.parent
    pasta.mkdir(parents=True, exist_ok=True)
    gravar_forma(forma, original)
    return {**preparar_imagem(original, pasta), "tamanho": original.stat().st_size}


@router.post("/formas", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def criar_forma(dados: FormaEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    forma = dados.model_dump()
    chave = hashlib.sha1(json.dumps(forma, sort_keys=True).encode()).hexdigest()[:16]
    existente = await db.midias.find_one({"organizacao_id": usuario["organizacao_id"], "elemento.chave": chave,
                                          "status": STATUS_PRONTA})
    if existente:
        return (await para_saida(db, [existente]))[0]
    nome = NOMES[forma["tipo"]]
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "forma.png", 0, "image/png")
    midia.update({"nome": nome, "nome_original": nome, "elemento": {**forma, "chave": chave}})
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    original = storage.caminho_local(chave_arquivo(usuario["organizacao_id"], midia_id, midia["original"]))
    try:
        info = await run_in_threadpool(_desenhar, forma, original)
    except Exception:
        await db.midias.delete_one({"_id": midia_id})
        await run_in_threadpool(storage.remover_pasta, pasta_da_midia(usuario["organizacao_id"], midia_id))
        raise
    momento = agora()
    campos = {**campos_da_imagem(info, []), "tamanho_total": info["tamanho"], "bytes_recebidos": info["tamanho"],
              "processado_em": momento, "atualizado_em": momento}
    await db.midias.update_one({"_id": midia_id}, {"$set": campos})
    logging.info(f"[{usuario['organizacao_id']}] Forma criada: {nome}")
    return (await para_saida(db, [{**midia, **campos, "_id": midia_id}]))[0]


@router.get("/formas/imagem")
async def imagem_da_forma(tipo: str, cor: str | None = None, contorno_cor: str = "#000000", contorno: float = 0.0,
                          proporcao: float | None = Query(default=None), _usuario=Depends(usuario_atual)):
    """O PNG da forma, sem criar mídia (a prévia dos modelos de imagem). Os mesmos limites do POST."""
    try:
        forma = FormaEntrada(tipo=tipo, cor=cor, contorno_cor=contorno_cor, contorno=contorno,
                             proporcao=proporcao).model_dump()
    except ValidationError as erro:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Forma inválida.") from erro
    png = await run_in_threadpool(lambda: para_png(desenhar_forma(forma)))
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})
