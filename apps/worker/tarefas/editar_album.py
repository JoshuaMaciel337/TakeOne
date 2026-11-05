# -----------------------------------------------
# Tarefa "editar_album" — desenha a capa e a cópia leve editadas das fotos do álbum (onda 16.5, ADR 0006)
#
# Cada foto com uma edição nova (edicao.versao diferente de edicao.gerada) é lida da cópia leve, recebe o
# endireitar e o recorte automáticos se foram pedidos (edicao.auto) e passa por core/utils/edicao_de_foto.editar.
# Os arquivos levam o álbum e a versão no nome (album_<id>_<versão>_capa.jpg e _proxy.webp), então a grade troca a
# imagem sem cache velho; os da versão de antes saem. A edição tirada apaga os arquivos.
# -----------------------------------------------
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

from bson import ObjectId

from core.modelos.job import ErroDefinitivo
from core.modelos.midia import ARQUIVO_PROXY_IMAGEM, chave_arquivo
from core.utils import storage
from core.utils.edicao_de_foto import editar, endireitar_automatico, recorte_automatico
from core.utils.imagem import LARGURA_CAPA
from core.utils.lut import chave_da_lut, de_bytes

# Depois de terminar, mais uma volta pelas que mudaram enquanto ela andava (até este tanto de voltas)
VOLTAS = 5
# Fotos desenhadas ao mesmo tempo (o numpy e o OpenCV soltam o GIL nas contas grandes)
JUNTAS = 4


def arquivos_da_edicao(album_id, versao: int) -> tuple[str, str]:
    """Os nomes da capa e da cópia leve editadas (core/modelos/midia.arquivo_publico os serve)."""
    return f"album_{album_id}_{versao}_capa.jpg", f"album_{album_id}_{versao}_proxy.webp"


def _apagar_versoes(db, organizacao_id, midia_id, album_id, menos: tuple = ()):
    """Apaga os arquivos editados do álbum (menos os das versões `menos`) e tira os nomes da lista da mídia, que é o
    que a API serve."""
    menos = tuple(v for v in menos if v is not None)
    pasta = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, "x")).parent
    for arquivo in pasta.glob(f"album_{album_id}_*"):
        if not any(arquivo.name.startswith(f"album_{album_id}_{v}_") for v in menos):
            arquivo.unlink(missing_ok=True)
    manter = "".join(f"(?!{v}_)" for v in menos)
    db.midias.update_one({"_id": midia_id}, {"$pull": {"arquivos": {"$regex": f"^album_{album_id}_{manter}"}}})


def _luts(db, organizacao_id, edicoes: list[dict]) -> dict:
    ids = {((e.get("cor") or {}).get("lut") or {}).get("id") for e in edicoes} - {None}
    luts = {}
    for doc in db.luts.find({"_id": {"$in": [ObjectId(i) for i in ids if ObjectId.is_valid(i)]},
                             "organizacao_id": organizacao_id}):
        caminho = storage.caminho_local(chave_da_lut(organizacao_id, doc["_id"]))
        if caminho.is_file():
            luts[str(doc["_id"])] = de_bytes(caminho.read_bytes(), doc["tamanho"], doc["minimo"], doc["maximo"])
    return luts


_modnet = None


def _sessao_do_modnet():
    """O MODNet (a pessoa da foto) para a pele do corpo e a roupa do retoque, aberto uma vez por processo."""
    global _modnet
    if _modnet is None:
        from core.config import MODELO_RECORTE

        if not MODELO_RECORTE.is_file():
            return None
        import onnxruntime as ort

        opcoes = ort.SessionOptions()
        opcoes.intra_op_num_threads = 8
        _modnet = ort.InferenceSession(str(MODELO_RECORTE), opcoes, providers=["CPUExecutionProvider"])
    return _modnet


def _retocar(db, foto: dict, midia: dict, rgb, retoque: dict):
    """O retoque de retrato antes da cor (core/utils/retoque.py), com os rostos medidos e as pessoas de cada um."""
    from core.utils.retoque import retocar
    from worker.tarefas.medir_album import modelos

    medidas = db.fotos_medidas.find_one({"midia_id": midia["_id"]}, {"rostos": 1}) or {}
    precisa_do_modnet = retoque.get("pescoco") or retoque.get("roupa")
    return retocar(rgb, retoque, modelos(), _sessao_do_modnet() if precisa_do_modnet else None,
                   medidas.get("rostos") or [], foto.get("pessoas_por_rosto") or [])


