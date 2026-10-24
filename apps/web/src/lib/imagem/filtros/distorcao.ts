// Filtro › Distorção (ADR 0003, onda 13.11): deslocamento por mapa, pinçar, coordenadas polares, ondulação,
// cisalhamento, esfera, redemoinho, onda e ziguezague. Todos são um remapeamento: cada pixel lê outro ponto da imagem
// (bilinear, no alfa pré-multiplicado), contado a partir do meio da imagem do filtro (o meio da camada).
import { type ContextoDoFiltro, dePlanos, desfocarPlano, type ImagemDoFiltro, lerPlano, limitar, paraPlanos, type Planos, sorteio } from "./comum.ts";

export type Sobra = "transparente" | "repetir" | "volta";

/** Cada pixel (x, y), pelo centro, lê o ponto que `origem` devolve; o que cai fora vira transparente, repete ou dá a volta. */
export function remapear(imagem: ImagemDoFiltro, origem: (x: number, y: number) => [number, number] | null, sobra: Sobra = "transparente"): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const n = largura * altura;
  const saida = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)] as Planos;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const ponto = origem(x + 0.5, y + 0.5);
      if (!ponto) continue;
      let [sx, sy] = ponto;
      if (sobra === "volta") {
        sx = ((sx % largura) + largura) % largura;
        sy = ((sy % altura) + altura) % altura;
      } else if (sobra === "repetir") {
        sx = limitar(sx, 0.5, largura - 0.5);
        sy = limitar(sy, 0.5, altura - 0.5);
      }
      const p = y * largura + x;
      for (let k = 0; k < 4; k++) saida[k][p] = lerPlano(planos[k], largura, altura, sx, sy);
    }
  }
  return dePlanos(saida, largura, altura);
}

/** Nuvens suaves de 0 a 1 presas ao documento (o mapa do deslocamento quando não se usa a própria imagem). */
export function nuvens(largura: number, altura: number, tamanho: number, ctx: ContextoDoFiltro, semente = 0): Float32Array {
  const campo = new Float32Array(largura * altura);
  let amplitude = 1;
  let total = 0;
  for (let oitava = 0; oitava < 5; oitava++) {
    const celula = Math.max(1, (tamanho / 2 ** oitava) * ctx.escala);
    const valor = (i: number, j: number) => sorteio(i, j, semente * 7 + oitava);
    for (let y = 0; y < altura; y++) {
      const gy = (ctx.origem.y * ctx.escala + y) / celula;
      const j = Math.floor(gy);
      const ty = gy - j;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < largura; x++) {
        const gx = (ctx.origem.x * ctx.escala + x) / celula;
        const i = Math.floor(gx);
        const tx = gx - i;
        const sx = tx * tx * (3 - 2 * tx);
        const a = valor(i, j) + (valor(i + 1, j) - valor(i, j)) * sx;
        const b = valor(i, j + 1) + (valor(i + 1, j + 1) - valor(i, j + 1)) * sx;
        campo[y * largura + x] += (a + (b - a) * sy) * amplitude;
      }
    }
    total += amplitude;
    amplitude /= 2;
  }
  for (let p = 0; p < campo.length; p++) campo[p] /= total;
  return campo;
}

/** Deslocamento: o mapa (a luz da própria imagem, ou nuvens) empurra cada pixel; 100% anda até 128 pixels do documento. */
export function deslocamentoPorMapa(imagem: ImagemDoFiltro, horizontal: number, vertical: number, mapa: string, tamanho: number, sobra: Sobra, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  let campo: Float32Array;
  if (mapa === "nuvens") campo = nuvens(largura, altura, tamanho, ctx, 3);
  else {
    const planos = paraPlanos(imagem);
    campo = new Float32Array(largura * altura);
    for (let p = 0; p < campo.length; p++) {
      const a = planos[3][p];
      campo[p] = a > 0 ? (0.299 * planos[0][p] + 0.587 * planos[1][p] + 0.114 * planos[2][p]) / a : 0.5;
    }
    campo = desfocarPlano(campo, largura, altura, Math.max(0.5, ctx.escala));
  }
  const fx = (horizontal / 100) * 128 * ctx.escala;
  const fy = (vertical / 100) * 128 * ctx.escala;
  return remapear(
    imagem,
    (x, y) => {
      const m = campo[Math.min(altura - 1, Math.floor(y)) * largura + Math.min(largura - 1, Math.floor(x))];
      return [x + (m - 0.5) * 2 * fx, y + (m - 0.5) * 2 * fy];
    },
    sobra,
  );
}

