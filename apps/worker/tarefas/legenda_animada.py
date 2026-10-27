# -----------------------------------------------
# Tarefa "legenda_animada" — grava a trilha de uma legenda animada (o Clipar, ADR 0004, 14.12a)
#
# A página (core/modelos/legenda_animada.py) abre no Chromium do worker com o motor (core/legendas/motor.js) e as
# fontes livres; cada quadro é desenhado no instante dele e gravado num vídeo de cor e num de transparência, como as
# animações em HTML. Antes de desenhar, a página diz o estado da tela naquele instante; quando ele é o mesmo do quadro
# anterior (a maior parte do tempo, entre a entrada de uma palavra e a seguinte), o quadro anterior é repetido sem
# passar pelo navegador, e o navegador só fotografa a faixa de linhas em que a legenda desenha. Uma trilha longa é
# gravada em partes, em processos separados. Depois a mídia segue pela ingestão, com a máscara pronta, como as
# animações.
# -----------------------------------------------
import logging
import multiprocessing
import queue
import subprocess
from collections.abc import Callable
from pathlib import Path

import cv2
import numpy as np
from bson import ObjectId

from core.config import FFMPEG, FONTES_DA_BIBLIOTECA
from core.modelos.animacao_html import PASTA_FONTES
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.legenda_animada import FONTES, PASTA_DO_MOTOR, QUADROS, montar_pagina, quadros_da_legenda
from core.modelos.midia import ARQUIVO_MASCARA, PRIORIDADE_INGESTAO, chave_arquivo
from core.utils import storage
from core.utils.ffmpeg import FILTRO_MARCAS_BT709, MARCAS_BT709
from core.utils.mongo import agora
from worker.tarefas.animacao_html import Estudio, _escritor, espalhar_cor

# Mais que isto, a gravação se divide entre processos (um Chromium cada), em partes emendadas sem recodificar
QUADROS_POR_PROCESSO = 150
PROCESSOS = 3


def arquivos_da_pagina() -> dict[str, Path]:
    """O motor e as fontes que a página pede, pelos caminhos da URL que montar_pagina usa."""
    extras = {"/legendas/motor.js": PASTA_DO_MOTOR / "motor.js"}
    for pasta, arquivo, *_ in FONTES.values():
        raiz = PASTA_FONTES if pasta == "nucleo" else FONTES_DA_BIBLIOTECA
        extras[f"/fontes/{pasta}/{arquivo}"] = Path(raiz) / arquivo
    return extras


def _fotografar_faixa(estudio: Estudio, segundos: float, y0: int, y1: int) -> np.ndarray:
    """O quadro só nas linhas em que a legenda desenha (BGRA): a foto da tela inteira levava o dobro do tempo."""
    estudio.avaliar("t => window.renderAt(t)", segundos)
    png = estudio.pagina.screenshot(type="png", omit_background=True,
                                    clip={"x": 0, "y": y0, "width": estudio.largura, "height": y1 - y0})
    faixa = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED)
    if faixa is not None and faixa.ndim == 3 and faixa.shape[2] == 3:
        faixa = cv2.cvtColor(faixa, cv2.COLOR_BGR2BGRA)
    if faixa is None or faixa.ndim != 3 or faixa.shape[:2] != (y1 - y0, estudio.largura):
        raise ErroDefinitivo("O navegador não devolveu o quadro da legenda.")
    return faixa


def _gravar_trecho(pagina_html: str, largura: int, altura: int, de: int, ate: int, cor: Path, mascara: Path,
                   avisar: Callable[[int], None]) -> dict:
    """Os quadros [de, ate) num vídeo de cor e num de transparência. O quadro em que a tela é igual à do anterior
    (o estado do motor não mudou) é repetido sem passar pelo navegador."""
    escritor_cor = _escritor(largura, altura, "rgb24", cor,
                             ["-vf", f"scale=out_color_matrix=bt709:out_range=tv,{FILTRO_MARCAS_BT709}", *MARCAS_BT709])
    escritor_alfa = _escritor(largura, altura, "gray", mascara, ["-color_range", "tv"])
    feitos = desenhados = 0
    anterior = None
    rgb = np.zeros((altura, largura, 3), np.uint8)
    alfa = np.zeros((altura, largura), np.uint8)
    rgb_bytes, alfa_bytes = rgb.tobytes(), alfa.tobytes()
    try:
        with Estudio(pagina_html, largura, altura, extras=arquivos_da_pagina()) as estudio:
            y0, y1 = (int(v) for v in estudio.avaliar("() => window.faixaDaLegenda()"))
            for indice in range(de, ate):
                segundos = indice / 30
                estado = estudio.avaliar("t => window.estadoEm(t)", segundos)
                if estado != anterior:
                    rgb[y0:y1], alfa[y0:y1] = espalhar_cor(_fotografar_faixa(estudio, segundos, y0, y1))
                    rgb_bytes, alfa_bytes = rgb.tobytes(), alfa.tobytes()
                    anterior = estado
                    desenhados += 1
                escritor_cor.stdin.write(rgb_bytes)
                escritor_alfa.stdin.write(alfa_bytes)
                feitos += 1
                if feitos % 15 == 0:
                    avisar(feitos)
    finally:
        for escritor in (escritor_cor, escritor_alfa):
            escritor.stdin.close()
        codigos = [escritor_cor.wait(timeout=900), escritor_alfa.wait(timeout=900)]
    if any(codigos) or feitos < ate - de:
        raise RuntimeError("O vídeo da legenda não foi gravado.")
    avisar(feitos)
    return {"quadros": feitos, "desenhados": desenhados}


