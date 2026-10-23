// Selecionar e mascarar (ADR 0003, onda 13.3): a borda da seleção refeita pela imagem. Numa faixa em volta da borda
// (o raio, mais o que o pincel de refinar pintou), a cobertura é onde a cor do pixel cai entre a cor de dentro e a de
// fora em volta dele (as médias do que está certamente dentro e certamente fora da faixa), e o filtro guiado (He, Sun e
// Tang, 2010) tira o ruído dela sem perder os fios e as bordas macias que a seleção dura cortava. Depois vêm suavizar, difusão, contraste e deslocar a borda, nessa ordem, como nos editores de imagem. A
// descontaminação troca a cor da borda pela do que está dentro, para a camada nova não levar o fundo junto.
import { type Selecao, vazia } from "./mascara.ts";
import type { ImagemRgba } from "./varinha.ts";

export type OpcoesDoRefinamento = {
  /** A largura da faixa em volta da borda que é refeita, em pixels. */
  raio: number;
  /** Onde a borda da imagem é dura, a faixa fica estreita (a borda continua nítida). */
  raioInteligente: boolean;
  /** 0 a 100: arredonda os cantos e tira as pontas. */
  suavizar: number;
  /** Desfoque da borda, em pixels. */
  difusao: number;
  /** 0 a 100: a borda fica mais dura. */
  contraste: number;
  /** −100 a 100: a borda anda para fora (positivo) ou para dentro. */
  deslocar: number;
};

export const REFINAMENTO_PADRAO: OpcoesDoRefinamento = { raio: 0, raioInteligente: false, suavizar: 0, difusao: 0, contraste: 0, deslocar: 0 };

/** A média numa janela de raio r (2r + 1 de lado), com a borda repetida, por somas móveis nas duas direções. */
export function mediaNaJanela(valores: Float32Array, largura: number, altura: number, r: number): Float32Array {
  if (r <= 0) return Float32Array.from(valores);
  const meio = new Float32Array(valores.length);
  const lado = 2 * r + 1;
  for (let y = 0; y < altura; y++) {
    const linha = y * largura;
    let soma = 0;
    for (let k = -r; k <= r; k++) soma += valores[linha + Math.min(largura - 1, Math.max(0, k))];
    for (let x = 0; x < largura; x++) {
      meio[linha + x] = soma / lado;
      soma += valores[linha + Math.min(largura - 1, x + r + 1)] - valores[linha + Math.max(0, x - r)];
    }
  }
  const saida = new Float32Array(valores.length);
  for (let x = 0; x < largura; x++) {
    let soma = 0;
    for (let k = -r; k <= r; k++) soma += meio[Math.min(altura - 1, Math.max(0, k)) * largura + x];
    for (let y = 0; y < altura; y++) {
      saida[y * largura + x] = soma / lado;
      soma += meio[Math.min(altura - 1, y + r + 1) * largura + x] - meio[Math.max(0, y - r) * largura + x];
    }
  }
  return saida;
}

/** A luz de cada pixel (0 a 1), no alfa pré-multiplicado sobre o cinza médio. */
function luzDa(imagem: ImagemRgba): Float32Array {
  const { dados } = imagem;
  const luz = new Float32Array(imagem.largura * imagem.altura);
  for (let i = 0; i < luz.length; i++) {
    const a = dados[i * 4 + 3] / 255;
    luz[i] = ((0.2126 * dados[i * 4] + 0.7152 * dados[i * 4 + 1] + 0.0722 * dados[i * 4 + 2]) / 255) * a + 0.5 * (1 - a);
  }
  return luz;
}

/** O filtro guiado em tons de cinza: a cobertura p guiada pela luz I, em janelas de raio r, com regularização eps. */
export function filtroGuiado(luz: Float32Array, cobertura: Float32Array, largura: number, altura: number, r: number, eps: number): Float32Array {
  const media = (v: Float32Array) => mediaNaJanela(v, largura, altura, r);
  const n = luz.length;
  const produto = new Float32Array(n);
  const quadrado = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    produto[i] = luz[i] * cobertura[i];
    quadrado[i] = luz[i] * luz[i];
  }
  const mI = media(luz);
  const mP = media(cobertura);
  const mIP = media(produto);
  const mII = media(quadrado);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const variancia = mII[i] - mI[i] * mI[i];
    a[i] = (mIP[i] - mI[i] * mP[i]) / (variancia + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = media(a);
  const mB = media(b);
  const saida = new Float32Array(n);
  for (let i = 0; i < n; i++) saida[i] = Math.min(1, Math.max(0, mA[i] * luz[i] + mB[i]));
  return saida;
}

