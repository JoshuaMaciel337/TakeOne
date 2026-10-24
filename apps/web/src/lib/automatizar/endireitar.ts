// Arquivo › Automatizar › Cortar e endireitar fotos (ADR 0003, onda 13.13): várias fotos escaneadas juntas, sobre um
// fundo liso, viram uma imagem cada, endireitada. O fundo é a cor mediana da borda; o que se afasta dela é foto; as
// regiões grandes, fechadas e ligadas são as fotos, e o retângulo de área mínima em volta de cada uma (pelo fecho
// convexo e os calibradores giratórios) dá o lugar e o giro.
import type { Ponto, Quadrilatero } from "../transformar/malha.ts";

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };

export type FotoAchada = { cx: number; cy: number; largura: number; altura: number; /** Graus, de -45 a 45. */ angulo: number };

const mediana = (lista: number[]) => {
  const ordem = [...lista].sort((a, b) => a - b);
  return ordem[ordem.length >> 1] ?? 0;
};

/** O fecho convexo (cadeia monótona), no sentido anti-horário. */
export function fechoConvexo(pontos: Ponto[]): Ponto[] {
  const p = [...pontos].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cruz = (o: Ponto, a: Ponto, b: Ponto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const baixo: Ponto[] = [];
  for (const q of p) {
    while (baixo.length >= 2 && cruz(baixo[baixo.length - 2], baixo[baixo.length - 1], q) <= 0) baixo.pop();
    baixo.push(q);
  }
  const cima: Ponto[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (cima.length >= 2 && cruz(cima[cima.length - 2], cima[cima.length - 1], q) <= 0) cima.pop();
    cima.push(q);
  }
  return [...baixo.slice(0, -1), ...cima.slice(0, -1)];
}

/** O retângulo de área mínima que cobre os pontos: um lado dele está sobre um lado do fecho. */
export function retanguloMinimo(pontos: Ponto[]): FotoAchada {
  const fecho = fechoConvexo(pontos);
  let melhor: FotoAchada | null = null;
  let menorArea = Infinity;
  for (let i = 0; i < fecho.length; i++) {
    const a = fecho[i];
    const b = fecho[(i + 1) % fecho.length];
    const angulo = Math.atan2(b.y - a.y, b.x - a.x);
    const cos = Math.cos(angulo);
    const sen = Math.sin(angulo);
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of fecho) {
      const u = p.x * cos + p.y * sen;
      const v = -p.x * sen + p.y * cos;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < menorArea) {
      menorArea = area;
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      melhor = { cx: cu * cos - cv * sen, cy: cu * sen + cv * cos, largura: u1 - u0, altura: v1 - v0, angulo: (angulo * 180) / Math.PI };
    }
  }
  const r = melhor ?? { cx: 0, cy: 0, largura: 0, altura: 0, angulo: 0 };
  // O giro fica entre -45° e 45°: um retângulo girado 90° é o mesmo com os lados trocados
  let angulo = ((r.angulo % 180) + 180) % 180;
  let { largura, altura } = r;
  if (angulo > 135) angulo -= 180;
  else if (angulo > 45) {
    angulo -= 90;
    [largura, altura] = [altura, largura];
  }
  return { ...r, angulo, largura, altura };
}

