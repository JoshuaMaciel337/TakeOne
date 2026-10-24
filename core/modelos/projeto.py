# -----------------------------------------------
# TakeOne — projeto de edição
#
# O projeto é um documento só: proporção, taxa de quadros e as faixas com os clipes, tudo em ticks
# (core/utils/tempo.py). O editor no navegador monta e altera esse documento; a API confere se ele
# continua válido antes de salvar, e o render vai ler o mesmo documento.
# -----------------------------------------------
import math
import uuid

from core.utils.mongo import agora
from core.utils.tempo import TICK_MAXIMO, segundos_para_ticks

PROPORCOES = ("9:16", "16:9", "1:1", "4:5", "3:4", "21:9")
PROPORCAO_PADRAO = "9:16"
NOME_PADRAO = "Projeto sem título"
# O projeto de imagem (editor de imagem) usa a mesma linha do tempo: cada camada é uma faixa com um clipe só,
# no começo. Ele tem o tamanho em pixels; a proporção guardada é a mais perto, para a lista de projetos
TIPOS = ("video", "imagem")
NOME_PADRAO_IMAGEM = "Imagem sem título"
LADO_MAXIMO_DA_IMAGEM = 8192
AREA_MAXIMA_DA_IMAGEM = 36_000_000


def proporcao_mais_perto(largura: int, altura: int) -> str:
    """A proporção da lista mais perto do tamanho (em escala logarítmica: 2:1 e 1:2 ficam à mesma distância)."""
    def distancia(proporcao: str) -> float:
        a, b = (int(x) for x in proporcao.split(":"))
        return abs(math.log((largura / altura) / (a / b)))

    return min(PROPORCOES, key=distancia)

FAIXA_PRINCIPAL = "principal"
FAIXA_VIDEO = "video"      # sobreposição, por cima da principal
FAIXA_AUDIO = "audio"
FAIXA_TEXTO = "texto"      # clipes de texto, sem mídia, por cima dos vídeos
FAIXA_LEGENDA = "legenda"  # legendas: também clipes de texto, por cima de tudo
TIPOS_FAIXA = (FAIXA_PRINCIPAL, FAIXA_VIDEO, FAIXA_AUDIO, FAIXA_TEXTO, FAIXA_LEGENDA)
FAIXAS_DE_TEXTO = (FAIXA_TEXTO, FAIXA_LEGENDA)

LIMITE_FAIXAS = 30
# No projeto de imagem cada camada é uma faixa, e a principal fica vazia embaixo
LIMITE_CAMADAS = 100
CAMPOS_DA_IMAGEM = ("pai", "recortada", "travas", "rotulo", "vinculo", "nome", "aberta", "fundo")
LIMITE_CLIPES = 1500
# O fim do clipe pode passar um pouco do fim da mídia: a duração do ffprobe e a borda do quadro
# não batem exatamente.
FOLGA_FIM_DA_MIDIA = segundos_para_ticks(0.05)


def novo_id() -> str:
    return uuid.uuid4().hex[:12]


def faixa_vazia(tipo: str) -> dict:
    return {"id": novo_id(), "tipo": tipo, "oculta": False, "muda": False, "travada": False, "clipes": []}


