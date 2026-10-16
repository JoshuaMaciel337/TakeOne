# -----------------------------------------------
# Miniaturas da biblioteca de animações: um quadro de cada modelo (16:9, no ponto mais cheio da animação)
# sobre um fundo escuro, em apps/web/public/animacoes/<id>.webp, para o painel do editor.
#
# Roda dentro da imagem do worker (que tem o Chromium), com a pasta do projeto montada:
#   docker run --rm -v "$PWD:/repo" -w /repo -e PYTHONPATH=/repo:/repo/apps takeone/worker:local \
#     python apps/worker/miniaturas_animacoes.py --agora
# Sem --todas, só gera as que faltam.
# -----------------------------------------------
import argparse
import logging
from pathlib import Path

import cv2
import numpy as np

from core.modelos.animacao_html import MODELOS, QUADROS, montar_html
from worker.tarefas.animacao_html import Estudio, abrir_navegador

PASTA = Path(__file__).resolve().parents[1] / "web" / "public" / "animacoes"
TAMANHO = (480, 270)


def fundo(largura: int, altura: int) -> np.ndarray:
    """Um degradê escuro com um pouco de cor, como uma foto de fundo apagada."""
    y, x = np.mgrid[0:altura, 0:largura].astype(np.float32)
    k = (x / largura * 0.6 + y / altura * 0.4)[:, :, None]
    escuro, roxo = np.array([18, 14, 12], np.float32), np.array([60, 28, 48], np.float32)
    return escuro * (1 - k) + roxo * k


def gerar(modelo: str, navegador) -> np.ndarray:
    largura, altura = QUADROS["16:9"]
    dur = MODELOS[modelo]["duracao"]
    with Estudio(montar_html(modelo, {}, dur, "16:9", "/fontes", "/animacoes"), largura, altura, navegador) as estudio:
        # O quadro com mais coisa aparecendo, entre 35% e 75% da animação
        quadros = [estudio.quadro(dur * frac) for frac in (0.35, 0.5, 0.62, 0.75)]
    quadro = max(quadros, key=lambda q: int(q[:, :, 3].astype(np.int64).sum()))
    a = quadro[:, :, 3:4].astype(np.float32) / 255
    imagem = quadro[:, :, :3].astype(np.float32) * a + fundo(largura, altura) * (1 - a)
    return cv2.resize(imagem.astype(np.uint8), TAMANHO, interpolation=cv2.INTER_AREA)


def main():
    parser = argparse.ArgumentParser(description="Gera as miniaturas da biblioteca de animações.")
    parser.add_argument("--agora", action="store_true", help="gera já (o padrão; existe pelo costume dos scripts)")
    parser.add_argument("--automatico", action="store_true", help="sem perguntas (o script não pergunta nada)")
    parser.add_argument("--todas", action="store_true", help="refaz também as que já existem")
    parser.add_argument("modelos", nargs="*", help="só estes modelos")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    PASTA.mkdir(parents=True, exist_ok=True)
    alvo = args.modelos or sorted(MODELOS)
    faltam = [m for m in alvo if args.todas or args.modelos or not (PASTA / f"{m}.webp").exists()]
    playwright, navegador = abrir_navegador()
    try:
        for modelo in faltam:
            cv2.imwrite(str(PASTA / f"{modelo}.webp"), gerar(modelo, navegador), [cv2.IMWRITE_WEBP_QUALITY, 82])
            logging.info(f"Miniatura de {modelo} pronta.")
    finally:
        navegador.close()
        playwright.stop()
    # Miniatura de modelo que não existe mais sai junto
    for sobra in PASTA.glob("*.webp"):
        if sobra.stem not in MODELOS:
            sobra.unlink()
            logging.info(f"Miniatura de {sobra.stem} apagada (o modelo saiu da biblioteca).")


if __name__ == "__main__":
    main()
