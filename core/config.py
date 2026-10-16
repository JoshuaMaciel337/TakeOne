# -----------------------------------------------
# TakeOne — configurações compartilhadas por API e workers
# Tudo que muda entre máquinas vem de variável de ambiente.
# -----------------------------------------------
import os
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Sao_Paulo")
VERSAO = "0.1.0"

PASTA_RAIZ = Path(__file__).resolve().parent.parent

# -----------------------------------------------
# BANCO
# -----------------------------------------------
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/?directConnection=true")
DATABASE_NAME = os.environ.get("DATABASE_NAME", "takeone")

# -----------------------------------------------
# ARMAZENAMENTO DE ARQUIVOS
# -----------------------------------------------
PASTA_ARMAZENAMENTO = Path(os.environ.get("PASTA_ARMAZENAMENTO", PASTA_RAIZ / "armazenamento"))

# -----------------------------------------------
# UPLOAD (protocolo tus)
# -----------------------------------------------
UPLOAD_MAX_BYTES = int(float(os.environ.get("UPLOAD_MAX_GB", "20")) * 1024**3)
# Um envio que deixaria menos que isso livre no disco é recusado.
# Disco cheio derruba o Mongo e o Docker no meio do trabalho.
ESPACO_MINIMO_LIVRE_BYTES = int(float(os.environ.get("ESPACO_MINIMO_LIVRE_GB", "2")) * 1024**3)
EXTENSOES_VIDEO = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts", ".m2ts", ".ts"}
EXTENSOES_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}

# -----------------------------------------------
# FFMPEG
# -----------------------------------------------
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
# DeepFilterNet (binário do projeto, sem PyTorch): tira o ruído da voz na CPU. Vem na imagem do worker.
DEEP_FILTER = os.environ.get("DEEP_FILTER", "deep-filter")
# YuNet (detector de rostos do OpenCV, MIT): o modelo vem na imagem do worker
MODELO_ROSTO = Path(os.environ.get("MODELO_ROSTO", "/app/modelos/yunet.onnx"))
# MODNet (recorte de retrato) para recortar o fundo do vídeo
MODELO_RECORTE = Path(os.environ.get("MODELO_RECORTE", "/app/modelos/modnet.onnx"))

# -----------------------------------------------
# SESSÃO
# -----------------------------------------------
# O valor padrão só serve para desenvolvimento local. Em produção vem do .env.
JWT_SEGREDO = os.environ.get("JWT_SEGREDO") or "dev-apenas-para-desenvolvimento-local-troque-no-env"
JWT_ALGORITMO = "HS256"
SESSAO_DIAS = int(os.environ.get("SESSAO_DIAS", "7"))
COOKIE_NOME = "takeone_sessao"
COOKIE_SEGURO = os.environ.get("COOKIE_SEGURO", "false").lower() == "true"

# Limite de tentativas de login por IP + e-mail
MAX_TENTATIVAS_LOGIN = 5
JANELA_TENTATIVAS_MINUTOS = 15

# -----------------------------------------------
# FILA DE JOBS
# -----------------------------------------------
LEASE_MINUTOS = 5                 # posse do job sem heartbeat antes de voltar para a fila
HEARTBEAT_SEGUNDOS = 30           # frequência de renovação da posse
MAX_TENTATIVAS_JOB = 3
ESPERAS_RETRY_MINUTOS = [1, 5, 30]
INTERVALO_BUSCA_SEGUNDOS = 2      # espera do worker quando a fila está vazia
INTERVALO_LIMPEZA_SEGUNDOS = 60   # frequência da recuperação de jobs com posse vencida

# -----------------------------------------------
# IA (sempre com modelos abertos, rodando na própria máquina)
# -----------------------------------------------
MODO_IA = os.environ.get("MODO_IA", "simulado")  # "simulado" ou "real"
# O ComfyUI que gera vídeo com o Wan 2.2 (serviço comfyui do Compose, perfil video)
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://comfyui:8188")
# O LLM local do "Criar automaticamente" (serviço ollama do Compose, perfil gpu)
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
MODELO_LLM = os.environ.get("MODELO_LLM", "qwen3:8b")