/** As fotos da imagem (as que ocupam pelo menos `areaMinima` dela), da esquerda de cima para a direita de baixo. */
export function acharFotos(imagem: Imagem, { tolerancia = 28, areaMinima = 0.01 }: { tolerancia?: number; areaMinima?: number } = {}): FotoAchada[] {
  // A conta numa cópia de até 2000 px (o escaneado comum cabe inteiro); o resultado volta à escala da imagem
  const escala = Math.min(1, 2000 / Math.max(imagem.largura, imagem.altura));
  const l = Math.max(1, Math.round(imagem.largura * escala));
  const a = Math.max(1, Math.round(imagem.altura * escala));
  const cor = (x: number, y: number) => {
    const i = (Math.min(imagem.altura - 1, Math.floor(y / escala)) * imagem.largura + Math.min(imagem.largura - 1, Math.floor(x / escala))) * 4;
    return [imagem.dados[i], imagem.dados[i + 1], imagem.dados[i + 2], imagem.dados[i + 3]];
  };
  const borda: number[][] = [];
  for (let x = 0; x < l; x++) borda.push(cor(x, 0), cor(x, a - 1));
  for (let y = 0; y < a; y++) borda.push(cor(0, y), cor(l - 1, y));
  const fundo = [0, 1, 2].map((e) => mediana(borda.map((c) => c[e])));
  let mascara = new Uint8Array(l * a);
  for (let y = 0; y < a; y++)
    for (let x = 0; x < l; x++) {
      const c = cor(x, y);
      mascara[y * l + x] = c[3] > 0 && Math.max(Math.abs(c[0] - fundo[0]), Math.abs(c[1] - fundo[1]), Math.abs(c[2] - fundo[2])) > tolerancia ? 1 : 0;
    }
  // Fecha os buracos pequenos (as partes da foto parecidas com o fundo): dilata e depois erode, em quadrado de 5
  const morfo = (entrada: Uint8Array, valor: 0 | 1) => {
    const saida = new Uint8Array(entrada.length);
    for (let y = 0; y < a; y++)
      for (let x = 0; x < l; x++) {
        let achou = false;
        for (let dy = -2; dy <= 2 && !achou; dy++)
          for (let dx = -2; dx <= 2 && !achou; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < l && ny < a && entrada[ny * l + nx] === valor) achou = true;
          }
        saida[y * l + x] = achou ? valor : valor ? 0 : 1;
      }
    return saida;
  };
  mascara = morfo(morfo(mascara, 1), 0);
  // As regiões ligadas
  const marca = new Int32Array(l * a).fill(-1);
  const fotos: FotoAchada[] = [];
  const fila = new Int32Array(l * a);
  for (let inicio = 0; inicio < l * a; inicio++) {
    if (!mascara[inicio] || marca[inicio] >= 0) continue;
    let fim = 0;
    fila[fim++] = inicio;
    marca[inicio] = inicio;
    const pontos: Ponto[] = [];
    for (let k = 0; k < fim; k++) {
      const p = fila[k];
      const x = p % l;
      const y = (p - x) / l;
      // Os cantos dos pixels da borda da região dão o contorno
      const ehBorda = x === 0 || y === 0 || x === l - 1 || y === a - 1 || !mascara[p - 1] || !mascara[p + 1] || !mascara[p - l] || !mascara[p + l];
      if (ehBorda) pontos.push({ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
      for (const q of [p - 1, p + 1, p - l, p + l]) {
        if (q < 0 || q >= l * a || marca[q] >= 0 || !mascara[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === l - 1)) continue;
        marca[q] = inicio;
        fila[fim++] = q;
      }
    }
    if (fim < areaMinima * l * a) continue;
    const r = retanguloMinimo(pontos);
    fotos.push({ cx: r.cx / escala, cy: r.cy / escala, largura: r.largura / escala, altura: r.altura / escala, angulo: r.angulo });
  }
  return fotos.sort((f, g) => (Math.abs(f.cy - g.cy) > Math.min(f.altura, g.altura) / 2 ? f.cy - g.cy : f.cx - g.cx));
}

/**
 * Para o `reamostrar` (lib/transformar/livre.ts): onde os cantos da imagem inteira caem na foto endireitada, de
 * largura × altura (a foto girada de volta e com o centro dela no meio).
 */
export function cantosNaFoto(foto: FotoAchada, imagem: { largura: number; altura: number }): Quadrilatero {
  const t = (-foto.angulo * Math.PI) / 180;
  const cos = Math.cos(t);
  const sen = Math.sin(t);
  const levar = (x: number, y: number): Ponto => {
    const dx = x - foto.cx;
    const dy = y - foto.cy;
    return { x: dx * cos - dy * sen + foto.largura / 2, y: dx * sen + dy * cos + foto.altura / 2 };
  };
  return [levar(0, 0), levar(imagem.largura, 0), levar(imagem.largura, imagem.altura), levar(0, imagem.altura)];
}