def _editar_uma(db, album_id, foto: dict, midia: dict, luts: dict) -> bool:
    import cv2

    edicao = dict(foto["edicao"])
    origem = storage.caminho_local(chave_arquivo(midia["organizacao_id"], midia["_id"], ARQUIVO_PROXY_IMAGEM))
    bgr = cv2.imread(str(origem), cv2.IMREAD_COLOR) if origem.is_file() else None
    if bgr is None:
        return False
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    auto = edicao.pop("auto", None)
    if auto:
        if auto.get("endireitar"):
            edicao["giro"] = endireitar_automatico(rgb)
        if auto.get("proporcao"):
            medidas = db.fotos_medidas.find_one({"midia_id": midia["_id"]}, {"rostos": 1}) or {}
            h, w = rgb.shape[:2]
            edicao["recorte"] = recorte_automatico(w, h, auto["proporcao"], medidas.get("rostos") or [],
                                                   float(edicao.get("giro") or 0))
    if edicao.get("retoque"):
        rgb = _retocar(db, foto, midia, rgb, edicao["retoque"])
    saida = editar(rgb, edicao, luts)
    versao = edicao["versao"]
    nome_capa, nome_proxy = arquivos_da_edicao(album_id, versao)
    pasta = origem.parent
    cv2.imwrite(str(pasta / nome_proxy), cv2.cvtColor(saida, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 90])
    h, w = saida.shape[:2]
    capa = cv2.resize(saida, (LARGURA_CAPA, max(1, round(h * LARGURA_CAPA / w))), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(pasta / nome_capa), cv2.cvtColor(capa, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
    db.midias.update_one({"_id": midia["_id"]}, {"$addToSet": {"arquivos": {"$each": [nome_capa, nome_proxy]}}})
    # Só grava se ninguém mudou a edição enquanto ela era desenhada (senão a próxima volta a refaz)
    campos = {"edicao.gerada": versao, "edicao.largura": w, "edicao.altura": h}
    if auto:
        campos.update({"edicao.giro": edicao.get("giro") or 0, "edicao.recorte": edicao.get("recorte")})
    gravada = db.album_fotos.update_one({"_id": foto["_id"], "edicao.versao": versao},
                                        {"$set": campos, **({"$unset": {"edicao.auto": ""}} if auto else {})})
    # As versões antigas só saem depois que o banco aponta para a nova, e a última mostrada fica até a próxima: a
    # página continua com ela até recarregar a lista (1,5 s depois do aviso), e levava 404
    if gravada.matched_count:
        _apagar_versoes(db, midia["organizacao_id"], midia["_id"], album_id,
                        menos=(versao, foto["edicao"].get("gerada")))
    return True


def executar_editar_album(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    album_id = ObjectId(job["entrada"]["album_id"])
    album = db.albuns.find_one({"_id": album_id}, {"organizacao_id": 1})
    if album is None:
        raise ErroDefinitivo("O álbum foi excluído antes da edição.")
    feitas = falhas = 0
    for _ in range(VOLTAS):
        pendentes = list(db.album_fotos.find({"album_id": album_id, "edicao": {"$ne": None},
                                              "$expr": {"$ne": ["$edicao.versao", "$edicao.gerada"]}}))
        tiradas = list(db.album_fotos.find({"album_id": album_id, "edicao": None, "edicao_tirada": True}))
        if not pendentes and not tiradas:
            break
        for foto in tiradas:
            _apagar_versoes(db, album["organizacao_id"], foto["midia_id"], album_id)
            db.album_fotos.update_one({"_id": foto["_id"]}, {"$unset": {"edicao_tirada": ""}})
        midias = {m["_id"]: m for m in db.midias.find({"_id": {"$in": [f["midia_id"] for f in pendentes]}},
                                                     {"organizacao_id": 1})}
        luts = _luts(db, album["organizacao_id"], [f["edicao"] for f in pendentes])
        def uma(foto: dict, midias=midias, luts=luts) -> bool:
            midia = midias.get(foto["midia_id"])
            if midia is None or not _editar_uma(db, album_id, foto, midia, luts):
                # Sem a cópia leve: marca como gerada para não tentar para sempre
                db.album_fotos.update_one({"_id": foto["_id"]}, {"$set": {"edicao.gerada": foto["edicao"]["versao"]}})
                return False
            return True

        with ThreadPoolExecutor(JUNTAS) as executor:
            for numero, futuro in enumerate(as_completed([executor.submit(uma, foto) for foto in pendentes])):
                if futuro.result():
                    feitas += 1
                else:
                    falhas += 1
                if numero % 5 == 0 or numero == len(pendentes) - 1:
                    reportar(2 + int(97 * (numero + 1) / max(1, len(pendentes))),
                             f"Editando {numero + 1} de {len(pendentes)}")
    logging.info(f"[album {album_id}] {feitas} fotos editadas ({falhas} sem a cópia leve).")
    return {"album_id": str(album_id), "editadas": feitas, "falhas": falhas}
