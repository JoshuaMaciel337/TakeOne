# -----------------------------------------------
# TakeOne API — levar a edição para outros editores
#
# A linha do tempo em XML de intercâmbio (core/utils/intercambio.py), sozinha ou num ZIP com as mídias
# originais na pasta midias/ (o XML aponta para lá; no outro editor, a pessoa liga as mídias apontando
# para essa pasta). O ZIP sai em pedaços enquanto é montado, sem compressão (vídeo já vem comprimido) e
# sem arquivo temporário: montado inteiro antes, um projeto grande passava dos 30 s do proxy do site antes
# do primeiro byte, e cada tentativa deixava mais uma cópia de todas as mídias no disco.
# -----------------------------------------------
import io
import re
import zipfile
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import quote

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse

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
    if projeto.get("tipo") == "imagem":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Só projetos de vídeo vão para outro editor.")
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


class _Saida(io.RawIOBase):
    """Onde o ZipFile escreve: guarda os bytes até a resposta levá-los. Sem seek, o ZipFile grava cada
    tamanho depois do arquivo (descritor de dados), que é o que deixa mandar o ZIP enquanto ele é montado."""

    def __init__(self):
        self._pedacos: list[bytes] = []

    def writable(self) -> bool:
        return True

    def write(self, dados) -> int:
        self._pedacos.append(bytes(dados))
        return len(dados)

    def tirar(self) -> Iterator[bytes]:
        pedacos, self._pedacos = self._pedacos, []
        yield from pedacos


BLOCO_DO_ZIP = 1 << 20


def _zip_em_pedacos(projeto: dict, midias: dict, caminhos: dict[str, Path]) -> Iterator[bytes]:
    nome = nome_de_arquivo(projeto.get("nome") or "Projeto")
    saida = _Saida()
    with zipfile.ZipFile(saida, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as pacote:
        pacote.writestr(f"{nome}.xml", montar_xmeml(projeto, midias))
        yield from saida.tirar()
        for chave, midia in midias.items():
            if not caminhos[chave].is_file():
                continue
            arquivo = pacote.open(f"midias/{midia['arquivo']}", "w", force_zip64=True)
            with open(caminhos[chave], "rb") as origem, arquivo as destino:
                while bloco := origem.read(BLOCO_DO_ZIP):
                    destino.write(bloco)
                    yield from saida.tirar()
            yield from saida.tirar()
    yield from saida.tirar()


@router.get("/{projeto_id}/intercambio.zip")
async def baixar_zip(projeto_id: str, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """A linha do tempo e as mídias originais juntas, num ZIP sem compressão."""
    projeto, midias, caminhos = await _preparar(db, projeto_id, usuario)
    if not midias:
        raise HTTPException(status.HTTP_409_CONFLICT, "O projeto não tem mídias para levar.")
    # Iterador comum: o Starlette lê cada pedaço numa thread, sem prender o laço de eventos
    disposicao = _disposicao(projeto.get("nome") or "Projeto", ".zip")
    return StreamingResponse(_zip_em_pedacos(projeto, midias, caminhos), media_type="application/zip",
                             headers={"Content-Disposition": disposicao})
