// A transformação livre (ADR 0003, ondas 13.3 e 13.6): o retângulo de origem (u, v de 0 a 1) vai para um quadrilátero
// qualquer (escala, giro, inclinação, distorção e perspectiva, pela homografia dos quatro cantos) ou para uma malha de
// deformação (o retalho de Bézier bicúbico de 4 × 4 pontos). O desenho divide a origem numa grade fina e cada
// triângulo vai com uma afim do canvas: a mesma conta serve à seleção, às camadas e à prévia.

export type Ponto = { x: number; y: number };
/** Os quatro cantos: em cima à esquerda, em cima à direita, embaixo à direita, embaixo à esquerda. */
export type Quadrilatero = [Ponto, Ponto, Ponto, Ponto];
/** A malha de deformação: 16 pontos, linha a linha (4 × 4). */
export type MalhaDeDeformacao = Ponto[];
export type Mapa = (u: number, v: number) => Ponto;

/**
 * A homografia que leva o quadrado unitário ao quadrilátero (Heckbert, 1989): (0,0) → q0, (1,0) → q1, (1,1) → q2,
 * (0,1) → q3. Num paralelogramo vira uma afim.
 */
export function homografia(q: Quadrilatero): Mapa {
  const [a, b, c, d, e, f, g, h] = coeficientesDaHomografia(q);
  return (u, v) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

/** Os oito coeficientes da homografia: x = (a·u + b·v + c) / (g·u + h·v + 1), y = (d·u + e·v + f) / (g·u + h·v + 1). */
export function coeficientesDaHomografia(q: Quadrilatero): [number, number, number, number, number, number, number, number] {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = p1.x - p0.x;
    b = p3.x - p0.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p3.y - p0.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const det = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / det;
    h = (dx1 * sy - sx * dy1) / det;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }
  return [a, b, c, d, e, f, g, h];
}

const bernstein = (t: number): [number, number, number, number] => {
  const s = 1 - t;
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
};

/** O retalho de Bézier bicúbico dos 16 pontos (linha j, coluna i: o índice é j × 4 + i). */
export function bezier(malha: MalhaDeDeformacao): Mapa {
  return (u, v) => {
    const bu = bernstein(u);
    const bv = bernstein(v);
    let x = 0;
    let y = 0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const peso = bu[i] * bv[j];
        x += malha[j * 4 + i].x * peso;
        y += malha[j * 4 + i].y * peso;
      }
    }
    return { x, y };
  };
}

/** A malha inicial de um quadrilátero: os 16 pontos espalhados pela homografia dele (sem deformar nada). */
export function malhaDoQuadrilatero(q: Quadrilatero): MalhaDeDeformacao {
  const mapa = homografia(q);
  const pontos: Ponto[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) pontos.push(mapa(i / 3, j / 3));
  return pontos;
}

/** O retângulo (girado) como quadrilátero: o centro, as medidas e o ângulo em graus. */
export function quadDoRetangulo(cx: number, cy: number, largura: number, altura: number, angulo: number): Quadrilatero {
  const r = (angulo * Math.PI) / 180;
  const cos = Math.cos(r);
  const sen = Math.sin(r);
  const canto = (dx: number, dy: number): Ponto => ({ x: cx + dx * cos - dy * sen, y: cy + dx * sen + dy * cos });
  return [canto(-largura / 2, -altura / 2), canto(largura / 2, -altura / 2), canto(largura / 2, altura / 2), canto(-largura / 2, altura / 2)];
}

/**
 * A afim (a, b, c, d, e, f do canvas) que leva o triângulo s0 s1 s2 ao triângulo t0 t1 t2. Null se o de origem não
 * tem área.
 */
export function afimDoTriangulo(s: [Ponto, Ponto, Ponto], t: [Ponto, Ponto, Ponto]): [number, number, number, number, number, number] | null {
  const det = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y);
  if (Math.abs(det) < 1e-12) return null;
  const resolver = (k0: number, k1: number, k2: number) => {
    const m = ((k1 - k0) * (s[2].y - s[0].y) - (k2 - k0) * (s[1].y - s[0].y)) / det;
    const n = ((k2 - k0) * (s[1].x - s[0].x) - (k1 - k0) * (s[2].x - s[0].x)) / det;
    return [m, n, k0 - m * s[0].x - n * s[0].y] as const;
  };
  const [a, c, e] = resolver(t[0].x, t[1].x, t[2].x);
  const [b, d, f] = resolver(t[0].y, t[1].y, t[2].y);
  return [a, b, c, d, e, f];
}

/**
 * Desenha a imagem de origem (largura × altura) pelo mapa, numa grade de `divisoes` × `divisoes` quadradinhos, cada
 * um em dois triângulos com a afim do canvas. Cada triângulo é recortado um pouco maior (meio pixel para fora) para
 * as emendas não aparecerem.
 */
export function desenharNaMalha(ctx: CanvasRenderingContext2D, origem: CanvasImageSource, largura: number, altura: number, mapa: Mapa, divisoes = 24) {
  const pontos: Ponto[] = [];
  for (let j = 0; j <= divisoes; j++) for (let i = 0; i <= divisoes; i++) pontos.push(mapa(i / divisoes, j / divisoes));
  const em = (i: number, j: number) => pontos[j * (divisoes + 1) + i];
  const fonte = (i: number, j: number): Ponto => ({ x: (i / divisoes) * largura, y: (j / divisoes) * altura });
  const triangulo = (s: [Ponto, Ponto, Ponto], t: [Ponto, Ponto, Ponto]) => {
    const afim = afimDoTriangulo(s, t);
    if (!afim) return;
    // O recorte é o triângulo de destino, inchado meio pixel a partir do centro
    const cx = (t[0].x + t[1].x + t[2].x) / 3;
    const cy = (t[0].y + t[1].y + t[2].y) / 3;
    const inchar = (p: Ponto) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * 0.5, y: p.y + (dy / d) * 0.5 };
    };
    ctx.save();
    ctx.beginPath();
    const [a, b, c] = t.map(inchar);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(...afim);
    ctx.drawImage(origem, 0, 0, largura, altura);
    ctx.restore();
  };
  for (let j = 0; j < divisoes; j++) {
    for (let i = 0; i < divisoes; i++) {
      triangulo([fonte(i, j), fonte(i + 1, j), fonte(i + 1, j + 1)], [em(i, j), em(i + 1, j), em(i + 1, j + 1)]);
      triangulo([fonte(i, j), fonte(i + 1, j + 1), fonte(i, j + 1)], [em(i, j), em(i + 1, j + 1), em(i, j + 1)]);
    }
  }
}
