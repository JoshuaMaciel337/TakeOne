# -----------------------------------------------
# Tarefa "animacao_html" — grava uma animação em HTML (tarja, título, CTA...) num vídeo com transparência
#
# A página do modelo abre num Chromium sem tela (Playwright), servida por um servidor HTTP mínimo só neste
# processo (os módulos do Three.js não carregam de file://); o Chromium não fala com mais nada. Todas as
# animações CSS ficam pausadas e o relógio delas avança quadro a quadro (document.getAnimations); modelos
# em Canvas ou Three.js definem window.renderAt(t), chamado em cada quadro. A mesma página dá sempre os
# mesmos quadros. Cada quadro sai com o fundo transparente e vira dois vídeos, como no recorte do fundo: a cor
# (original.mp4, que o render usa) e a transparência (mascara.mp4, a mesma de clipe.remover_fundo). Antes de
# ir para o vídeo, a cor de cada borda é espalhada para os pixels transparentes em volta, para o H.264 não
# misturar preto nas beiradas das letras. Depois, a mídia segue para a ingestão como um envio comum.
# -----------------------------------------------
import logging
import subprocess
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import cv2
import numpy as np
from bson import ObjectId

from core.config import FFMPEG
from core.modelos.animacao_html import (
    ARQUIVOS_COMUNS,
    FPS,
    PASTA_FONTES,
    PASTA_MODELOS,
    QUADROS,
    montar_html,
    quadros_da_animacao,
)
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import ARQUIVO_MASCARA, PRIORIDADE_INGESTAO, STATUS_ERRO, chave_arquivo
from core.utils import storage
from core.utils.ffmpeg import MARCAS_BT709
from core.utils.mongo import agora

# Pausa todas as animações CSS no instante pedido (ms) e desenha o quadro dos modelos em Canvas (s)
_IR_PARA = """async t => {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; }
  if (typeof window.renderAt === "function") await window.renderAt(t / 1000);
  // Espera dois quadros de tela: as animações de opacidade e posição rodam noutra linha do Chrome
  await new Promise((pronto) => requestAnimationFrame(() => requestAnimationFrame(pronto)));
}"""
# Antes do 1º quadro: as fontes, o que o comum.js pediu e o que o modelo disser que falta (prontoParaGravar)
_ESPERAR = """() => Promise.all([document.fonts.ready, window.TO ? window.TO.carregado : null,
  window.prontoParaGravar || null]).then(() => typeof window.renderAt)"""
FONTES = {"Inter[opsz,wght].ttf", "Montserrat[wght].ttf", "Caveat[wght].ttf"}
TIPOS = {".js": "text/javascript; charset=utf-8", ".ttf": "font/ttf", ".html": "text/html; charset=utf-8"}


