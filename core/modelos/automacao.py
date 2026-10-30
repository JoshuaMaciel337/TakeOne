# -----------------------------------------------
# TakeOne — as automações do Clipar (ADR 0004, 14.9)
#
# Uma esteira leva um vídeo do link (ou do envio, ou do canal) até os cortes exportados, sem ninguém na página:
# importa, espera o vídeo ficar pronto, espera o horário (quando pedido: a placa de vídeo é do dono durante o dia),
# procura os cortes, e o worker da montagem monta e exporta os melhores. Uma automação de canal lê o feed RSS
# público do canal do YouTube (o monitor do HolyCut, genérico) e põe uma esteira em cada vídeo novo. Funções puras:
# leem e decidem; o laço que avança as esteiras e olha os canais está em core/utils/esteiras.py.
# -----------------------------------------------
import re
import xml.etree.ElementTree as ET
from datetime import datetime, time, timedelta

from core.config import TZ
from core.modelos.cortes import parecidos

# A esteira, do começo ao fim
IMPORTANDO = "importando"          # o vídeo ainda baixa ou passa pela ingestão
ESPERANDO_HORARIO = "esperando"    # pronto, esperando o horário para procurar os cortes
PROCURANDO = "procurando"          # a clipagem (a transcrição e o Qwen3)
MONTANDO = "montando"              # o worker da montagem e o render
PRONTA = "pronta"
ERRO = "erro"
CANCELADA = "cancelada"
ATIVAS = (IMPORTANDO, ESPERANDO_HORARIO, PROCURANDO, MONTANDO)
ORIGENS = ("link", "envio", "canal")

QUANTOS_PADRAO = 3
QUANTOS_MAXIMO = 10
INTERVALO_DA_ESTEIRA = timedelta(seconds=20)
INTERVALO_DO_CANAL = timedelta(minutes=10)
DURACAO_MINIMA_DO_CANAL = 5          # minutos: os Shorts e os vídeos curtos do canal ficam de fora
MAXIMO_VISTOS = 200
MAXIMO_DE_AUTOMACOES = 20
FEED_CANAL = "https://www.youtube.com/feeds/videos.xml?channel_id={}"

_ID_VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")
_ID_CANAL = re.compile(r"^UC[A-Za-z0-9_-]{22}$")
_HANDLE = re.compile(r"^@[A-Za-z0-9._-]{3,30}$")
_HORARIO = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_ATOM = "{http://www.w3.org/2005/Atom}"
_YT = "{http://www.youtube.com/xml/schemas/2015}"


# -----------------------------------------------
# A ESTEIRA
# -----------------------------------------------
def proximo_horario(horario: str | None, momento: datetime) -> datetime | None:
    """A próxima vez que o relógio de São Paulo marca o horário ("HH:MM"); None sem horário. A mesma hora de agora
    (o minuto já começou) vale agora."""
    achado = _HORARIO.match(horario or "")
    if not achado:
        return None
    local = momento.astimezone(TZ)
    alvo = datetime.combine(local.date(), time(int(achado.group(1)), int(achado.group(2))), tzinfo=TZ)
    if alvo + timedelta(minutes=1) <= local:
        alvo += timedelta(days=1)
    return alvo


def montar_esteira(organizacao_id, criado_por, origem: str, opcoes: dict, quantos: int = QUANTOS_PADRAO,
                   resolucao: str = "1080p", horario: str | None = None, midia_id=None, titulo: str = "",
                   automacao_id=None, momento: datetime | None = None) -> dict:
    """A esteira nova, esperando o vídeo. O horário vale para a busca dos cortes: o download começa já."""
    momento = momento or datetime.now(TZ)
    return {
        "organizacao_id": organizacao_id,
        "criado_por": criado_por,
        "automacao_id": automacao_id,
        "origem": origem,
        "titulo": titulo[:200],
        "midia_id": midia_id,
        "clipagem_id": None,
        "opcoes": {**opcoes, "inicio": 0, "fim": None},
        "quantos": max(1, min(int(quantos), QUANTOS_MAXIMO)),
        "resolucao": resolucao,
        "horario": horario,
        "status": IMPORTANDO,
        "cortes": [],
        "videos": 0,
        "erro": None,
        "proxima_volta": momento,
        "criado_em": momento,
        "atualizado_em": momento,
        "concluida_em": None,
    }


def cortes_escolhidos(cortes: list[dict], quantos: int) -> list[str]:
    """Os melhores cortes pela nota, sem dois parecidos (do parecido, fica o de nota maior) e sem as partes 2."""
    candidatos = sorted((corte for corte in cortes if corte.get("nota") is not None and not corte.get("copia_de")),
                        key=lambda corte: -corte["nota"])
    vizinhos = parecidos(candidatos)
    escolhidos: list[str] = []
    for corte in candidatos:
        if len(escolhidos) >= quantos:
            break
        if not any(outro in escolhidos for outro in vizinhos.get(corte["id"], [])):
            escolhidos.append(corte["id"])
    return escolhidos


