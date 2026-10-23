# -----------------------------------------------
# Tarefa "renderizacao" — gera o vídeo final de uma exportação
#
#   1. lê a cópia do projeto guardada na exportação e as mídias que ela usa
#   2. planeja o grafo do FFmpeg (core/utils/render.py), a partir dos arquivos originais
#   3. mistura o som num arquivo e mede o loudness dele (primeira passada, só de áudio)
#   4. gera o vídeo com o som já misturado (segunda passada), com o progresso indo para o job
#   5. confere o arquivo gerado e marca a exportação como pronta
#
# Os outros formatos usam o mesmo grafo: o quadro em PNG (só os clipes daquele instante, em RGB), o GIF
# (os quadros em RGB sem perda, a paleta e o GIF) e só o som (a primeira passada e o ganho até -14 LUFS).
# -----------------------------------------------
import logging
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.modelos.exportacao import (
    STATUS_ERRO,
    STATUS_PROCESSANDO,
    STATUS_PRONTA,
    arquivo_do_formato,
    chave_exportacao,
)
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import (
    ARQUIVO_IMAGEM,
    ARQUIVO_IMAGEM_LIMPA,
    ARQUIVO_INVERTIDO,
    ARQUIVO_MASCARA,
    ARQUIVO_PROXY_AUDIO,
    ARQUIVO_PROXY_IMAGEM,
    ARQUIVO_PROXY_VIDEO,
    ARQUIVO_VOZ_LIMPA,
    chave_arquivo,
    e_imagem,
)
from core.modelos.midia import STATUS_PRONTA as MIDIA_PRONTA
from core.modelos.projeto import midias_usadas
from core.utils import storage
from core.utils.cantos import desenhar_cantos
from core.utils.cor import desenhar_vinheta, gerar_cube
from core.utils.efeitos import LINHAS_POR_ALTURA, imagem_do_grao, tira_de_luz
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg, resumir_sondagem, sondar
from core.utils.geometria import LADO_REFERENCIA_TEXTO
from core.utils.letras import tem_destaque, tem_letra_a_letra, texto_do_destaque
from core.utils.mongo import agora
from core.utils.render import (
    ErroRender,
    ImagemDoTexto,
    MidiaDoRender,
    argumentos_da_paleta,
    argumentos_de_saida,
    argumentos_do_gif,
    argumentos_do_quadro,
    argumentos_do_som,
    argumentos_do_som_final,
    argumentos_do_video,
    argumentos_dos_quadros_sem_perda,
    ganho_para_o_alvo,
    ler_loudness,
    planejar_render,
    projeto_do_quadro,
)
from core.utils.som import wav_do_reverb
from core.utils.texto import desenhar_texto, layout_do_texto

ARQUIVO_FILTRO = "filtro.txt"
ARQUIVO_QUADROS = "quadros.mkv"
ARQUIVO_PALETA = "paleta.png"


def arquivo_da_midia(midia: dict) -> Path | None:
    """O original, que tem a qualidade toda; sem ele (apagado à mão), o proxy. Imagem: a imagem.png da
    ingestão, já girada pelo EXIF (o FFmpeg não gira) e no máximo 4096 px."""
    nomes = (ARQUIVO_IMAGEM, ARQUIVO_PROXY_IMAGEM) if e_imagem(midia) else (
        midia.get("original"), ARQUIVO_PROXY_VIDEO, ARQUIVO_PROXY_AUDIO)
    for nome in nomes:
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
        # Mídias enviadas antes de a ingestão guardar a matriz de cor e a duração da imagem: lê do arquivo
        sondado = {}
        if video and not e_imagem(midia) and ("matriz" not in video or "duracao" not in video):
            sondado = resumir_sondagem(sondar(caminho))["video"] or {}
        matriz = None if e_imagem(midia) else video["matriz"] if "matriz" in video else sondado.get("matriz")
        duracao_video = 0.0 if e_imagem(midia) else float(video.get("duracao") or sondado.get("duracao") or 0)
        preparadas[str(midia["_id"])] = MidiaDoRender(
            caminho=str(caminho),
            largura=int(video.get("largura") or 0),
            altura=int(video.get("altura") or 0),
            video=bool(video),
            audio=bool(midia.get("audio")),
            duracao=0 if e_imagem(midia) else float(midia.get("duracao") or 0),
            matriz=matriz,
            # Só o que a ingestão marcou: uma mídia HDR antiga tem a cópia leve sem a conversão, e o render
            # fica igual a ela até ser ingerida de novo
            hdr=None if e_imagem(midia) else video.get("hdr"),
            voz_limpa=str(voz) if voz.is_file() else None,
            imagem_limpa=str(limpa) if (limpa := storage.caminho_local(chave_arquivo(
                midia["organizacao_id"], midia["_id"], ARQUIVO_IMAGEM_LIMPA))).is_file() else None,
            mascara=str(mascara) if (mascara := storage.caminho_local(chave_arquivo(
                midia["organizacao_id"], midia["_id"], ARQUIVO_MASCARA))).is_file() else None,
            tons=tuple((chave, str(caminho)) for chave, tom in (midia.get("tons") or {}).items()
                       if tom.get("status") == "pronta"
                       and (caminho := storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"],
                                                                           f"{chave}.m4a"))).is_file()),
            estaveis=tuple((chave, str(caminho)) for chave, item in (midia.get("estabilizacoes") or {}).items()
                           if item.get("status") == "pronta"
                           and (caminho := storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"],
                                                                               f"{chave}.mp4"))).is_file()),
            lufs=(midia.get("audio") or {}).get("lufs"),
            imagem=e_imagem(midia),
            duracao_video=duracao_video,
            fluidos=tuple((chave, str(caminho), float(item.get("zero") or item.get("de") or 0))
                          for chave, item in (midia.get("fluidos") or {}).items()
                          if item.get("status") == "pronta"
                          and (caminho := storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"],
                                                                              f"{chave}.mp4"))).is_file()),
            invertido=str(invertido) if (midia.get("invertido") or {}).get("status") == "pronta" and (
                invertido := storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"],
                                                                 ARQUIVO_INVERTIDO))).is_file() else None,
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


