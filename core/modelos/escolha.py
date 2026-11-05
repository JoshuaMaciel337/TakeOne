# -----------------------------------------------
# TakeOne — escolher as melhores fotos do álbum (onda 16.3, docs/decisoes/0006-album-de-fotos.md)
#
# Uma conta pura sobre as medidas de cada foto (core/utils/medir_foto.py), sem modelo nenhum: mudar a quantidade ou o
# rigor refaz a escolha na hora.
#   1. as fotos vão para a ordem da hora em que foram tiradas (sem a hora, a do envio);
#   2. a sequência é cortada em cenas onde o tempo pula ou a foto muda muito (o vetor);
#   3. dentro da cena, fotos encostadas e parecidas (cosseno dos vetores) viram um grupo de parecidas;
#   4. cada foto ganha uma nota de 0 a 100: foco, rosto (olhos, sorriso, olhar, de frente) e exposição, com o peso de
#      cada um pelo tipo do ensaio; o foco é comparado ao do próprio ensaio;
#   5. as desfocadas e as de olhos fechados ficam de fora; em cada grupo a melhor é escolhida e as outras são
#      parecidas; a quantidade pedida corta as escolhidas mais fracas (viram "talvez"); os destaques são as melhores
#      escolhidas com variedade (as que menos se parecem entre si).
# -----------------------------------------------
from dataclasses import dataclass, field

import numpy as np

CATEGORIAS = ("destaque", "escolhida", "talvez", "parecida", "desfocada", "olhos_fechados")
# Quanto do ensaio fica escolhido, pela opção "quantas"
FRACAO_ESCOLHIDA = {"minima": 0.15, "poucas": 0.25, "padrao": 0.40, "muitas": 0.60}
# A semelhança (cosseno) a partir da qual duas fotos vizinhas são do mesmo grupo, pelo tamanho dos grupos
SEMELHANCA_DO_GRUPO = {"pequeno": 0.95, "padrao": 0.92, "grande": 0.88, "muito_grande": 0.84}
# A foto é desfocada abaixo desta fração da mediana do foco do ensaio, pelo rigor
FOCO_MINIMO = {"tolerante": 0.2, "moderado": 0.35, "rigido": 0.5}
# Um corte de cena: mais que isso de tempo entre duas fotos, ou o vetor mudando muito
SEGUNDOS_DE_UMA_CENA = 120
SEMELHANCA_DA_CENA = 0.6
# Os destaques: esta fração das escolhidas (no mínimo 1)
FRACAO_DE_DESTAQUES = 0.15
# O rosto conta a partir deste tamanho (fração da área da foto); os do fundo não decidem nada
AREA_MINIMA_DO_ROSTO = 0.004
OLHO_ABERTO = 0.5
# O peso de cada parte da nota por tipo de ensaio: foco, rosto (olhos, sorriso, olhar e frente juntos) e exposição
PESOS = {
    "casamento": {"foco": 0.35, "rosto": 0.45, "exposicao": 0.20},
    "ensaio": {"foco": 0.35, "rosto": 0.45, "exposicao": 0.20},
    "familia": {"foco": 0.30, "rosto": 0.50, "exposicao": 0.20},
    "evento": {"foco": 0.35, "rosto": 0.40, "exposicao": 0.25},
    "esporte": {"foco": 0.55, "rosto": 0.20, "exposicao": 0.25},
    "escola": {"foco": 0.30, "rosto": 0.55, "exposicao": 0.15},
    "recem_nascido": {"foco": 0.40, "rosto": 0.35, "exposicao": 0.25},
    "produto": {"foco": 0.60, "rosto": 0.05, "exposicao": 0.35},
    "outro": {"foco": 0.45, "rosto": 0.30, "exposicao": 0.25},
}


@dataclass
class Opcoes:
    quantas: str = "padrao"
    # Um número exato de fotos no lugar da fração (0: pela fração)
    alvo: int = 0
    rigor: str = "moderado"
    olhos_fechados: bool = True
    grupos: str = "padrao"
    genero: str = "ensaio"


@dataclass(eq=False)
class Foto:
    id: str
    # Segundos desde um início qualquer (a hora da foto), ou None
    hora: float | None
    ordem: int
    medidas: dict
    vetor: np.ndarray


@dataclass
class Resultado:
    categoria: dict[str, str] = field(default_factory=dict)
    nota: dict[str, int] = field(default_factory=dict)
    grupo: dict[str, int] = field(default_factory=dict)
    cena: dict[str, int] = field(default_factory=dict)
    motivo: dict[str, str] = field(default_factory=dict)


