// Filtro › Renderização (ADR 0003, onda 13.11): nuvens, nuvens por diferença, fibras, reflexo de lente, efeitos de
// iluminação, reiluminar, chamas, moldura e árvore. Os que desenham usam o ruído fractal e os sorteios presos ao
// documento (o mesmo desenho em qualquer zoom) e um rasterizador pequeno (traços grossos e discos de borda suave).
import { type ContextoDoFiltro, dePlanos, desfocarPlano, type ImagemDoFiltro, limitar, lumaDe, paraPlanos, type Planos, type Rgb, sorteio } from "./comum.ts";

/** O ruído de valor suavizado num ponto do documento (0 a 1), com a célula `tamanho`. */
function ruido(x: number, y: number, tamanho: number, semente: number): number {
  const gx = x / tamanho;
  const gy = y / tamanho;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const tx = gx - i;
  const ty = gy - j;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const v = (a: number, b: number) => sorteio(a, b, semente);
  const a = v(i, j) + (v(i + 1, j) - v(i, j)) * sx;
  const b = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * sx;
  return a + (b - a) * sy;
}

/** O ruído fractal (soma de oitavas, cada uma com metade do tamanho e da força), de 0 a 1. */
export function fractal(x: number, y: number, tamanho: number, semente: number, oitavas = 6): number {
  let soma = 0;
  let forca = 1;
  let total = 0;
  for (let o = 0; o < oitavas; o++) {
    soma += ruido(x, y, Math.max(0.5, tamanho / 2 ** o), semente * 31 + o) * forca;
    total += forca;
    forca /= 2;
  }
  return soma / total;
}

const misturar = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** O ponto do documento de um pixel. */
const doc = (x: number, y: number, ctx: ContextoDoFiltro) => [ctx.origem.x + (x + 0.5) / ctx.escala, ctx.origem.y + (y + 0.5) / ctx.escala];

/** Uma imagem opaca pintada por `cor(x, y)` (pixels da imagem do filtro). */
function pintarTudo(imagem: ImagemDoFiltro, cor: (x: number, y: number) => Rgb): ImagemDoFiltro {
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let y = 0, i = 0; y < imagem.altura; y++)
    for (let x = 0; x < imagem.largura; x++, i += 4) {
      const c = cor(x, y);
      dados[i] = Math.round(limitar(c[0]) * 255);
      dados[i + 1] = Math.round(limitar(c[1]) * 255);
      dados[i + 2] = Math.round(limitar(c[2]) * 255);
      dados[i + 3] = 255;
    }
  return { ...imagem, dados };
}

/** Nuvens: o ruído fractal entre a cor da frente e a do fundo, cobrindo a camada. */
export function nuvens(imagem: ImagemDoFiltro, frente: Rgb, fundo: Rgb, tamanho: number, semente: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  return pintarTudo(imagem, (x, y) => {
    const [dx, dy] = doc(x, y, ctx);
    return misturar(frente, fundo, fractal(dx, dy, tamanho, semente));
  });
}

/** Nuvens por diferença: as nuvens misturadas à imagem em diferença (cada canal, |imagem − nuvem|). */
export function nuvensPorDiferenca(imagem: ImagemDoFiltro, frente: Rgb, fundo: Rgb, tamanho: number, semente: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const dados = imagem.dados.slice();
  for (let y = 0, i = 0; y < imagem.altura; y++)
    for (let x = 0; x < imagem.largura; x++, i += 4) {
      const a = dados[i + 3];
      if (!a) continue;
      const [dx, dy] = doc(x, y, ctx);
      const nuvem = misturar(frente, fundo, fractal(dx, dy, tamanho, semente));
      for (let k = 0; k < 3; k++) dados[i + k] = Math.round(Math.abs(dados[i + k] / a - nuvem[k]) * a);
    }
  return { ...imagem, dados };
}

/** Fibras: o ruído esticado na vertical (a força), com a variância dando o contraste das listras. */
export function fibras(imagem: ImagemDoFiltro, frente: Rgb, fundo: Rgb, variancia: number, forca: number, semente: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  return pintarTudo(imagem, (x, y) => {
    const [dx, dy] = doc(x, y, ctx);
    let v = 0;
    for (let o = 0; o < 4; o++) v += ruido(dx * 2 ** o, dy / (forca * 4), 1 + o * 0.5, semente * 13 + o) / 2 ** o;
    v = limitar(0.5 + (v / 1.875 - 0.5) * (variancia / 16));
    return misturar(frente, fundo, v);
  });
}

