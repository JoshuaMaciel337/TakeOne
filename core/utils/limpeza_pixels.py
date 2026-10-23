# -----------------------------------------------
# TakeOne — limpeza das versões das camadas de pixels (editor de imagem, ADR 0003, decisão 2)
#
# Cada traço sobe uma versão nova (v<n>.png) e o clipe aponta a última; o desfazer volta o número, e as anteriores
# ficam no servidor. Uma versão que nenhum projeto nem modelo do espaço usa, com mais de 3 dias (a folga para o
# histórico de uma aba aberta), é apagada; a camada inteira sai quando nada mais a usa.
# -----------------------------------------------
import logging
from datetime import datetime, timedelta

from core.config import TZ
from core.modelos.midia import chave_arquivo, pasta_da_midia
from core.utils import storage

FOLGA = timedelta(days=3)


def versoes_em_uso(db, organizacao_id) -> dict[str, set[int]]:
    """As versões que cada camada de pixels mostra em algum projeto ou modelo do espaço."""
    usadas: dict[str, set[int]] = {}
    for colecao in (db.projetos, db.modelos):
        com_pixels = [{"faixas.clipes.pixels": {"$exists": True}}, {"faixas.clipes.mascara_pixels": {"$exists": True}}]
        filtro = {"organizacao_id": organizacao_id, "$or": com_pixels}
        for doc in colecao.find(filtro, {"faixas.clipes.midia_id": 1, "faixas.clipes.pixels": 1,
                                         "faixas.clipes.mascara_pixels": 1}):
            for faixa in doc.get("faixas", []):
                for clipe in faixa.get("clipes", []):
                    if clipe.get("pixels") and clipe.get("midia_id"):
                        usadas.setdefault(str(clipe["midia_id"]), set()).add(int(clipe["pixels"]["versao"]))
                    # A máscara de camada também é uma camada de pixels
                    if mascara := clipe.get("mascara_pixels"):
                        usadas.setdefault(str(mascara["midia_id"]), set()).add(int(mascara["versao"]))
    return usadas


def _modificado_em(caminho) -> datetime | None:
    try:
        return datetime.fromtimestamp(caminho.stat().st_mtime, TZ)
    except OSError:
        return None


def limpar_versoes(db, agora: datetime | None = None, apagar: bool = True) -> dict:
    """Apaga as versões sem uso há mais da folga (e as camadas sem uso nenhum). Com `apagar` falso, só conta."""
    agora = agora or datetime.now(TZ)
    limite = agora - FOLGA
    resumo = {"versoes": 0, "camadas": 0, "bytes": 0}
    por_espaco: dict = {}
    for midia in db.midias.find({"camada_pixels": {"$exists": True}}):
        espaco = midia["organizacao_id"]
        if espaco not in por_espaco:
            por_espaco[espaco] = versoes_em_uso(db, espaco)
        usadas = por_espaco[espaco].get(str(midia["_id"]), set())
        criada = midia.get("criado_em")
        if criada is not None and criada.tzinfo is None:
            criada = criada.replace(tzinfo=TZ)
        if not usadas and (criada is None or criada < limite):
            # Nenhum projeto usa a camada: sai inteira
            pasta = storage.caminho_local(pasta_da_midia(espaco, midia["_id"]))
            arquivos = [arquivo for arquivo in pasta.glob("*") if arquivo.is_file()] if pasta.is_dir() else []
            tamanho = sum(arquivo.stat().st_size for arquivo in arquivos)
            resumo["camadas"] += 1
            resumo["bytes"] += tamanho
            if apagar:
                storage.remover_pasta(pasta_da_midia(espaco, midia["_id"]))
                db.midias.delete_one({"_id": midia["_id"]})
            continue
        saem: list[str] = []
        for nome in midia.get("arquivos", []):
            if not (nome.startswith("v") and nome.endswith(".png") and nome[1:-4].isdigit()):
                continue
            if int(nome[1:-4]) in usadas:
                continue
            caminho = storage.caminho_local(chave_arquivo(espaco, midia["_id"], nome))
            momento = _modificado_em(caminho)
            if momento is not None and momento >= limite:
                continue
            saem.append(nome)
            resumo["bytes"] += caminho.stat().st_size if momento is not None else 0
            if apagar and momento is not None:
                caminho.unlink()
        resumo["versoes"] += len(saem)
        if apagar and saem:
            db.midias.update_one({"_id": midia["_id"]}, {"$pull": {"arquivos": {"$in": saem}}})
    if resumo["versoes"] or resumo["camadas"]:
        logging.info(f"Camadas de pixels: {resumo['versoes']} versões e {resumo['camadas']} camadas sem uso "
                     f"({resumo['bytes'] / 1e6:.1f} MB){' apagadas' if apagar else ''}")
    return resumo