def _posicoes(valores: list[float]) -> list[float]:
    """A posição de cada valor entre os outros (0 o menor, 1 o maior; empates no meio)."""
    if len(valores) < 2:
        return [1.0] * len(valores)
    ordem = np.argsort(np.argsort(valores, kind="stable"), kind="stable")
    return list(ordem / (len(valores) - 1))


def rostos_que_contam(medidas: dict) -> list[dict]:
    return [r for r in medidas.get("rostos", []) if r["caixa"][2] * r["caixa"][3] >= AREA_MINIMA_DO_ROSTO]


def abertura_dos_olhos(rosto: dict) -> float:
    """A média dos dois olhos (sem medida, abertos). A média, não o pior: um olho só abaixo do limiar costuma ser a
    cabeça inclinada ou o sorriso apertado, e a piscada de verdade fecha os dois; de perfil, o olho escondido ainda
    puxa a média para baixo quando o outro também está fechado."""
    return (rosto.get("olho_esq", 1.0) + rosto.get("olho_dir", 1.0)) / 2


def olhos_fechados(medidas: dict) -> bool:
    """Algum rosto que conta com os olhos fechados."""
    return any(abertura_dos_olhos(r) < OLHO_ABERTO for r in rostos_que_contam(medidas))


def nota_do_rosto(medidas: dict) -> float | None:
    """De 0 a 1 para os rostos que contam (o pior deles pesa mais: uma pessoa de olho fechado estraga a foto)."""
    rostos = rostos_que_contam(medidas)
    if not rostos:
        return None
    notas = []
    for r in rostos:
        olho = min(1.0, abertura_dos_olhos(r) / 0.75)
        frente = max(0.0, 1 - abs(r.get("guinada", 0.0)) * 2)
        notas.append(0.45 * olho + 0.25 * r.get("sorriso", 0.5) + 0.15 * r.get("olhando", 0.5) + 0.15 * frente)
    return 0.6 * min(notas) + 0.4 * float(np.mean(notas))


def nota_da_exposicao(medidas: dict) -> float:
    e = medidas["exposicao"]
    nota = 1 - min(1.0, e["estourado"] * 8) * 0.5 - min(1.0, e["afogado"] * 3) * 0.3
    return max(0.0, nota - max(0.0, abs(e["mediana"] - 0.45) - 0.2) * 1.5)


def _cosseno(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b)


