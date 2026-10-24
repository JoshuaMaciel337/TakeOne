// As fatias do editor de imagem (ADR 0003, onda 13.15): retângulos do documento que saem cada um num arquivo. As
// fatias da pessoa ficam no documento; as automáticas cobrem o resto (a grade formada pelas bordas de todas, sem o que
// já está numa fatia, juntando os pedaços vizinhos), como lá.

export type Fatia = { id: string; nome: string; x: number; y: number; largura: number; altura: number };
export type Retangulo = { x: number; y: number; largura: number; altura: number };

export const MAXIMO_DE_FATIAS = 500;

/** O retângulo de dois cantos, em pixels inteiros e dentro do documento (ou null, se não sobrar nada). */
export function retanguloDosCantos(a: { x: number; y: number }, b: { x: number; y: number }, documento: { largura: number; altura: number }): Retangulo | null {
  const x0 = Math.max(0, Math.round(Math.min(a.x, b.x)));
  const y0 = Math.max(0, Math.round(Math.min(a.y, b.y)));
  const x1 = Math.min(documento.largura, Math.round(Math.max(a.x, b.x)));
  const y1 = Math.min(documento.altura, Math.round(Math.max(a.y, b.y)));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 } : null;
}

/** As bordas em ordem, sem repetir, com as do documento. */
function cortes(valores: number[], fim: number): number[] {
  return [...new Set([0, fim, ...valores.map(Math.round).filter((v) => v > 0 && v < fim)])].sort((a, b) => a - b);
}

/** Fatias a partir das guias: uma fatia por célula da grade das guias (as que caem fora do documento não contam). */
export function fatiasDasGuias(guias: { verticais: number[]; horizontais: number[] }, documento: { largura: number; altura: number }, novoId: () => string): Fatia[] {
  const xs = cortes(guias.verticais, documento.largura);
  const ys = cortes(guias.horizontais, documento.altura);
  const fatias: Fatia[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) fatias.push({ id: novoId(), nome: "", x: xs[i], y: ys[j], largura: xs[i + 1] - xs[i], altura: ys[j + 1] - ys[j] });
  }
  return fatias;
}

/** Dividir a fatia em colunas e linhas iguais (o resto da conta vai para as últimas). */
export function dividirFatia(fatia: Fatia, colunas: number, linhas: number, novoId: () => string): Fatia[] {
  const partes: Fatia[] = [];
  const xs = Array.from({ length: colunas + 1 }, (_, i) => fatia.x + Math.round((fatia.largura * i) / colunas));
  const ys = Array.from({ length: linhas + 1 }, (_, j) => fatia.y + Math.round((fatia.altura * j) / linhas));
  for (let j = 0; j < linhas; j++) {
    for (let i = 0; i < colunas; i++) {
      if (xs[i + 1] > xs[i] && ys[j + 1] > ys[j]) partes.push({ id: i === 0 && j === 0 ? fatia.id : novoId(), nome: i === 0 && j === 0 ? fatia.nome : "", x: xs[i], y: ys[j], largura: xs[i + 1] - xs[i], altura: ys[j + 1] - ys[j] });
    }
  }
  return partes;
}

/** A fatia de cima no ponto (a criada por último), ou null. */
export function fatiaNoPonto(fatias: Fatia[], x: number, y: number): Fatia | null {
  for (let i = fatias.length - 1; i >= 0; i--) {
    const f = fatias[i];
    if (x >= f.x && x < f.x + f.largura && y >= f.y && y < f.y + f.altura) return f;
  }
  return null;
}

/**
 * As fatias automáticas: as células da grade das bordas de todas as fatias (e do documento) que nenhuma fatia cobre,
 * juntadas na horizontal e depois na vertical quando têm as mesmas bordas.
 */
export function fatiasAutomaticas(fatias: Fatia[], documento: { largura: number; altura: number }): Retangulo[] {
  const xs = cortes(fatias.flatMap((f) => [f.x, f.x + f.largura]), documento.largura);
  const ys = cortes(fatias.flatMap((f) => [f.y, f.y + f.altura]), documento.altura);
  const livre = (i: number, j: number) => !fatiaNoPonto(fatias, (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2);
  // Na horizontal: os trechos livres seguidos de cada linha da grade
  const linhas: Retangulo[][] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const linha: Retangulo[] = [];
    let i = 0;
    while (i < xs.length - 1) {
      if (!livre(i, j)) {
        i++;
        continue;
      }
      let k = i;
      while (k + 1 < xs.length - 1 && livre(k + 1, j)) k++;
      linha.push({ x: xs[i], y: ys[j], largura: xs[k + 1] - xs[i], altura: ys[j + 1] - ys[j] });
      i = k + 1;
    }
    linhas.push(linha);
  }
  // Na vertical: um trecho igual na linha de baixo cresce o de cima
  const prontos: Retangulo[] = [];
  let abertos: Retangulo[] = [];
  for (const linha of linhas) {
    const seguem: Retangulo[] = [];
    for (const trecho of linha) {
      const acima = abertos.find((r) => r.x === trecho.x && r.largura === trecho.largura && r.y + r.altura === trecho.y);
      if (acima) {
        acima.altura += trecho.altura;
        seguem.push(acima);
      } else seguem.push({ ...trecho });
    }
    prontos.push(...abertos.filter((r) => !seguem.includes(r)));
    abertos = seguem;
  }
  return [...prontos, ...abertos].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** O nome do arquivo da fatia: o dela, ou o do documento com o número (como lá: "foto_01"). */
export function nomeDaFatia(fatia: { nome?: string }, documento: string, numero: number, total: number): string {
  return fatia.nome?.trim() || `${documento || "imagem"}_${String(numero).padStart(Math.max(2, String(total).length), "0")}`;
}
