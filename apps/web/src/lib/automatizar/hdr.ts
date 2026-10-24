// Arquivo › Automatizar › Mesclar para HDR (ADR 0003, onda 13.13): a fusão de exposições de Mertens, Kautz e Van
// Reeth (2007). Cada foto (a mesma cena, de escura a clara, já alinhada) ganha um peso por pixel pelo contraste
// (o laplaciano do cinza), pela saturação (o desvio dos três canais) e pela exposição bem feita (perto do meio-tom);
// as fotos se juntam pelas pirâmides laplacianas, com os pesos nas gaussianas, e o resultado já sai em 8 bits, sem a
// tonalização de um HDR de 32 bits. As pirâmides são somadas uma foto por vez, para caber na memória.

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };

export type OpcoesDoHdr = { contraste: number; saturacao: number; exposicao: number };
export const OPCOES_PADRAO_DO_HDR: OpcoesDoHdr = { contraste: 1, saturacao: 1, exposicao: 1 };

type Plano = { dados: Float32Array; largura: number; altura: number; canais: number };

const NUCLEO = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

/** Desfoca (o núcleo binomial de 5) e tira um pixel a cada dois: o nível seguinte da pirâmide gaussiana. */
function reduzir(p: Plano): Plano {
  const { largura: l, altura: a, canais: c } = p;
  const meio = new Float32Array(l * a * c);
  for (let y = 0; y < a; y++)
    for (let x = 0; x < l; x++)
      for (let e = 0; e < c; e++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += NUCLEO[k + 2] * p.dados[(y * l + Math.min(l - 1, Math.max(0, x + k))) * c + e];
        meio[(y * l + x) * c + e] = s;
      }
  const nl = Math.ceil(l / 2);
  const na = Math.ceil(a / 2);
  const saida = new Float32Array(nl * na * c);
  for (let y = 0; y < na; y++)
    for (let x = 0; x < nl; x++)
      for (let e = 0; e < c; e++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += NUCLEO[k + 2] * meio[(Math.min(a - 1, Math.max(0, y * 2 + k)) * l + x * 2) * c + e];
        saida[(y * nl + x) * c + e] = s;
      }
  return { dados: saida, largura: nl, altura: na, canais: c };
}

