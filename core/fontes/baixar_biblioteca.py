"""Baixa a biblioteca de fontes livres (core/fontes/biblioteca.json) do google/fonts, no commit fixo do manifesto.

Cada arquivo confere com o SHA-256 do manifesto (um arquivo diferente para a construção da imagem). Roda na construção
das imagens da API e do worker; o que já está na pasta e confere não é baixado de novo.

    python core/fontes/baixar_biblioteca.py --destino /app/fontes-biblioteca
"""
import argparse
import hashlib
import json
import logging
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PADRAO_MANIFESTO = Path(__file__).with_name("biblioteca.json")


def baixar(url: str) -> bytes:
    for tentativa in range(5):
        try:
            requisicao = urllib.request.Request(url, headers={"User-Agent": "takeone-fontes"})
            with urllib.request.urlopen(requisicao, timeout=120) as resposta:
                return resposta.read()
        except OSError as erro:
            logging.warning("De novo (%s): %s", erro, url)
            time.sleep(2 + 3 * tentativa)
    raise SystemExit(f"Não foi possível baixar {url}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    argumentos = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    argumentos.add_argument("--manifesto", type=Path, default=PADRAO_MANIFESTO)
    argumentos.add_argument("--destino", type=Path, required=True)
    opcoes = argumentos.parse_args()
    manifesto = json.loads(opcoes.manifesto.read_text(encoding="utf-8"))
    base = f"https://raw.githubusercontent.com/google/fonts/{manifesto['commit']}"
    opcoes.destino.mkdir(parents=True, exist_ok=True)
    pedidos = []
    for familia in manifesto["familias"]:
        pedidos += [(arquivo["caminho"], arquivo["arquivo"], arquivo["sha256"]) for arquivo in familia["arquivos"]]
        licenca = familia.get("arquivo_da_licenca")
        if licenca:
            pedidos.append((licenca["caminho"], f"LICENCA-{familia['id']}.txt", licenca["sha256"]))

    def um(pedido: tuple[str, str, str]) -> None:
        caminho, nome, sha = pedido
        alvo = opcoes.destino / nome
        if alvo.is_file() and hashlib.sha256(alvo.read_bytes()).hexdigest() == sha:
            return
        dados = baixar(f"{base}/{caminho}")
        if hashlib.sha256(dados).hexdigest() != sha:
            raise SystemExit(f"O arquivo {caminho} não confere com o manifesto.")
        alvo.write_bytes(dados)

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(um, pedidos))
    logging.info("Biblioteca de fontes pronta: %d arquivos em %s", len(pedidos), opcoes.destino)


if __name__ == "__main__":
    main()
