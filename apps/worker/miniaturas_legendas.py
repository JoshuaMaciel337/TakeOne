# -----------------------------------------------
# Miniaturas da biblioteca de legendas animadas (14.11): a frase de exemplo de cada estilo num quadro 1:1, no
# instante com mais coisa na tela, sobre o fundo escuro das miniaturas de animações, em
# apps/web/public/legendas/<id>.webp, para o seletor do editor e do Clipar.
#
# Roda dentro da imagem do worker (que tem o Chromium e as fontes), com a pasta do projeto montada:
#   docker run --rm -v "$PWD:/repo" -w /repo -e PYTHONPATH=/repo:/repo/apps takeone/worker:local \
#     python apps/worker/miniaturas_legendas.py --agora
# Sem --todas, só gera as que faltam.
# -----------------------------------------------
import argparse
import logging
from pathlib import Path

import cv2
import numpy as np

from core.modelos.animacao_html import QUADROS
from core.modelos.legenda_animada import ESTILOS, blocos_da_fala, conferir_palavras, montar_pagina
from worker.miniaturas_animacoes import fundo
from worker.tarefas.animacao_html import Estudio, abrir_navegador
from worker.tarefas.legenda_animada import arquivos_da_pagina

PASTA = Path(__file__).resolve().parents[1] / "web" / "public" / "legendas"
TAMANHO = (240, 240)
# Uma frase só (um bloco nos estilos de frase), com um número, um conectivo e duas ênfases
FRASE = "Em 30 dias mudei a minha rotina"
ENFASE = {"rotina", "30"}
INSTANTES = (1.1, 1.5, 1.9, 2.3)


def gerar(estilo: str, navegador) -> np.ndarray:
    palavras, t = [], 0.1
    for texto in FRASE.split():
        palavras.append({"texto": texto, "inicio": round(t, 2), "fim": round(t + 0.26, 2), "enfase": texto in ENFASE})
        t += 0.3
    duracao = 3.0
    blocos = blocos_da_fala(conferir_palavras(palavras, duracao), estilo, duracao)
    largura, altura = QUADROS["1:1"]
    pagina = montar_pagina(blocos, estilo, "1:1", duracao, {}, 0.5, "/fontes", "/legendas")
    with Estudio(pagina, largura, altura, navegador, extras=arquivos_da_pagina()) as estudio:
        quadros = [estudio.quadro(t) for t in INSTANTES]
    # Nos estilos de uma palavra por vez, a maior palavra; nos outros, a frase mais inteira
    quadro = max(quadros, key=lambda q: int(q[:, :, 3].astype(np.int64).sum()))
    a = quadro[:, :, 3:4].astype(np.float32) / 255
    imagem = quadro[:, :, :3].astype(np.float32) * a + fundo(largura, altura) * (1 - a)
    # O texto ocupa o meio: a miniatura corta as margens para ele aparecer maior
    margem = largura // 8
    imagem = imagem[margem:altura - margem, margem:largura - margem]
    return cv2.resize(imagem.astype(np.uint8), TAMANHO, interpolation=cv2.INTER_AREA)


def main():
    parser = argparse.ArgumentParser(description="Gera as miniaturas da biblioteca de legendas animadas.")
    parser.add_argument("--agora", action="store_true", help="gera já (o padrão; existe pelo costume dos scripts)")
    parser.add_argument("--automatico", action="store_true", help="sem perguntas (o script não pergunta nada)")
    parser.add_argument("--todas", action="store_true", help="refaz também as que já existem")
    parser.add_argument("estilos", nargs="*", help="só estes estilos")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    PASTA.mkdir(parents=True, exist_ok=True)
    alvo = args.estilos or list(ESTILOS)
    faltam = [e for e in alvo if args.todas or args.estilos or not (PASTA / f"{e}.webp").exists()]
    playwright, navegador = abrir_navegador()
    try:
        for estilo in faltam:
            cv2.imwrite(str(PASTA / f"{estilo}.webp"), gerar(estilo, navegador), [cv2.IMWRITE_WEBP_QUALITY, 85])
            logging.info(f"Miniatura de {estilo} pronta.")
    finally:
        navegador.close()
        playwright.stop()
    for sobra in PASTA.glob("*.webp"):
        if sobra.stem not in ESTILOS:
            sobra.unlink()
            logging.info(f"Miniatura de {sobra.stem} apagada (o estilo saiu da biblioteca).")


if __name__ == "__main__":
    main()