def escrever_auxiliares(plano):
    """LUTs da cor, roteiros e imagens (vinhetas, luz, cantos, grão) que o grafo abre."""
    for auxiliar in plano.auxiliares:
        if auxiliar.tipo == "lut":
            Path(auxiliar.caminho).write_text(gerar_cube(auxiliar.ajustes), encoding="utf-8")
        elif auxiliar.tipo == "comandos":
            Path(auxiliar.caminho).write_text(auxiliar.conteudo, encoding="utf-8")
        elif auxiliar.tipo == "reverb":
            Path(auxiliar.caminho).write_bytes(wav_do_reverb())
        elif auxiliar.tipo == "luz":
            tira_de_luz(auxiliar.largura, auxiliar.altura, auxiliar.ajustes["forca"]).save(auxiliar.caminho)
        elif auxiliar.tipo in ("cantos", "anel"):
            mascara, anel = desenhar_cantos(auxiliar.largura, auxiliar.altura, auxiliar.ajustes)
            (mascara if auxiliar.tipo == "cantos" else anel).save(auxiliar.caminho)
        elif auxiliar.tipo == "grao":
            imagem_do_grao(auxiliar.ajustes["forca"]).save(auxiliar.caminho)
        else:
            desenhar_vinheta(auxiliar.largura, auxiliar.altura, auxiliar.ajustes["vinheta"],
                             auxiliar.ajustes.get("linhas", 0), LINHAS_POR_ALTURA).save(auxiliar.caminho)


