// Editar › Alinhar camadas automaticamente (ADR 0003, onda 13.6): pontos de canto (Harris) espalhados pela imagem,
// cada um com um descritor binário orientado (o BRIEF girado pelo ângulo do centroide da luz em volta, como no ORB),
// os pares pela distância de Hamming (com o teste da razão e a ida e volta) e o modelo pelo RANSAC: só deslocar
// (reposicionar), semelhança (colagem: mover, girar e escalar por igual) ou homografia (perspectiva), refinado nos pares
// que concordam. Tudo numa cópia de até 800 px; o modelo volta na escala da imagem.
import type { Ponto } from "./malha.ts";

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };
export type ProjecaoDoAlinhamento = "auto" | "perspectiva" | "colagem" | "reposicionar";
/** A homografia (a, b, c, d, e, f, g, h): x' = (a·x + b·y + c) / (g·x + h·y + 1), y' = (d·x + e·y + f) / (…). */
export type Homografia = [number, number, number, number, number, number, number, number];

export const IDENTIDADE: Homografia = [1, 0, 0, 0, 1, 0, 0, 0];

export function aplicar(h: Homografia, p: Ponto): Ponto {
  const w = h[6] * p.x + h[7] * p.y + 1;
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** A luz numa cópia de até `lado` px, suavizada (o BRIEF lê pixels suavizados). */
function cinza(imagem: Imagem, lado: number): { luz: Float32Array; largura: number; altura: number; escala: number } {
  const escala = Math.min(1, lado / Math.max(imagem.largura, imagem.altura));
  const largura = Math.max(8, Math.round(imagem.largura * escala));
  const altura = Math.max(8, Math.round(imagem.altura * escala));
  const luz = new Float32Array(largura * altura);
  const passo = 1 / escala;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      // A média da área (pela caixa de pixels da original)
      let soma = 0;
      let n = 0;
      const x0 = Math.floor(x * passo);
      const y0 = Math.floor(y * passo);
      const x1 = Math.min(imagem.largura, Math.max(x0 + 1, Math.floor((x + 1) * passo)));
      const y1 = Math.min(imagem.altura, Math.max(y0 + 1, Math.floor((y + 1) * passo)));
      for (let yy = y0; yy < y1; yy += Math.max(1, Math.floor((y1 - y0) / 3))) {
        for (let xx = x0; xx < x1; xx += Math.max(1, Math.floor((x1 - x0) / 3))) {
          const i = (yy * imagem.largura + xx) * 4;
          // O transparente conta como escuro, sem pontos
          soma += (0.299 * imagem.dados[i] + 0.587 * imagem.dados[i + 1] + 0.114 * imagem.dados[i + 2]) * (imagem.dados[i + 3] / 255);
          n++;
        }
      }
      luz[y * largura + x] = soma / Math.max(1, n);
    }
  }
  return { luz: borrar(luz, largura, altura), largura, altura, escala };
}

/** Um borrão de três passadas de média 3 × 3 (quase uma gaussiana de sigma 1,5). */
function borrar(valores: Float32Array, largura: number, altura: number): Float32Array {
  let a = valores;
  for (let k = 0; k < 3; k++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        let soma = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.min(altura - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) soma += a[yy * largura + Math.min(largura - 1, Math.max(0, x + dx))];
        }
        b[y * largura + x] = soma / 9;
      }
    }
    a = b;
  }
  return a;
}

/** Um sorteio com semente (o padrão do BRIEF é sempre o mesmo). */
function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const RAIO = 15;
const PARES = (() => {
  const aleatorio = sorteio(12345);
  // Pares numa gaussiana em volta do centro (sigma de um quinto do lado), dentro do raio
  const normal = () => Math.max(-RAIO + 1, Math.min(RAIO - 1, Math.sqrt(-2 * Math.log(aleatorio() + 1e-12)) * Math.cos(2 * Math.PI * aleatorio()) * (RAIO / 2.5)));
  return Array.from({ length: 256 }, () => [normal(), normal(), normal(), normal()] as const);
})();

type PontoChave = { x: number; y: number; descritor: Uint32Array };

