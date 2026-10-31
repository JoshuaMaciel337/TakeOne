# -----------------------------------------------
# TakeOne — a clipagem: um vídeo longo, as opções escolhidas e os cortes achados (o Clipar, ADR 0004)
#
# Uma por pedido, na coleção `clipagens`. O job "clipagem" (worker de GPU) lê a transcrição da mídia, procura
# os cortes pelo LLM local (core/modelos/cortes.py) e guarda a lista aqui. Montar o projeto de cada corte é do
# editor. Funções puras: montam e calculam, sem acessar o banco.
# -----------------------------------------------
from core.modelos.cortes import FAIXAS, frases_da_fala, maximo_de_cortes, nota_final
from core.utils.mongo import agora

STATUS_PROCESSANDO = "processando"
STATUS_PRONTA = "pronta"
STATUS_ERRO = "erro"

# As estratégias prontas: o nome na tela, a faixa de duração que elas sugerem e o que vai ao modelo.
ESTRATEGIAS = {
    "ganchos": ("Ganchos rápidos", "medio",
                "Momentos curtos e fortes, que prendem nos primeiros segundos: uma frase de impacto, uma revelação, "
                "um número que surpreende."),
    "historias": ("Histórias completas", "longo",
                  "Histórias contadas do começo ao desfecho, com a emoção e a virada; o corte espera a história "
                  "terminar."),
    "ideia": ("Ideia completa (podcast e entrevista)", "longo",
              "Uma ideia ou resposta inteira, com o raciocínio do começo ao fim, sem cortar o argumento."),
    "dicas": ("Dicas e aulas", "medio",
              "Dicas práticas e explicações que ensinam algo útil sozinhas: o passo, o porquê e o resultado."),
    "humor": ("Humor e reações", "curto",
              "As piadas inteiras, da preparação ao riso, e as reações espontâneas."),
    "pregacao": ("Pregação", "longo",
                 "Os trechos da mensagem que tocam e se entendem sozinhos: uma aplicação, uma história, uma frase "
                 "forte; "
                 "sem os avisos e sem a oração."),
}
GENEROS = ("auto", "podcast", "entrevista", "palestra", "aula", "pregação", "vlog", "comentário", "notícia",
           "tutorial", "humor", "esporte", "jogo", "outro")
FORMATOS = ("9:16", "1:1", "4:5", "16:9")
DURACAO_MINIMA = 60.0          # vídeo mais curto que isso não precisa ser clipado
PALAVRAS_POR_SEGUNDO_BOA = 2.6  # o ritmo de uma fala animada em português


LEGENDAS_NO_MAXIMO = 20000      # um .srt de 4 h tem umas 4000
PALAVRAS_NO_MAXIMO = 60000


def palavras_das_legendas(legendas: list[dict]) -> list[dict]:
    """As legendas de um .srt da pessoa viram as palavras da fala: cada legenda reparte o tempo dela entre as
    palavras pelo número de letras (como as legendas digitadas no editor), sem sobrepor a seguinte."""
    palavras: list[dict] = []
    for legenda in sorted(legendas, key=lambda item: item["inicio"]):
        textos = str(legenda.get("texto") or "").split()
        inicio, fim = float(legenda["inicio"]), float(legenda["fim"])
        if palavras and inicio < palavras[-1]["fim"]:
            inicio = palavras[-1]["fim"]
        if not textos or fim - inicio < 0.05:
            continue
        letras = sum(len(texto) for texto in textos)
        andado = 0
        for texto in textos:
            de = inicio + (fim - inicio) * andado / letras
            andado += len(texto)
            palavras.append({"texto": texto, "inicio": round(de, 3),
                             "fim": round(inicio + (fim - inicio) * andado / letras, 3)})
    return palavras[:PALAVRAS_NO_MAXIMO]


def montar_clipagem(organizacao_id, criado_por, midia: dict, opcoes: dict,
                    palavras: list[dict] | None = None) -> dict:
    """Documento novo, processando. palavras: a fala de um .srt da pessoa, no lugar da transcrição."""
    momento = agora()
    return {
        "organizacao_id": organizacao_id,
        "criado_por": criado_por,
        "midia_id": midia["_id"],
        "nome": midia.get("nome") or "Vídeo",
        "duracao": float(midia.get("duracao") or 0),
        "opcoes": opcoes,
        "fala": "legendas" if palavras else "transcricao",
        "palavras": palavras or None,
        "status": STATUS_PROCESSANDO,
        "cortes": [],
        "erro": None,
        "criado_em": momento,
        "atualizado_em": momento,
    }


def instrucoes_da_estrategia(opcoes: dict) -> str:
    """O texto da estratégia pronta, mais o que a pessoa escreveu (o que buscar e o estilo do título)."""
    pronta = ESTRATEGIAS.get(opcoes.get("estrategia") or "")
    partes = [pronta[2]] if pronta else []
    if opcoes.get("instrucoes"):
        partes.append(str(opcoes["instrucoes"]))
    return " ".join(partes)


def faixa_das_opcoes(opcoes: dict) -> str:
    faixa = opcoes.get("faixa") or "auto"
    if faixa == "auto" and opcoes.get("estrategia") in ESTRATEGIAS:
        return ESTRATEGIAS[opcoes["estrategia"]][1]
    return faixa if faixa in FAIXAS else "auto"