/** Reflexo de lente: o brilho no centro e os fantasmas na reta até o meio da imagem, somados em "tela". */
export function reflexoDeLente(imagem: ImagemDoFiltro, brilho: number, centro: { x: number; y: number }, tipo: string, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const forca = brilho / 100;
  const escala = Math.min(largura, altura) / 600;
  const meio = { x: largura / 2, y: altura / 2 };
  // Os fantasmas: posição na reta (0 é o centro do brilho, 1 o lado oposto ao meio), raio e cor
  const fantasmas: [number, number, Rgb][] =
    tipo === "filme"
      ? [[0.4, 18, [0.4, 0.6, 1]], [0.7, 40, [0.3, 1, 0.5]], [1.2, 70, [1, 0.5, 0.3]]]
      : tipo === "35mm"
        ? [[0.5, 22, [0.9, 0.5, 1]], [0.9, 12, [0.4, 0.8, 1]], [1.4, 50, [0.6, 1, 0.6]]]
        : tipo === "105mm"
          ? [[0.6, 30, [1, 0.6, 0.3]], [1.1, 16, [0.5, 0.7, 1]]]
          : [[0.3, 14, [1, 0.8, 0.5]], [0.6, 28, [0.5, 0.7, 1]], [0.95, 10, [0.6, 1, 0.6]], [1.3, 60, [1, 0.5, 0.8]]];
  const planos = paraPlanos(imagem);
  const n = largura * altura;
  const saida = planos.map((plano) => plano.slice()) as Planos;
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      const a = planos[3][p];
      if (!a) continue;
      const d = Math.hypot(x - centro.x, y - centro.y) / escala;
      // O brilho principal e o halo
      let luz: Rgb = [0, 0, 0];
      const nucleo = Math.exp(-((d / 20) ** 2)) * 1.4 + Math.exp(-d / 90) * 0.5;
      luz = [nucleo, nucleo * 0.95, nucleo * 0.85];
      const anel = Math.exp(-(((d - (tipo === "105mm" ? 140 : 110)) / 6) ** 2)) * 0.18;
      luz = [luz[0] + anel * 0.6, luz[1] + anel * 0.8, luz[2] + anel];
      for (const [t, raio, cor] of fantasmas) {
        const fx = centro.x + (meio.x - centro.x) * 2 * t;
        const fy = centro.y + (meio.y - centro.y) * 2 * t;
        const df = Math.hypot(x - fx, y - fy) / (raio * escala);
        const f = df < 1 ? 0.12 * (1 - df * df) : 0;
        luz = [luz[0] + f * cor[0], luz[1] + f * cor[1], luz[2] + f * cor[2]];
      }
      for (let k = 0; k < 3; k++) {
        const c = planos[k][p] / a;
        const l = limitar(luz[k] * forca);
        saida[k][p] = (c + l - c * l) * a;
      }
    }
  void n;
  return dePlanos(saida, largura, altura);
}

export type Iluminacao = {
  tipo: string;
  cor: Rgb;
  intensidade: number;
  foco: number;
  centro: { x: number; y: number };
  raio: number;
  angulo: number;
  altura: number;
  ambiente: number;
  exposicao: number;
  textura: string;
  relevo: number;
};

/** O campo de altura do relevo (a luz, o alfa ou nada), desfocado um pouco para as normais não serem ruído. */
function campoDeAltura(imagem: ImagemDoFiltro, textura: string, ctx: ContextoDoFiltro): Float32Array | null {
  if (textura === "nenhuma") return null;
  const { largura, altura } = imagem;
  const campo = new Float32Array(largura * altura);
  for (let p = 0, i = 0; p < campo.length; p++, i += 4) {
    const a = imagem.dados[i + 3];
    campo[p] = textura === "alfa" ? a / 255 : a ? lumaDe(imagem.dados[i], imagem.dados[i + 1], imagem.dados[i + 2]) / a : 0;
  }
  return desfocarPlano(campo, largura, altura, Math.max(0.7, ctx.escala));
}