/** A distância (em pixels, aproximada pela chanfradura 3-4) de cada pixel até a borda da seleção. */
function distanciaDaBorda(alfa: Float32Array, largura: number, altura: number): Float32Array {
  const dentro = (i: number) => alfa[i] >= 0.5;
  const d = new Float32Array(largura * altura).fill(1e9);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      const vizinhoDiferente = (x > 0 && dentro(i - 1) !== dentro(i)) || (x < largura - 1 && dentro(i + 1) !== dentro(i)) || (y > 0 && dentro(i - largura) !== dentro(i)) || (y < altura - 1 && dentro(i + largura) !== dentro(i));
      // Uma cobertura no meio do caminho (a borda difusa) também é borda
      if (vizinhoDiferente || (alfa[i] > 0.02 && alfa[i] < 0.98)) d[i] = 0;
    }
  }
  // Duas passadas da chanfradura (3 nos lados, 4 nas diagonais), em terços de pixel
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 3);
      if (y > 0) {
        d[i] = Math.min(d[i], d[i - largura] + 3);
        if (x > 0) d[i] = Math.min(d[i], d[i - largura - 1] + 4);
        if (x < largura - 1) d[i] = Math.min(d[i], d[i - largura + 1] + 4);
      }
    }
  }
  for (let y = altura - 1; y >= 0; y--) {
    for (let x = largura - 1; x >= 0; x--) {
      const i = y * largura + x;
      if (x < largura - 1) d[i] = Math.min(d[i], d[i + 1] + 3);
      if (y < altura - 1) {
        d[i] = Math.min(d[i], d[i + largura] + 3);
        if (x < largura - 1) d[i] = Math.min(d[i], d[i + largura + 1] + 4);
        if (x > 0) d[i] = Math.min(d[i], d[i + largura - 1] + 4);
      }
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** A força da borda da imagem (0 a 1) em cada pixel: o gradiente da luz, saturando numa borda forte. */
function forcaDaBorda(luz: Float32Array, largura: number, altura: number): Float32Array {
  const forca = new Float32Array(luz.length);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const em = (dx: number, dy: number) => luz[Math.min(altura - 1, Math.max(0, y + dy)) * largura + Math.min(largura - 1, Math.max(0, x + dx))];
      forca[y * largura + x] = Math.min(1, Math.hypot(em(1, 0) - em(-1, 0), em(0, 1) - em(0, -1)) * 2.5);
    }
  }
  return forca;
}

/**
 * Refaz a seleção pela imagem (do mesmo tamanho). `faixaExtra`: o que o pincel de refinar pintou (1 entra na faixa,
 * mesmo longe da borda: os fios soltos de um cabelo).
 */
