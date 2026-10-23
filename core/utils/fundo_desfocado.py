# -----------------------------------------------
# TakeOne — as cópias que um clipe ganha na hora de desenhar (lib/projeto/fundoDesfocado.ts)
#
#   fundo desfocado: o clipe vira a cópia desfocada (sem a máscara) e uma faixa logo acima recebe a cópia
#                    recortada pela máscara da pessoa, sem som;
#   esconder os rostos: uma faixa acima recebe uma cópia pixelizada ou desfocada, recortada pela máscara dos rostos.
# -----------------------------------------------
SUFIXO_DO_RECORTE = "~recorte"
SUFIXO_DOS_ROSTOS = "~rostos"


def tem_fundo_desfocado(clipe: dict) -> bool:
    return bool((clipe.get("fundo_desfocado") or 0) > 0 and not clipe.get("texto") and not clipe.get("ajuste"))


def tem_rostos_escondidos(clipe: dict) -> bool:
    esconder = clipe.get("esconder_rostos") or {}
    return bool((esconder.get("forca") or 0) > 0 and not clipe.get("texto") and not clipe.get("ajuste"))


def _copia(clipe: dict, sufixo: str) -> dict:
    return {**clipe, "id": f"{clipe['id']}{sufixo}", "fundo_desfocado": None, "esconder_rostos": None,
            "som_separado": True, "transicao": None, "contorno": None, "sombra": None}


def expandir_para_desenhar(projeto: dict) -> dict:
    """O projeto como é desenhado, com as cópias de cada clipe nas faixas logo acima da dele."""
    if not any(tem_fundo_desfocado(c) or tem_rostos_escondidos(c) for f in projeto["faixas"] for c in f["clipes"]):
        return projeto
    faixas = []
    for faixa in projeto["faixas"]:
        com_fundo = [c for c in faixa["clipes"] if tem_fundo_desfocado(c)]
        com_rostos = [c for c in faixa["clipes"] if tem_rostos_escondidos(c)]
        if not com_fundo and not com_rostos:
            faixas.append(faixa)
            continue
        tipo = "video" if faixa["tipo"] == "principal" else faixa["tipo"]
        # A lista vai de cima para baixo: os rostos por cima de tudo, depois a pessoa recortada, depois a original
        if com_rostos:
            faixas.append({**faixa, "id": f"{faixa['id']}{SUFIXO_DOS_ROSTOS}", "tipo": tipo, "clipes": [
                {**_copia(c, SUFIXO_DOS_ROSTOS), "remover_fundo": True, "mascara_do_recorte": "rostos",
                 "efeito": {"tipo": "desfoque" if c["esconder_rostos"]["modo"] == "desfocar" else "pixelizar",
                            "intensidade": c["esconder_rostos"]["forca"]}} for c in com_rostos]})
        if com_fundo:
            faixas.append({**faixa, "id": f"{faixa['id']}{SUFIXO_DO_RECORTE}", "tipo": tipo,
                           # O contorno e a sombra ficam em volta da pessoa recortada, não do vídeo desfocado
                           "clipes": [{**_copia(c, SUFIXO_DO_RECORTE), "remover_fundo": True,
                                       "contorno": c.get("contorno"), "sombra": c.get("sombra")} for c in com_fundo]})

        def original(c: dict) -> dict:
            sem_intencao = {**c, "fundo_desfocado": None, "esconder_rostos": None}
            if tem_fundo_desfocado(c):
                return {**sem_intencao, "remover_fundo": False, "contorno": None, "sombra": None,
                        "efeito": {"tipo": "desfoque", "intensidade": c["fundo_desfocado"]}}
            return sem_intencao if tem_rostos_escondidos(c) else c

        faixas.append({**faixa, "clipes": [original(c) for c in faixa["clipes"]]})
    return {**projeto, "faixas": faixas}
