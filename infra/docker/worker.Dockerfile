# TakeOne worker — fila de jobs e backup. FFmpeg incluído.
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tzdata espeak-ng \
 && rm -rf /var/lib/apt/lists/*

# DeepFilterNet 0.5.6 (MIT ou Apache-2.0): o binário do próprio projeto, com o modelo dentro, para
# tirar o ruído da voz na CPU sem PyTorch. O checksum confere que é o arquivo publicado.
ADD --checksum=sha256:70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da \
    https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-unknown-linux-musl \
    /usr/local/bin/deep-filter
RUN chmod 755 /usr/local/bin/deep-filter
# YuNet 2023mar (detector de rostos do OpenCV Zoo, MIT), para o reenquadramento seguindo o rosto
ADD --checksum=sha256:8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4 \
    https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
    /app/modelos/yunet.onnx
RUN chmod 644 /app/modelos/yunet.onnx
# VitTrack 2023sep (rastreador de objetos do OpenCV Zoo, Apache-2.0), para o texto que segue um objeto
ADD --checksum=sha256:2990f0b7cd44d92afa48cd97db6de7be113fc1d9594fddb74e2725c10478e91d \
    https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/object_tracking_vittrack/object_tracking_vittrack_2023sep.onnx \
    /app/modelos/vittrack.onnx
RUN chmod 644 /app/modelos/vittrack.onnx
# MODNet em ONNX (recorte de retrato, Apache-2.0; cópia do Xenova/modnet numa revisão fixa), para recortar o fundo
ADD --checksum=sha256:07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9 \
    https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx \
    /app/modelos/modnet.onnx
RUN chmod 644 /app/modelos/modnet.onnx
# Kokoro-82M v1.0 em ONNX (texto em fala, Apache-2.0; onnx-community numa revisão fixa) e as três vozes pt-BR.
# O espeak-ng (GPL-3, pelo apt) converte o texto em fonemas, chamado como programa separado.
ARG KOKORO=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231
ADD --checksum=sha256:8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb ${KOKORO}/onnx/model.onnx /app/modelos/kokoro/model.onnx
ADD --checksum=sha256:77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34 ${KOKORO}/tokenizer.json /app/modelos/kokoro/tokenizer.json
ADD --checksum=sha256:3da7b5b2d91847ebf5646f57631af6ececae3c29a89cd300f06edf9aa6cfe9ee ${KOKORO}/voices/pf_dora.bin /app/modelos/kokoro/pf_dora.bin
ADD --checksum=sha256:0175c753f59c54e7fd5a995bedef0c5ff2fb67e0043dd3dcb2ae74ec2acbeb2a ${KOKORO}/voices/pm_alex.bin /app/modelos/kokoro/pm_alex.bin
ADD --checksum=sha256:8b012db3185778afe2e45a62cbad69db73021774fe68dda634bcc748a982eede ${KOKORO}/voices/pm_santa.bin /app/modelos/kokoro/pm_santa.bin
RUN chmod -R a+rX /app/modelos/kokoro

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    TZ=America/Sao_Paulo

WORKDIR /app
COPY apps/worker/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
# O Chromium das animações em HTML, com as bibliotecas do sistema que ele pede, numa pasta que todos leem
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN playwright install --with-deps chromium-headless-shell && chmod -R a+rX /ms-playwright

COPY core /app/core
COPY apps/worker /app/worker
COPY infra/backup /app/backup

RUN useradd --create-home --uid 1000 takeone && mkdir -p /dados/armazenamento /dados/backups && chown -R takeone /dados
USER takeone

CMD ["python", "-m", "worker.worker_principal", "--automatico", "--recursos", "cpu"]