/** Efeitos de iluminação: um holofote, um ponto ou uma luz infinita, com o ambiente e o relevo de um canal. */
export function efeitosDeIluminacao(imagem: ImagemDoFiltro, o: Iluminacao, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const relevo = campoDeAltura(imagem, o.textura, ctx);
  const saida = planos.map((plano) => plano.slice()) as Planos;
  const ang = (o.angulo * Math.PI) / 180;
  const elevacao = (o.altura / 100) * (Math.PI / 2);
  const infinita: [number, number, number] = [Math.cos(ang) * Math.cos(elevacao), -Math.sin(ang) * Math.cos(elevacao), Math.sin(elevacao)];
  const altLuz = Math.max(20, o.raio * 0.6) ;
  const forcaDoRelevo = (o.relevo / 100) * 8;
  const ambiente = ((o.ambiente + 100) / 200) * 0.4;
  const exposicao = 1 + o.exposicao / 100;
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      const a = planos[3][p];
      if (!a) continue;
      // A normal da superfície pelo relevo
      let nx = 0;
      let ny = 0;
      if (relevo && x > 0 && y > 0 && x < largura - 1 && y < altura - 1) {
        nx = -(relevo[p + 1] - relevo[p - 1]) * forcaDoRelevo;
        ny = -(relevo[p + largura] - relevo[p - largura]) * forcaDoRelevo;
      }
      const nl = Math.hypot(nx, ny, 1);
      let lx: number;
      let ly: number;
      let lz: number;
      let atenuacao = 1;
      if (o.tipo === "infinita") [lx, ly, lz] = infinita;
      else {
        const dx = o.centro.x - x;
        const dy = o.centro.y - y;
        const dz = altLuz * ctx.escala;
        const d = Math.hypot(dx, dy, dz);
        [lx, ly, lz] = [dx / d, dy / d, dz / d];
        const r = Math.hypot(dx, dy) / Math.max(1, o.raio * ctx.escala);
        atenuacao = o.tipo === "spot" ? Math.max(0, 1 - r ** (1 + o.foco / 25)) : 1 / (1 + r * r);
      }
      const difusa = Math.max(0, (nx * lx + ny * ly + lz) / nl) * atenuacao * (o.intensidade / 100 + 0.35);
      for (let k = 0; k < 3; k++) {
        const c = planos[k][p] / a;
        saida[k][p] = limitar(c * (ambiente + difusa * o.cor[k]) * exposicao * 1.2) * a;
      }
    }
  return dePlanos(saida, largura, altura);
}

/** Reiluminar: a luz infinita no ângulo, sobre o relevo tirado da própria luz da imagem (desfocada), com preenchimento. */
export function reiluminar(imagem: ImagemDoFiltro, angulo: number, elevacao: number, intensidade: number, preenchimento: number, cor: Rgb, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const luz = new Float32Array(largura * altura);
  for (let p = 0; p < luz.length; p++) luz[p] = planos[3][p] ? (0.299 * planos[0][p] + 0.587 * planos[1][p] + 0.114 * planos[2][p]) / planos[3][p] : 0;
  // O relevo largo: as formas grandes da cena, não os detalhes
  const forma = desfocarPlano(luz, largura, altura, Math.max(2, Math.min(largura, altura) * 0.02));
  const a0 = (angulo * Math.PI) / 180;
  const e = (elevacao / 90) * (Math.PI / 2);
  const L = [Math.cos(a0) * Math.cos(e), -Math.sin(a0) * Math.cos(e), Math.sin(e)];
  const saida = planos.map((plano) => plano.slice()) as Planos;
  const k0 = 30 / Math.max(0.5, ctx.escala);
  for (let y = 1; y < altura - 1; y++)
    for (let x = 1; x < largura - 1; x++) {
      const p = y * largura + x;
      const a = planos[3][p];
      if (!a) continue;
      const nx = -(forma[p + 1] - forma[p - 1]) * k0;
      const ny = -(forma[p + largura] - forma[p - largura]) * k0;
      const nl = Math.hypot(nx, ny, 1);
      const difusa = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / nl);
      const ganho = preenchimento / 100 + (1 - preenchimento / 100) * difusa;
      const t = intensidade / 100;
      for (let k = 0; k < 3; k++) {
        const c = planos[k][p] / a;
        const nova = c * (1 - t + t * ganho * 1.3 * (0.6 + 0.4 * cor[k]));
        saida[k][p] = limitar(nova) * a;
      }
    }
  return dePlanos(saida, largura, altura);
}

// ——— O rasterizador pequeno ———
/** Pinta por cima, no alfa pré-multiplicado, uma cor com cobertura de 0 a 1 em cada pixel. */
function pintarPorCima(planos: Planos, largura: number, p: number, cor: Rgb, cobertura: number) {
  if (cobertura <= 0) return;
  const c = limitar(cobertura);
  for (let k = 0; k < 3; k++) planos[k][p] = cor[k] * c + planos[k][p] * (1 - c);
  planos[3][p] = c + planos[3][p] * (1 - c);
  void largura;
}

