#!/bin/sh
# Baixa os pesos do Wan que faltam no volume /modelos (com o SHA-256 conferido), liga cada um na
# pasta que o ComfyUI lê e sobe o ComfyUI. Os arquivos são o pacote do Comfy-Org (Apache-2.0) numa
# revisão fixa do Hugging Face.
set -eu
REVISAO=ee6f4a40737a995bf5818954cfce6d59443b0f04
BASE="https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/$REVISAO/split_files"

baixar() {  # pasta arquivo sha256
  destino="/modelos/$1/$2"
  mkdir -p "/modelos/$1" "/comfyui/models/$1"
  if [ ! -f "$destino" ]; then
    echo "Baixando $1/$2 (só na primeira subida)"
    curl -fL --retry 5 -C - -o "$destino.parcial" "$BASE/$1/$2"
    echo "$3  $destino.parcial" | sha256sum -c -
    mv "$destino.parcial" "$destino"
  fi
  ln -sf "$destino" "/comfyui/models/$1/$2"
}

baixar diffusion_models wan2.2_ti2v_5B_fp16.safetensors 456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e
baixar text_encoders umt5_xxl_fp8_e4m3fn_scaled.safetensors c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68
baixar vae wan2.2_vae.safetensors e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156

# O preenchimento generativo do editor de imagem: o Wan 2.1 VACE 1.3B e o VAE dele (Apache-2.0), do pacote do
# Wan 2.1 do Comfy-Org, também numa revisão fixa
REVISAO=123acf1cc74bccbb9bfff8ac1ee72edc08c2341d
BASE="https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/$REVISAO/split_files"
baixar diffusion_models wan2.1_vace_1.3B_fp16.safetensors 640ccc0577e6a5d4bb15cd91b11b699ef914fc55f126c5a1c544e152130784f2
baixar vae wan_2.1_vae.safetensors 2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b

exec python main.py --listen 0.0.0.0 --port 8188
