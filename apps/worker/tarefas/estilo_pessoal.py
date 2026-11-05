# -----------------------------------------------
# Tarefas "ensinar_estilo" e "aplicar_estilo_pessoal" — o estilo pessoal das fotos do álbum (onda 16.7, ADR 0006)
#
# Ensinar guarda um par por foto (estilo_pessoal_pares): o vetor e a luz medidos (fotos_medidas), o "Melhorar" da
# foto (core/utils/melhorar.py) e a cor final, que vem da edição da foto no álbum ou do .xmp de outro programa ao
# lado da foto importada "no lugar". Depois treina: até 300 pares, os vizinhos mais parecidos (nada a treinar); a
# partir de 300, o gradient boosting (core/modelos/estilo_pessoal.py), guardado no armazenamento. Aplicar prevê a
# cor de cada foto, troca a cor da edição dela (o giro e o recorte ficam) e desenha as fotos (editar_album).
# -----------------------------------------------
import logging
import pickle
from collections.abc import Callable

import numpy as np
from bson import Binary, ObjectId

from core.modelos.estilo_pessoal import MINIMO_PARA_O_BOOSTING, Boosting, Par, boosting_disponivel, cor_prevista
from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_PROXY_IMAGEM, chave_arquivo
from core.modelos.xmp import cor_do_xmp
from core.utils import storage
from core.utils.fotos_no_lugar import CaminhoInvalido, caminho_do_original
from core.utils.medir_foto import VERSAO_DAS_MEDIDAS, medir
from core.utils.melhorar import ajustes_automaticos, amostra
from core.utils.mongo import agora
from worker.tarefas.editar_album import executar_editar_album
from worker.tarefas.medir_album import modelos

BYTES_DO_XMP = 2 * 1024 * 1024


def chave_do_modelo(organizacao_id, estilo_id) -> str:
    return f"org_{organizacao_id}/estilos_pessoais/{estilo_id}/modelo.pkl"


def _proxy(midia: dict):
    import cv2

    caminho = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], ARQUIVO_PROXY_IMAGEM))
    bgr = cv2.imread(str(caminho), cv2.IMREAD_COLOR) if caminho.is_file() else None
    return None if bgr is None else cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def _medidas(db, midia: dict, rgb) -> dict:
    """As medidas da foto (o vetor e a luz); mede agora se ainda não foi medida."""
    guardadas = db.fotos_medidas.find_one({"midia_id": midia["_id"], "versao": VERSAO_DAS_MEDIDAS})
    if guardadas is None:
        import cv2

        lidas, vetor, pessoas = medir(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), modelos())
        guardadas = {**lidas, "midia_id": midia["_id"], "organizacao_id": midia["organizacao_id"],
                     "vetor": Binary(vetor.astype(np.float16).tobytes()),
                     "pessoas": Binary(pessoas.astype(np.float16).tobytes()), "medido_em": agora()}
        db.fotos_medidas.update_one({"midia_id": midia["_id"]}, {"$set": guardadas}, upsert=True)
    exposicao = guardadas["exposicao"]
    return {"vetor": np.frombuffer(bytes(guardadas["vetor"]), np.float16).astype(np.float32),
            "luz": (exposicao["mediana"], exposicao["estourado"], exposicao["afogado"])}


def cor_do_xmp_ao_lado(midia: dict) -> dict | None:
    """A cor do .xmp ao lado da foto importada no lugar (IMG_1.xmp ou IMG_1.CR3.xmp), se houver."""
    if not midia.get("externo"):
        return None
    try:
        original = caminho_do_original(midia)
    except CaminhoInvalido:
        return None
    candidatos = (original.with_suffix(".xmp"), original.with_suffix(".XMP"),
                  original.with_name(original.name + ".xmp"))
    for candidato in candidatos:
        if candidato.is_file() and candidato.stat().st_size <= BYTES_DO_XMP:
            try:
                return cor_do_xmp(candidato.read_text(encoding="utf-8", errors="replace"))
            except ValueError:
                return None
    return None


def _pares(db, estilo_id) -> list[Par]:
    return [Par(str(p["midia_id"]), np.frombuffer(bytes(p["vetor"]), np.float16).astype(np.float32),
                tuple(p["luz"]), p["melhorado"], p["cor"])
            for p in db.estilo_pessoal_pares.find({"estilo_id": estilo_id})]


def treinar(db, estilo: dict) -> dict:
    """O modelo do estilo pelos pares que ele tem: os vizinhos, ou o boosting a partir de 300 pares."""
    pares = _pares(db, estilo["_id"])
    chave = chave_do_modelo(estilo["organizacao_id"], estilo["_id"])
    if len(pares) >= MINIMO_PARA_O_BOOSTING and boosting_disponivel():
        storage.salvar_bytes(chave, pickle.dumps(Boosting.treinar(pares)))
        modelo = {"tipo": "boosting", "pares": len(pares), "treinado_em": agora()}
    else:
        storage.remover(chave)
        modelo = {"tipo": "vizinhos", "pares": len(pares), "treinado_em": agora()}
    db.estilos_pessoais.update_one({"_id": estilo["_id"]}, {"$set": {"pares": len(pares), "modelo": modelo}})
    return modelo


