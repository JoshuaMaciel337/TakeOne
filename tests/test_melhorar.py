# O "Melhorar" em Python (core/utils/melhorar.py) é o do editor: os casos de tests/casos/melhorar.json saem daqui e
# o teste do TS (apps/web/src/lib/projeto/melhorar.test.ts) confere a conta dele nos mesmos números
import json
from pathlib import Path

import numpy as np

from core.utils.melhorar import ajustes_automaticos

CASOS = Path(__file__).parent / "casos" / "melhorar.json"


def amostras() -> dict[str, np.ndarray]:
    r = np.random.default_rng(16)

    def imagem(base, ruido, lado=14, alfa=255):
        pixels = np.clip(np.asarray(base, float) + r.normal(0, ruido, (lado * lado, 3)), 0, 255)
        return np.concatenate([pixels, np.full((lado * lado, 1), alfa)], axis=1).round().astype(np.uint8)

    gradiente = np.linspace(0, 255, 14 * 14)[:, None].repeat(3, 1)
    lavada = np.concatenate([gradiente * 0.4 + 90, np.full((196, 1), 255)], axis=1).round().astype(np.uint8)
    estourada = imagem((250, 248, 245), 6)
    estourada[:40, :3] = 40
    com_transparencia = imagem((60, 120, 200), 20)
    com_transparencia[::2, 3] = 0
    return {
        "escura": imagem((30, 28, 25), 10),
        "clara_azulada": imagem((160, 175, 215), 15),
        "quente": imagem((200, 150, 100), 25),
        "lavada": lavada,
        "estourada": estourada,
        "apagada": imagem((128, 126, 124), 4),
        "com_transparencia": com_transparencia,
        "pequena": imagem((90, 90, 90), 5, lado=3),
    }


def casos() -> list[dict]:
    return [{"nome": nome, "rgba": rgba.ravel().tolist(), "esperado": ajustes_automaticos(rgba)}
            for nome, rgba in amostras().items()]


def test_os_casos_sao_os_da_conta():
    guardados = json.loads(CASOS.read_text(encoding="utf-8"))
    assert guardados == casos(), "rode este arquivo como programa para refazer tests/casos/melhorar.json"


if __name__ == "__main__":
    CASOS.write_text(json.dumps(casos(), ensure_ascii=False) + "\n", encoding="utf-8")
