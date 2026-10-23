# -----------------------------------------------
# TakeOne — fundo desfocado no vídeo (lib/projeto/fundoDesfocado.ts)
#
# O clipe guarda só `fundo_desfocado` (a intensidade). Para o render, o projeto é expandido como na prévia: o clipe
# vira a cópia desfocada (sem a máscara) e uma faixa logo acima recebe a cópia recortada (a pessoa), sem som.
# -----------------------------------------------
SUFIXO_DO_RECORTE = "~recorte"


def tem_fundo_desfocado(clipe: dict) -> bool:
    return bool((clipe.get("fundo_desfocado") or 0) > 0 and not clipe.get("texto") and not clipe.get("ajuste"))


def expandir_fundo_desfocado(projeto: dict) -> dict:
    """O projeto como é desenhado: cada clipe com fundo desfocado vira dois, em duas faixas."""
    if not any(tem_fundo_desfocado(c) for f in projeto["faixas"] for c in f["clipes"]):
        return projeto
    faixas = []
    for faixa in projeto["faixas"]:
        com_fundo = [c for c in faixa["clipes"] if tem_fundo_desfocado(c)]
        if not com_fundo:
            faixas.append(faixa)
            continue
        # A lista vai de cima para baixo: a faixa da cópia recortada entra antes da original
        faixas.append({**faixa, "id": f"{faixa['id']}{SUFIXO_DO_RECORTE}",
                       "tipo": "video" if faixa["tipo"] == "principal" else faixa["tipo"],
                       "clipes": [{**c, "id": f"{c['id']}{SUFIXO_DO_RECORTE}", "fundo_desfocado": None,
                                   "remover_fundo": True, "som_separado": True, "transicao": None} for c in com_fundo]})
        faixas.append({**faixa, "clipes": [
            {**c, "fundo_desfocado": None, "remover_fundo": False,
             "efeito": {"tipo": "desfoque", "intensidade": c["fundo_desfocado"]}} if tem_fundo_desfocado(c) else c
            for c in faixa["clipes"]]})
    return {**projeto, "faixas": faixas}
