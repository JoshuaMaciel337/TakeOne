# -----------------------------------------------
# TakeOne — as batidas de uma mídia com som, para cortar e animar no ritmo
#
# Uma por mídia (coleção batidas): o andamento (BPM), o instante de cada batida e os tempos fortes, em
# segundos da mídia. A conta fica em core/utils/batidas.py; o editor leva os instantes para a linha do
# tempo (apps/web/src/lib/projeto/ritmo.ts). Funções puras.
# -----------------------------------------------
from core.utils.mongo import agora

STATUS_NENHUMA = "nenhuma"         # ainda não procuradas (só na resposta da API)
STATUS_PROCESSANDO = "processando"
STATUS_PRONTO = "pronto"
STATUS_ERRO = "erro"

# Mais que isso o worker não analisa: 20 min de som em 22 kHz são uns 100 MB na memória
DURACAO_MAXIMA_S = 20 * 60


def montar_batidas(organizacao_id, midia_id) -> dict:
    momento = agora()
    return {"organizacao_id": organizacao_id, "midia_id": midia_id, "status": STATUS_PROCESSANDO,
            "bpm": 0.0, "batidas": [], "fortes": [], "erro": None, "criado_em": momento, "atualizado_em": momento}
