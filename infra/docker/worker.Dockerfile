# TakeOne worker — fila de jobs e backup. FFmpeg incluído.
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tzdata \
 && rm -rf /var/lib/apt/lists/*

# DeepFilterNet 0.5.6 (MIT ou Apache-2.0): o binário do próprio projeto, com o modelo dentro, para
# tirar o ruído da voz na CPU sem PyTorch. O checksum confere que é o arquivo publicado.
ADD --checksum=sha256:70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da \
    https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-unknown-linux-musl \
    /usr/local/bin/deep-filter
RUN chmod 755 /usr/local/bin/deep-filter

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    TZ=America/Sao_Paulo

WORKDIR /app
COPY apps/worker/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY core /app/core
COPY apps/worker /app/worker
COPY infra/backup /app/backup

RUN useradd --create-home --uid 1000 takeone && mkdir -p /dados/armazenamento /dados/backups && chown -R takeone /dados
USER takeone

CMD ["python", "-m", "worker.worker_principal", "--automatico", "--recursos", "cpu"]
