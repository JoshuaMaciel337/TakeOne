# TakeOne worker — fila de jobs e backup. FFmpeg incluído.

# O montador dos cortes do Clipar (apps/web/src/lib/clipar/montador): o código TS do editor num arquivo só, que o
# worker da montagem roda pelo Deno (que vem com o yt-dlp)
FROM node:22-alpine AS montador
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY apps/web/src ./src
RUN npm run montador

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
# MobileSAM em ONNX (seleção com um clique, MIT; Acly/MobileSAM numa revisão fixa): o codificador e o decodificador
ARG MOBILESAM=https://huggingface.co/Acly/MobileSAM/resolve/0d3b403339b4674a82493d5e97964dd78089ddc8
ADD --checksum=sha256:580f5fb648ea1062c0aabc26217aed56921985f03f0cbbd852bba81d760cc749 ${MOBILESAM}/mobile_sam_image_encoder.onnx /app/modelos/mobilesam/mobile_sam_image_encoder.onnx
ADD --checksum=sha256:93915fc7c993ab9d59ab8c9ccd3bce37f7509c81ab4150a74abd4d2abbd8570d ${MOBILESAM}/sam_mask_decoder_single.onnx /app/modelos/mobilesam/sam_mask_decoder_single.onnx
RUN chmod -R a+rX /app/modelos/mobilesam
# LaMa em ONNX (apagar objeto, Apache-2.0; Carve/LaMa-ONNX numa revisão fixa, entrada de 512 × 512)
ADD --checksum=sha256:1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6     https://huggingface.co/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx     /app/modelos/lama.onnx
RUN chmod 644 /app/modelos/lama.onnx
# Real-ESRGAN geral x4v3 em ONNX (ampliar fotos, BSD-3; a exportação da Qualcomm AI Hub, versão 0.65.0, entrada de
# 128 × 128): o .onnx e os pesos no .data ao lado, tirados do ZIP
ADD --checksum=sha256:fc094329b24a00c936ebc1cc4c51bc59633e7dc36f4a553344342171cbd3c7cf \
    https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/real_esrgan_general_x4v3/releases/v0.65.0/real_esrgan_general_x4v3-onnx-float.zip \
    /tmp/esrgan.zip
RUN python -c "import zipfile; zipfile.ZipFile('/tmp/esrgan.zip').extractall('/tmp/esrgan')" \
 && mkdir -p /app/modelos/esrgan \
 && mv /tmp/esrgan/real_esrgan_general_x4v3-onnx-float/real_esrgan_general_x4v3.onnx \
       /tmp/esrgan/real_esrgan_general_x4v3-onnx-float/real_esrgan_general_x4v3.data /app/modelos/esrgan/ \
 && rm -rf /tmp/esrgan /tmp/esrgan.zip && chmod -R a+rX /app/modelos/esrgan
# Depth Anything V2 Small em ONNX (profundidade da foto em 3D, Apache-2.0; onnx-community numa revisão fixa).
# O Base e o Large não servem: a licença deles não permite uso comercial
ADD --checksum=sha256:afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c \
    https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx \
    /app/modelos/profundidade.onnx
RUN chmod 644 /app/modelos/profundidade.onnx
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

# A biblioteca de fontes livres (core/fontes/biblioteca.json), conferida pelo SHA-256 de cada arquivo; antes do código,
# para a camada da imagem só mudar quando o manifesto muda
COPY core/fontes/biblioteca.json core/fontes/baixar_biblioteca.py /tmp/fontes/
RUN python /tmp/fontes/baixar_biblioteca.py --manifesto /tmp/fontes/biblioteca.json --destino /app/fontes-biblioteca     && chmod -R a+rX /app/fontes-biblioteca
ENV FONTES_DA_BIBLIOTECA=/app/fontes-biblioteca

COPY core /app/core
COPY apps/worker /app/worker
COPY infra/backup /app/backup
COPY --from=montador /web/dist/montador.mjs /app/montador/montador.mjs

RUN useradd --create-home --uid 1000 takeone && mkdir -p /dados/armazenamento /dados/backups && chown -R takeone /dados
USER takeone

CMD ["python", "-m", "worker.worker_principal", "--automatico", "--recursos", "cpu"]