def montar_projeto(organizacao_id: str, usuario_id: str, nome: str | None = None,
                   proporcao: str | None = None, tamanho: dict | None = None) -> dict:
    """Com `tamanho` ({largura, altura} em pixels), um projeto de imagem."""
    momento = agora()
    if tamanho:
        proporcao = proporcao_mais_perto(tamanho["largura"], tamanho["altura"])
    return {
        "organizacao_id": organizacao_id,
        "criado_por": usuario_id,
        "tipo": "imagem" if tamanho else "video",
        "tamanho": tamanho,
        "nome": nome or (NOME_PADRAO_IMAGEM if tamanho else NOME_PADRAO),
        "proporcao": proporcao if proporcao in PROPORCOES else PROPORCAO_PADRAO,
        "taxa": {"num": 30, "den": 1},
        # A imagem nasce branca, como uma folha; o vídeo, preto
        "fundo": {"cor": "#ffffff" if tamanho else "#000000"},
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
    # A gravação de uma câmera conta mesmo sem clipe na faixa: a troca de câmera volta a usar
    cameras = {f["multicamera"]["midia_id"] for f in faixas if f.get("multicamera")}
    # A máscara de camada do editor de imagem é uma camada de pixels: conta como usada, para não ser excluída
    mascaras = {c["mascara_pixels"]["midia_id"] for f in faixas for c in f["clipes"] if c.get("mascara_pixels")}
    return sorted({c["midia_id"] for f in faixas for c in f["clipes"] if c.get("midia_id")} | cameras | mascaras)


def capa_do_projeto(faixas: list[dict], tipo: str = "video") -> str | None:
    """
    A mídia do primeiro clipe da faixa principal: a capa dela vira a capa do projeto. Na imagem (sem nada na
    principal), a mídia da camada mais de baixo.
    """
    if tipo == "imagem":
        # As camadas de pixels não têm capa: a de baixo que for foto
        return next((c["midia_id"] for f in reversed(faixas) for c in f["clipes"]
                     if c.get("midia_id") and not c.get("pixels")), None)
    principal = next((f for f in faixas if f["tipo"] == FAIXA_PRINCIPAL), None)
    return principal["clipes"][0]["midia_id"] if principal and principal["clipes"] else None


def _conferir_posicao(faixa: dict, clipe: dict, anterior_fim: int) -> str | None:
    animacao = clipe.get("animacao")
    if animacao and animacao["entrada"]["duracao"] + animacao["saida"]["duracao"] > clipe["duracao"]:
        return "As animações de um clipe passam da duração dele."
    if fim_do_clipe(clipe) > TICK_MAXIMO:
        return "O projeto pode ter no máximo 6 horas."
    if clipe["inicio"] < anterior_fim:
        return "Dois clipes da mesma faixa estão um por cima do outro."
    if faixa["tipo"] == FAIXA_PRINCIPAL and clipe["inicio"] != anterior_fim:
        return "A faixa principal não pode ter espaço vazio entre os clipes."
    return None


def _conferir_transicoes(faixa: dict, clipes: list[dict]) -> str | None:
    """Transição só entre vizinhos da principal, e cabendo nos dois clipes."""
    for indice, clipe in enumerate(clipes):
        transicao = clipe.get("transicao")
        if not transicao:
            continue
        if faixa["tipo"] != FAIXA_PRINCIPAL or indice == len(clipes) - 1:
            return "Transição só existe entre dois clipes vizinhos da faixa principal."
        if transicao["duracao"] > min(clipe["duracao"], clipes[indice + 1]["duracao"]):
            return "Uma transição é mais longa que um dos clipes dela."
        if clipe.get("curva_velocidade") or clipes[indice + 1].get("curva_velocidade"):
            return "Clipe com curva de velocidade não tem transição."
    return None


# Os campos e os modos de mesclagem que só o editor de imagem desenha (o render do vídeo não sabe desenhá-los)
MESCLAGENS_SO_DA_IMAGEM = {
    "dissolver", "superexposicao_cores", "superexposicao_linear", "cor_mais_escura", "subexposicao_cores",
    "cor_mais_clara", "luz_suave", "luz_brilhante", "luz_linear", "luz_do_pino", "mistura_solida", "subtrair",
    "dividir", "matiz", "saturacao", "cor", "luminosidade", "passagem",
}
PROFUNDIDADE_DAS_PASTAS = 10


PONTOS_DOS_CAMINHOS = 100_000


def problema_nos_caminhos(caminhos: list[dict]) -> str | None:
    """Os caminhos do painel Caminhos: ids sem repetir, um caminho de trabalho e um de recorte no máximo."""
    if len({c["id"] for c in caminhos}) != len(caminhos):
        return "Dois caminhos têm o mesmo id."
    if sum(1 for c in caminhos if c.get("trabalho")) > 1:
        return "Só um caminho pode ser o caminho de trabalho."
    if sum(1 for c in caminhos if c.get("recorte")) > 1:
        return "Só um caminho pode ser o caminho de recorte."
    if sum(len(s["nos"]) for c in caminhos for s in c["subcaminhos"]) > PONTOS_DOS_CAMINHOS:
        return "Os caminhos podem ter no máximo 100 mil pontos."
    return None


def problema_na_arvore(faixas: list[dict], imagem: bool) -> str | None:
    """As regras da árvore de camadas (as mesmas de lib/projeto/arvore.ts, problemaNaArvore)."""
    por_id = {f["id"]: f for f in faixas}
    for faixa in faixas:
        clipes = faixa.get("clipes", [])
        da_imagem = any(faixa.get(campo) for campo in CAMPOS_DA_IMAGEM)
        if not imagem:
            if da_imagem or any(c.get("pasta") or c.get("preenchimento") is not None or c.get("pixels")
                                or c.get("mascara_pixels") or c.get("vetor") or c.get("mascara_vetorial")
                                or c.get("mesclagem") in MESCLAGENS_SO_DA_IMAGEM for c in clipes):
                return ("Grupos, recortes, travas parciais, camadas de pixels, formas vetoriais e os modos de mesclagem"
                        " novos só existem no editor de imagem.")
            continue
        clipe = clipes[0] if clipes else None
        if clipe and clipe.get("pasta") and (faixa["tipo"] != FAIXA_VIDEO or clipe.get("midia_id") or clipe.get("texto")
                                              or clipe.get("ajuste")):
            return "A pasta fica numa faixa de sobreposição, sem mídia nem texto."
        if clipe and clipe.get("mesclagem") == "passagem" and not clipe.get("pasta"):
            return "Só uma pasta usa a mesclagem Passagem."
        if faixa.get("fundo"):
            da_raiz = [f for f in faixas if f.get("tipo") != FAIXA_PRINCIPAL and f.get("clipes") and not f.get("pai")]
            if not (clipe and clipe.get("pixels")) or faixa.get("pai") or not da_raiz or da_raiz[-1] is not faixa:
                return "A camada de fundo fica embaixo de todas, fora das pastas."
        if faixa.get("pai"):
            pai = por_id.get(faixa["pai"])
            if not pai or not pai.get("clipes") or not pai["clipes"][0].get("pasta"):
                return "Uma camada está dentro de uma pasta que não existe."
            vistos = {faixa["id"]}
            atual, nivel = pai, 1
            while atual:
                if atual["id"] in vistos:
                    return "Uma pasta está dentro dela mesma."
                vistos.add(atual["id"])
                nivel += 1
                if nivel > PROFUNDIDADE_DAS_PASTAS + 1:
                    return f"As pastas vão até {PROFUNDIDADE_DAS_PASTAS} níveis."
                atual = por_id.get(atual.get("pai")) if atual.get("pai") else None
    return None


def conferir_linha_do_tempo(faixas: list[dict], midias: dict[str, dict], imagem: bool = False) -> str | None:
    """
    Confere as regras que o editor mantém. Devolve a mensagem do primeiro problema, ou None.
    midias: id → documento da mídia, só as do espaço e já prontas.
    """
    if sum(f["tipo"] == FAIXA_PRINCIPAL for f in faixas) != 1:
        return "O projeto precisa de exatamente uma faixa principal."
    if imagem:
        if len(faixas) > LIMITE_CAMADAS + 1:
            return f"A imagem pode ter no máximo {LIMITE_CAMADAS} camadas."
    elif len(faixas) > LIMITE_FAIXAS:
        return f"O projeto pode ter no máximo {LIMITE_FAIXAS} faixas."
    if sum(len(f["clipes"]) for f in faixas) > LIMITE_CLIPES:
        return f"O projeto pode ter no máximo {LIMITE_CLIPES} clipes."
    ids = [f["id"] for f in faixas] + [c["id"] for f in faixas for c in f["clipes"]]
    if len(ids) != len(set(ids)):
        return "Há faixas ou clipes com o mesmo id."
    problema = problema_na_arvore(faixas, imagem)
    if problema:
        return problema

    for faixa in faixas:
        clipes = sorted(faixa["clipes"], key=lambda c: c["inicio"])
        problema = _conferir_transicoes(faixa, clipes)
        if problema:
            return problema
        anterior_fim = 0
        for clipe in clipes:
            mascara = clipe.get("mascara_pixels")
            if mascara and not (midias.get(mascara["midia_id"]) or {}).get("camada_pixels"):
                return "A máscara de uma camada não existe mais."
            if clipe.get("ajuste") or clipe.get("pasta") or clipe.get("vetor"):
                # A camada de ajuste, a pasta e a forma vetorial não têm mídia nem texto: só nas sobreposições
                if faixa["tipo"] != FAIXA_VIDEO or clipe.get("texto") or clipe.get("midia_id"):
                    return "A camada de ajuste e a forma ficam só numa faixa de sobreposição, sem mídia nem texto."
                if clipe.get("vetor") and (clipe.get("ajuste") or clipe.get("pasta")):
                    return "Uma forma não é camada de ajuste nem pasta."
                problema = _conferir_posicao(faixa, clipe, anterior_fim)
                if problema:
                    return problema
                anterior_fim = fim_do_clipe(clipe)
                continue
            if faixa["tipo"] in FAIXAS_DE_TEXTO or clipe.get("texto") or not clipe.get("midia_id"):
                if faixa["tipo"] not in FAIXAS_DE_TEXTO or not clipe.get("texto") or clipe.get("midia_id"):
                    return "Textos ficam só na faixa de texto, e a faixa de texto só tem textos."
                problema = _conferir_posicao(faixa, clipe, anterior_fim)
                if problema:
                    return problema
                anterior_fim = fim_do_clipe(clipe)
                continue
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
            # Imagem parada não tem fim: o clipe dura o quanto a pessoa quiser
            fim_da_midia = segundos_para_ticks(midia.get("duracao") or 0) + FOLGA_FIM_DA_MIDIA
            if not midia.get("imagem") and fonte_fim > fim_da_midia:
                return f'Um clipe de "{midia["nome"]}" passa do fim da mídia.'
            if clipe.get("fade_entrada", 0) + clipe.get("fade_saida", 0) > clipe["duracao"]:
                return "Os fades de um clipe passam da duração dele."
            incompativel = clipe.get("remover_fundo") or midia.get("imagem") or midia.get("animacao")
            if clipe.get("estabilizar") and incompativel:
                # A máscara do recorte é do vídeo original: num vídeo estável ela ficaria fora do lugar
                return "Um clipe estabilizado não pode ter o fundo removido, e só vídeos gravados se estabilizam."
            problema = _conferir_posicao(faixa, clipe, anterior_fim)
            if problema:
                return problema
            anterior_fim = fim_do_clipe(clipe)
    return None
