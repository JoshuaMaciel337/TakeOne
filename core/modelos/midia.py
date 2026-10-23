# -----------------------------------------------
# TakeOne — modelo de mídia (um vídeo, um áudio ou uma imagem enviada para a biblioteca)
# Funções puras: montam e calculam, sem acessar o banco.
# -----------------------------------------------
import re
from datetime import datetime
from pathlib import PurePosixPath

from core.config import EXTENSOES_AUDIO, EXTENSOES_IMAGEM, EXTENSOES_VIDEO, TZ

STATUS_ENVIANDO = "enviando"        # upload em andamento
STATUS_PROCESSANDO = "processando"  # ingestão na fila ou rodando
STATUS_PRONTA = "pronta"
STATUS_ERRO = "erro"
PRIORIDADE_INGESTAO = 5   # a mídia nova passa na frente dos outros jobs

# Arquivos gerados pela ingestão. A API só serve nomes desta lista.
ARQUIVO_PROXY_VIDEO = "proxy.mp4"
ARQUIVO_PROXY_AUDIO = "proxy.m4a"
ARQUIVO_AUDIO_ANALISE = "audio.wav"
ARQUIVO_FORMA_DE_ONDA = "forma_de_onda.json"
ARQUIVO_MINIATURAS = "miniaturas.jpg"
ARQUIVO_CAPA = "capa.jpg"
# Nível do áudio em dB a cada 10 ms (int8). Base do corte de silêncios e do nivelar a voz (no editor).
ARQUIVO_NIVEIS = "niveis.bin"
NIVEIS_POR_SEGUNDO = 100
# A voz sem ruído (DeepFilterNet), gerada sob pedido, no mesmo tempo do original. Serve a prévia e o render.
ARQUIVO_VOZ_LIMPA = "voz_limpa.m4a"
ARQUIVOS_PUBLICOS = {ARQUIVO_PROXY_VIDEO, ARQUIVO_PROXY_AUDIO, ARQUIVO_FORMA_DE_ONDA, ARQUIVO_MINIATURAS, ARQUIVO_CAPA,
                     ARQUIVO_VOZ_LIMPA, ARQUIVO_NIVEIS}
# A máscara da pessoa em cada quadro (tarefa "recorte_fundo"), no tempo da cópia leve
ARQUIVO_MASCARA = "mascara.mp4"
# A imagem sem ruído (tarefa "limpeza_imagem"): a de resolução cheia é só do render; a cópia leve, da prévia
ARQUIVO_IMAGEM_LIMPA = "limpo.mp4"
ARQUIVO_IMAGEM_LIMPA_PROXY = "limpo_proxy.mp4"
ARQUIVOS_PUBLICOS = ARQUIVOS_PUBLICOS | {ARQUIVO_MASCARA, ARQUIVO_IMAGEM_LIMPA_PROXY}
# Imagem parada (core/utils/imagem.py): a de resolução cheia é do render; a cópia leve, da prévia
ARQUIVO_IMAGEM = "imagem.png"
ARQUIVO_PROXY_IMAGEM = "proxy.webp"
# O recorte do fundo de uma imagem parada (tarefa "recorte_fundo"): a máscara cinza, no lugar do mascara.mp4
ARQUIVO_MASCARA_IMAGEM = "mascara.png"
# A de resolução cheia também: o editor de imagem exporta no navegador, no tamanho de verdade
ARQUIVOS_PUBLICOS = ARQUIVOS_PUBLICOS | {ARQUIVO_PROXY_IMAGEM, ARQUIVO_IMAGEM, ARQUIVO_MASCARA_IMAGEM}
# O vídeo ao contrário (tarefa "inversao"): o de resolução cheia é do render; a cópia leve, com o som, da prévia
ARQUIVO_INVERTIDO = "invertido.mp4"
ARQUIVO_INVERTIDO_PROXY = "invertido_proxy.mp4"
ARQUIVOS_PUBLICOS = ARQUIVOS_PUBLICOS | {ARQUIVO_INVERTIDO_PROXY}
# A imagem estável (tarefa "estabilizacao"): estavel.mp4 só do render, estavel_proxy.mp4 da prévia;
# sobre a imagem sem ruído, estavel_limpo.mp4 e estavel_limpo_proxy.mp4
_ARQUIVO_ESTAVEL_PROXY = re.compile(r"estavel(_limpo)?_proxy\.mp4")
# A voz em outro tom (tarefa "tom"), uma por tom pedido: tom_p3.m4a, tom_m2_limpa.m4a (sobre a voz limpa)
TOM_LIMITE = 12
_ARQUIVO_DO_TOM = re.compile(r"tom_[mp]\d{1,2}(_limpa)?\.m4a")
_ARQUIVO_FLUIDO_PROXY = re.compile(r"fluido_\d{1,8}_\d{1,8}_proxy\.mp4")
# A máscara de uma seleção com um clique (tarefa "selecao"), pela chave dos pontos; o embedding do MobileSAM,
# guardado para os cliques seguintes, é só do worker
_ARQUIVO_DA_SELECAO = re.compile(r"selecao_[0-9a-f]{12}\.png")
ARQUIVO_EMBEDDING_SAM = "sam.npy"


def arquivo_da_selecao(pontos: list[list[float]]) -> str:
    """O nome da máscara de uma seleção: o mesmo para os mesmos pontos (em milésimos), para não refazer."""
    import hashlib
    import json

    chave = json.dumps([[round(x, 3), round(y, 3), bool(incluir)] for x, y, incluir in pontos])
    return f"selecao_{hashlib.sha1(chave.encode()).hexdigest()[:12]}.png"