class _Servidor:
    """Serve a página da animação, as fontes e os arquivos comuns (comum.js, vendor/) em 127.0.0.1."""

    def __init__(self, pagina_html: str):
        pagina = pagina_html.encode("utf-8")

        class Atendente(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802 (nome do http.server)
                caminho = unquote(urlparse(self.path).path)
                if caminho == "/pagina.html":
                    self._enviar(pagina, TIPOS[".html"])
                elif caminho.startswith("/fontes/") and caminho[8:] in FONTES:
                    self._enviar((PASTA_FONTES / caminho[8:]).read_bytes(), TIPOS[".ttf"])
                elif caminho.startswith("/animacoes/") and ARQUIVOS_COMUNS.fullmatch(caminho[11:]):
                    self._enviar((PASTA_MODELOS / caminho[11:]).read_bytes(), TIPOS[".js"])
                else:
                    self.send_error(404)

            def _enviar(self, dados: bytes, tipo: str):
                self.send_response(200)
                self.send_header("Content-Type", tipo)
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

            def log_message(self, *_):
                pass

        self.http = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self.origem = f"http://127.0.0.1:{self.http.server_address[1]}"
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

    def fechar(self):
        self.http.shutdown()
        self.http.server_close()


def abrir_navegador():
    """(playwright, Chromium) para gravar animações. WebGL em software (SwiftShader), porque o worker não tem
    placa de vídeo; o Canvas 2D fica na CPU (o Skia direto é bem mais rápido que passando pelo SwiftShader)."""
    from playwright.sync_api import sync_playwright

    playwright = sync_playwright().start()
    navegador = playwright.chromium.launch(args=["--font-render-hinting=none", "--use-angle=swiftshader",
                                                 "--enable-unsafe-swiftshader", "--disable-accelerated-2d-canvas"])
    return playwright, navegador


class Estudio:
    """Abre a página de uma animação e devolve qualquer quadro dela (BGRA, fundo transparente).
    Uso: with Estudio(pagina, largura, altura) as estudio: quadro = estudio.quadro(1.5)"""

    def __init__(self, pagina_html: str, largura: int, altura: int, navegador=None):
        """navegador: um Chromium já aberto (os testes abrem um para todos os modelos); sem ele, abre e fecha."""
        self.pagina_html, self.largura, self.altura = pagina_html, largura, altura
        self._emprestado = navegador
        self.navegador = navegador
        self._playwright = self.servidor = self.pagina = None

    def __enter__(self):
        self.servidor = _Servidor(self.pagina_html)
        try:
            if self.navegador is None:
                self._playwright, self.navegador = abrir_navegador()
            self.pagina = self.navegador.new_page(viewport={"width": self.largura, "height": self.altura},
                                                  device_scale_factor=1)
            origem = self.servidor.origem
            self.pagina.route("**/*", lambda rota: rota.continue_() if rota.request.url.startswith(origem)
                              else rota.abort())
            erros: list[str] = []
            self.pagina.on("pageerror", lambda erro: erros.append(str(erro)))
            self.pagina.goto(f"{origem}/pagina.html", wait_until="load")
            self.motor = self.pagina.evaluate(_ESPERAR)
            if erros:
                raise ErroDefinitivo(f"A animação tem um erro de script: {erros[0][:200]}")
        except BaseException:
            self.__exit__(None, None, None)
            raise
        return self

    def quadro(self, segundos: float) -> np.ndarray:
        self.pagina.evaluate(_IR_PARA, segundos * 1000)
        png = self.pagina.screenshot(type="png", omit_background=True, animations="allow")
        quadro = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED)
        if quadro is None or quadro.shape[2] != 4:
            raise ErroDefinitivo("O navegador não devolveu o quadro com transparência.")
        return quadro

    def __exit__(self, *_):
        navegador = None if self._emprestado else self.navegador
        for coisa, fechar in ((self.pagina, "close"), (navegador, "close"), (self._playwright, "stop"),
                              (self.servidor, "fechar")):
            if coisa is not None:
                try:
                    getattr(coisa, fechar)()
                except Exception:  # noqa: BLE001 (fechar o que abriu, mesmo que algo já tenha caído)
                    logging.debug("Falha ao fechar o estúdio da animação", exc_info=True)


def marcar_animacao_com_erro(db, job: dict, mensagem: str):
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {
            "status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora(),
        }})