def executar_ensinar_estilo(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    estilo = db.estilos_pessoais.find_one({"_id": ObjectId(entrada["estilo_id"])})
    if estilo is None:
        raise ErroDefinitivo("O estilo pessoal foi excluído.")
    album_id = ObjectId(entrada["album_id"])
    ids = [ObjectId(i) for i in entrada["midia_ids"]]
    fotos = {f["midia_id"]: f for f in db.album_fotos.find({"album_id": album_id, "midia_id": {"$in": ids}})}
    midias = list(db.midias.find({"_id": {"$in": list(fotos)}, "organizacao_id": estilo["organizacao_id"]}))
    ensinadas = sem_edicao = 0
    for numero, midia in enumerate(midias):
        if entrada.get("origem") == "xmp":
            cor = cor_do_xmp_ao_lado(midia)
        else:
            cor = ((fotos[midia["_id"]].get("edicao") or {}).get("cor"))
        rgb = _proxy(midia) if cor else None
        if not cor or rgb is None:
            sem_edicao += 1
            continue
        medidas = _medidas(db, midia, rgb)
        db.estilo_pessoal_pares.update_one({"estilo_id": estilo["_id"], "midia_id": midia["_id"]}, {"$set": {
            "organizacao_id": estilo["organizacao_id"], "vetor": Binary(medidas["vetor"].astype(np.float16).tobytes()),
            "luz": list(medidas["luz"]), "melhorado": ajustes_automaticos(amostra(rgb)), "cor": cor,
            "origem": entrada.get("origem", "takeone"), "criado_em": agora()}}, upsert=True)
        ensinadas += 1
        if numero % 5 == 0:
            reportar(2 + int(80 * (numero + 1) / max(1, len(midias))), f"Ensinando {numero + 1} de {len(midias)}")
    reportar(85, "Treinando")
    modelo = treinar(db, estilo)
    logging.info(f"[estilo {estilo['_id']}] {ensinadas} pares novos ({sem_edicao} sem edição); {modelo['tipo']}, "
                 f"{modelo['pares']} pares.")
    return {"album_id": str(album_id), "estilo_id": str(estilo["_id"]), "ensinadas": ensinadas,
            "sem_edicao": sem_edicao, "modelo": modelo["tipo"], "pares": modelo["pares"]}


def executar_aplicar_estilo_pessoal(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    estilo = db.estilos_pessoais.find_one({"_id": ObjectId(entrada["estilo_id"])})
    if estilo is None:
        raise ErroDefinitivo("O estilo pessoal foi excluído.")
    pares = _pares(db, estilo["_id"])
    if not pares:
        raise ErroDefinitivo("O estilo pessoal ainda não aprendeu nada: ensine com fotos editadas antes.")
    boosting = None
    if (estilo.get("modelo") or {}).get("tipo") == "boosting":
        caminho = storage.caminho_local(chave_do_modelo(estilo["organizacao_id"], estilo["_id"]))
        if caminho.is_file():
            boosting = pickle.loads(caminho.read_bytes())  # noqa: S301 — o arquivo é o que o próprio worker gravou
    album_id = ObjectId(entrada["album_id"])
    intensidade = float(entrada.get("intensidade", 1))
    ids = [ObjectId(i) for i in entrada["midia_ids"]]
    midias = list(db.midias.find({"_id": {"$in": ids}, "organizacao_id": estilo["organizacao_id"]}))
    feitas = 0
    for numero, midia in enumerate(midias):
        rgb = _proxy(midia)
        if rgb is None:
            continue
        medidas = _medidas(db, midia, rgb)
        cor = cor_prevista(pares, medidas["vetor"], medidas["luz"], ajustes_automaticos(amostra(rgb)), intensidade,
                           boosting)
        # A cor nova na edição (o giro e o recorte ficam; o igualar sai), com a versão seguinte
        db.album_fotos.update_one({"album_id": album_id, "midia_id": midia["_id"]}, [{"$set": {"edicao": {
            "$mergeObjects": [{"$ifNull": ["$edicao", {}]}, {"cor": {"$literal": cor}, "igualar": None,
                                                               "versao": {"$add": [{"$ifNull": ["$edicao.versao", 0]},
                                                                                   1]}}]}}}])
        feitas += 1
        if numero % 5 == 0:
            reportar(2 + int(60 * (numero + 1) / max(1, len(midias))), f"Prevendo {numero + 1} de {len(midias)}")
    reportar(65, "Desenhando as fotos")
    executar_editar_album(db, {"entrada": {"album_id": str(album_id)}},
                          lambda andamento, mensagem: reportar(65 + andamento * 34 // 100, mensagem))
    return {"album_id": str(album_id), "estilo_id": str(estilo["_id"]), "aplicadas": feitas,
            "modelo": (estilo.get("modelo") or {}).get("tipo", "vizinhos")}
