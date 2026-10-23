# -----------------------------------------------
# TakeOne — apaga as versões das camadas de pixels que nenhum projeto usa (core/utils/limpeza_pixels.py)
#
#   docker compose exec worker-cpu python apps/worker/limpar_pixels.py --agora
#
# Sem --agora, só conta o que apagaria. O agendador do backup roda a limpeza todo dia, depois do backup.
# -----------------------------------------------
import argparse
import logging

from core.utils.limpeza_pixels import limpar_versoes
from core.utils.mongo import conectar

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.StreamHandler()])


def main():
    parser = argparse.ArgumentParser(description="Apaga as versões das camadas de pixels sem uso há mais de 3 dias.")
    parser.add_argument("--agora", action="store_true", help="apaga (sem ele, só conta)")
    parser.add_argument("--automatico", action="store_true", help="sem perguntas (o script não pergunta nada)")
    args = parser.parse_args()
    db = conectar()
    if db is None:
        return
    resumo = limpar_versoes(db, apagar=args.agora)
    feito = "Apagadas" if args.agora else "Sairiam"
    logging.info(f"{feito}: {resumo['versoes']} versões e {resumo['camadas']} camadas ({resumo['bytes'] / 1e6:.1f} MB)")
    db.client.close()


if __name__ == "__main__":
    main()
