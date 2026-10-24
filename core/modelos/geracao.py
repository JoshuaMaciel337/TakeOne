# -----------------------------------------------
# TakeOne — geração de vídeo e de imagem com o Wan 2.2 TI2V-5B, e o preenchimento generativo com o Wan 2.1
# VACE 1.3B (pelo ComfyUI)
# Funções puras: os formatos, o fluxo que vai para o ComfyUI e quanto tempo ele deve levar.
# Com uma imagem, ela é o primeiro quadro e o texto descreve o movimento (o mesmo modelo faz os dois).
# A imagem é um vídeo de um quadro só, em 720p: sem os outros quadros, cabe na placa e sai em uns 3 min.
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

# A imagem: um quadro em 720p (lados múltiplos de 32), com mais passos que o vídeo
FORMATOS_DA_IMAGEM = {
    "16:9": (1280, 704),
    "9:16": (704, 1280),
    "1:1": (960, 960),
    "4:5": (896, 1120),
}
PASSOS_DA_IMAGEM = 30
# Medido no Nitro 5 (23/10/2026): 1280 × 704 em 194 s, quase tudo carregando os pesos
SEGUNDOS_DA_IMAGEM = 200

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


def montar_fluxo_da_imagem(descricao: str, formato: str, semente: int, prefixo: str) -> dict:
    """O grafo da imagem: o mesmo do vídeo com um quadro só, mais passos e um PNG no fim."""
    largura, altura = FORMATOS_DA_IMAGEM[formato]
    fluxo = montar_fluxo(descricao, "16:9", 1, semente, prefixo)
    fluxo["7"]["inputs"].update({"width": largura, "height": altura, "length": 1})
    fluxo["8"]["inputs"]["steps"] = PASSOS_DA_IMAGEM
    del fluxo["10"]
    fluxo["11"] = {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": prefixo}}
    return fluxo


def arquivo_gerado(historico: dict, extensao: str = ".mp4") -> dict | None:
    """O arquivo salvo, no registro do ComfyUI: {filename, subfolder, type}."""
    for saida in (historico.get("outputs") or {}).values():
        for itens in saida.values():
            if not isinstance(itens, list):
                continue
            for item in itens:
                if isinstance(item, dict) and str(item.get("filename", "")).endswith(extensao):
                    return item
    return None


# O preenchimento generativo (o editor de imagem): o Wan 2.1 VACE 1.3B (Apache-2.0) recebe a imagem com a área
# a preencher em cinza e a máscara dela, e pinta só ali, no tamanho em que foi treinado (480p). O Wan 2.2 TI2V lê
# a máscara de ruído do latente como o passo de cada pedaço (é assim que ele segura o primeiro quadro), e o buraco
# saía em ruído colorido; o image-to-image dele refazia a imagem inteira e a emenda aparecia.
AREA_DO_PREENCHIMENTO = 832 * 480
LADO_MAXIMO_DO_PREENCHIMENTO = 1024
PASSOS_DO_PREENCHIMENTO = 25
# Medido no Nitro 5 (24/10/2026), em 832 × 464 com o modelo já carregado
SEGUNDOS_DO_PREENCHIMENTO = 60
# Sem texto, a pessoa quer tirar o que estava ali: o fundo continua, e gente e objetos novos vão no negativo (com o
# texto genérico de antes, a máscara alta ao lado de alguém virava outra pessoa)
DESCRICAO_PADRAO_DO_PREENCHIMENTO = ("o fundo da cena continuando, vazio, sem pessoas e sem objetos novos, "
                                     "com a mesma luz e a mesma textura, fotografia realista")
NEGATIVO_DO_FUNDO = "pessoa, pessoas, gente, rosto, corpo, mão, figura humana, silhueta, objeto novo"


def tamanho_do_preenchimento(largura: int, altura: int) -> tuple[int, int]:
    """O tamanho em que o recorte vai ao modelo: a mesma proporção, na área de 480p (o recorte pequeno também
    cresce até ela: num recorte de 160 × 224 o modelo pintava borrões) e até 1024 de lado, em múltiplos de 16
    (o que o VACE pede)."""
    escala = min(math.sqrt(AREA_DO_PREENCHIMENTO / (largura * altura)),
                 LADO_MAXIMO_DO_PREENCHIMENTO / max(largura, altura))
    return max(16, round(largura * escala / 16) * 16), max(16, round(altura * escala / 16) * 16)


def montar_fluxo_do_preenchimento(descricao: str, imagem: str, largura: int, altura: int, semente: int,
                                  prefixo: str) -> dict:
    """O grafo do preenchimento: a imagem (`imagem`, já no ComfyUI, com o alfa 0 na área a preencher) vira o
    vídeo de controle de um quadro, com essa área em cinza; a máscara é a mesma área, um pouco maior."""
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "wan2.1_vace_1.3B_fp16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan_2.1_vae.safetensors"}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8}},
        "5": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": descricao or DESCRICAO_PADRAO_DO_PREENCHIMENTO}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": NEGATIVO if descricao else f"{NEGATIVO}, {NEGATIVO_DO_FUNDO}"}},
        "12": {"class_type": "LoadImage", "inputs": {"image": imagem}},
        "14": {"class_type": "GrowMask", "inputs": {"mask": ["12", 1], "expand": 8, "tapered_corners": True}},
        "17": {"class_type": "EmptyImage",
               "inputs": {"width": largura, "height": altura, "batch_size": 1, "color": 0x7F7F7F}},
        "16": {"class_type": "ImageCompositeMasked",
               "inputs": {"destination": ["12", 0], "source": ["17", 0], "x": 0, "y": 0, "resize_source": False,
                          "mask": ["14", 0]}},
        "7": {"class_type": "WanVaceToVideo",
              "inputs": {"positive": ["5", 0], "negative": ["6", 0], "vae": ["3", 0], "width": largura,
                         "height": altura, "length": 1, "batch_size": 1, "strength": 1.0,
                         "control_video": ["16", 0], "control_masks": ["14", 0]}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["4", 0], "positive": ["7", 0], "negative": ["7", 1], "latent_image": ["7", 2],
                         "seed": semente, "steps": PASSOS_DO_PREENCHIMENTO, "cfg": 6, "sampler_name": "uni_pc",
                         "scheduler": "simple", "denoise": 1}},
        "18": {"class_type": "TrimVideoLatent", "inputs": {"samples": ["8", 0], "trim_amount": ["7", 3]}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["18", 0], "vae": ["3", 0]}},
        "11": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": prefixo}},
    }


