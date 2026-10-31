# -----------------------------------------------
# TakeOne — o que o próprio vídeo diz de cada corte (o Clipar, ADR 0004, decisão 3: a nota é medida)
#
# Além do ritmo da fala (core/modelos/clipagem.py), a nota final leva três medidas, cada uma de 0 a 1:
#   voz    — em que ponto da fala do próprio vídeo fica o volume da fala do corte (o percentil): quem fala mais
#            alto que o normal dela está num momento de energia; a média do vídeo dá 0,5
#   rosto  — quanto do corte tem um rosto à vista (a busca do "Seguir o rosto", 2 amostras por segundo): o
#            formato em pé corta em volta dele, e um corte sem ninguém em quadro rende menos
#   imagem — a nota média da imagem no corte (nitidez, luz e câmera firme: a nota da montagem automática)
# Uma medida que não existe (vídeo sem imagem, a busca falhou) fica de fora da média. Funções puras.
# -----------------------------------------------
import numpy as np

from core.modelos.midia import NIVEIS_POR_SEGUNDO
from core.modelos.rosto import AMOSTRAS_POR_SEGUNDO as AMOSTRAS_DO_ROSTO

# A janela em que o volume é medido (como o nivelar a voz) e o que conta como fala
JANELA_DO_VOLUME_S = 0.4
FALA_MINIMA_DB = -45.0


def _volumes(niveis: np.ndarray) -> np.ndarray:
    """O volume de cada janela de 0,4 s, em dB, pela média da potência dos picos de 10 ms."""
    passo = max(1, int(round(JANELA_DO_VOLUME_S * NIVEIS_POR_SEGUNDO)))
    n = len(niveis) // passo
    if n == 0:
        return np.zeros(0)
    potencia = 10 ** (niveis[:n * passo].astype(np.float64).reshape(n, passo) / 10)
    return 10 * np.log10(np.maximum(potencia.mean(axis=1), 1e-10))


def _dentro(tempos: np.ndarray, trechos: list[dict]) -> np.ndarray:
    dentro = np.zeros(len(tempos), dtype=bool)
    for trecho in trechos:
        dentro |= (tempos >= trecho["inicio"]) & (tempos < trecho["fim"])
    return dentro


class MedidasDoVideo:
    """As medidas do vídeo inteiro, lidas uma vez, para medir cada corte."""

    def __init__(self, niveis: bytes | np.ndarray | None = None, rostos: list[dict] | None = None,
                 qualidade: dict | None = None):
        self.volumes = None
        if niveis is not None and len(niveis):
            bruto = np.frombuffer(niveis, dtype=np.int8) if isinstance(niveis, bytes | bytearray) else niveis
            volumes = _volumes(np.asarray(bruto))
            fala = volumes[volumes > FALA_MINIMA_DB]
            if len(fala) >= 10:
                self.volumes = volumes
                self.fala_ordenada = np.sort(fala)
        # Os instantes com rosto (a busca só guarda as amostras em que achou alguém)
        self.rostos = np.array([float(a["t"]) for a in rostos]) if rostos is not None else None
        self.qualidade = None
        if qualidade and qualidade.get("t"):
            self.qualidade = (np.asarray(qualidade["t"], dtype=np.float64),
                              np.asarray(qualidade["nota"], dtype=np.float64))

    def voz(self, corte: dict) -> float | None:
        if self.volumes is None:
            return None
        tempos = (np.arange(len(self.volumes)) + 0.5) * JANELA_DO_VOLUME_S
        volumes = self.volumes[_dentro(tempos, corte["trechos"])]
        volumes = volumes[volumes > FALA_MINIMA_DB]
        if len(volumes) < 3:
            return None
        mediana = float(np.median(volumes))
        abaixo = np.searchsorted(self.fala_ordenada, mediana, side="left")
        acima = np.searchsorted(self.fala_ordenada, mediana, side="right")
        return round(float((abaixo + acima) / 2 / len(self.fala_ordenada)), 3)

    def rosto(self, corte: dict) -> float | None:
        if self.rostos is None or corte["duracao"] <= 0:
            return None
        com_rosto = int(_dentro(self.rostos, corte["trechos"]).sum())
        return round(min(1.0, com_rosto / (corte["duracao"] * AMOSTRAS_DO_ROSTO)), 3)

    def imagem(self, corte: dict) -> float | None:
        if self.qualidade is None:
            return None
        tempos, notas = self.qualidade
        dentro = _dentro(tempos, corte["trechos"])
        if not dentro.any():
            return None
        return round(float(notas[dentro].mean()), 3)

    def do_corte(self, corte: dict) -> dict:
        """As medidas que existem, sem as que faltam."""
        medidas = {"voz": self.voz(corte), "rosto": self.rosto(corte), "imagem": self.imagem(corte)}
        return {nome: valor for nome, valor in medidas.items() if valor is not None}
