# ComfyUI (GPL-3.0) para gerar vídeo com o Wan 2.2 TI2V-5B. Roda num container à parte e o worker de GPU
# só conversa com ele pela API HTTP: nenhum código do ComfyUI entra no TakeOne (seção 9 do docs/PLANO.md).
# Os pesos (uns 17 GB) não ficam na imagem: o iniciar.sh baixa no volume na primeira subida.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ffmpeg curl \
 && rm -rf /var/lib/apt/lists/*

# As versões medidas no Nitro 5 em 14/10/2026
RUN pip install --no-cache-dir torch==2.11.0 torchvision==0.26.0 torchaudio==2.11.0 \
    --index-url https://download.pytorch.org/whl/cu128
RUN git clone --depth 1 --branch v0.38.0 https://github.com/comfyanonymous/ComfyUI /comfyui
WORKDIR /comfyui
RUN pip install --no-cache-dir -r requirements.txt

COPY infra/comfyui/iniciar.sh /iniciar.sh
RUN chmod 755 /iniciar.sh

ENV PYTHONUNBUFFERED=1 TZ=America/Sao_Paulo
EXPOSE 8188
CMD ["/iniciar.sh"]