/** O nível de cima no tamanho do de baixo (bilinear): o que o laplaciano subtrai e o que a montagem soma. */
function ampliar(p: Plano, largura: number, altura: number): Float32Array {
  const { largura: l, altura: a, canais: c } = p;
  const saida = new Float32Array(largura * altura * c);
  for (let y = 0; y < altura; y++) {
    const fy = Math.min(a - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(a - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < largura; x++) {
      const fx = Math.min(l - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(l - 1, x0 + 1);
      const tx = fx - x0;
      for (let e = 0; e < c; e++) {
        const v00 = p.dados[(y0 * l + x0) * c + e];
        const v01 = p.dados[(y0 * l + x1) * c + e];
        const v10 = p.dados[(y1 * l + x0) * c + e];
        const v11 = p.dados[(y1 * l + x1) * c + e];
        saida[(y * largura + x) * c + e] = (v00 * (1 - tx) + v01 * tx) * (1 - ty) + (v10 * (1 - tx) + v11 * tx) * ty;
      }
    }
  }
  return saida;
}

/** O peso de cada pixel da foto (contraste × saturação × exposição, com os expoentes das opções). */
export function pesosDaExposicao(imagem: Imagem, opcoes: OpcoesDoHdr): Float32Array {
  const { largura: l, altura: a, dados } = imagem;
  const cinza = new Float32Array(l * a);
  for (let p = 0; p < l * a; p++) cinza[p] = (0.299 * dados[p * 4] + 0.587 * dados[p * 4 + 1] + 0.114 * dados[p * 4 + 2]) / 255;
  const pesos = new Float32Array(l * a);
  for (let y = 0; y < a; y++)
    for (let x = 0; x < l; x++) {
      const p = y * l + x;
      const vizinho = (dx: number, dy: number) => cinza[Math.min(a - 1, Math.max(0, y + dy)) * l + Math.min(l - 1, Math.max(0, x + dx))];
      const contraste = Math.abs(vizinho(-1, 0) + vizinho(1, 0) + vizinho(0, -1) + vizinho(0, 1) - 4 * cinza[p]);
      const r = dados[p * 4] / 255;
      const g = dados[p * 4 + 1] / 255;
      const b = dados[p * 4 + 2] / 255;
      const media = (r + g + b) / 3;
      const saturacao = Math.sqrt(((r - media) ** 2 + (g - media) ** 2 + (b - media) ** 2) / 3);
      const sino = (v: number) => Math.exp(-((v - 0.5) ** 2) / (2 * 0.2 * 0.2));
      const exposicao = sino(r) * sino(g) * sino(b);
      // O transparente (a borda de uma exposição alinhada) quase não pesa: o pixel vem das que cobrem
      pesos[p] = dados[p * 4 + 3] === 0 ? 1e-12 : (contraste ** opcoes.contraste) * (saturacao ** opcoes.saturacao) * (exposicao ** opcoes.exposicao) + 1e-9;
    }
  return pesos;
}

/** As fotos (do mesmo tamanho) numa só. */
export function mesclarExposicoes(imagens: Imagem[], opcoes: OpcoesDoHdr = OPCOES_PADRAO_DO_HDR): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura } = imagens[0];
  const niveis = Math.max(1, Math.min(8, Math.floor(Math.log2(Math.min(largura, altura))) - 2));
  // Os pesos normalizados: a soma das fotos em cada pixel é 1
  const pesos = imagens.map((imagem) => pesosDaExposicao(imagem, opcoes));
  for (let p = 0; p < largura * altura; p++) {
    let soma = 0;
    for (const w of pesos) soma += w[p];
    for (const w of pesos) w[p] /= soma;
  }
  let acumulada: Plano[] | null = null;
  for (const [indice, imagem] of imagens.entries()) {
    // A pirâmide gaussiana da foto e a dos pesos dela
    const cor = new Float32Array(largura * altura * 3);
    for (let p = 0; p < largura * altura; p++) for (let e = 0; e < 3; e++) cor[p * 3 + e] = imagem.dados[p * 4 + e] / 255;
    const gauss: Plano[] = [{ dados: cor, largura, altura, canais: 3 }];
    const pesoG: Plano[] = [{ dados: pesos[indice], largura, altura, canais: 1 }];
    for (let n = 1; n < niveis; n++) {
      gauss.push(reduzir(gauss[n - 1]));
      pesoG.push(reduzir(pesoG[n - 1]));
    }
    if (!acumulada) acumulada = gauss.map((g) => ({ ...g, dados: new Float32Array(g.dados.length) }));
    for (let n = 0; n < niveis; n++) {
      // O laplaciano do nível (o último é a própria gaussiana), vezes o peso, somado ao acumulado
      const g = gauss[n];
      const lap = n === niveis - 1 ? g.dados : (() => {
        const acima = ampliar(gauss[n + 1], g.largura, g.altura);
        const d = new Float32Array(g.dados.length);
        for (let i = 0; i < d.length; i++) d[i] = g.dados[i] - acima[i];
        return d;
      })();
      const w = pesoG[n].dados;
      const destino = acumulada[n].dados;
      for (let p = 0; p < g.largura * g.altura; p++) for (let e = 0; e < 3; e++) destino[p * 3 + e] += lap[p * 3 + e] * w[p];
    }
  }
  // A montagem: do nível mais baixo para cima
  let atual = acumulada![niveis - 1];
  for (let n = niveis - 2; n >= 0; n--) {
    const abaixo = acumulada![n];
    const somado = ampliar(atual, abaixo.largura, abaixo.altura);
    for (let i = 0; i < somado.length; i++) somado[i] += abaixo.dados[i];
    atual = { ...abaixo, dados: somado };
  }
  const saida = new Uint8ClampedArray(largura * altura * 4);
  for (let p = 0; p < largura * altura; p++) {
    for (let e = 0; e < 3; e++) saida[p * 4 + e] = Math.round(atual.dados[p * 3 + e] * 255);
    saida[p * 4 + 3] = 255;
  }
  return saida;
}