/** Os pontos de canto de Harris, os mais fortes de cada bloco de uma grade 8 × 8, com o descritor orientado. */
function pontosChave(imagem: { luz: Float32Array; largura: number; altura: number }, quantos = 600): PontoChave[] {
  const { luz, largura, altura } = imagem;
  const gx = new Float32Array(largura * altura);
  const gy = new Float32Array(largura * altura);
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const i = y * largura + x;
      gx[i] = (luz[i + 1] - luz[i - 1]) / 2;
      gy[i] = (luz[i + largura] - luz[i - largura]) / 2;
    }
  }
  const xx = borrar(gx.map((v) => v * v), largura, altura);
  const yy = borrar(gy.map((v) => v * v), largura, altura);
  const xy = borrar(gx.map((v, i) => v * gy[i]), largura, altura);
  const resposta = new Float32Array(largura * altura);
  for (let i = 0; i < resposta.length; i++) resposta[i] = xx[i] * yy[i] - xy[i] * xy[i] - 0.04 * (xx[i] + yy[i]) ** 2;
  const margem = RAIO + 2;
  const candidatos: { x: number; y: number; r: number }[] = [];
  for (let y = margem; y < altura - margem; y++) {
    for (let x = margem; x < largura - margem; x++) {
      const i = y * largura + x;
      const r = resposta[i];
      if (r <= 1e-3) continue;
      let maximo = true;
      for (let dy = -2; dy <= 2 && maximo; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && resposta[i + dy * largura + dx] > r) maximo = false;
      if (maximo) candidatos.push({ x, y, r });
    }
  }
  // Espalhados: os melhores de cada bloco
  const blocos = new Map<number, { x: number; y: number; r: number }[]>();
  for (const c of candidatos) {
    const chave = Math.floor((c.y / altura) * 8) * 8 + Math.floor((c.x / largura) * 8);
    const lista = blocos.get(chave) ?? [];
    lista.push(c);
    blocos.set(chave, lista);
  }
  const porBloco = Math.max(4, Math.ceil(quantos / 64));
  const escolhidos = [...blocos.values()].flatMap((lista) => lista.sort((a, b) => b.r - a.r).slice(0, porBloco));
  return escolhidos.map(({ x, y }) => {
    // A orientação pelo centroide da luz em volta
    let m10 = 0;
    let m01 = 0;
    for (let dy = -RAIO; dy <= RAIO; dy++) {
      for (let dx = -RAIO; dx <= RAIO; dx++) {
        if (dx * dx + dy * dy > RAIO * RAIO) continue;
        const v = luz[(y + dy) * largura + x + dx];
        m10 += dx * v;
        m01 += dy * v;
      }
    }
    const angulo = Math.atan2(m01, m10);
    const cos = Math.cos(angulo);
    const sen = Math.sin(angulo);
    const descritor = new Uint32Array(8);
    PARES.forEach(([ax, ay, bx, by], k) => {
      const pa = luz[Math.round(y + ax * sen + ay * cos) * largura + Math.round(x + ax * cos - ay * sen)];
      const pb = luz[Math.round(y + bx * sen + by * cos) * largura + Math.round(x + bx * cos - by * sen)];
      if (pa < pb) descritor[k >> 5] |= 1 << (k & 31);
    });
    return { x, y, descritor };
  });
}

