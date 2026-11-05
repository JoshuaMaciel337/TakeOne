# -----------------------------------------------
# Tarefa "exportar_album" — as fotos escolhidas do álbum num ZIP (onda 16.10, docs/decisoes/0006-album-de-fotos.md)
#
# Cada foto sai da original, na resolução dela (as fotos comuns pelo arquivo enviado, giradas pelo EXIF; o RAW e o
# HEIC pela imagem que a ingestão já tirou deles), com a edição inteira (apps/worker/tarefas/editar_album.py,
# foto_editada), no tamanho e no formato pedidos, com a marca d'água e, se pedido, o XMP ao lado (a nota, a cor e os
# ajustes). "Original" põe o arquivo como chegou, sem mexer, com o XMP. O ZIP fica no armazenamento e a API o serve.
# -----------------------------------------------
import io
import logging
import zipfile
from collections.abc import Callable
from pathlib import Path

import numpy as np
from bson import ObjectId
from PIL import Image, ImageDraw, ImageFont, ImageOps

import core
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_IMAGEM, chave_arquivo
from core.modelos.saida_do_album import (
    lado_para_o_limite,
    nome_do_arquivo,
    posicao_da_marca,
    qualidade_para_o_tamanho,
    sem_repetir,
    subpasta,
    xmp_da_foto,
)
from core.utils import storage
from core.utils.fotos_no_lugar import CaminhoInvalido, caminho_do_original
from core.utils.mongo import agora
from worker.tarefas.editar_album import foto_editada, luts_das_edicoes

LEGIVEIS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}
FONTE = Path(core.__file__).parent / "fontes" / "Inter[opsz,wght].ttf"


def chave_do_zip(organizacao_id, album_id, job_id) -> str:
    return f"org_{organizacao_id}/albuns/{album_id}/saidas/{job_id}.zip"


def _original(midia: dict) -> tuple[Image.Image | None, bytes | None, str]:
    """A foto em resolução cheia (girada pelo EXIF), os bytes do arquivo como chegou e a extensão dele."""
    try:
        caminho = caminho_do_original(midia)
    except CaminhoInvalido:
        caminho = None
    bruto = caminho.read_bytes() if caminho and caminho.is_file() else None
    extensao = (caminho.suffix.lower() if caminho else "") or ".jpg"
    imagem = None
    if bruto and extensao in LEGIVEIS:
        with Image.open(io.BytesIO(bruto)) as aberta:
            imagem = ImageOps.exif_transpose(aberta).convert("RGB")
    if imagem is None:
        renderizada = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], ARQUIVO_IMAGEM))
        if renderizada.is_file():
            with Image.open(renderizada) as aberta:
                imagem = aberta.convert("RGB")
    return imagem, bruto, extensao


def _marca(imagem: Image.Image, marca: dict, logo: Image.Image | None) -> Image.Image:
    """A marca d'água (texto ou o logo) no canto pedido, com a opacidade."""
    largura, altura = imagem.size
    lado = min(largura, altura)
    opacidade = float(marca.get("opacidade", 0.6))
    if marca.get("tipo") == "logo" and logo is not None:
        alvo = max(8, round(lado * float(marca.get("tamanho", 0.15))))
        selo = logo.convert("RGBA")
        selo = selo.resize((alvo, max(1, round(selo.height * alvo / selo.width))), Image.Resampling.LANCZOS)
    else:
        texto = (marca.get("texto") or "").strip()
        if not texto:
            return imagem
        tamanho = max(8, round(lado * float(marca.get("tamanho", 0.04))))
        fonte = ImageFont.truetype(FONTE, tamanho)
        caixa = fonte.getbbox(texto)
        selo = Image.new("RGBA", (caixa[2] - caixa[0] + 4, caixa[3] - caixa[1] + 4), (0, 0, 0, 0))
        desenho = ImageDraw.Draw(selo)
        # O texto branco com uma sombra fina, para ler em cima de claro e de escuro
        desenho.text((2 - caixa[0], 3 - caixa[1]), texto, font=fonte, fill=(0, 0, 0, 140))
        desenho.text((1 - caixa[0], 1 - caixa[1]), texto, font=fonte, fill=(255, 255, 255, 255))
    alfa = selo.getchannel("A").point(lambda v: round(v * opacidade))
    selo.putalpha(alfa)
    x, y = posicao_da_marca(largura, altura, selo.width, selo.height, marca.get("canto", "baixo-direita"))
    saida = imagem.convert("RGBA")
    saida.alpha_composite(selo, (max(0, x), max(0, y)))
    return saida.convert("RGB")