/** Um traço grosso (cápsula) de `a` a `b`, de raio `ra` a `rb`, com a borda suave de um pixel. */
function traco(planos: Planos, largura: number, altura: number, a: [number, number], b: [number, number], ra: number, rb: number, cor: Rgb) {
  const x0 = Math.max(0, Math.floor(Math.min(a[0] - ra, b[0] - rb) - 1));
  const x1 = Math.min(largura - 1, Math.ceil(Math.max(a[0] + ra, b[0] + rb) + 1));
  const y0 = Math.max(0, Math.floor(Math.min(a[1] - ra, b[1] - rb) - 1));
  const y1 = Math.min(altura - 1, Math.ceil(Math.max(a[1] + ra, b[1] + rb) + 1));
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy || 1;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - a[0];
      const py = y + 0.5 - a[1];
      const t = limitar((px * vx + py * vy) / l2);
      const r = ra + (rb - ra) * t;
      const d = Math.hypot(px - vx * t, py - vy * t);
      pintarPorCima(planos, largura, y * largura + x, cor, r - d + 0.5);
    }
}

/** Árvore: o tronco e os galhos em ramificações sorteadas, com as folhas em discos nas pontas (ou sem folhas). */
export function arvore(imagem: ImagemDoFiltro, base: { x: number; y: number }, tamanho: number, tipo: string, tronco: Rgb, folhas: Rgb, folhagem: number, semente: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const galhos: [number, number, number, number, number, number][] = [];
  const pontas: [number, number, number][] = [];
  const conifera = tipo === "conifera";
  const crescer = (x: number, y: number, comprimento: number, angulo: number, espessura: number, nivel: number, id: number) => {
    const fim: [number, number] = [x + Math.cos(angulo) * comprimento, y - Math.sin(angulo) * comprimento];
    galhos.push([x, y, fim[0], fim[1], espessura, espessura * 0.7]);
    if (nivel >= (conifera ? 3 : 6) || comprimento < 3 * ctx.escala) {
      pontas.push([fim[0], fim[1], comprimento]);
      return;
    }
    const s = (k: number) => sorteio(id, semente, k);
    if (conifera) {
      // O pinheiro: o tronco segue reto e solta galhos curtos para os lados, cada vez menores
      for (let i = 1; i <= 6; i++) {
        const t = i / 7;
        const bx = x + (fim[0] - x) * t;
        const by = y + (fim[1] - y) * t;
        const lado = comprimento * (1 - t) * 0.55;
        crescer(bx, by, lado, Math.PI * (0.08 + 0.06 * s(i)), espessura * 0.3, nivel + 2, id * 16 + i);
        crescer(bx, by, lado, Math.PI * (0.92 - 0.06 * s(i + 9)), espessura * 0.3, nivel + 2, id * 16 + i + 8);
      }
      return;
    }
    const filhos = 2 + Math.round(s(1));
    for (let i = 0; i < filhos; i++) {
      const desvio = (i / (filhos - 1 || 1) - 0.5) * (0.9 + 0.5 * s(i + 2));
      crescer(fim[0], fim[1], comprimento * (0.62 + 0.18 * s(i + 5)), angulo + desvio, espessura * 0.68, nivel + 1, id * 8 + i + 1);
    }
  };
  const bx = (base.x - ctx.origem.x) * ctx.escala;
  const by = (base.y - ctx.origem.y) * ctx.escala;
  const t = tamanho * ctx.escala;
  crescer(bx, by, conifera ? t : t * 0.32, Math.PI / 2, Math.max(1, t * 0.045), 0, 1);
  for (const [x0, y0, x1, y1, r0, r1] of galhos) traco(planos, largura, altura, [x0, y0], [x1, y1], r0, r1, tronco);
  if (tipo !== "sem_folhas") {
    for (const [x, y, comprimento] of pontas) {
      const quantas = Math.max(1, Math.round((folhagem / 100) * 6));
      for (let i = 0; i < quantas; i++) {
        const s = (k: number) => sorteio(Math.round(x * 7), Math.round(y * 7) + i, k + semente);
        const r = Math.max(1.5, comprimento * (conifera ? 0.35 : 0.55) * (0.6 + 0.6 * s(1)));
        const fx = x + (s(2) - 0.5) * r * 1.6;
        const fy = y + (s(3) - 0.5) * r * 1.6;
        const tom = 0.75 + 0.5 * s(4);
        traco(planos, largura, altura, [fx, fy], [fx, fy], r, r, [folhas[0] * tom, folhas[1] * tom, folhas[2] * tom] as Rgb);
      }
    }
  }
  return dePlanos(planos, largura, altura);
}