def palavras_do_trecho(palavras: list[dict], inicio: float | None, fim: float | None) -> list[dict]:
    """Só a fala do trecho a analisar (as duas pontas da página de opções)."""
    de = float(inicio or 0)
    ate = float(fim) if fim else float("inf")
    return [palavra for palavra in palavras if palavra["inicio"] >= de and palavra["fim"] <= ate]


def ritmo_do_corte(corte: dict, palavras: list[dict]) -> float:
    """
    De 0 a 1: quanto do corte tem fala e quão animada ela é. Muito silêncio no meio, ou fala arrastada,
    rende pouco numa rede social.
    """
    falado, contadas = 0.0, 0
    for trecho in corte["trechos"]:
        for palavra in palavras:
            if palavra["inicio"] >= trecho["inicio"] and palavra["fim"] <= trecho["fim"]:
                falado += palavra["fim"] - palavra["inicio"]
                contadas += 1
    if corte["duracao"] <= 0:
        return 0.0
    densidade = min(1.0, falado / corte["duracao"] / 0.85)
    velocidade = min(1.0, contadas / corte["duracao"] / PALAVRAS_POR_SEGUNDO_BOA)
    return round(0.5 * densidade + 0.5 * velocidade, 3)


def pontuar(corte: dict, palavras: list[dict], video=None) -> dict:
    """A nota de 0 a 100 do corte, com as medidas do vídeo (o ritmo da fala e, com `video`, uma MedidasDoVideo de
    core/modelos/medidas_do_corte.py, a voz, o rosto e a imagem). Propaganda perde pontos."""
    medidas = {"ritmo": ritmo_do_corte(corte, palavras), **(video.do_corte(corte) if video is not None else {})}
    nota = nota_final(corte["notas"], medidas) - (15 if corte.get("propaganda") else 0)
    return {**corte, "medidas": medidas, "nota": max(0, nota)}


def cortes_simulados(palavras: list[dict], faixa: str) -> list[dict]:
    """Sem o modelo (o modo simulado e o CI): cortes previsíveis, de frase em frase, para testar o fluxo."""
    minimo, maximo = FAIXAS.get(faixa, FAIXAS["auto"])
    alvo = (minimo + maximo) / 2
    frases = frases_da_fala(palavras)
    cortes, comeco = [], 0
    for i, frase in enumerate(frases):
        duracao = frase["fim"] - frases[comeco]["inicio"]
        if duracao >= alvo or (i == len(frases) - 1 and duracao >= minimo):
            texto = " ".join(item["texto"] for item in frases[comeco:i + 1])
            numero = len(cortes) + 1
            cortes.append({
                "trechos": [{"inicio": frases[comeco]["inicio"], "fim": frase["fim"]}],
                "frases": [{"de": comeco, "ate": i}],
                "duracao": round(duracao, 3),
                "titulo": f"Corte de exemplo {numero}",
                "foco": [],
                "resumo": texto[:120],
                "categoria": "explicacao",
                "notas": {"gancho": 9 - numero % 5, "fluxo": 7.0, "valor": 7.0, "autonomia": 7.0},
                "motivos": {"gancho": "Exemplo sem o modelo.", "fluxo": "", "valor": "", "autonomia": ""},
                "texto": texto,
                "propaganda": False,
            })
            comeco = i + 1
    return cortes


def maximo_das_opcoes(opcoes: dict, duracao: float) -> int:
    return maximo_de_cortes(duracao, opcoes.get("maximo"))


# -----------------------------------------------
# Ênfase: as palavras fortes de cada corte, que a montagem pinta nas legendas
# -----------------------------------------------
def legendas_da_enfase(cortes: list[dict], frases: list[dict], palavras: list[dict]) -> list[dict]:
    """As frases dos cortes como "legendas" para o pedido das palavras-chave (core/modelos/palavras_chave.py):
    o id é o corte e a frase, e o texto é o das palavras da transcrição, para os números baterem com elas."""
    legendas = []
    for corte in cortes:
        for trecho in corte.get("frases") or []:
            for n in range(trecho["de"], trecho["ate"] + 1):
                if 0 <= n < len(frases):
                    frase = frases[n]
                    texto = " ".join(p["texto"].strip() for p in palavras[frase["de"]:frase["ate"] + 1])
                    legendas.append({"id": f"{corte['id']}:{n}", "texto": texto})
    return legendas


def enfase_dos_cortes(cortes: list[dict], frases: list[dict], palavras: list[dict],
                      chaves: dict[str, list[int]]) -> list[dict]:
    """Cada corte ganha "enfase": o começo (segundos da mídia) de cada palavra escolhida. Pelo tempo, a montagem
    acha a palavra em qualquer divisão das legendas e em qualquer formato."""
    saida = []
    for corte in cortes:
        inicios = []
        for chave, numeros in chaves.items():
            corte_id, _, n = chave.rpartition(":")
            if corte_id != corte["id"] or not n.isdigit() or int(n) >= len(frases):
                continue
            frase = frases[int(n)]
            grupo = palavras[frase["de"]:frase["ate"] + 1]
            inicios.extend(round(float(grupo[j]["inicio"]), 3) for j in numeros if 0 <= j < len(grupo))
        saida.append({**corte, "enfase": sorted(set(inicios))})
    return saida
