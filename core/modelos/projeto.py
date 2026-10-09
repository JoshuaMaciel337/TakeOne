# -----------------------------------------------
# TakeOne — projeto de edição
#
# O projeto é um documento só: proporção, taxa de quadros e as faixas com os clipes, tudo em ticks
# (core/utils/tempo.py). O editor no navegador monta e altera esse documento; a API confere se ele
# continua válido antes de salvar, e o render vai ler o mesmo documento.
# -----------------------------------------------
import uuid

from core.utils.mongo import agora
from core.utils.tempo import TICK_MAXIMO, segundos_para_ticks

PROPORCOES = ("9:16", "16:9", "1:1", "4:5", "3:4", "21:9")
PROPORCAO_PADRAO = "9:16"
NOME_PADRAO = "Projeto sem título"

FAIXA_PRINCIPAL = "principal"
FAIXA_VIDEO = "video"      # sobreposição, por cima da principal
FAIXA_AUDIO = "audio"
TIPOS_FAIXA = (FAIXA_PRINCIPAL, FAIXA_VIDEO, FAIXA_AUDIO)

LIMITE_FAIXAS = 30
LIMITE_CLIPES = 1500
# O fim do clipe pode passar um pouco do fim da mídia: a duração do ffprobe e a borda do quadro
# não batem exatamente.
FOLGA_FIM_DA_MIDIA = segundos_para_ticks(0.05)


def novo_id() -> str:
    return uuid.uuid4().hex[:12]


def faixa_vazia(tipo: str) -> dict:
    return {"id": novo_id(), "tipo": tipo, "oculta": False, "muda": False, "travada": False, "clipes": []}


def montar_projeto(organizacao_id: str, usuario_id: str, nome: str | None = None,
                   proporcao: str | None = None) -> dict:
    momento = agora()
    return {
        "organizacao_id": organizacao_id,
        "criado_por": usuario_id,
        "nome": nome or NOME_PADRAO,
        "proporcao": proporcao if proporcao in PROPORCOES else PROPORCAO_PADRAO,
        "taxa": {"num": 30, "den": 1},
        "fundo": {"cor": "#000000"},
        "faixas": [faixa_vazia(FAIXA_PRINCIPAL)],
        "versao": 1,
        "duracao": 0,
        "midias_usadas": [],
        "capa_midia_id": None,
        "criado_em": momento,
        "atualizado_em": momento,
    }


def fim_do_clipe(clipe: dict) -> int:
    return clipe["inicio"] + clipe["duracao"]


def duracao_do_projeto(faixas: list[dict]) -> int:
    return max((fim_do_clipe(c) for f in faixas for c in f["clipes"]), default=0)


def midias_usadas(faixas: list[dict]) -> list[str]:
    return sorted({c["midia_id"] for f in faixas for c in f["clipes"]})


def capa_do_projeto(faixas: list[dict]) -> str | None:
    """A mídia do primeiro clipe da faixa principal: a capa dela vira a capa do projeto."""
    principal = next((f for f in faixas if f["tipo"] == FAIXA_PRINCIPAL), None)
    return principal["clipes"][0]["midia_id"] if principal and principal["clipes"] else None


def conferir_linha_do_tempo(faixas: list[dict], midias: dict[str, dict]) -> str | None:
    """
    Confere as regras que o editor mantém. Devolve a mensagem do primeiro problema, ou None.
    midias: id → documento da mídia, só as do espaço e já prontas.
    """
    if sum(f["tipo"] == FAIXA_PRINCIPAL for f in faixas) != 1:
        return "O projeto precisa de exatamente uma faixa principal."
    if len(faixas) > LIMITE_FAIXAS:
        return f"O projeto pode ter no máximo {LIMITE_FAIXAS} faixas."
    if sum(len(f["clipes"]) for f in faixas) > LIMITE_CLIPES:
        return f"O projeto pode ter no máximo {LIMITE_CLIPES} clipes."
    ids = [f["id"] for f in faixas] + [c["id"] for f in faixas for c in f["clipes"]]
    if len(ids) != len(set(ids)):
        return "Há faixas ou clipes com o mesmo id."

    for faixa in faixas:
        clipes = sorted(faixa["clipes"], key=lambda c: c["inicio"])
        anterior_fim = 0
        for clipe in clipes:
            midia = midias.get(clipe["midia_id"])
            if midia is None:
                return "Um clipe usa uma mídia que não existe mais ou ainda não está pronta."
            if faixa["tipo"] == FAIXA_AUDIO and not midia.get("audio"):
                return f'"{midia["nome"]}" não tem áudio para ir numa faixa de áudio.'
            if faixa["tipo"] != FAIXA_AUDIO and not midia.get("video"):
                return f'"{midia["nome"]}" não tem imagem para ir numa faixa de vídeo.'
            if fim_do_clipe(clipe) > TICK_MAXIMO:
                return "O projeto pode ter no máximo 6 horas."
            fonte_fim = clipe["entrada"] + round(clipe["duracao"] * clipe["velocidade"])
            if fonte_fim > segundos_para_ticks(midia.get("duracao") or 0) + FOLGA_FIM_DA_MIDIA:
                return f'Um clipe de "{midia["nome"]}" passa do fim da mídia.'
            if clipe["inicio"] < anterior_fim:
                return "Dois clipes da mesma faixa estão um por cima do outro."
            if faixa["tipo"] == FAIXA_PRINCIPAL and clipe["inicio"] != anterior_fim:
                return "A faixa principal não pode ter espaço vazio entre os clipes."
            anterior_fim = fim_do_clipe(clipe)
    return None