/** Moldura: uma borda em volta da camada (simples, dupla, chanfrada, madeira, vinhas ou pontilhada), por cima dela. */
export function moldura(imagem: ImagemDoFiltro, tipo: string, larguraDaBorda: number, cor: Rgb, cor2: Rgb, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const w = Math.max(1, larguraDaBorda * ctx.escala);
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      // A distância à borda mais perto da imagem do filtro (a camada)
      const d = Math.min(x + 0.5, y + 0.5, largura - x - 0.5, altura - y - 0.5);
      if (d > w + 1) continue;
      const cobertura = limitar(w - d + 0.5);
      const t = d / w;
      const [dx, dy] = doc(x, y, ctx);
      let c: Rgb = cor;
      if (tipo === "dupla") c = t < 0.35 || t > 0.7 ? cor : cor2;
      else if (tipo === "chanfrada") {
        // A luz de cima à esquerda: os lados de cima e da esquerda claros, os outros escuros
        const claro = x + 0.5 < largura - x - 0.5 === y + 0.5 < altura - y - 0.5 ? (x + 0.5 + y + 0.5 < largura - x + altura - y ? 1.35 : 0.6) : 1;
        c = cor.map((v) => v * claro) as Rgb;
      } else if (tipo === "madeira") {
        const veio = fractal(dx * 0.15, dy * 2.2, 6, 4) * 0.6 + Math.sin(dx * 0.4 + fractal(dx, dy, 18, 5) * 8) * 0.2;
        c = misturar(cor, cor2, limitar(0.4 + veio));
      } else if (tipo === "vinhas") {
        const ao_longo = x + 0.5 < w + 1 || largura - x - 0.5 < w + 1 ? dy : dx;
        const onda = Math.abs(t - 0.5 - 0.25 * Math.sin(ao_longo / (w * 0.9)));
        c = onda < 0.12 ? cor2 : cor;
      } else if (tipo === "pontilhada") {
        const ao_longo = x + 0.5 < w + 1 || largura - x - 0.5 < w + 1 ? dy : dx;
        const fase = ((ao_longo / (w * 0.8)) % 1 + 1) % 1;
        c = Math.hypot(fase - 0.5, t - 0.5) < 0.3 ? cor2 : cor;
      }
      pintarPorCima(planos, largura, p, c, cobertura);
    }
  return dePlanos(planos, largura, altura);
}

/** Chamas: línguas de fogo subindo de uma linha horizontal (a altura em %), pelo ruído que sobe, em "tela" por cima. */
export function chamas(imagem: ImagemDoFiltro, base: number, comprimento: number, largura_: number, turbulencia: number, cor: string, semente: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const saida = planos.map((plano) => plano.slice()) as Planos;
  const paleta = (v: number): Rgb =>
    cor === "azul"
      ? [limitar(v * 1.6 - 0.9), limitar(v * 1.3 - 0.4), limitar(v * 1.4)]
      : cor === "verde"
        ? [limitar(v * 1.5 - 0.8), limitar(v * 1.5), limitar(v * 1.4 - 0.7)]
        : [limitar(v * 2), limitar(v * 1.6 - 0.5), limitar(v * 2 - 1.4)];
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const [dx, dy] = doc(x, y, ctx);
      const subida = (base / 100) * ctx.documento.altura - dy;
      if (subida < -2 || subida > comprimento) continue;
      const t = limitar(subida / comprimento);
      // As línguas: colunas de ruído (a largura) que se afinam com a altura, mexidas pela turbulência
      const mexida = (fractal(dx, dy * 0.6, 30, semente + 7, 3) - 0.5) * turbulencia;
      const coluna = fractal(dx + mexida, subida * 0.25, largura_, semente, 4);
      const v = limitar((coluna - t * 0.75) * 2.4 - 0.1) * (1 - t * t);
      if (v <= 0) continue;
      const p = y * largura + x;
      const c = paleta(v);
      for (let k = 0; k < 3; k++) saida[k][p] = c[k] + saida[k][p] - c[k] * saida[k][p];
      saida[3][p] = Math.max(saida[3][p], limitar(v * 1.5));
    }
  return dePlanos(saida, largura, altura);
}
