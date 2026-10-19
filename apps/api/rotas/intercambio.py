# -----------------------------------------------
# TakeOne API — levar a edição para outros editores
#
# A linha do tempo em XML de intercâmbio (core/utils/intercambio.py), sozinha ou num ZIP com as mídias
# originais na pasta midias/ (o XML aponta para lá; no outro editor, a pessoa liga as mídias apontando
# para essa pasta). O ZIP é montado num arquivo temporário, sem compressão (vídeo já vem comprimido), e
# apagado depois do download.
# -----------------------------------------------
import re
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import quote

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.rotas.projetos import buscar_projeto
from core.modelos.midia import chave_arquivo, e_imagem
from core.modelos.projeto import midias_usadas
from core.utils import storage
from core.utils.intercambio import montar_xmeml

router = APIRouter(prefix="/api/projetos", tags=["intercambio"])

_PROIBIDOS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def nome_de_arquivo(nome: str) -> str:
    """Um nome que serve em qualquer sistema: sem barras, dois-pontos e afins, e nunca vazio."""
    return _PROIBIDOS.sub("", nome).strip().strip(".")[:80] or "midia"


async def _preparar(db, projeto_id: str, usuario: dict) -> tuple[dict, dict[str, dict], dict[str, Path]]:
    """O projeto, as mídias dele (com o nome do arquivo na pasta midias/) e onde cada original está."""
    projeto = await buscar_projeto(db, projeto_id, usuario)
    ids = [ObjectId(i) for i in midias_usadas(projeto["faixas"]) if ObjectId.is_valid(i)]
    campos = {"nome": 1, "original": 1, "duracao": 1, "video": 1, "audio": 1, "imagem": 1, "extensao": 1}
    cursor = db.midias.find({"_id": {"$in": ids}, "organizacao_id": usuario["organizacao_id"]}, campos)
    midias, caminhos, usados = {}, {}, set()
    async for midia in cursor:
        base = nome_de_arquivo(midia["nome"])
        extensao = Path(midia["original"]).suffix.lower()
        arquivo, n = f"{base}{extensao}", 2
        while arquivo.lower() in usados:
            arquivo, n = f"{base} ({n}){extensao}", n + 1
        usados.add(arquivo.lower())
        chave = str(midia["_id"])
        midias[chave] = {"nome": midia["nome"], "arquivo": arquivo, "duracao": midia.get("duracao"),
                         "video": midia.get("video"), "audio": bool(midia.get("audio")), "imagem": e_imagem(midia)}
        original = chave_arquivo(usuario["organizacao_id"], midia["_id"], midia["original"])
        caminhos[chave] = storage.caminho_local(original)
    return projeto, midias, caminhos


def _disposicao(nome: str, extensao: str) -> str:
    seguro = nome_de_arquivo(nome)
    ascii_ = seguro.encode("ascii", "ignore").decode() or "projeto"
    return f'attachment; filename="{ascii_}{extensao}"; filename*=UTF-8\'\'{quote(seguro + extensao)}'


@router.get("/{projeto_id}/intercambio.xml")
async def baixar_xml(projeto_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Só a linha do tempo: para quem tem as mídias originais no computador."""
    projeto, midias, _ = await _preparar(db, projeto_id, usuario)
    xml = montar_xmeml(projeto, midias)
    return Response(xml, media_type="application/xml",
                    headers={"Content-Disposition": _disposicao(projeto.get("nome") or "Projeto", ".xml")})


def _montar_zip(projeto: dict, midias: dict, caminhos: dict[str, Path]) -> Path:
    destino = Path(tempfile.mkstemp(prefix="takeone_intercambio_", suffix=".zip")[1])
    nome = nome_de_arquivo(projeto.get("nome") or "Projeto")
    with zipfile.ZipFile(destino, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as pacote:
        pacote.writestr(f"{nome}.xml", montar_xmeml(projeto, midias))
        for chave, midia in midias.items():
            if caminhos[chave].is_file():
                pacote.write(caminhos[chave], f"midias/{midia['arquivo']}")
    return destino


@router.get("/{projeto_id}/intercambio.zip")
async def baixar_zip(projeto_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A linha do tempo e as mídias originais juntas, num ZIP sem compressão."""
    projeto, midias, caminhos = await _preparar(db, projeto_id, usuario)
    if not midias:
        raise HTTPException(status.HTTP_409_CONFLICT, "O projeto não tem mídias para levar.")
    destino = await run_in_threadpool(_montar_zip, projeto, midias, caminhos)
    return FileResponse(destino, media_type="application/zip",
                        headers={"Content-Disposition": _disposicao(projeto.get("nome") or "Projeto", ".zip")},
                        background=BackgroundTask(destino.unlink, missing_ok=True))
