# TakeOne worker de GPU — a mesma fila, com o faster-whisper para a transcrição.
# O worker de CPU continua na imagem leve (worker.Dockerfile).
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tzdata \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    TZ=America/Sao_Paulo \
    HF_HOME=/cache/huggingface \
    HUGGINGFACE_HUB_CACHE=/cache/huggingface

WORKDIR /app
COPY apps/worker/requirements.txt /tmp/requirements.txt
COPY apps/worker/requirements-gpu.txt /tmp/requirements-gpu.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt -r /tmp/requirements-gpu.txt \
 && python -c "import faster_whisper, ctranslate2"
# O ctranslate2 procura o cuBLAS e o cuDNN no caminho de bibliotecas
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib

COPY core /app/core
COPY apps/worker /app/worker

# A pasta do cache já nasce do usuário takeone: o volume vazio herda o dono na primeira subida
RUN useradd --create-home --uid 1000 takeone \
 && mkdir -p /dados/armazenamento /cache/huggingface \
 && chown -R takeone /dados /cache
USER takeone

CMD ["python", "-m", "worker.worker_principal", "--automatico", "--recursos", "gpu"]
