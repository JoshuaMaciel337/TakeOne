# -----------------------------------------------
# TakeOne API — congelar o quadro de um vídeo
#
# O quadro do instante vira uma foto da biblioteca, como o objeto apagado: a mídia nasce processando e o
# worker de CPU tira o quadro do mesmo arquivo que o render lê (o original, a imagem sem ruído ou a estável)
# pela regra do render (o último quadro que chegou até o instante), em BT.709, e põe a ingestão na fila.
# -----------------------------------------------
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import MidiaSaida, QuadroEntrada
from api.rotas.midias import buscar_midia, para_saida
from core.modelos.job import montar_job
from core.modelos.midia import (
    ARQUIVO_IMAGEM_LIMPA,
    PRIORIDADE_INGESTAO,
    STATUS_PROCESSANDO,
    STATUS_PRONTA,
    arquivos_da_estabilizacao,
    e_imagem,
    montar_midia,
)

router = APIRouter(prefix="/api/midias", tags=["quadros"])


def arquivo_do_quadro(midia: dict, imagem_limpa: bool, estabilizar: bool) -> str:
    """O arquivo de onde o quadro sai: o mesmo que o render lê para o clipe."""
    if estabilizar:
        return arquivos_da_estabilizacao(imagem_limpa)[0]
    if imagem_limpa:
        return ARQUIVO_IMAGEM_LIMPA
    return midia["original"]


@router.post("/{midia_id}/quadro", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def congelar_quadro(midia_id: str, dados: QuadroEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """O quadro do vídeo no instante dado (segundos da mídia) como uma foto nova na biblioteca."""
    origem = await buscar_midia(db, midia_id, usuario)
    if origem["status"] != STATUS_PRONTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "O vídeo ainda está sendo preparado.")
    if e_imagem(origem) or not origem.get("video"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Congelar o quadro vale em vídeos.")
    arquivo = arquivo_do_quadro(origem, dados.imagem_limpa, dados.estabilizar)
    if arquivo != origem["original"] and arquivo not in origem.get("arquivos", []):
        raise HTTPException(status.HTTP_409_CONFLICT, "A versão do vídeo que o clipe usa ainda está sendo preparada.")
    segundos = min(dados.segundos, max(float(origem.get("duracao") or 0), 0))
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "quadro.png", 0, "image/png")
    minutos, resto = divmod(segundos, 60)
    nome = f"{origem['nome']} (quadro {int(minutos)}:{resto:05.2f})"
    midia["nome"] = midia["nome_original"] = nome[:200]
    midia["status"] = STATUS_PROCESSANDO
    midia_id_novo = (await db.midias.insert_one(midia)).inserted_id
    entrada = {"midia_id": str(midia_id_novo), "origem_id": str(origem["_id"]), "arquivo": arquivo,
               "segundos": segundos}
    # Na frente da fila: a pessoa está esperando o quadro entrar na linha do tempo
    job = montar_job("quadro", usuario["organizacao_id"], entrada, prioridade=PRIORIDADE_INGESTAO + 1,
                     criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    await db.midias.update_one({"_id": midia_id_novo}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Quadro pedido: {origem['nome']} em {segundos:.3f}s")
    return (await para_saida(db, [{**midia, "_id": midia_id_novo, "job_ingestao_id": job_id}]))[0]
