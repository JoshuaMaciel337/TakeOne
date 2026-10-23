"use client";

// As pontas de amostra e as texturas dos pincéis (ADR 0003, onda 13.2), desenhadas aqui com sorteio de semente fixa:
// nada vem de pacote de terceiros. Cada ponta é um canvas branco com o alfa do desenho, no lado pedido; cada textura
// é um ladrilho cinza que se repete (o claro deixa a tinta passar).

/** Sorteio com semente (mulberry32): a mesma ponta sai igual sempre. */
export function sorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type IdDaPonta =
  | "giz"
  | "carvao"
  | "grafite"
  | "pastel"
  | "spray"
  | "aquarela"
  | "cerdas"
  | "nanquim"
  | "esponja"
  | "estrela"
  | "folha"
  | "grama"
  | "respingo"
  | "nuvem"
  | "quadrado";

export const PONTAS_DE_AMOSTRA: { id: IdDaPonta; nome: string }[] = [
  { id: "giz", nome: "Giz" },
  { id: "carvao", nome: "Carvão" },
  { id: "grafite", nome: "Grafite" },
  { id: "pastel", nome: "Pastel seco" },
  { id: "spray", nome: "Spray" },
  { id: "aquarela", nome: "Aquarela" },
  { id: "cerdas", nome: "Cerdas" },
  { id: "nanquim", nome: "Nanquim" },
  { id: "esponja", nome: "Esponja" },
  { id: "estrela", nome: "Estrela" },
  { id: "folha", nome: "Folha" },
  { id: "grama", nome: "Grama" },
  { id: "respingo", nome: "Respingo" },
  { id: "nuvem", nome: "Nuvem" },
  { id: "quadrado", nome: "Quadrado" },
];

export type IdDaTextura = "papel" | "tela" | "areia" | "ruido" | "linhas";

export const TEXTURAS: { id: IdDaTextura; nome: string }[] = [
  { id: "papel", nome: "Papel" },
  { id: "tela", nome: "Tela de pintura" },
  { id: "areia", nome: "Areia" },
  { id: "ruido", nome: "Ruído" },
  { id: "linhas", nome: "Linhas" },
];

/** O lado em que as amostras são desenhadas (a marca é a amostra reduzida ou ampliada para o diâmetro). */
const LADO_DA_AMOSTRA = 128;
const AMOSTRAS = new Map<string, HTMLCanvasElement>();
const LADRILHOS = new Map<string, HTMLCanvasElement>();

