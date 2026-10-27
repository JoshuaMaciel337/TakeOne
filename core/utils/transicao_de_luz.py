# -----------------------------------------------
# TakeOne — as transições de luz, Flash e Clarão (lib/projeto/transicaoDeLuz.ts, o Clipar 14.12c)
#
# Os dois clipes se cortam seco; por cima dos vídeos entra uma camada de ajuste que sobe até o corte e desce depois
# (as animações "aparecer", que o render faz com o fade do alfa): no Flash ela leva tudo ao branco, no Clarão é uma
# luz quente que vem de um canto.
# -----------------------------------------------
from core.utils.cor import AJUSTES_NEUTROS, CURVA_NEUTRA
from core.utils.tempo import duracao_do_quadro

TRANSICOES_DE_LUZ = ("flash", "clarao")
SUFIXO_DA_LUZ = "~luz"
FAIXA_DA_LUZ = "~luzes"

COR_DO_FLASH = {**AJUSTES_NEUTROS, "filtro": None, "intensidade": 1, "hsl": None, "lut": None,
                "curvas": {"rgb": [[0, 1], [1, 1]], "r": CURVA_NEUTRA, "g": CURVA_NEUTRA, "b": CURVA_NEUTRA}}
# A luz quente: mais exposição, e as curvas levantam o vermelho e um pouco do verde e seguram o azul
COR_DO_CLARAO = {**AJUSTES_NEUTROS, "exposicao": 1.2, "temperatura": 1, "filtro": None, "intensidade": 1,
                 "hsl": None, "lut": None,
                 "curvas": {"rgb": CURVA_NEUTRA, "r": [[0, 0.3], [0.5, 0.92], [1, 1]], "g": [[0, 0.1], [1, 1]],
                            "b": [[0, 0], [1, 0.78]]}}
MASCARA_DO_CLARAO = {"forma": "elipse", "x": 0.12, "y": 0.18, "largura": 1.5, "altura": 1.3, "suavidade": 0.5,
                     "inverter": False}


def janela_da_luz(corte: int, duracao: int, quadro: int) -> dict:
    """A janela em volta do corte, em quadros inteiros, com a metade de baixo antes dele (janelaDaLuz)."""
    quadros = max(2, round(duracao / quadro))
    antes = (quadros // 2) * quadro
    return {"inicio": max(0, corte - antes), "duracao": quadros * quadro, "antes": min(antes, corte)}


def com_as_luzes_das_transicoes(projeto: dict) -> dict:
    """O projeto com a camada de ajuste de cada transição de luz da principal, numa faixa por cima dos vídeos."""
    principal = next((f for f in projeto["faixas"] if f["tipo"] == "principal"), None)
    if not principal or not any((c.get("transicao") or {}).get("tipo") in TRANSICOES_DE_LUZ
                                for c in principal["clipes"]):
        return projeto
    taxa = projeto["taxa"]
    quadro = duracao_do_quadro(taxa["num"], taxa["den"])
    clipes = sorted(principal["clipes"], key=lambda c: c["inicio"])
    luzes = []
    for clipe, _proximo in zip(clipes, clipes[1:], strict=False):
        transicao = clipe.get("transicao") or {}
        if transicao.get("tipo") not in TRANSICOES_DE_LUZ or transicao.get("duracao", 0) <= 0:
            continue
        janela = janela_da_luz(clipe["inicio"] + clipe["duracao"], transicao["duracao"], quadro)
        flash = transicao["tipo"] == "flash"
        luzes.append({
            "id": f"{clipe['id']}{SUFIXO_DA_LUZ}", "midia_id": None, "ajuste": True,
            "inicio": janela["inicio"], "duracao": janela["duracao"], "entrada": 0, "velocidade": 1, "volume": 0,
            "fade_entrada": 0, "fade_saida": 0,
            "transformacao": {"x": 0, "y": 0, "escala": 1, "rotacao": 0, "opacidade": 1},
            "recorte": {"x": 0, "y": 0, "largura": 1, "altura": 1},
            "cor": COR_DO_FLASH if flash else COR_DO_CLARAO,
            "mascara": None if flash else MASCARA_DO_CLARAO,
            "animacao": {"entrada": {"tipo": "aparecer", "duracao": janela["antes"]},
                         "saida": {"tipo": "aparecer", "duracao": janela["duracao"] - janela["antes"]}},
        })
    if not luzes:
        return projeto
    faixa = {"id": FAIXA_DA_LUZ, "tipo": "video", "oculta": False, "muda": True, "travada": True, "clipes": luzes}
    faixas = list(projeto["faixas"])
    # A lista vai de cima para baixo: a luz fica acima de todos os vídeos e abaixo dos textos e das legendas
    indice = next((i for i, f in enumerate(faixas) if f["tipo"] in ("video", "principal")), len(faixas))
    faixas.insert(indice, faixa)
    return {**projeto, "faixas": faixas}
