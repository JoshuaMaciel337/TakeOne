# -----------------------------------------------
# Tarefa "renderizacao" — gera o vídeo final de uma exportação
#
#   1. lê a cópia do projeto guardada na exportação e as mídias que ela usa
#   2. planeja o grafo do FFmpeg (core/utils/render.py), a partir dos arquivos originais
#   3. mistura o som num arquivo e mede o loudness dele (primeira passada, só de áudio)
#   4. gera o vídeo com o som já misturado (segunda passada), com o progresso indo para o job
#   5. confere o arquivo gerado e marca a exportação como pronta
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
from core.modelos.midia import ARQUIVO_PROXY_AUDIO, ARQUIVO_PROXY_VIDEO, ARQUIVO_VOZ_LIMPA, chave_arquivo
from core.modelos.midia import STATUS_PRONTA as MIDIA_PRONTA
from core.modelos.projeto import midias_usadas
from core.utils import storage
from core.utils.cor import desenhar_vinheta, gerar_cube
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg, resumir_sondagem, sondar
from core.utils.geometria import LADO_REFERENCIA_TEXTO
from core.utils.letras import tem_destaque, tem_letra_a_letra, texto_do_destaque
from core.utils.mongo import agora
from core.utils.render import (
    ErroRender,
    ImagemDoTexto,
    MidiaDoRender,
    argumentos_de_saida,
    argumentos_do_som,
    argumentos_do_video,
    ganho_para_o_alvo,
    ler_loudness,
    planejar_render,
)
from core.utils.texto import desenhar_texto, layout_do_texto

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
        voz = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], ARQUIVO_VOZ_LIMPA))
        # Mídias enviadas antes de a ingestão guardar a matriz de cor: lê do arquivo
        if "matriz" in video:
            matriz = video["matriz"]
        else:
            matriz = (resumir_sondagem(sondar(caminho))["video"] or {}).get("matriz")
        preparadas[str(midia["_id"])] = MidiaDoRender(
            caminho=str(caminho),
            largura=int(video.get("largura") or 0),
            altura=int(video.get("altura") or 0),
            video=bool(video),
            audio=bool(midia.get("audio")),
            duracao=float(midia.get("duracao") or 0),
            matriz=matriz,
            voz_limpa=str(voz) if voz.is_file() else None,
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
            lado = min(largura, altura)
            caminho = pasta / f"texto_{clipe['id']}.png"
            desenhar_texto(clipe["texto"], lado).save(caminho, format="PNG")
            # Letra a letra e destaque: onde cada letra fica no PNG, e o PNG na cor do destaque
            layout = destaque = None
            if tem_letra_a_letra(clipe) or tem_destaque(clipe):
                layout = layout_do_texto(clipe["texto"], lado)
            if tem_destaque(clipe):
                destaque = pasta / f"texto_{clipe['id']}_destaque.png"
                desenhar_texto(texto_do_destaque(clipe["texto"]), lado).save(destaque, format="PNG")
            textos[clipe["id"]] = ImagemDoTexto(str(caminho), *referencia, layout=layout,
                                                destaque=str(destaque) if destaque else None)
    return textos


def misturar_o_som(plano, filtro: Path, reportar: Callable[[float], None], rotulo: str) -> float:
    """Primeira passada: mistura o som no arquivo `plano.som`, mede o loudness e devolve o ganho até -14 LUFS."""
    filtro.write_text(plano.filtro_som, encoding="utf-8")
    saida = executar_ffmpeg(argumentos_do_som(plano, str(filtro)), plano.duracao, reportar)
    medido = ler_loudness(saida)
    ganho = ganho_para_o_alvo(medido)
    logging.info(f"{rotulo} loudness da mistura: {medido} LUFS, ganho de {ganho:+.1f} dB")
    return ganho


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
        plano = planejar_render(projeto, midias, largura, altura, textos, pasta=str(pasta))
    except ErroRender as e:
        raise ErroDefinitivo(str(e)) from e
    logging.info(f"{rotulo} {largura}x{altura}, {plano.duracao:.1f}s, {len(plano.entradas)} clipes")

    # Os grafos ficam num arquivo: com muitos clipes eles passam do limite da linha de comando
    filtro = caminho(ARQUIVO_FILTRO)
    parcial = caminho(ARQUIVO_PARCIAL)
    try:
        # LUTs da cor e imagens das vinhetas que o grafo usa (as duas passadas abrem as mesmas entradas)
        for auxiliar in plano.auxiliares:
            if auxiliar.tipo == "lut":
                Path(auxiliar.caminho).write_text(gerar_cube(auxiliar.ajustes), encoding="utf-8")
            elif auxiliar.tipo == "comandos":
                Path(auxiliar.caminho).write_text(auxiliar.conteudo, encoding="utf-8")
            else:
                desenhar_vinheta(auxiliar.largura, auxiliar.altura, auxiliar.ajustes["vinheta"]).save(auxiliar.caminho)
        if plano.tem_som:
            ganho = misturar_o_som(plano, filtro, lambda f: reportar(3 + int(f * 12), "Misturando o som"), rotulo)
            plano = planejar_render(projeto, midias, largura, altura, textos, pasta=str(pasta), ganho_db=ganho)
        filtro.write_text(plano.filtro, encoding="utf-8")
        argumentos = argumentos_do_video(plano, str(filtro))
        argumentos += argumentos_de_saida(plano, str(parcial), max(largura, altura))
        executar_ffmpeg(argumentos, plano.duracao, lambda f: reportar(15 + int(f * 80), "Gerando o vídeo"))
    finally:
        filtro.unlink(missing_ok=True)
        if plano.som:
            Path(plano.som).unlink(missing_ok=True)
        for imagem in textos.values():
            Path(imagem.caminho).unlink(missing_ok=True)
        for auxiliar in plano.auxiliares:
            Path(auxiliar.caminho).unlink(missing_ok=True)

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
