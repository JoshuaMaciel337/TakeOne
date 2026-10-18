# -----------------------------------------------
# TakeOne — geração de vídeo com o Wan 2.2 TI2V-5B (pelo ComfyUI)
# Funções puras: os formatos, o fluxo que vai para o ComfyUI e quanto tempo ele deve levar.
# Com uma imagem, ela é o primeiro quadro e o texto descreve o movimento (o mesmo modelo faz os dois).
# -----------------------------------------------
import math
import re

# Em 480p, o tamanho medido no Nitro 5 (8 GB de VRAM). Lados múltiplos de 32, como o Wan pede.
FORMATOS = {
    "16:9": (832, 480),
    "9:16": (480, 832),
    "1:1": (640, 640),
}
FPS = 24
DURACOES = (2, 3, 4, 5)
PASSOS = 20
DESCRICAO_MINIMA = 3
DESCRICAO_MAXIMA = 800
# O que o modelo deve evitar (texto fixo, a pessoa só escreve o que quer ver)
NEGATIVO = "borrado, baixa qualidade, distorcido, deformado, texto, legenda, marca d'água, quadros estáticos, piscando"

# Medido no Nitro 5 pelo serviço comfyui (15/10/2026), com 20 passos em 480p: 73 quadros em 314 s e
# 121 quadros em 541 s, uns 4,5 s por quadro (com o carregamento dos pesos e a decodificação).
SEGUNDOS_POR_QUADRO = 4.47


def quadros_para(duracao: int) -> int:
    """O Wan pede 4k + 1 quadros: 2 s → 49, 5 s → 121."""
    return FPS * duracao + 1


def segundos_estimados(duracao: int, formato: str = "16:9") -> int:
    largura, altura = FORMATOS[formato]
    return round(SEGUNDOS_POR_QUADRO * quadros_para(duracao) * largura * altura / (832 * 480))


def formato_da_imagem(largura: int, altura: int) -> str:
    """O formato mais perto da proporção da imagem (comparando em escala logarítmica: 2:1 fica no 16:9)."""
    return min(FORMATOS, key=lambda f: abs(math.log((largura / altura) / (FORMATOS[f][0] / FORMATOS[f][1]))))


def nome_da_midia(descricao: str) -> str:
    """'Ondas do mar quebrando ao pôr do sol, câmera lenta' → 'IA · Ondas do mar quebrando ao pôr do sol'."""
    texto = re.sub(r"\s+", " ", descricao).strip()
    trecho = re.split(r"[.,;:!?\n]", texto, maxsplit=1)[0].strip() or texto
    if len(trecho) > 60:
        trecho = trecho[:60].rsplit(" ", 1)[0] + "…"
    return f"IA · {trecho}"


def montar_fluxo(descricao: str, formato: str, duracao: int, semente: int, prefixo: str,
                 imagem: str | None = None) -> dict:
    """O grafo da API do ComfyUI: texto → latente do Wan 2.2 → amostragem → vídeo MP4 (H.264, 24 fps).
    `imagem` é o nome de um arquivo já enviado ao ComfyUI (/upload/image), no tamanho do formato: vira o
    primeiro quadro."""
    largura, altura = FORMATOS[formato]
    fluxo = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": descricao}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEGATIVO}},
        "7": {"class_type": "Wan22ImageToVideoLatent",
              "inputs": {"vae": ["3", 0], "width": largura, "height": altura, "length": quadros_para(duracao),
                         "batch_size": 1}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
                         "seed": semente, "steps": PASSOS, "cfg": 5, "sampler_name": "uni_pc",
                         "scheduler": "simple", "denoise": 1}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "CreateVideo", "inputs": {"images": ["9", 0], "fps": FPS}},
        "11": {"class_type": "SaveVideo",
               "inputs": {"video": ["10", 0], "filename_prefix": prefixo, "format": "mp4", "codec": "h264"}},
    }
    if imagem:
        fluxo["12"] = {"class_type": "LoadImage", "inputs": {"image": imagem}}
        fluxo["7"]["inputs"]["start_image"] = ["12", 0]
    return fluxo


def arquivo_gerado(historico: dict) -> dict | None:
    """O vídeo salvo, no registro do ComfyUI: {filename, subfolder, type}."""
    for saida in (historico.get("outputs") or {}).values():
        for itens in saida.values():
            if not isinstance(itens, list):
                continue
            for item in itens:
                if isinstance(item, dict) and str(item.get("filename", "")).endswith(".mp4"):
                    return item
    return None