function hamming(a: Uint32Array, b: Uint32Array): number {
  let d = 0;
  for (let k = 0; k < 8; k++) {
    let v = a[k] ^ b[k];
    v -= (v >>> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    d += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return d;
}

/** Os pares: o melhor de cada ponto, se for bem melhor que o segundo e se a volta concordar. */
function pares(a: PontoChave[], b: PontoChave[]): [Ponto, Ponto][] {
  const melhorDe = (p: PontoChave, lista: PontoChave[]) => {
    let melhor = -1;
    let d1 = Infinity;
    let d2 = Infinity;
    lista.forEach((q, i) => {
      const d = hamming(p.descritor, q.descritor);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        melhor = i;
      } else if (d < d2) d2 = d;
    });
    return { melhor, d1, d2 };
  };
  const saida: [Ponto, Ponto][] = [];
  a.forEach((p, i) => {
    const ida = melhorDe(p, b);
    if (ida.melhor < 0 || ida.d1 > 80 || ida.d1 > 0.8 * ida.d2) return;
    if (melhorDe(b[ida.melhor], a).melhor !== i) return;
    saida.push([
      { x: p.x, y: p.y },
      { x: b[ida.melhor].x, y: b[ida.melhor].y },
    ]);
  });
  return saida;
}

/** Resolve o sistema linear (eliminação de Gauss com pivô), ou null se ele não tem uma solução só. */
function resolver(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((linha, i) => [...linha, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((linha, i) => linha[n] / linha[i]);
}

/** O modelo pelos mínimos quadrados (as equações normais) dos pares, de `de` para `para`. */
function ajustar(lista: [Ponto, Ponto][], projecao: Exclude<ProjecaoDoAlinhamento, "auto">): Homografia | null {
  if (projecao === "reposicionar") {
    const dx = lista.reduce((s, [p, q]) => s + q.x - p.x, 0) / lista.length;
    const dy = lista.reduce((s, [p, q]) => s + q.y - p.y, 0) / lista.length;
    return [1, 0, dx, 0, 1, dy, 0, 0];
  }
  if (projecao === "colagem") {
    // x' = a·x − b·y + c, y' = b·x + a·y + d
    const ata = [0, 0, 0, 0].map(() => [0, 0, 0, 0]);
    const atb = [0, 0, 0, 0];
    for (const [p, q] of lista) {
      for (const [linha, alvo] of [
        [[p.x, -p.y, 1, 0], q.x],
        [[p.y, p.x, 0, 1], q.y],
      ] as [number[], number][]) {
        for (let i = 0; i < 4; i++) {
          atb[i] += linha[i] * alvo;
          for (let j = 0; j < 4; j++) ata[i][j] += linha[i] * linha[j];
        }
      }
    }
    const s = resolver(ata, atb);
    return s ? [s[0], -s[1], s[2], s[1], s[0], s[3], 0, 0] : null;
  }
  // A homografia: as 8 incógnitas, linearizadas
  const ata = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const atb = new Array(8).fill(0);
  for (const [p, q] of lista) {
    for (const [linha, alvo] of [
      [[p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x], q.x],
      [[0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y], q.y],
    ] as [number[], number][]) {
      for (let i = 0; i < 8; i++) {
        atb[i] += linha[i] * alvo;
        for (let j = 0; j < 8; j++) ata[i][j] += linha[i] * linha[j];
      }
    }
  }
  const s = resolver(ata, atb);
  return s ? (s as Homografia) : null;
}

/** O RANSAC: o modelo com mais pares a até `limite` px, refeito com eles. */
export function modeloPeloRansac(lista: [Ponto, Ponto][], projecao: Exclude<ProjecaoDoAlinhamento, "auto">, limite = 3, tentativas = 600): { modelo: Homografia; concordam: number } | null {
  const minimo = projecao === "reposicionar" ? 1 : projecao === "colagem" ? 2 : 4;
  if (lista.length < minimo) return null;
  const aleatorio = sorteio(777);
  let melhor: [Ponto, Ponto][] = [];
  for (let t = 0; t < tentativas; t++) {
    const amostra: [Ponto, Ponto][] = [];
    const usados = new Set<number>();
    while (amostra.length < minimo) {
      const i = Math.floor(aleatorio() * lista.length);
      if (usados.has(i)) continue;
      usados.add(i);
      amostra.push(lista[i]);
    }
    const modelo = ajustar(amostra, projecao);
    if (!modelo) continue;
    const bons = lista.filter(([p, q]) => {
      const r = aplicar(modelo, p);
      return Math.hypot(r.x - q.x, r.y - q.y) <= limite;
    });
    if (bons.length > melhor.length) melhor = bons;
  }
  if (melhor.length < minimo) return null;
  const modelo = ajustar(melhor, projecao);
  return modelo ? { modelo, concordam: melhor.length } : null;
}

/** O modelo na escala da imagem: S⁻¹·H·S, com S a escala da cópia. */
function naEscalaDaImagem(h: Homografia, escalaDe: number, escalaPara: number): Homografia {
  const [a, b, c, d, e, f, g, hh] = h;
  // x' = (a·s·x + b·s·y + c) / (g·s·x + h·s·y + 1) / t, com s a escala da origem e t a do destino
  const s = escalaDe;
  const t = escalaPara;
  return [(a * s) / t, (b * s) / t, c / t, (d * s) / t, (e * s) / t, f / t, g * s, hh * s];
}

/**
 * O modelo que leva a imagem `de` para o lugar dela na `referencia` (os dois na escala deles), ou null quando não há
 * pares que bastem. No automático, a homografia, ou a semelhança quando ela não acha.
 */
export function alinhar(de: Imagem, referencia: Imagem, projecao: ProjecaoDoAlinhamento): { modelo: Homografia; pares: number } | null {
  const a = cinza(de, 800);
  const b = cinza(referencia, 800);
  const lista = pares(pontosChave(a), pontosChave(b));
  const tipos: Exclude<ProjecaoDoAlinhamento, "auto">[] = projecao === "auto" ? ["perspectiva", "colagem"] : [projecao];
  for (const tipo of tipos) {
    const achado = modeloPeloRansac(lista, tipo);
    if (achado && achado.concordam >= (tipo === "perspectiva" ? 12 : 6)) return { modelo: naEscalaDaImagem(achado.modelo, a.escala, b.escala), pares: achado.concordam };
  }
  return null;
}
