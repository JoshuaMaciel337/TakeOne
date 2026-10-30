# TakeOne API — FastAPI
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    TZ=America/Sao_Paulo

WORKDIR /app
# A fonte de emoji (Noto Color Emoji, OFL): o emoji automático das legendas é desenhado aqui (core/utils/emoji.py)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*
COPY apps/api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# A biblioteca de fontes livres (core/fontes/biblioteca.json), conferida pelo SHA-256 de cada arquivo; antes do código,
# para a camada da imagem só mudar quando o manifesto muda
COPY core/fontes/biblioteca.json core/fontes/baixar_biblioteca.py /tmp/fontes/
RUN python /tmp/fontes/baixar_biblioteca.py --manifesto /tmp/fontes/biblioteca.json --destino /app/fontes-biblioteca     && chmod -R a+rX /app/fontes-biblioteca
ENV FONTES_DA_BIBLIOTECA=/app/fontes-biblioteca

COPY core /app/core
COPY apps/api /app/api

RUN useradd --create-home --uid 1000 takeone && mkdir -p /dados/armazenamento && chown -R takeone /dados
USER takeone

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/saude', timeout=4)"
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