def situacao_dos_cortes(cortes: list[dict], ids: list[str], exportacoes: dict[str, str]) -> tuple[bool, int, int]:
    """(algum ainda anda, quantos vídeos saíram, quantos falharam). exportacoes: id → status da exportação."""
    andando, videos, erros = False, 0, 0
    por_id = {corte.get("id"): corte for corte in cortes}
    for corte_id in ids:
        saida = (por_id.get(corte_id) or {}).get("saida") or {}
        status = saida.get("status")
        if status in ("na_fila", "montando"):
            andando = True
        elif status == "exportado":
            situacao = exportacoes.get(saida.get("exportacao_id") or "")
            if situacao == "processando":
                andando = True
            elif situacao == "pronta":
                videos += 1
            else:
                erros += 1
        else:
            # Erro, ou o corte saiu da lista
            erros += 1
    return andando, videos, erros


# -----------------------------------------------
# O CANAL (o monitor do HolyCut, sem as partes de igreja)
# -----------------------------------------------
def normalizar_canal(texto: str) -> dict:
    """'@canal', 'youtube.com/@Canal' ou o id 'UC...' (Studio > Configurações > Canal)."""
    valor = (texto or "").strip()
    valor = re.sub(r"^(https?://)?(www\.|m\.)?youtube\.com/", "", valor).split("?")[0].strip("/")
    if valor.startswith("channel/"):
        valor = valor.removeprefix("channel/").split("/")[0]
    else:
        valor = valor.split("/")[0]
    if _ID_CANAL.fullmatch(valor):
        return {"id": valor, "handle": None}
    if not valor.startswith("@"):
        valor = f"@{valor}"
    if _HANDLE.fullmatch(valor):
        return {"id": None, "handle": valor.lower()}
    raise ValueError("Não reconheci o canal. Cole o @ do canal (como @meucanal) ou o endereço dele.")


def ler_feed(texto: str) -> list[dict]:
    """Os vídeos do feed RSS do canal: id, título e quando foi publicado."""
    try:
        raiz = ET.fromstring(texto)
    except ET.ParseError:
        return []
    videos = []
    for entrada in raiz.findall(f"{_ATOM}entry"):
        video_id = (entrada.findtext(f"{_YT}videoId") or "").strip()
        publicado = (entrada.findtext(f"{_ATOM}published") or "").strip()
        if not _ID_VIDEO.fullmatch(video_id):
            continue
        try:
            momento = datetime.fromisoformat(publicado)
        except ValueError:
            continue
        videos.append({"video_id": video_id, "titulo": (entrada.findtext(f"{_ATOM}title") or "").strip(),
                       "publicado": momento})
    return videos


def videos_novos(videos: list[dict], vistos: list[str]) -> list[dict]:
    """O que o monitor ainda não olhou, do mais antigo ao mais novo. A data do feed não serve de filtro: a live
    agendada com dias de antecedência entra no feed com a data do agendamento."""
    ja_vistos = set(vistos)
    return sorted((video for video in videos if video["video_id"] not in ja_vistos), key=lambda v: v["publicado"])


def lembrar_visto(vistos: list[str], video_id: str) -> list[str]:
    return ([item for item in vistos if item != video_id] + [video_id])[-MAXIMO_VISTOS:]


def montar_automacao(organizacao_id, criado_por, canal: dict, nome_do_canal: str, opcoes: dict,
                     quantos: int = QUANTOS_PADRAO, resolucao: str = "1080p", horario: str | None = None,
                     duracao_minima: int = DURACAO_MINIMA_DO_CANAL, momento: datetime | None = None) -> dict:
    """A automação de canal. Na primeira volta, o que já está no feed só fica como visto: dali em diante, cada
    vídeo novo vira uma esteira."""
    momento = momento or datetime.now(TZ)
    return {
        "organizacao_id": organizacao_id,
        "criado_por": criado_por,
        "tipo": "canal",
        "ativa": True,
        "canal": {**canal, "nome": nome_do_canal[:120], "vistos": [], "primeira_volta": True},
        "opcoes": {**opcoes, "inicio": 0, "fim": None},
        "quantos": max(1, min(int(quantos), QUANTOS_MAXIMO)),
        "resolucao": resolucao,
        "horario": horario,
        "duracao_minima": duracao_minima,
        "proxima_verificacao": momento,
        "ultima_verificacao": None,
        "ultimo_erro": None,
        "criado_em": momento,
        "atualizado_em": momento,
    }
