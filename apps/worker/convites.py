# -----------------------------------------------
# TakeOne — convites para o cadastro (core/utils/convites.py)
#
#   docker compose exec worker-cpu python worker/convites.py --agora --nota "Ana" --usos 1 --dias 14
#   docker compose exec worker-cpu python worker/convites.py --listar
#   docker compose exec worker-cpu python worker/convites.py --agora --revogar ABC
#
# Sem --agora, só mostra o que faria. O código aparece uma vez: o banco guarda o hash.
# -----------------------------------------------
import argparse
import logging
import os

from core.utils import convites
from core.utils.mongo import conectar

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.StreamHandler()])


def listar(db):
    for convite in db.convites.find().sort("criado_em", -1):
        situacao = "revogado" if convite["revogado"] else f"{convite['usos']} de {convite['usos_max']} usos"
        logging.info(f"{convite['inicio']}…  {convite['nota'] or '-'}  {situacao}  "
                     f"vence {convite['expira_em']:%d/%m/%Y %H:%M}")


def main():
    parser = argparse.ArgumentParser(description="Cria, lista e revoga os convites do cadastro.")
    parser.add_argument("--agora", action="store_true", help="grava (sem ele, só mostra o que faria)")
    parser.add_argument("--automatico", action="store_true", help="sem perguntas (o script não pergunta nada)")
    parser.add_argument("--nota", default="", help="para quem é o convite (só para a lista)")
    parser.add_argument("--usos", type=int, default=1, help="quantas contas o convite cria (padrão 1)")
    parser.add_argument("--dias", type=int, default=14, help="dias até vencer (padrão 14)")
    parser.add_argument("--listar", action="store_true", help="lista os convites")
    parser.add_argument("--revogar", metavar="INICIO", help="revoga o convite que começa com estas letras")
    args = parser.parse_args()
    if not 1 <= args.usos <= 100 or not 1 <= args.dias <= 365:
        parser.error("use de 1 a 100 usos e de 1 a 365 dias")

    db = conectar()
    if db is None:
        return
    if args.listar:
        listar(db)
    elif args.revogar:
        filtro = {"inicio": args.revogar.upper()[:3], "revogado": False}
        quantos = db.convites.count_documents(filtro)
        if quantos != 1:
            logging.error(f"{quantos} convites ativos começam com {args.revogar[:3]}: nada revogado.")
        elif args.agora:
            db.convites.update_one(filtro, {"$set": {"revogado": True}})
            logging.info("Convite revogado.")
        else:
            logging.info("Revogaria 1 convite (rode com --agora).")
    elif not args.agora:
        logging.info(f"Criaria um convite de {args.usos} uso(s) por {args.dias} dias (rode com --agora).")
    else:
        codigo, documento = convites.novo_convite(args.nota, args.usos, args.dias)
        db.convites.insert_one(documento)
        site = os.environ.get("SITE_PUBLICO", "").rstrip("/")
        logging.info(f"Convite criado: {codigo} ({args.usos} uso(s), vence em {args.dias} dias)")
        if site:
            logging.info(f"Link: {site}/cadastro?convite={codigo}")
    db.client.close()


if __name__ == "__main__":
    main()
