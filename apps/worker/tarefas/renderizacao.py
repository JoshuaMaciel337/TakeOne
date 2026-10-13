# -----------------------------------------------
# Tarefa "renderizacao" — gera o vídeo final de uma exportação
#
#   1. lê a cópia do projeto guardada na exportação e as mídias que ela usa
#   2. planeja o grafo do FFmpeg (core/utils/render.py), a partir dos arquivos originais
#   3. renderiza numa passada só, com o progresso indo para o job
#   4. confere o arquivo gerado e marca a exportação como pronta
# -----------------------------------------------
import logging
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.modelos.exportacao import (
    ARQUIVO_VIDEO,
    STATUS_ERRO,
    STATUS_PROCESSANDO,
    STATUS_PRONTA,
    chave_exportacao,
)
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_PROXY_AUDIO, ARQUIVO_PROXY_VIDEO, chave_arquivo
from core.modelos.midia import STATUS_PRONTA as MIDIA_PRONTA
from core.modelos.projeto import midias_usadas
from core.utils import storage
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg, resumir_sondagem, sondar
from core.utils.geometria import LADO_REFERENCIA_TEXTO
from core.utils.mongo import agora
from core.utils.render import (
    ErroRender,
    ImagemDoTexto,
    MidiaDoRender,
    argumentos_de_saida,
    opcao_filtro_em_arquivo,
    planejar_render,
)
from core.utils.texto import desenhar_texto

ARQUIVO_FILTRO = "filtro.txt"
ARQUIVO_PARCIAL = "video.parcial.mp4"


def arquivo_da_midia(midia: dict) -> Path | None:
    """O original, que tem a qualidade toda; sem ele (apagado à mão), o proxy."""
    for nome in (midia.get("original"), ARQUIVO_PROXY_VIDEO, ARQUIVO_PROXY_AUDIO):
        if not nome:
            continue
        caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], nome))
        if caminho.is_file():
            return caminho
    return None


def preparar_midias(db, organizacao_id, faixas: list[dict]) -> dict[str, MidiaDoRender]:
    ids = [ObjectId(i) for i in midias_usadas(faixas) if ObjectId.is_valid(i)]
    preparadas = {}
    for midia in db.midias.find({"_id": {"$in": ids}, "organizacao_id": organizacao_id, "status": MIDIA_PRONTA}):
        caminho = arquivo_da_midia(midia)
        if caminho is None:
            raise ErroDefinitivo(f'O arquivo de "{midia["nome"]}" não foi encontrado no servidor.')
        video = midia.get("video") or {}
        preparadas[str(midia["_id"])] = MidiaDoRender(
            caminho=str(caminho),
            largura=int(video.get("largura") or 0),
            altura=int(video.get("altura") or 0),
            video=bool(video),
            audio=bool(midia.get("audio")),
        )
    return preparadas


def preparar_textos(faixas: list[dict], largura: int, altura: int, pasta: Path) -> dict[str, ImagemDoTexto]:
    """
    O PNG de cada texto, no tamanho do vídeo (nítido em 4K). A caixa no quadro sai do tamanho no lado
    de referência, o mesmo que a prévia mede, para o texto ficar no mesmo lugar nos dois.
    """
    textos = {}
    for faixa in faixas:
        if faixa.get("oculta"):
            continue
        for clipe in faixa["clipes"]:
            if not clipe.get("texto"):
                continue
            referencia = desenhar_texto(clipe["texto"], LADO_REFERENCIA_TEXTO).size
            caminho = pasta / f"texto_{clipe['id']}.png"
            desenhar_texto(clipe["texto"], min(largura, altura)).save(caminho, format="PNG")
            textos[clipe["id"]] = ImagemDoTexto(str(caminho), *referencia)
    return textos


def marcar_exportacao_com_erro(db, job: dict, mensagem: str):
    """Chamado quando o render falha de vez: a exportação mostra o erro."""
    exportacao_id = (job.get("entrada") or {}).get("exportacao_id")
    if exportacao_id:
        db.exportacoes.update_one({"_id": ObjectId(exportacao_id)}, {"$set": {
            "status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora(),
        }})


def executar_renderizacao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    exportacao = db.exportacoes.find_one({"_id": ObjectId(job["entrada"]["exportacao_id"])})
    if exportacao is None:
        raise ErroDefinitivo("A exportação foi excluída antes do render.")
    organizacao_id = exportacao["organizacao_id"]
    projeto = exportacao["projeto"]
    rotulo = f"[{organizacao_id}] [exportacao {exportacao['_id']}]"

    def caminho(nome: str) -> Path:
        return storage.caminho_local(chave_exportacao(organizacao_id, exportacao["_id"], nome))

    db.exportacoes.update_one({"_id": exportacao["_id"]}, {"$set": {
        "status": STATUS_PROCESSANDO, "erro": None, "atualizado_em": agora(),
    }})

    reportar(2, "Preparando as mídias e os textos")
    midias = preparar_midias(db, organizacao_id, projeto["faixas"])
    largura, altura = exportacao["largura"], exportacao["altura"]
    pasta = caminho(ARQUIVO_FILTRO).parent
    pasta.mkdir(parents=True, exist_ok=True)
    textos = preparar_textos(projeto["faixas"], largura, altura, pasta)
    try:
        plano = planejar_render(projeto, midias, largura, altura, textos)
    except ErroRender as e:
        raise ErroDefinitivo(str(e)) from e
    logging.info(f"{rotulo} {largura}x{altura}, {plano.duracao:.1f}s, {len(plano.entradas)} clipes")

    # O grafo fica num arquivo: com muitos clipes ele passa do limite da linha de comando
    filtro = caminho(ARQUIVO_FILTRO)
    filtro.parent.mkdir(parents=True, exist_ok=True)
    filtro.write_text(plano.filtro, encoding="utf-8")
    parcial = caminho(ARQUIVO_PARCIAL)
    argumentos = [argumento for entrada in plano.entradas for argumento in entrada.argumentos()]
    argumentos += opcao_filtro_em_arquivo(str(filtro))
    argumentos += argumentos_de_saida(plano, str(parcial), max(largura, altura))
    try:
        executar_ffmpeg(argumentos, plano.duracao, lambda f: reportar(5 + int(f * 90), "Gerando o vídeo"))
    finally:
        filtro.unlink(missing_ok=True)
        for imagem in textos.values():
            Path(imagem.caminho).unlink(missing_ok=True)

    reportar(97, "Conferindo o vídeo")
    try:
        resumo = resumir_sondagem(sondar(parcial))
    except ErroFFmpeg as e:
        parcial.unlink(missing_ok=True)
        raise ErroFFmpeg(f"O vídeo gerado não abre: {e}") from e
    final = caminho(ARQUIVO_VIDEO)
    parcial.replace(final)

    momento = agora()
    db.exportacoes.update_one({"_id": exportacao["_id"]}, {"$set": {
        "status": STATUS_PRONTA,
        "arquivos": [ARQUIVO_VIDEO],
        "tamanho": final.stat().st_size,
        "duracao": resumo["duracao"],
        "erro": None,
        "concluido_em": momento,
        "atualizado_em": momento,
    }})
    reportar(100, "Vídeo pronto")
    return {"exportacao_id": str(exportacao["_id"]), "duracao": resumo["duracao"], "tamanho": final.stat().st_size}