def espalhar_cor(quadro_bgra: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(cor em RGB, alfa) de um quadro com fundo transparente. Onde o alfa é parcial ou zero, a cor vira a
    média da cor vizinha pesada pelo alfa: as bordas não escurecem quando o vídeo perde resolução de cor."""
    altura, largura = quadro_bgra.shape[:2]
    rgb = np.zeros((altura, largura, 3), np.uint8)
    visivel = cv2.findNonZero(quadro_bgra[:, :, 3])
    if visivel is None:
        return rgb, quadro_bgra[:, :, 3]
    # Só a região em volta do que aparece, com folga; a média da vizinha sai numa cópia 4 vezes menor
    x, y, w, h = cv2.boundingRect(visivel)
    x0, y0 = max(0, x - 32), max(0, y - 32)
    x1, y1 = min(largura, x + w + 32), min(altura, y + h + 32)
    trecho = quadro_bgra[y0:y1, x0:x1]
    alfa = trecho[:, :, 3].astype(np.float32) / 255
    pre = trecho[:, :, 2::-1].astype(np.float32) * alfa[:, :, None]
    menor = (max(1, (x1 - x0) // 4), max(1, (y1 - y0) // 4))
    soma = cv2.blur(cv2.resize(pre, menor, interpolation=cv2.INTER_AREA), (5, 5))
    peso = cv2.blur(cv2.resize(alfa, menor, interpolation=cv2.INTER_AREA), (5, 5))
    vizinha = cv2.resize(soma / np.maximum(peso, 1e-4)[:, :, None], (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)
    saida = pre + vizinha * (1 - alfa[:, :, None])
    rgb[y0:y1, x0:x1] = np.clip(np.round(saida), 0, 255).astype(np.uint8)
    return rgb, quadro_bgra[:, :, 3]


def _escritor(largura: int, altura: int, pix_fmt: str, destino: Path, extras: list[str]) -> subprocess.Popen:
    return subprocess.Popen([FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix_fmt,
                             "-s", f"{largura}x{altura}", "-framerate", str(FPS), "-i", "-", *extras,
                             "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p",
                             "-g", str(FPS * 2), "-movflags", "+faststart", str(destino)], stdin=subprocess.PIPE)


def gravar_animacao(pagina_html: str, largura: int, altura: int, duracao: float, cor: Path, mascara: Path,
                    reportar: Callable[[int, str], None] = lambda *_: None) -> int:
    """Grava a página (montada com as bases /fontes e /animacoes) nos dois vídeos e devolve quantos
    quadros saíram. Animação que não mostra nada é recusada."""
    total = quadros_da_animacao(duracao)
    escritor_cor = _escritor(largura, altura, "rgb24", cor,
                             ["-vf", "scale=out_color_matrix=bt709:out_range=tv", *MARCAS_BT709])
    escritor_alfa = _escritor(largura, altura, "gray", mascara, ["-color_range", "tv"])
    feitos = 0
    visivel = False
    try:
        with Estudio(pagina_html, largura, altura) as estudio:
            for indice in range(total):
                rgb, alfa = espalhar_cor(estudio.quadro(indice / FPS))
                visivel = visivel or bool(alfa.any())
                escritor_cor.stdin.write(rgb.tobytes())
                escritor_alfa.stdin.write(alfa.tobytes())
                feitos += 1
                if feitos % 15 == 0:
                    reportar(min(95, 2 + int(93 * feitos / total)), "Gravando a animação")
    finally:
        for escritor in (escritor_cor, escritor_alfa):
            escritor.stdin.close()
        codigos = [escritor_cor.wait(timeout=600), escritor_alfa.wait(timeout=600)]
    if any(codigos) or feitos < total:
        raise RuntimeError("O vídeo da animação não foi gravado.")
    if not visivel:
        raise ErroDefinitivo("A animação saiu vazia: nada apareceu no quadro. Tente descrever de outro jeito.")
    return feitos


def executar_animacao_html(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de a animação ser gravada.")
    organizacao_id = midia["organizacao_id"]
    largura, altura = QUADROS[entrada["proporcao"]]
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    mascara = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, ARQUIVO_MASCARA))
    original.parent.mkdir(parents=True, exist_ok=True)
    parciais = [original.with_name("animacao.parcial.mp4"), mascara.with_name("mascara.parcial.mp4")]
    pagina = montar_html(entrada["modelo"], entrada["campos"], entrada["duracao"], entrada["proporcao"],
                         "/fontes", "/animacoes")
    reportar(1, "Abrindo a animação")
    try:
        feitos = gravar_animacao(pagina, largura, altura, entrada["duracao"], *parciais, reportar=reportar)
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
    resultado = db.midias.update_one({"_id": midia_id}, {
        "$set": {"tamanho_total": original.stat().st_size, "bytes_recebidos": original.stat().st_size,
                 "job_ingestao_id": ingestao_id, "enviado_em": momento, "atualizado_em": momento,
                 # A transparência já está pronta: o clipe usa o mesmo caminho do recorte do fundo
                 "recorte_fundo": {"status": "pronta", "erro": None}},
        "$addToSet": {"arquivos": ARQUIVO_MASCARA},
    })
    if resultado.matched_count == 0:
        db.jobs.delete_one({"_id": ingestao_id})
        raise ErroDefinitivo("A mídia foi excluída enquanto a animação era gravada.")
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Animação gravada: {feitos} quadros; ingestão na fila.")
    reportar(100, "Animação gravada")
    return {"midia_id": str(midia_id), "quadros": feitos}