/** Um alfa por pixel da amostra (0 a 1), para o desenho de cada ponta. */
function desenharAmostra(id: IdDaPonta, n: number): Float32Array {
  const alfa = new Float32Array(n * n);
  const aleatorio = sorteio(id.split("").reduce((soma, letra) => soma * 31 + letra.charCodeAt(0), 7));
  const c = n / 2;
  const somar = (x: number, y: number, valor: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= n || yi >= n) return;
    alfa[yi * n + xi] = Math.min(1, alfa[yi * n + xi] + valor);
  };
  const disco = (cx: number, cy: number, r: number, valor = 1, borda = 1) => {
    for (let y = Math.floor(cy - r - borda); y <= Math.ceil(cy + r + borda); y++) {
      for (let x = Math.floor(cx - r - borda); x <= Math.ceil(cx + r + borda); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cobertura = Math.min(1, Math.max(0, (r + borda / 2 - d) / borda));
        if (cobertura > 0) somar(x, y, cobertura * valor);
      }
    }
  };
  const poligono = (pontos: [number, number][]) => {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // Quatro amostras por pixel, pela regra par-ímpar, para a borda não serrilhar
        let dentro = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const px = x + ox;
          const py = y + oy;
          let impar = false;
          for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
            const [xi, yi] = pontos[i];
            const [xj, yj] = pontos[j];
            if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) impar = !impar;
          }
          if (impar) dentro += 0.25;
        }
        if (dentro) somar(x, y, dentro);
      }
    }
  };
  const r = n * 0.46;
  switch (id) {
    case "giz":
    case "pastel":
    case "carvao":
    case "grafite": {
      // Um disco comido por grão: o giz é falhado, o carvão é mais escuro e solto, o grafite é fino e denso
      const falha = { giz: 0.45, pastel: 0.3, carvao: 0.35, grafite: 0.15 }[id];
      const achatado = id === "grafite" ? 0.55 : 1;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const dx = (x + 0.5 - c) / r;
          const dy = (y + 0.5 - c) / (r * achatado);
          const d = Math.hypot(dx, dy);
          if (d > 1) continue;
          const grao = aleatorio();
          const borda = 1 - Math.pow(d, id === "carvao" ? 2 : 4);
          if (grao > falha * (0.5 + d)) somar(x, y, borda * (0.55 + 0.45 * aleatorio()));
        }
      }
      break;
    }
    case "spray":
      for (let i = 0; i < n * 3; i++) {
        const angulo = aleatorio() * Math.PI * 2;
        const raio = Math.sqrt(aleatorio()) * r;
        disco(c + Math.cos(angulo) * raio, c + Math.sin(angulo) * raio, 0.6 + aleatorio() * 1.2, 0.8, 1);
      }
      break;
    case "aquarela":
      // Miolo claro e a borda mais escura, como a tinta que seca na beira
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / (r * (0.92 + 0.08 * Math.sin(Math.atan2(y - c, x - c) * 5)));
          if (d < 1) somar(x, y, 0.35 + 0.65 * Math.pow(d, 3) * (0.8 + 0.2 * aleatorio()));
        }
      }
      break;
    case "cerdas":
      // Fios paralelos de espessura e força diferentes
      for (let i = 0; i < 22; i++) {
        const x = c - r + (2 * r * (i + aleatorio() * 0.6)) / 22;
        const meio = Math.sqrt(Math.max(0, 1 - ((x - c) / r) ** 2)) * r;
        const forca = 0.4 + 0.6 * aleatorio();
        for (let y = c - meio; y < c + meio; y += 0.5) disco(x, y, 0.7 + aleatorio(), forca * 0.35, 1);
      }
      break;
    case "nanquim":
      disco(c, c, r * 0.8, 1, 2);
      for (let i = 0; i < 18; i++) {
        const angulo = aleatorio() * Math.PI * 2;
        disco(c + Math.cos(angulo) * r * (0.8 + aleatorio() * 0.15), c + Math.sin(angulo) * r * (0.8 + aleatorio() * 0.15), r * 0.05 + aleatorio() * r * 0.06, 1, 1.5);
      }
      break;
    case "esponja":
      for (let i = 0; i < 70; i++) {
        const angulo = aleatorio() * Math.PI * 2;
        const raio = Math.sqrt(aleatorio()) * r * 0.85;
        disco(c + Math.cos(angulo) * raio, c + Math.sin(angulo) * raio, r * (0.05 + aleatorio() * 0.09), 0.6, 2);
      }
      break;
    case "estrela": {
      const pontos: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const angulo = -Math.PI / 2 + (i * Math.PI) / 5;
        const raio = i % 2 ? r * 0.42 : r;
        pontos.push([c + Math.cos(angulo) * raio, c + Math.sin(angulo) * raio]);
      }
      poligono(pontos);
      break;
    }
    case "folha": {
      const pontos: [number, number][] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const y = c - r + 2 * r * t;
        pontos.push([c + Math.sin(Math.PI * t) * r * 0.45, y]);
      }
      for (let i = 40; i >= 0; i--) {
        const t = i / 40;
        pontos.push([c - Math.sin(Math.PI * t) * r * 0.45, c - r + 2 * r * t]);
      }
      poligono(pontos);
      // A nervura do meio, clara
      for (let y = c - r * 0.9; y < c + r * 0.9; y += 0.5) alfa[Math.round(y) * n + Math.round(c)] *= 0.4;
      break;
    }
    case "grama":
      for (let i = 0; i < 9; i++) {
        const base = c - r * 0.6 + (1.2 * r * i) / 8 + (aleatorio() - 0.5) * 6;
        const altura = r * (1.2 + aleatorio() * 0.7);
        const curva = (aleatorio() - 0.5) * r * 0.8;
        const largura = 2 + aleatorio() * 3;
        poligono([
          [base - largura, c + r],
          [base + largura, c + r],
          [base + curva, c + r - altura],
        ]);
      }
      break;
    case "respingo":
      disco(c, c, r * 0.45, 1, 2);
      for (let i = 0; i < 26; i++) {
        const angulo = aleatorio() * Math.PI * 2;
        const raio = r * (0.5 + aleatorio() * 0.5);
        disco(c + Math.cos(angulo) * raio, c + Math.sin(angulo) * raio, r * (0.02 + aleatorio() * 0.07), 1, 1.5);
      }
      break;
    case "nuvem":
      for (let i = 0; i < 9; i++) {
        const angulo = aleatorio() * Math.PI * 2;
        const raio = aleatorio() * r * 0.45;
        disco(c + Math.cos(angulo) * raio, c + Math.sin(angulo) * raio * 0.7, r * (0.3 + aleatorio() * 0.2), 0.35, r * 0.3);
      }
      break;
    case "quadrado":
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.abs(x + 0.5 - c) <= r && Math.abs(y + 0.5 - c) <= r) alfa[y * n + x] = 1;
      break;
  }
  return alfa;
}