export function refinarSelecao(imagem: ImagemRgba, selecao: Selecao, opcoes: OpcoesDoRefinamento, faixaExtra?: Uint8Array | null): Selecao {
  const { largura, altura } = imagem;
  const n = largura * altura;
  let alfa: Float32Array = Float32Array.from(selecao.dados, (v) => v / 255);
  const luz = luzDa(imagem);
  if (opcoes.raio > 0 || faixaExtra) {
    const distancia = distanciaDaBorda(alfa, largura, altura);
    const forca = opcoes.raioInteligente ? forcaDaBorda(mediaNaJanela(luz, largura, altura, 1), largura, altura) : null;
    // O mapa de três partes: o certo de dentro, o certo de fora e a faixa (o raio, ou o que o pincel pintou)
    const naFaixa = new Uint8Array(n);
    const pesoDentro = new Float32Array(n);
    const pesoFora = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // O raio inteligente encolhe a faixa onde a imagem tem borda dura
      const raio = forca ? opcoes.raio * (1 - 0.75 * forca[i]) : opcoes.raio;
      if (distancia[i] <= raio || (faixaExtra?.[i] ?? 0) > 0) naFaixa[i] = 1;
      else if (alfa[i] >= 0.5) pesoDentro[i] = 1;
      else pesoFora[i] = 1;
    }
    // As cores de dentro e de fora em volta de cada pixel: a média pesada numa janela que atravessa a faixa
    const janela = Math.max(3, Math.round(opcoes.raio * 1.5) + 2);
    const somaDentro = mediaNaJanela(pesoDentro, largura, altura, janela);
    const somaFora = mediaNaJanela(pesoFora, largura, altura, janela);
    const cores = [0, 1, 2].map((c) => {
      const canal = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = imagem.dados[i * 4 + 3] / 255;
        canal[i] = (imagem.dados[i * 4 + c] / 255) * a + 0.5 * (1 - a);
      }
      return canal;
    });
    const mediaPesada = (peso: Float32Array) =>
      cores.map((canal) => {
        const pesado = new Float32Array(n);
        for (let i = 0; i < n; i++) pesado[i] = canal[i] * peso[i];
        return mediaNaJanela(pesado, largura, altura, janela);
      });
    const dentro = mediaPesada(pesoDentro);
    const fora = mediaPesada(pesoFora);
    // Na faixa, a cobertura é onde a cor cai entre a de fora (0) e a de dentro (1)
    const projetada = Float32Array.from(alfa);
    for (let i = 0; i < n; i++) {
      if (!naFaixa[i] || somaDentro[i] < 1e-4 || somaFora[i] < 1e-4) continue;
      let numerador = 0;
      let denominador = 0;
      for (let c = 0; c < 3; c++) {
        const f = dentro[c][i] / somaDentro[i];
        const b = fora[c][i] / somaFora[i];
        numerador += (cores[c][i] - b) * (f - b);
        denominador += (f - b) * (f - b);
      }
      // Sem diferença de cor entre dentro e fora, a imagem não diz nada: fica a seleção
      if (denominador > 0.004) projetada[i] = Math.min(1, Math.max(0, numerador / denominador));
    }
    // O filtro guiado tira o ruído da projeção sem perder os fios
    const guiada = filtroGuiado(luz, projetada, largura, altura, 2, 1e-3);
    for (let i = 0; i < n; i++) if (naFaixa[i]) alfa[i] = guiada[i];
  }
  if (opcoes.suavizar > 0) {
    // Desfoca e corta no meio, sem perder a borda macia: o resultado é a mistura do cortado com o macio
    const raio = Math.max(1, Math.round(opcoes.suavizar / 10));
    const desfocado = mediaNaJanela(mediaNaJanela(alfa, largura, altura, raio), largura, altura, raio);
    const peso = Math.min(1, opcoes.suavizar / 50);
    for (let i = 0; i < n; i++) {
      const duro = Math.min(1, Math.max(0, (desfocado[i] - 0.5) * 4 + 0.5));
      alfa[i] = alfa[i] * (1 - peso) + duro * peso;
    }
  }
  if (opcoes.difusao > 0) {
    // Três médias móveis seguidas imitam a gaussiana (sigma = metade da difusão)
    const sigma = opcoes.difusao / 2;
    const raio = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
    for (let k = 0; k < 3; k++) alfa = mediaNaJanela(alfa, largura, altura, raio);
  }
  if (opcoes.contraste > 0) {
    const ganho = 1 + opcoes.contraste / 10;
    for (let i = 0; i < n; i++) alfa[i] = Math.min(1, Math.max(0, (alfa[i] - 0.5) * ganho + 0.5));
  }
  if (opcoes.deslocar !== 0) {
    const desloc = opcoes.deslocar / 100;
    for (let i = 0; i < n; i++) alfa[i] = Math.min(1, Math.max(0, alfa[i] + desloc * Math.min(1, 4 * alfa[i] * (1 - alfa[i]) + (desloc > 0 ? alfa[i] : 1 - alfa[i]))));
  }
  const saida = vazia(largura, altura);
  for (let i = 0; i < n; i++) saida.dados[i] = Math.round(alfa[i] * 255);
  return saida;
}

/**
 * Descontaminar as cores: na borda (cobertura entre 0 e 1), a cor vai em direção à média das cores de dentro em volta
 * (a média da imagem pesada pela cobertura, numa janela de `raio`), na `quantidade` (0 a 1). Devolve outra imagem.
 */
export function descontaminar(imagem: ImagemRgba, selecao: Selecao, quantidade: number, raio: number): ImagemRgba {
  const { largura, altura, dados } = imagem;
  const n = largura * altura;
  const peso = Float32Array.from(selecao.dados, (v) => (v / 255) ** 2);
  // Três médias seguidas (quase uma gaussiana): com uma só, a cor puxada aparecia em quadrados
  const r = Math.max(1, Math.round(raio / 2));
  const suave = (v: Float32Array) => mediaNaJanela(mediaNaJanela(mediaNaJanela(v, largura, altura, r), largura, altura, r), largura, altura, r);
  const somaPeso = suave(peso);
  const canais = [0, 1, 2].map((c) => {
    const pesada = new Float32Array(n);
    for (let i = 0; i < n; i++) pesada[i] = dados[i * 4 + c] * peso[i];
    return suave(pesada);
  });
  const saida = new Uint8ClampedArray(dados);
  for (let i = 0; i < n; i++) {
    const a = selecao.dados[i] / 255;
    if (a <= 0.01 || a >= 0.99 || somaPeso[i] < 1e-4) continue;
    // Quanto mais de fora o pixel, mais a cor vem de dentro
    const mistura = quantidade * (1 - a);
    for (let c = 0; c < 3; c++) saida[i * 4 + c] = Math.round(dados[i * 4 + c] * (1 - mistura) + (canais[c][i] / somaPeso[i]) * mistura);
  }
  return { largura, altura, dados: saida };
}