def _trecho_no_processo(pagina_html, largura, altura, de, ate, cor, mascara, contador, saida):
    def avisar(feitos):
        contador.value = feitos

    try:
        saida.put(("ok", _gravar_trecho(pagina_html, largura, altura, de, ate, Path(cor), Path(mascara), avisar)))
    except BaseException as erro:  # noqa: BLE001 (o erro volta ao processo do job, com a mensagem)
        saida.put(("erro", str(erro) or type(erro).__name__))


def _emendar(partes: list[Path], destino: Path):
    lista = destino.with_suffix(".txt")
    lista.write_text("".join(f"file '{parte.as_posix()}'\n" for parte in partes), encoding="utf-8")
    try:
        subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lista), "-c", "copy",
                        "-movflags", "+faststart", str(destino)], check=True, capture_output=True, timeout=600)
    finally:
        lista.unlink(missing_ok=True)


def gravar_legenda(pagina_html: str, largura: int, altura: int, duracao: float, cor: Path, mascara: Path,
                   reportar: Callable[[int, str], None] = lambda *_: None, processos: int = PROCESSOS) -> dict:
    """Grava a trilha e devolve quantos quadros saíram e quantos foram desenhados de fato. Uma trilha longa se divide
    em partes iguais, cada uma num processo com o próprio Chromium, emendadas no fim (o motor é uma função do tempo,
    então cada parte começa onde a anterior parou)."""
    total = quadros_da_legenda(duracao)
    partes = max(1, min(processos, total // QUADROS_POR_PROCESSO))

    def reportar_quadros(feitos):
        reportar(min(95, 2 + int(93 * feitos / total)), "Gravando a legenda")

    if partes == 1:
        return _gravar_trecho(pagina_html, largura, altura, 0, total, cor, mascara,
                              lambda feitos: reportar_quadros(feitos) if feitos % 30 == 0 else None)
    limites = [round(total * k / partes) for k in range(partes + 1)]
    arquivos = [(cor.with_name(f"{cor.stem}.{k}.mp4"), mascara.with_name(f"{mascara.stem}.{k}.mp4"))
                for k in range(partes)]
    contexto = multiprocessing.get_context("spawn")
    saida = contexto.Queue()
    contadores = [contexto.Value("i", 0) for _ in range(partes)]
    filhos = [contexto.Process(target=_trecho_no_processo, daemon=True,
                               args=(pagina_html, largura, altura, limites[k], limites[k + 1], str(arquivos[k][0]),
                                     str(arquivos[k][1]), contadores[k], saida))
              for k in range(partes)]
    try:
        for filho in filhos:
            filho.start()
        resultados = []
        while len(resultados) < partes:
            try:
                resultados.append(saida.get(timeout=2))
            except queue.Empty:
                if not any(filho.is_alive() for filho in filhos) and saida.empty():
                    raise RuntimeError("Um processo da gravação da legenda parou sem resposta.") from None
            reportar_quadros(sum(contador.value for contador in contadores))
        erro = next((texto for situacao, texto in resultados if situacao == "erro"), None)
        if erro:
            raise RuntimeError(f"A legenda não foi gravada: {erro}")
        _emendar([c for c, _ in arquivos], cor)
        _emendar([m for _, m in arquivos], mascara)
        return {"quadros": sum(r["quadros"] for _, r in resultados),
                "desenhados": sum(r["desenhados"] for _, r in resultados)}
    finally:
        for filho in filhos:
            if filho.is_alive():
                filho.terminate()
            filho.join(timeout=10)
        for par in arquivos:
            for arquivo in par:
                arquivo.unlink(missing_ok=True)


def executar_legenda_animada(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de a legenda ser gravada.")
    organizacao_id = midia["organizacao_id"]
    largura, altura = QUADROS[entrada["proporcao"]]
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    mascara = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_MASCARA))
    original.parent.mkdir(parents=True, exist_ok=True)
    parciais = [original.with_name("legenda.parcial.mp4"), mascara.with_name("mascara.parcial.mp4")]
    pagina = montar_pagina(entrada["blocos"], entrada["estilo"], entrada["proporcao"], entrada["duracao"],
                           entrada["cores"], entrada["posicao"], "/fontes", "/legendas")
    reportar(1, "Abrindo a legenda")
    try:
        resultado = gravar_legenda(pagina, largura, altura, entrada["duracao"], *parciais, reportar=reportar)
    except BaseException:
        for parcial in parciais:
            parcial.unlink(missing_ok=True)
        raise
    parciais[0].replace(original)
    parciais[1].replace(mascara)
    ingestao = montar_job("ingestao", organizacao_id, {"midia_id": str(midia_id)},
                          prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"))
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    momento = agora()
    atualizado = db.midias.update_one({"_id": midia_id}, {
        "$set": {"tamanho_total": original.stat().st_size, "bytes_recebidos": original.stat().st_size,
                 "job_ingestao_id": ingestao_id, "enviado_em": momento, "atualizado_em": momento,
                 "recorte_fundo": {"status": "pronta", "erro": None}},
        "$addToSet": {"arquivos": ARQUIVO_MASCARA},
    })
    if atualizado.matched_count == 0:
        db.jobs.delete_one({"_id": ingestao_id})
        raise ErroDefinitivo("A mídia foi excluída enquanto a legenda era gravada.")
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Legenda animada gravada: {resultado['quadros']} quadros, "
                 f"{resultado['desenhados']} desenhados; ingestão na fila.")
    reportar(100, "Legenda gravada")
    return {"midia_id": str(midia_id), **resultado}
