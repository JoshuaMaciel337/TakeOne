# -----------------------------------------------
# TakeOne — o caminho de um objeto marcado num vídeo
#
# A pessoa marca um retângulo num quadro (instante `t` da mídia, em segundos) e o worker segue o objeto
# para os dois lados, dentro do trecho [de, ate] que o clipe usa. Cada ponto é [t, x, y, largura, altura,
# nota]: o centro e o tamanho em frações da imagem como ela aparece, e a confiança do rastreador (0 a 1).
# O editor transforma o caminho em keyframes de posição do texto que segue o objeto
# (apps/web/src/lib/projeto/seguirObjeto.ts). Funções puras.
# -----------------------------------------------
from core.utils.mongo import agora

STATUS_PROCESSANDO = "processando"
STATUS_PRONTO = "pronto"
STATUS_ERRO = "erro"

# Quadros seguidos por segundo, na regra da prévia (o último quadro que chegou)
QUADROS_POR_SEGUNDO = 30
# Lado maior em que o rastreador vê o quadro: o da cópia leve (720p). Medido num objeto andando em curva
# sobre uma foto, a 1280 × 720: o VitTrack errou 3,6 px em média e levou 6,7 ms por quadro; a 512 de
# largura o erro passava de 15 px (cada pixel do rastreador vira 2,5 no vídeo)
LARGURA_MAXIMA_DE_ANALISE = 1280
# Na volta, os quadros são lidos em blocos deste tamanho (2 s, uns 170 MB em 720p)
QUADROS_POR_BLOCO = 60
# O trecho seguido de uma vez
TRECHO_MAXIMO_S = 180
# Retângulo menor que isto (fração do lado) não tem textura para seguir
LADO_MINIMO = 0.02


def conferir_pedido(t: float, caixa: dict, de: float, ate: float, duracao: float) -> str | None:
    """A mensagem para a pessoa se o pedido não serve, ou None."""
    if not 0 <= de <= t <= ate or ate > duracao + 0.5:
        return "O instante marcado precisa estar dentro do trecho do clipe."
    if ate - de > TRECHO_MAXIMO_S:
        return f"Dá para seguir um objeto por até {TRECHO_MAXIMO_S // 60} minutos de vídeo de cada vez."
    x, y, largura, altura = caixa["x"], caixa["y"], caixa["largura"], caixa["altura"]
    if largura < LADO_MINIMO or altura < LADO_MINIMO:
        return "Marque um retângulo maior em volta do objeto."
    if x < 0 or y < 0 or x + largura > 1.0001 or y + altura > 1.0001:
        return "O retângulo precisa ficar dentro da imagem do vídeo."
    return None


def montar_rastreio(organizacao_id, midia_id, arquivo: str, t: float, caixa: dict, de: float, ate: float) -> dict:
    momento = agora()
    return {"organizacao_id": organizacao_id, "midia_id": midia_id, "arquivo": arquivo, "t": t, "caixa": caixa,
            "de": de, "ate": ate, "status": STATUS_PROCESSANDO, "pontos": [], "erro": None,
            "criado_em": momento, "atualizado_em": momento}
