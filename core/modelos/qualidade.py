# -----------------------------------------------
# TakeOne — a nota de cada instante de um vídeo (coleção qualidades), para a montagem automática
#
# Uma por mídia: t (segundos da mídia, 4 por segundo), nota de 0 a 1 e se há corte de cena ali. A conta
# fica em core/utils/qualidade.py; o editor escolhe os trechos (apps/web/src/lib/projeto/montagem.ts).
# -----------------------------------------------
from core.utils.mongo import agora

STATUS_NENHUMA = "nenhuma"         # ainda não avaliada (só na resposta da API)
STATUS_PROCESSANDO = "processando"
STATUS_PRONTO = "pronto"
STATUS_ERRO = "erro"


def montar_qualidade(organizacao_id, midia_id) -> dict:
    momento = agora()
    return {"organizacao_id": organizacao_id, "midia_id": midia_id, "status": STATUS_PROCESSANDO,
            "t": [], "nota": [], "corte": [], "erro": None, "criado_em": momento, "atualizado_em": momento}
