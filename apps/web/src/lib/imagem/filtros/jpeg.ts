// Filtro › Filtros neurais › Remover artefatos de JPEG (ADR 0003, onda 13.11/13.12), sem modelo: os blocos e o
// chuvisco da compressão aparecem na cor (que o JPEG guarda em meia resolução) e no liso da luz. A cor é suavizada;
// a luz, só onde a volta é lisa (a borda continua nítida). A força escala as duas.
import { type ContextoDoFiltro, type ImagemDoFiltro, limitar } from "./comum.ts";
import { borrar, deReta, gradiente, reta } from "./galeriaDeFiltros/base.ts";

export function removerArtefatosDeJpeg(imagem: ImagemDoFiltro, forca: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const img = reta(imagem);
  const { largura, altura } = img;
  const n = largura * altura;
  const f = limitar(forca / 100);
  if (f <= 0) return imagem;
  // Y, Cb e Cr (BT.601), para mexer na cor sem mexer na luz
  const y = new Float32Array(n);
  const cb = new Float32Array(n);
  const cr = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    y[p] = 0.299 * img.r[p] + 0.587 * img.g[p] + 0.114 * img.b[p];
    cb[p] = (img.b[p] - y[p]) * 0.564;
    cr[p] = (img.r[p] - y[p]) * 0.713;
  }
  const sigmaDaCor = (0.8 + 2.2 * f) * ctx.escala;
  const cbLisa = borrar(cb, largura, altura, sigmaDaCor);
  const crLisa = borrar(cr, largura, altura, sigmaDaCor);
  const yLisa = borrar(y, largura, altura, (0.5 + 1.2 * f) * ctx.escala);
  const { m } = gradiente(yLisa, largura, altura);
  for (let p = 0; p < n; p++) {
    // Onde a luz muda pouco (os blocos aparecem no liso), ela é suavizada; na borda, não
    const liso = 1 - limitar(m[p] * 14);
    const luz = y[p] + (yLisa[p] - y[p]) * f * liso;
    img.r[p] = luz + crLisa[p] / 0.713;
    img.b[p] = luz + cbLisa[p] / 0.564;
    img.g[p] = (luz - 0.299 * img.r[p] - 0.114 * img.b[p]) / 0.587;
  }
  return deReta(img, largura, altura, img.a);
}