/** A ponta de um pincel do espaço (importado de um .abr ou salvo), pelo id dele: "pincel:<id>". */
export type IdDaPontaPersonalizada = `pincel:${string}`;
const PERSONALIZADAS = new Map<string, HTMLCanvasElement>();

/** Guarda a ponta de um pincel do espaço (branco com o alfa), para o motor e as miniaturas. */
export function registrarPonta(id: IdDaPontaPersonalizada, canvas: HTMLCanvasElement) {
  PERSONALIZADAS.set(id, canvas);
}

export function pontaRegistrada(id: IdDaPontaPersonalizada): boolean {
  return PERSONALIZADAS.has(id);
}

/** A amostra da ponta (branco com o alfa), guardada; a de um pincel do espaço só depois de baixada (senão null). */
export function amostraDaPonta(id: IdDaPonta | IdDaPontaPersonalizada): HTMLCanvasElement | null {
  if (id.startsWith("pincel:")) return PERSONALIZADAS.get(id) ?? null;
  const guardada = AMOSTRAS.get(id);
  if (guardada) return guardada;
  const n = LADO_DA_AMOSTRA;
  const alfa = desenharAmostra(id as IdDaPonta, n);
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d")!;
  const dados = ctx.createImageData(n, n);
  for (let i = 0; i < alfa.length; i++) {
    dados.data[i * 4] = 255;
    dados.data[i * 4 + 1] = 255;
    dados.data[i * 4 + 2] = 255;
    dados.data[i * 4 + 3] = Math.round(alfa[i] * 255);
  }
  ctx.putImageData(dados, 0, 0);
  AMOSTRAS.set(id, canvas);
  return canvas;
}

/** O ladrilho da textura: cinza (o claro deixa a tinta passar), 256 × 256, que se repete sem emenda. */
export function ladrilhoDaTextura(id: IdDaTextura): HTMLCanvasElement {
  const guardado = LADRILHOS.get(id);
  if (guardado) return guardado;
  const n = 256;
  const aleatorio = sorteio(id.length * 977 + id.charCodeAt(0));
  const valores = new Float32Array(n * n);
  // Ruído de valor em algumas oitavas, com a grade que dá a volta (o ladrilho emenda)
  const oitava = (celulas: number, peso: number) => {
    const grade = Array.from({ length: celulas * celulas }, () => aleatorio());
    const em = (x: number, y: number) => grade[((y + celulas) % celulas) * celulas + ((x + celulas) % celulas)];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * celulas;
        const fy = (y / n) * celulas;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const topo = em(x0, y0) * (1 - sx) + em(x0 + 1, y0) * sx;
        const base = em(x0, y0 + 1) * (1 - sx) + em(x0 + 1, y0 + 1) * sx;
        valores[y * n + x] += (topo * (1 - sy) + base * sy) * peso;
      }
    }
  };
  switch (id) {
    case "papel":
      oitava(8, 0.3);
      oitava(32, 0.35);
      oitava(128, 0.35);
      break;
    case "tela":
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) valores[y * n + x] = 0.5 + 0.25 * Math.sin((x / n) * Math.PI * 64) * Math.sin((y / n) * Math.PI * 64) + 0.25 * aleatorio();
      break;
    case "areia":
      oitava(64, 0.4);
      for (let i = 0; i < valores.length; i++) valores[i] += aleatorio() * 0.6;
      break;
    case "ruido":
      for (let i = 0; i < valores.length; i++) valores[i] = aleatorio();
      break;
    case "linhas":
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) valores[y * n + x] = 0.5 + 0.5 * Math.sin(((x + y) / n) * Math.PI * 32) * (0.7 + 0.3 * aleatorio());
      break;
  }
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d")!;
  const dados = ctx.createImageData(n, n);
  for (let i = 0; i < valores.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, valores[i])) * 255);
    dados.data[i * 4] = v;
    dados.data[i * 4 + 1] = v;
    dados.data[i * 4 + 2] = v;
    dados.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(dados, 0, 0);
  LADRILHOS.set(id, canvas);
  return canvas;
}
