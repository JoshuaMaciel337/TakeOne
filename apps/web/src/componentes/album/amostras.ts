// As imagens do álbum lidas no navegador: a amostra para o "Melhorar", o igualar e os estilos, e a prévia de uma
// cor desenhada sobre a capa (a mesma LUT 3D da prévia do editor e do worker).
import { type Cor, COR_PADRAO, ajustesEfetivos, escurecimentoDaVinheta } from "@/lib/projeto/cor";
import { corDoClipeEmPixels } from "@/lib/projeto/igualarCor";

async function carregar(url: string): Promise<HTMLImageElement> {
  const imagem = new Image();
  imagem.src = url;
  await imagem.decode();
  return imagem;
}

/** Os pixels de uma imagem da API reduzida a `lado` no lado maior, em RGBA. */
export async function amostra(url: string, lado = 160): Promise<Uint8ClampedArray> {
  const imagem = await carregar(url);
  const escala = lado / Math.max(imagem.naturalWidth, imagem.naturalHeight);
  const w = Math.max(1, Math.round(imagem.naturalWidth * escala));
  const h = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const contexto = new OffscreenCanvas(w, h).getContext("2d")!;
  contexto.drawImage(imagem, 0, 0, w, h);
  return contexto.getImageData(0, 0, w, h).data;
}

/** Roda uma conta em cada item, no máximo `juntas` ao mesmo tempo. */
export async function emLotes<T, R>(itens: T[], conta: (item: T) => Promise<R>, juntas = 6): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(juntas, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        saida[i] = await conta(itens[i]);
      }
    }),
  );
  return saida;
}

/** A imagem com a cor (ajustes, filtro, cor por matiz, curvas, LUT e vinheta), num endereço de objeto. */
export async function previaComCor(url: string, cor: Partial<Cor>, lado = 560): Promise<string> {
  const imagem = await carregar(url);
  const escala = Math.min(1, lado / Math.max(imagem.naturalWidth, imagem.naturalHeight));
  const w = Math.max(1, Math.round(imagem.naturalWidth * escala));
  const h = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const canvas = new OffscreenCanvas(w, h);
  const contexto = canvas.getContext("2d")!;
  contexto.drawImage(imagem, 0, 0, w, h);
  const dados = contexto.getImageData(0, 0, w, h);
  const completa: Cor = { ...COR_PADRAO, ...cor };
  const conta = corDoClipeEmPixels(completa);
  const vinheta = ajustesEfetivos(completa).vinheta;
  if (conta || vinheta > 0) {
    const p = dados.data;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        let rgb: [number, number, number] = [p[i] / 255, p[i + 1] / 255, p[i + 2] / 255];
        if (conta) rgb = conta(rgb);
        const fator = vinheta > 0 ? 1 - escurecimentoDaVinheta((x + 0.5) / w, (y + 0.5) / h, vinheta) : 1;
        p[i] = Math.round(rgb[0] * fator * 255);
        p[i + 1] = Math.round(rgb[1] * fator * 255);
        p[i + 2] = Math.round(rgb[2] * fator * 255);
      }
    }
    contexto.putImageData(dados, 0, 0);
  }
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 }));
}