def chave_do_fluido(de: float, ate: float) -> str:
    """A câmera lenta suave de um trecho (segundos da mídia, em milésimos no nome): chaveDoFluido no editor."""
    return f"fluido_{round(de * 1000)}_{round(ate * 1000)}"


def arquivos_do_fluido(de: float, ate: float) -> tuple[str, str]:
    """(o do render, o da prévia)."""
    chave = chave_do_fluido(de, ate)
    return f"{chave}.mp4", f"{chave}_proxy.mp4"


def chave_do_tom(semitons: int, limpa: bool) -> str:
    return f"tom_{'m' if semitons < 0 else 'p'}{abs(semitons)}{'_limpa' if limpa else ''}"


def arquivo_do_tom(semitons: int, limpa: bool) -> str:
    return f"{chave_do_tom(semitons, limpa)}.m4a"


def chave_da_estabilizacao(limpa: bool) -> str:
    return "estavel_limpo" if limpa else "estavel"


def arquivos_da_estabilizacao(limpa: bool) -> tuple[str, str]:
    """(o do render, o da prévia)."""
    chave = chave_da_estabilizacao(limpa)
    return f"{chave}.mp4", f"{chave}_proxy.mp4"


def arquivo_publico(nome: str) -> bool:
    """Os arquivos da mídia que a API serve: os fixos, as vozes em outro tom e as cópias leves estáveis."""
    return (nome in ARQUIVOS_PUBLICOS or bool(_ARQUIVO_DO_TOM.fullmatch(nome))
            or bool(_ARQUIVO_FLUIDO_PROXY.fullmatch(nome))
            or bool(_ARQUIVO_ESTAVEL_PROXY.fullmatch(nome)) or bool(_ARQUIVO_DA_SELECAO.fullmatch(nome)))


def extensao_aceita(nome_arquivo: str) -> str | None:
    """Extensão em minúsculas se o arquivo for vídeo, áudio ou imagem aceita, senão None."""
    extensao = PurePosixPath(nome_arquivo.replace("\\", "/")).suffix.lower()
    return extensao if extensao in EXTENSOES_VIDEO | EXTENSOES_AUDIO | EXTENSOES_IMAGEM else None


def e_imagem(midia: dict) -> bool:
    """A mídia é uma imagem parada (foto, logo): clipe de duração livre, sem som e sem velocidade."""
    return bool(midia.get("imagem")) or midia.get("extensao") in EXTENSOES_IMAGEM


def campos_da_imagem(info: dict, arquivos_antigos: list[str]) -> dict:
    """O que a mídia guarda de uma imagem preparada (core/utils/imagem.preparar_imagem): sem duração nem som,
    e `video` só com o tamanho, para a caixa do clipe, a prévia e o render usarem a conta dos vídeos."""
    arquivos = [ARQUIVO_IMAGEM, ARQUIVO_PROXY_IMAGEM, ARQUIVO_CAPA, ARQUIVO_MINIATURAS]
    arquivos += [nome for nome in arquivos_antigos if nome not in arquivos]
    video = {"codec": "imagem", "largura": info["largura"], "altura": info["altura"], "fps": None, "rotacao": 0,
             "matriz": None, "transparente": info["transparente"]}
    miniaturas = {"total": 1, "colunas": 1, "linhas": 1, "intervalo": 1.0, **info["miniatura"]}
    return {"status": STATUS_PRONTA, "imagem": True, "duracao": None, "video": video, "audio": None,
            "arquivos": arquivos, "miniaturas": miniaturas, "erro": None}


def nome_para_exibir(nome_arquivo: str) -> str:
    """'C:/Videos/Viagem 29-09.MP4' → 'Viagem 29-09'."""
    nome = PurePosixPath(nome_arquivo.replace("\\", "/")).stem.strip()
    return (nome or "Mídia")[:120]


def pasta_da_midia(organizacao_id, midia_id) -> str:
    return f"org_{organizacao_id}/midias/{midia_id}"


def chave_arquivo(organizacao_id, midia_id, nome: str) -> str:
    return f"{pasta_da_midia(organizacao_id, midia_id)}/{nome}"


def montar_midia(organizacao_id, criado_por, nome_arquivo: str, tamanho_total: int,
                 tipo_mime: str = "", momento: datetime | None = None) -> dict:
    """Documento de uma mídia nova, no começo do upload."""
    extensao = extensao_aceita(nome_arquivo)
    if extensao is None:
        raise ValueError(f"Formato não aceito: {nome_arquivo}")
    momento = momento or datetime.now(TZ)
    return {
        "organizacao_id": organizacao_id,
        "criado_por": criado_por,
        "nome": nome_para_exibir(nome_arquivo),
        "nome_original": nome_arquivo[:255],
        "extensao": extensao,
        "tipo_mime": tipo_mime[:100],
        "status": STATUS_ENVIANDO,
        "tamanho_total": tamanho_total,
        "bytes_recebidos": 0,
        "original": f"original{extensao}",
        "arquivos": [],
        "duracao": None,
        "video": None,
        "audio": None,
        "miniaturas": None,
        "imagem": extensao in EXTENSOES_IMAGEM,
        "job_ingestao_id": None,
        "erro": None,
        "criado_em": momento,
        "atualizado_em": momento,
        "enviado_em": None,
    }