/** A posição relativa ao meio, em frações dos semieixos (a elipse que cabe na imagem tem raio 1). */
function relativo(imagem: ImagemDoFiltro) {
  const cx = imagem.largura / 2;
  const cy = imagem.altura / 2;
  return { cx, cy, rx: cx, ry: cy };
}

/** Pinçar: aperta o meio (positivo: cada ponto lê mais longe do meio) ou estufa (negativo), dentro da elipse da imagem. */
export function pincar(imagem: ImagemDoFiltro, quantidade: number): ImagemDoFiltro {
  const { cx, cy, rx, ry } = relativo(imagem);
  const expoente = 1 - (quantidade / 100) * 0.6;
  return remapear(imagem, (x, y) => {
    const u = (x - cx) / rx;
    const v = (y - cy) / ry;
    const r = Math.hypot(u, v);
    if (r >= 1 || r === 0) return [x, y];
    // r elevado à potência: 1 na borda (sem emenda), mais longe do meio com expoente abaixo de 1
    const f = r ** expoente / r;
    return [cx + u * f * rx, cy + v * f * ry];
  });
}

/**
 * Esfera: positivo, a imagem numa esfera (o arco: cada ponto lê asen(r)·2/π, e o meio aumenta); negativo, o contrário
 * (sen(r·π/2), o meio encolhe). Só na horizontal ou na vertical, um cilindro.
 */
export function esfera(imagem: ImagemDoFiltro, quantidade: number, modo: string): ImagemDoFiltro {
  const { cx, cy, rx, ry } = relativo(imagem);
  const q = quantidade / 100;
  return remapear(imagem, (x, y) => {
    let u = (x - cx) / rx;
    let v = (y - cy) / ry;
    const r = modo === "horizontal" ? Math.abs(u) : modo === "vertical" ? Math.abs(v) : Math.hypot(u, v);
    if (r >= 1 || r === 0) return [x, y];
    const curva = q >= 0 ? (Math.asin(r) * 2) / Math.PI : Math.sin((r * Math.PI) / 2);
    const lido = r + Math.abs(q) * (curva - r);
    const f = lido / r;
    if (modo !== "vertical") u *= f;
    if (modo !== "horizontal") v *= f;
    return [cx + u * rx, cy + v * ry];
  });
}

/** Redemoinho: gira mais no meio e nada na borda (o ângulo em graus). */
export function redemoinho(imagem: ImagemDoFiltro, angulo: number): ImagemDoFiltro {
  const { cx, cy, rx, ry } = relativo(imagem);
  const raio = Math.min(rx, ry);
  const a0 = (angulo * Math.PI) / 180;
  return remapear(imagem, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy) / raio;
    if (r >= 1) return [x, y];
    const a = a0 * (1 - r);
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}

/** Coordenadas polares: do retângulo para o círculo (o topo vira o meio) ou de volta. */
export function coordenadasPolares(imagem: ImagemDoFiltro, sentido: string): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const cx = largura / 2;
  const cy = altura / 2;
  const raio = Math.min(cx, cy);
  if (sentido === "para_polar")
    return remapear(imagem, (x, y) => {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const r = Math.hypot(dx, dy);
      if (r > 1) return null;
      const a = (Math.atan2(dx, -dy) + Math.PI) / (2 * Math.PI);
      return [a * largura, r * altura];
    });
  return remapear(imagem, (x, y) => {
    const a = (x / largura) * 2 * Math.PI - Math.PI;
    const r = (y / altura) * raio;
    return [cx + Math.sin(a) * r * (cx / raio), cy - Math.cos(a) * r * (cy / raio)];
  });
}