def escolher(fotos: list[Foto], opcoes: Opcoes) -> Resultado:
    resultado = Resultado()
    if not fotos:
        return resultado
    fotos = sorted(fotos, key=lambda f: (f.hora is None, f.hora or 0, f.ordem))
    pesos = PESOS.get(opcoes.genero, PESOS["outro"])
    foco = [f.medidas["foco"]["melhor_bloco"] for f in fotos]
    posicao_do_foco = _posicoes(foco)
    mediana_do_foco = float(np.median(foco)) or 1.0

    # 1. A nota de cada foto (0 a 100)
    for f, pos in zip(fotos, posicao_do_foco, strict=True):
        rosto = nota_do_rosto(f.medidas)
        partes = {"foco": pos, "exposicao": nota_da_exposicao(f.medidas)}
        peso = dict(pesos)
        if rosto is None:
            # Sem rosto, o peso dele vai para o foco e a exposição
            peso = {"foco": pesos["foco"] + pesos["rosto"] * 0.7,
                    "exposicao": pesos["exposicao"] + pesos["rosto"] * 0.3}
        else:
            partes["rosto"] = rosto
        resultado.nota[f.id] = round(100 * sum(peso[k] * partes[k] for k in peso))

    # 2. Cenas e grupos de parecidas, pela sequência
    limiar = SEMELHANCA_DO_GRUPO.get(opcoes.grupos, SEMELHANCA_DO_GRUPO["padrao"])
    cena = grupo = 0
    for i, f in enumerate(fotos):
        if i:
            anterior = fotos[i - 1]
            perto = _cosseno(f.vetor, anterior.vetor)
            pulo = f.hora is not None and anterior.hora is not None and f.hora - anterior.hora > SEGUNDOS_DE_UMA_CENA
            if pulo or perto < SEMELHANCA_DA_CENA:
                cena += 1
                grupo += 1
            elif perto < limiar:
                grupo += 1
        resultado.cena[f.id] = cena
        resultado.grupo[f.id] = grupo

    # 3. As que ficam de fora de saída e a melhor de cada grupo
    fora: dict[str, str] = {}
    for f in fotos:
        if f.medidas["foco"]["melhor_bloco"] < FOCO_MINIMO.get(opcoes.rigor, 0.35) * mediana_do_foco:
            fora[f.id] = "desfocada"
            resultado.motivo[f.id] = "O foco está bem abaixo do resto do ensaio."
        elif opcoes.olhos_fechados and olhos_fechados(f.medidas):
            fora[f.id] = "olhos_fechados"
            resultado.motivo[f.id] = "Alguém está de olhos fechados."
    grupos: dict[int, list[Foto]] = {}
    for f in fotos:
        grupos.setdefault(resultado.grupo[f.id], []).append(f)
    melhores: list[Foto] = []
    for membros in grupos.values():
        boas = [f for f in membros if f.id not in fora] or membros
        melhor = max(boas, key=lambda f: resultado.nota[f.id])
        if melhor.id in fora and len(membros) > 1:
            # O grupo inteiro é ruim: a melhor dele vira "talvez", com o motivo
            resultado.categoria[melhor.id] = "talvez"
            resultado.motivo[melhor.id] = "A melhor de um grupo em que todas têm problema."
        elif melhor.id not in fora:
            melhores.append(melhor)
        for f in membros:
            if f.id in resultado.categoria or f is melhor and melhor.id not in fora:
                continue
            resultado.categoria[f.id] = fora.get(f.id, "parecida")
            if f.id not in resultado.motivo:
                resultado.motivo[f.id] = "Há outra parecida melhor no grupo."

    # 4. A quantidade: pela fração do ensaio ou um número exato
    quantas = opcoes.alvo or max(1, round(len(fotos) * FRACAO_ESCOLHIDA.get(opcoes.quantas, 0.40)))
    escolhidas = _diversas(melhores, resultado.nota, quantas)
    for f in melhores:
        if f in escolhidas:
            resultado.categoria[f.id] = "escolhida"
            resultado.motivo[f.id] = "A melhor do grupo."
        else:
            resultado.categoria[f.id] = "talvez"
            resultado.motivo[f.id] = "Boa, mas ficou fora da quantidade pedida."
    if opcoes.alvo and len(escolhidas) < opcoes.alvo:
        # Um número exato maior que os grupos: completa com as melhores das parecidas
        sobra = [f for f in fotos if resultado.categoria.get(f.id) in ("parecida", "talvez") and f not in escolhidas]
        for f in sorted(sobra, key=lambda f: -resultado.nota[f.id])[:opcoes.alvo - len(escolhidas)]:
            resultado.categoria[f.id] = "escolhida"
            resultado.motivo[f.id] = "Entrou para chegar ao número pedido."
            escolhidas.append(f)

    # 5. Os destaques: as melhores escolhidas, variadas
    destaques = _diversas(escolhidas, resultado.nota, max(1, round(len(escolhidas) * FRACAO_DE_DESTAQUES)))
    for f in destaques:
        resultado.categoria[f.id] = "destaque"
        resultado.motivo[f.id] = "Uma das melhores do ensaio."
    return resultado


def _diversas(fotos: list[Foto], nota: dict[str, int], quantas: int) -> list[Foto]:
    """
    Escolhe `quantas` pela nota, descontando a semelhança com as já escolhidas (as melhores sem repetir a cena). A
    semelhança de cada candidata com as escolhidas é guardada e só cresce, então cada passo é uma conta só.
    """
    if quantas >= len(fotos):
        return list(fotos)
    vetores = np.stack([f.vetor for f in fotos]).astype(np.float32)
    notas = np.array([nota[f.id] / 100 for f in fotos], np.float32)
    parecida = np.zeros(len(fotos), np.float32)
    livre = np.ones(len(fotos), bool)
    escolhidas: list[Foto] = []
    for _ in range(quantas):
        valor = np.where(livre, notas - 0.35 * np.maximum(parecida, 0), -np.inf)
        i = int(np.argmax(valor))
        escolhidas.append(fotos[i])
        livre[i] = False
        parecida = np.maximum(parecida, vetores @ vetores[i])
    return escolhidas


# A nota (estrelas) e a marcação de cada categoria quando a escolha é aplicada no álbum
ESTRELAS = {"destaque": 5, "escolhida": 4, "talvez": 3, "parecida": 2, "desfocada": 1, "olhos_fechados": 1}
MARCACAO = {"destaque": "escolhida", "escolhida": "escolhida"}