# Os filtros neurais do editor de imagem pelo mesmo VACE: a foto inteira como vídeo de controle e a máscara toda
# acesa, com o texto dizendo o que mudar. Na transferência de estilo a foto vai colorida e o texto é o estilo; no
# colorir, vai em cinza e só a cor do resultado volta (core/utils/foto_neural.py).
ESTILOS = {
    "oleo": ("Pintura a óleo", "pintura a óleo impressionista, pinceladas grossas e visíveis, tela de pintura"),
    "aquarela": ("Aquarela", "pintura em aquarela, manchas de tinta suaves, papel de aquarela, bordas que escorrem"),
    "lapis": ("Desenho a lápis", "desenho a lápis grafite em papel, traços e sombreado à mão, preto e branco"),
    "quadrinhos": ("Quadrinhos",
                   "ilustração de história em quadrinhos, contornos pretos fortes, cores chapadas, retícula"),
    "anime": ("Anime", "ilustração em estilo anime, cores limpas, contornos finos, céu pintado à mão"),
    "pop": ("Pop art", "pop art, cores primárias saturadas, contornos grossos, pontos de retícula"),
    "vitral": ("Vitral", "vitral de igreja, pedaços de vidro colorido, contornos de chumbo"),
    "mosaico": ("Mosaico", "mosaico de pastilhas de cerâmica, peças pequenas e coloridas"),
    "digital": ("Arte digital", "arte digital pintada, luz cinematográfica, cores vibrantes, detalhes nítidos"),
}
DESCRICAO_DO_COLORIR = "fotografia colorida com cores naturais e realistas"
# Sem isto, o colorir saía em neon (roxo e amarelo fortes) mesmo com o texto pedindo cores naturais
NEGATIVO_DO_COLORIR = "cores saturadas demais, neon, cores artificiais, roxo e amarelo fortes"


def montar_fluxo_do_vace_inteiro(descricao: str, imagem: str, largura: int, altura: int, semente: int,
                                 prefixo: str, negativo_extra: str = "") -> dict:
    """O VACE guiado pela foto inteira (`imagem`, já no ComfyUI): sem área a preencher, a máscara toda acesa."""
    fluxo = montar_fluxo_do_preenchimento(descricao, imagem, largura, altura, semente, prefixo)
    if negativo_extra:
        fluxo["6"]["inputs"]["text"] = f"{NEGATIVO}, {negativo_extra}"
    fluxo["14"] = {"class_type": "SolidMask", "inputs": {"value": 1.0, "width": largura, "height": altura}}
    fluxo["7"]["inputs"]["control_video"] = ["12", 0]
    del fluxo["16"], fluxo["17"]
    return fluxo
