# -----------------------------------------------
# Mede o loudness (LUFS) das mídias com som que ficaram sem ele. Até 22/10/2026 a ingestão perdia o resumo
# do ebur128 em todo vídeo com som (ele saía antes das estatísticas do libx264, fora das últimas linhas
# guardadas), e o "Igualar o volume" ficava desligado nessas mídias. A conta é a da ingestão: o original,
# em estéreo a 48 kHz, pelo FILTRO_MEDIR_LOUDNESS.
#
# Roda dentro da imagem do worker, com o banco e o armazenamento do Compose:
#   docker compose exec worker-cpu python apps/worker/medir_loudness.py --agora
# Sem --agora, só lista o que mediria.
# -----------------------------------------------
import argparse
import logging

from core.modelos.midia import ARQUIVO_PROXY_AUDIO, ARQUIVO_PROXY_VIDEO, chave_arquivo
from core.utils import storage
from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg
from core.utils.mongo import conectar
from core.utils.render import ler_loudness
from core.utils.som import FILTRO_MEDIR_LOUDNESS


def arquivo_para_medir(midia: dict):
    """O original, ou a cópia leve se o original não estiver mais no armazenamento."""
    for nome in (midia.get("original"), ARQUIVO_PROXY_VIDEO, ARQUIVO_PROXY_AUDIO):
        if not nome:
            continue
        caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], nome))
        if caminho.is_file():
            return caminho
    return None


def main():
    parser = argparse.ArgumentParser(description="Mede o loudness das mídias com som que ficaram sem ele.")
    parser.add_argument("--agora", action="store_true", help="mede e grava (sem ele, só lista)")
    parser.add_argument("--automatico", action="store_true", help="sem perguntas (o script não pergunta nada)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    db = conectar()
    if db is None:
        raise SystemExit(1)
    filtro = {"status": "pronta", "audio": {"$ne": None}, "audio.lufs": None}
    medidas = falhas = 0
    for midia in db.midias.find(filtro):
        caminho = arquivo_para_medir(midia)
        if caminho is None:
            logging.warning(f"[midia {midia['_id']}] sem arquivo para medir")
            falhas += 1
            continue
        if not args.agora:
            logging.info(f"[midia {midia['_id']}] mediria {caminho.name}")
            continue
        try:
            saida = executar_ffmpeg(["-i", str(caminho), "-map", "0:a:0", "-vn", "-af", FILTRO_MEDIR_LOUDNESS,
                                     "-f", "null", "-"])
        except ErroFFmpeg as erro:
            logging.warning(f"[midia {midia['_id']}] FFmpeg falhou: {erro}")
            falhas += 1
            continue
        lufs = ler_loudness(saida)
        # Silêncio total dá -inf: fica None, como na ingestão
        db.midias.update_one({"_id": midia["_id"]}, {"$set": {"audio.lufs": lufs}})
        logging.info(f"[midia {midia['_id']}] {lufs} LUFS")
        medidas += 1
    logging.info(f"Fim: {medidas} medida(s), {falhas} falha(s).")


if __name__ == "__main__":
    main()