def executar_renderizacao(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    exportacao = db.exportacoes.find_one({"_id": ObjectId(job["entrada"]["exportacao_id"])})
    if exportacao is None:
        raise ErroDefinitivo("A exportação foi excluída antes do render.")
    organizacao_id = exportacao["organizacao_id"]
    projeto = exportacao["projeto"]
    formato = exportacao.get("formato") or "mp4"
    so_som = formato in ("m4a", "wav")
    imagem_rgb = formato in ("png", "gif")
    rotulo = f"[{organizacao_id}] [exportacao {exportacao['_id']}]"
    if exportacao.get("taxa"):
        # Outra taxa de quadros: a montagem inteira passa a ser nessa grade (as transições, os cortes)
        projeto = {**projeto, "taxa": {"num": exportacao["taxa"], "den": 1}}
    indice = None
    if formato == "png":
        projeto, indice = projeto_do_quadro(projeto, exportacao.get("tempo") or 0)

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
    # Os grafos ficam num arquivo: com muitos clipes eles passam do limite da linha de comando
    filtro = caminho(ARQUIVO_FILTRO)
    arquivo_final = arquivo_do_formato(formato)
    parcial = caminho(f"parcial{Path(arquivo_final).suffix}")
    quadros = caminho(ARQUIVO_QUADROS)
    paleta = caminho(ARQUIVO_PALETA)
    # Tudo o que o render grava fica dentro do try: com o plano recusado ou o FFmpeg falhando, os PNGs dos
    # textos (e dos destaques) e o vídeo pela metade ficavam na pasta até a exportação ser excluída
    textos: dict = {}
    plano = None
    gerou = False
    try:
        if not so_som:
            textos = preparar_textos(projeto["faixas"], largura, altura, pasta)
        try:
            plano = planejar_render(projeto, midias, largura, altura, textos, pasta=str(pasta), imagem_rgb=imagem_rgb,
                                    sem_imagem=so_som)
        except ErroRender as e:
            raise ErroDefinitivo(str(e)) from e
        logging.info(f"{rotulo} {formato} {largura}x{altura}, {plano.duracao:.1f}s, {len(plano.entradas)} clipes")
        escrever_auxiliares(plano)
        if so_som:
            if not plano.tem_som:
                raise ErroDefinitivo("O projeto não tem som para exportar.")
            ganho = misturar_o_som(plano, filtro, lambda f: reportar(3 + int(f * 80), "Misturando o som"), rotulo)
            executar_ffmpeg(argumentos_do_som_final(plano, ganho, str(parcial), formato), plano.duracao,
                            lambda f: reportar(85 + int(f * 10), "Gravando o som"))
        elif formato == "png":
            filtro.write_text(plano.filtro, encoding="utf-8")
            argumentos = argumentos_do_video(plano, str(filtro)) + argumentos_do_quadro(plano, indice, str(parcial))
            executar_ffmpeg(argumentos, plano.duracao, lambda f: reportar(5 + int(f * 90), "Desenhando o quadro"))
        elif formato == "gif":
            filtro.write_text(plano.filtro, encoding="utf-8")
            argumentos = argumentos_do_video(plano, str(filtro)) + argumentos_dos_quadros_sem_perda(plano, str(quadros))
            executar_ffmpeg(argumentos, plano.duracao, lambda f: reportar(5 + int(f * 75), "Gerando os quadros"))
            executar_ffmpeg(argumentos_da_paleta(str(quadros), str(paleta)), plano.duracao,
                            lambda f: reportar(80 + int(f * 5), "Escolhendo as cores"))
            executar_ffmpeg(argumentos_do_gif(str(quadros), str(paleta), str(parcial)), plano.duracao,
                            lambda f: reportar(85 + int(f * 10), "Gravando o GIF"))
        else:
            if plano.tem_som:
                ganho = misturar_o_som(plano, filtro, lambda f: reportar(3 + int(f * 12), "Misturando o som"), rotulo)
                plano = planejar_render(projeto, midias, largura, altura, textos, pasta=str(pasta), ganho_db=ganho)
            filtro.write_text(plano.filtro, encoding="utf-8")
            argumentos = argumentos_do_video(plano, str(filtro))
            argumentos += argumentos_de_saida(plano, str(parcial), max(largura, altura))
            executar_ffmpeg(argumentos, plano.duracao, lambda f: reportar(15 + int(f * 80), "Gerando o vídeo"))
        gerou = True
    finally:
        filtro.unlink(missing_ok=True)
        quadros.unlink(missing_ok=True)
        paleta.unlink(missing_ok=True)
        for imagem in textos.values():
            Path(imagem.caminho).unlink(missing_ok=True)
            if imagem.destaque:
                Path(imagem.destaque).unlink(missing_ok=True)
        if plano:
            if plano.som:
                Path(plano.som).unlink(missing_ok=True)
            for auxiliar in plano.auxiliares:
                Path(auxiliar.caminho).unlink(missing_ok=True)
        if not gerou:
            parcial.unlink(missing_ok=True)

    reportar(97, "Conferindo o arquivo")
    try:
        resumo = resumir_sondagem(sondar(parcial))
    except ErroFFmpeg as e:
        parcial.unlink(missing_ok=True)
        raise ErroFFmpeg(f"O arquivo gerado não abre: {e}") from e
    final = caminho(arquivo_final)
    parcial.replace(final)

    momento = agora()
    duracao = None if formato == "png" else resumo["duracao"]
    db.exportacoes.update_one({"_id": exportacao["_id"]}, {"$set": {
        "status": STATUS_PRONTA,
        "arquivos": [arquivo_final],
        "tamanho": final.stat().st_size,
        "duracao": duracao,
        "erro": None,
        "concluido_em": momento,
        "atualizado_em": momento,
    }})
    reportar(100, "Pronto")
    return {"exportacao_id": str(exportacao["_id"]), "duracao": duracao, "tamanho": final.stat().st_size}