/** Ondulação: ondas pequenas nas duas direções (o tamanho dá o comprimento; a quantidade, a altura). */
export function ondulacao(imagem: ImagemDoFiltro, quantidade: number, tamanho: string, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const comprimento = ({ pequeno: 8, medio: 16, grande: 32 }[tamanho] ?? 16) * ctx.escala;
  const amplitude = (quantidade / 100) * 2 * ctx.escala;
  return remapear(
    imagem,
    (x, y) => [x + amplitude * Math.sin((2 * Math.PI * (y + ctx.origem.y * ctx.escala)) / comprimento), y + amplitude * Math.sin((2 * Math.PI * (x + ctx.origem.x * ctx.escala)) / comprimento)],
    "repetir",
  );
}

/** Cisalhamento: cada linha anda para o lado pela curva (arco, onda ou S), com a quantidade no meio. */
export function cisalhamento(imagem: ImagemDoFiltro, quantidade: number, forma: string, sobra: Sobra): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const maximo = (quantidade / 100) * (largura / 2);
  return remapear(
    imagem,
    (x, y) => {
      const t = y / altura;
      const curva = forma === "onda" ? Math.sin(t * 2 * Math.PI) : forma === "s" ? Math.sin((t - 0.5) * Math.PI) : Math.sin(t * Math.PI);
      return [x - curva * maximo, y];
    },
    sobra,
  );
}

export type OpcoesDaOnda = { geradores: number; comprimentoMin: number; comprimentoMax: number; amplitudeMin: number; amplitudeMax: number; escalaH: number; escalaV: number; tipo: string; semente: number; sobra: Sobra };

/** Onda: a soma de vários geradores (seno, triângulo ou quadrado) de comprimentos e alturas sorteados entre os limites. */
export function onda(imagem: ImagemDoFiltro, o: OpcoesDaOnda, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const geradores = Array.from({ length: Math.max(1, Math.min(20, Math.round(o.geradores))) }, (_, i) => {
    const s = (k: number) => sorteio(i, o.semente, k);
    return {
      comprimento: (o.comprimentoMin + (o.comprimentoMax - o.comprimentoMin) * s(1)) * ctx.escala,
      amplitude: (o.amplitudeMin + (o.amplitudeMax - o.amplitudeMin) * s(2)) * ctx.escala,
      fase: s(3) * 2 * Math.PI,
      angulo: s(4) * 2 * Math.PI,
    };
  });
  const forma = (fase: number) => {
    const t = (((fase / (2 * Math.PI)) % 1) + 1) % 1;
    if (o.tipo === "triangulo") return 4 * Math.abs(t - 0.5) - 1;
    if (o.tipo === "quadrado") return t < 0.5 ? 1 : -1;
    return Math.sin(fase);
  };
  return remapear(
    imagem,
    (x, y) => {
      let dx = 0;
      let dy = 0;
      const gx = x + ctx.origem.x * ctx.escala;
      const gy = y + ctx.origem.y * ctx.escala;
      for (const g of geradores) {
        const projecao = gx * Math.cos(g.angulo) + gy * Math.sin(g.angulo);
        const valor = forma((2 * Math.PI * projecao) / Math.max(1, g.comprimento) + g.fase) * g.amplitude;
        dx += valor;
        dy += forma((2 * Math.PI * projecao) / Math.max(1, g.comprimento) + g.fase + Math.PI / 2) * g.amplitude;
      }
      return [x + (dx / geradores.length) * (o.escalaH / 100), y + (dy / geradores.length) * (o.escalaV / 100)];
    },
    o.sobra,
  );
}

/** Ziguezague: ondas que saem do meio, girando em volta dele, para fora ou como numa lagoa. */
export function ziguezague(imagem: ImagemDoFiltro, quantidade: number, cristas: number, estilo: string): ImagemDoFiltro {
  const { cx, cy } = relativo(imagem);
  const raio = Math.min(cx, cy);
  const q = quantidade / 100;
  const n = Math.max(1, cristas);
  return remapear(imagem, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    const r = d / raio;
    if (r >= 1 || d === 0) return [x, y];
    const onda = Math.sin(r * n * Math.PI) * q * (1 - r);
    if (estilo === "volta") {
      const a = onda * 0.6;
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    }
    const f = 1 + onda * (estilo === "lagoa" ? 0.25 : 0.4) / Math.max(r, 0.05);
    const deslocar = estilo === "lagoa" ? 1 + Math.sin(r * n * 2 * Math.PI) * q * 0.08 * (1 - r) : f;
    return [cx + dx * deslocar, cy + dy * deslocar];
  });
}