def _codificar(imagem: Image.Image, formato: str, qualidade: int, limite_kb: int | None) -> bytes:
    def salvar(q: int) -> bytes:
        saida = io.BytesIO()
        if formato == "png":
            imagem.save(saida, "PNG", optimize=True)
        else:
            imagem.save(saida, "JPEG", quality=q, optimize=True, subsampling=0 if q >= 90 else 2)
        return saida.getvalue()

    if formato == "jpg" and limite_kb:
        tamanhos: dict[int, bytes] = {}

        def tamanho(q: int) -> int:
            tamanhos[q] = tamanhos.get(q) or salvar(q)
            return len(tamanhos[q])

        q = qualidade_para_o_tamanho(tamanho, limite_kb * 1024, maximo=qualidade)
        return tamanhos.get(q) or salvar(q)
    return salvar(qualidade)


def executar_exportar_album(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    album = db.albuns.find_one({"_id": ObjectId(entrada["album_id"])})
    if album is None:
        raise ErroDefinitivo("O álbum foi excluído antes da exportação.")
    opcoes = entrada.get("opcoes") or {}
    formato = opcoes.get("formato", "jpg")
    ids = [ObjectId(i) for i in entrada["midia_ids"]]
    fotos = {f["midia_id"]: f for f in db.album_fotos.find({"album_id": album["_id"], "midia_id": {"$in": ids}})}
    midias = {m["_id"]: m for m in db.midias.find({"_id": {"$in": list(fotos)},
                                                   "organizacao_id": album["organizacao_id"]})}
    ordem = [i for i in ids if i in midias]
    luts = luts_das_edicoes(db, album["organizacao_id"], [f.get("edicao") or {} for f in fotos.values()])
    logo = None
    marca = opcoes.get("marca")
    if marca and marca.get("tipo") == "logo" and marca.get("midia_id"):
        dona = db.midias.find_one({"_id": ObjectId(marca["midia_id"]), "organizacao_id": album["organizacao_id"]})
        caminho = storage.caminho_local(chave_arquivo(album["organizacao_id"], dona["_id"], ARQUIVO_IMAGEM)) \
            if dona else None
        if caminho and caminho.is_file():
            logo = Image.open(caminho)
            logo.load()
    destino = storage.caminho_local(chave_do_zip(album["organizacao_id"], album["_id"], job["_id"]))
    destino.parent.mkdir(parents=True, exist_ok=True)
    usados: set[str] = set()
    feitas = falhas = 0
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_STORED) as arquivo_zip:
        for numero, midia_id in enumerate(ordem, start=1):
            foto, midia = fotos[midia_id], midias[midia_id]
            descricao = {**foto, "nome": midia.get("nome"), "exif": midia.get("exif")}
            imagem, bruto, extensao = _original(midia)
            if imagem is None and bruto is None:
                falhas += 1
                continue
            pasta = subpasta(descricao, opcoes.get("divisao", "nenhuma"))
            if formato == "original" and bruto is not None:
                nome = nome_do_arquivo(opcoes.get("padrao", "{original}"), descricao, numero, album["nome"],
                                       extensao.lstrip("."))
                caminho = sem_repetir(f"{pasta}/{nome}" if pasta else nome, usados)
                arquivo_zip.writestr(caminho, bruto)
            else:
                rgb = np.asarray(imagem)
                edicao = dict(foto.get("edicao") or {})
                edicao.pop("auto", None)
                if edicao and opcoes.get("com_edicao", True):
                    rgb = foto_editada(db, foto, midia, rgb, edicao, luts)
                saida = Image.fromarray(rgb)
                saida = saida.resize(lado_para_o_limite(*saida.size, opcoes.get("lado_maximo")),
                                     Image.Resampling.LANCZOS)
                if marca:
                    saida = _marca(saida, marca, logo)
                extensao_saida = "png" if formato == "png" else "jpg"
                nome = nome_do_arquivo(opcoes.get("padrao", "{original}"), descricao, numero, album["nome"],
                                       extensao_saida)
                caminho = sem_repetir(f"{pasta}/{nome}" if pasta else nome, usados)
                arquivo_zip.writestr(caminho, _codificar(saida, formato, int(opcoes.get("qualidade", 92)),
                                                         opcoes.get("tamanho_maximo_kb")))
            if opcoes.get("xmp"):
                cor = (foto.get("edicao") or {}).get("cor")
                arquivo_zip.writestr(caminho.rsplit(".", 1)[0] + ".xmp", xmp_da_foto(descricao, cor))
            feitas += 1
            reportar(2 + int(96 * numero / max(1, len(ordem))), f"Exportando {numero} de {len(ordem)}")
    tamanho = destino.stat().st_size
    db.albuns.update_one({"_id": album["_id"]}, {"$set": {"exportado_em": agora()}})
    logging.info(f"[album {album['_id']}] {feitas} fotos exportadas ({falhas} sem arquivo), {tamanho} bytes.")
    return {"album_id": str(album["_id"]), "fotos": feitas, "falhas": falhas, "bytes": tamanho}
