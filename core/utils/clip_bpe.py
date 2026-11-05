# -----------------------------------------------
# TakeOne — o tokenizador do CLIP em Python puro (onda 16.9), para o texto livre do detector de distrações
# (OWL-ViT): o mesmo caminho do tokenizer.json do modelo (NFC, espaços juntos, minúsculas, a divisão em palavras, os
# bytes em letras como no GPT-2 e o BPE com o "</w>" no fim de cada palavra), sem pôr outra biblioteca no worker.
# tests/test_clip_bpe.py confere contra os números que a biblioteca oficial dá para as mesmas frases.
# -----------------------------------------------
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

INICIO, FIM = 49406, 49407
TAMANHO = 16
_PALAVRAS = re.compile(r"'s|'t|'re|'ve|'m|'ll|'d|[^\W\d_]+|\d|[^\s\w]+|_+")


@lru_cache(maxsize=1)
def _bytes_em_letras() -> dict[int, str]:
    """A tabela do GPT-2: cada byte vira uma letra imprimível."""
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return dict(zip(bs, map(chr, cs), strict=True))


class TokenizadorClip:
    def __init__(self, caminho: Path):
        dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
        self.vocab: dict[str, int] = dados["model"]["vocab"]
        merges = dados["model"]["merges"]
        pares = [tuple(m.split(" ")) if isinstance(m, str) else tuple(m) for m in merges]
        self.ranks = {par: i for i, par in enumerate(pares)}
        self._cache: dict[str, list[str]] = {}

    def _bpe(self, palavra: str) -> list[str]:
        if palavra in self._cache:
            return self._cache[palavra]
        partes = list(palavra[:-1]) + [palavra[-1] + "</w>"]
        while len(partes) > 1:
            candidatos = [(self.ranks.get((a, b), 1 << 30), i)
                          for i, (a, b) in enumerate(zip(partes, partes[1:], strict=False))]
            rank, _ = min(candidatos)
            if rank == 1 << 30:
                break
            a, b = next((partes[i], partes[i + 1]) for r, i in candidatos if r == rank)
            novas, i = [], 0
            while i < len(partes):
                if i < len(partes) - 1 and partes[i] == a and partes[i + 1] == b:
                    novas.append(a + b)
                    i += 2
                else:
                    novas.append(partes[i])
                    i += 1
            partes = novas
        self._cache[palavra] = partes
        return partes

    def ids(self, texto: str) -> list[int]:
        """Os números do texto, sem o início e o fim."""
        texto = re.sub(r"\s+", " ", unicodedata.normalize("NFC", texto)).lower()
        letras = _bytes_em_letras()
        saida = []
        for pedaco in _PALAVRAS.findall(texto):
            palavra = "".join(letras[b] for b in pedaco.encode("utf-8"))
            saida += [self.vocab[p] for p in self._bpe(palavra) if p in self.vocab]
        return saida

    def lote(self, textos: list[str], tamanho: int = TAMANHO) -> tuple[list[list[int]], list[list[int]]]:
        """Os ids com o início e o fim, cortados e completados com 0 até `tamanho`, e a máscara de atenção."""
        ids, mascara = [], []
        for texto in textos:
            # A pontuação nas pontas sai (a biblioteca oficial trata o "!" do fim de um jeito próprio; os nomes de
            # objetos não precisam dela)
            texto = texto.strip().strip("!?.,;:")
            linha = [INICIO] + self.ids(texto)[:tamanho - 2] + [FIM]
            ids.append(linha + [0] * (tamanho - len(linha)))
            mascara.append([1] * len(linha) + [0] * (tamanho - len(linha)))
        return ids, mascara
