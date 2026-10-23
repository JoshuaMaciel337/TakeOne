# -----------------------------------------------
# TakeOne API — fotos com IA (worker de CPU, core/utils/foto_ia.py)
#
#   POST /api/midias/{id}/ampliar    a foto 2 ou 4 vezes maior (até 4096 px no lado maior)
#   POST /api/midias/{id}/expandir   a foto numa tela de outra proporção, com o que falta inventado em volta
#   POST /api/midias/{id}/foto-3d    um vídeo da foto com a câmera andando pela profundidade dela
#
# Cada pedido cria uma mídia nova na biblioteca (processando), como o "apagar objeto": a foto de origem não muda.
# -----------------------------------------------
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencias import obter_db, usuario_atual
from api.esquemas import AmpliarEntrada, ExpandirEntrada, Foto3dEntrada, MidiaSaida
from api.rotas.midias import para_saida
from api.rotas.objetos import _foto_pronta
from core.modelos.job import montar_job
from core.modelos.midia import STATUS_PROCESSANDO, montar_midia
from core.utils.foto_ia import LADO_MAXIMO, conferir_expansao

router = APIRouter(prefix="/api/midias", tags=["foto_ia"])


def _tamanho(midia: dict) -> tuple[int, int]:
    video = midia.get("video") or {}
    return int(video.get("largura") or 1), int(video.get("altura") or 1)


async def _pedir(db, usuario: dict, origem: dict, tipo: str, arquivo: str, tipo_mime: str, sufixo: str,
                 entrada: dict) -> MidiaSaida:
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], arquivo, 0, tipo_mime)
    nome = f"{origem['nome']} ({sufixo})"
    midia["nome"] = midia["nome_original"] = nome[:200]
    midia["status"] = STATUS_PROCESSANDO
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    job = montar_job(tipo, usuario["organizacao_id"], {"midia_id": str(midia_id), "origem_id": str(origem["_id"]),
                                                       **entrada}, criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    # O progresso aparece como o da ingestão; ao terminar, o worker troca pelo job da ingestão
    await db.midias.update_one({"_id": midia_id}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Foto com IA pedida: {tipo} em {origem['nome']}")
    return (await para_saida(db, [{**midia, "_id": midia_id, "job_ingestao_id": job_id}]))[0]


@router.post("/{midia_id}/ampliar", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def ampliar_foto(midia_id: str, dados: AmpliarEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    origem = await _foto_pronta(db, midia_id, usuario)
    if max(_tamanho(origem)) >= LADO_MAXIMO:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A foto já tem {LADO_MAXIMO} px no lado maior, o máximo.")
    return await _pedir(db, usuario, origem, "ampliar", "ampliada.png", "image/png", f"ampliada {dados.fator}×",
                        {"fator": dados.fator})


@router.post("/{midia_id}/expandir", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def expandir_foto(midia_id: str, dados: ExpandirEntrada, usuario=Depends(usuario_atual),
                        db=Depends(obter_db)):
    origem = await _foto_pronta(db, midia_id, usuario)
    if (origem.get("video") or {}).get("transparente"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Expandir vale em fotos sem transparência.")
    largura, altura = dados.proporcao.split(":")
    proporcao = int(largura) / int(altura)
    problema = conferir_expansao(*_tamanho(origem), proporcao)
    if problema:
        raise HTTPException(status.HTTP_409_CONFLICT, problema)
    return await _pedir(db, usuario, origem, "expandir", "expandida.png", "image/png",
                        f"expandida {dados.proporcao}", {"proporcao": proporcao})


@router.post("/{midia_id}/foto-3d", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def foto_em_3d(midia_id: str, dados: Foto3dEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    origem = await _foto_pronta(db, midia_id, usuario)
    return await _pedir(db, usuario, origem, "foto_3d", "foto3d.mp4", "video/mp4", "foto em 3D",
                        {"movimento": dados.movimento, "duracao": dados.duracao})
