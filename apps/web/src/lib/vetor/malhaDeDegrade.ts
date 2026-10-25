// A malha de degradê do editor vetorial (ADR 0003, onda 13.16): pontos em linhas e colunas sobre a caixa da forma, cada
// um com uma cor; entre eles, a cor anda suave (Catmull-Rom nas duas direções da grade), e os pontos podem sair do lugar
// (a célula vira um quadrilátero, e cada pixel acha o lugar dele na célula pela inversa bilinear). As contas são puras.
type Ponto = { x: number; y: number };

export type PontoDaMalha = { x: number; y: number; cor: string };
export type MalhaDeDegrade = { tipo: "malha"; linhas: number; colunas: number; pontos: PontoDaMalha[] };

/** Uma malha regular de `linhas` × `colunas` células, com uma cor em todos os pontos. */
export function malhaNova(linhas: number, colunas: number, cor: (x: number, y: number) => string): MalhaDeDegrade {
  const pontos: PontoDaMalha[] = [];
  for (let l = 0; l <= linhas; l++) for (let c = 0; c <= colunas; c++) pontos.push({ x: c / colunas, y: l / linhas, cor: cor(c / colunas, l / linhas) });
  return { tipo: "malha", linhas, colunas, pontos };
}

const rgb = (cor: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16) || 0) as [number, number, number];
const hex = (v: number[]) => `#${v.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;

/** Catmull-Rom entre p1 e p2 (com os vizinhos p0 e p3). */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** A cor da malha no lugar (c + s, l + t) da grade (as cores pela grade, não pelo lugar dos pontos). */
export function corNaGrade(malha: MalhaDeDegrade, c: number, l: number, s: number, t: number, cores = malha.pontos.map((p) => rgb(p.cor))): [number, number, number] {
  const colunas = malha.colunas + 1;
  const em = (cc: number, ll: number) => cores[Math.max(0, Math.min(malha.linhas, ll)) * colunas + Math.max(0, Math.min(malha.colunas, cc))];
  const saida: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const linha = (ll: number) => catmull(em(c - 1, ll)[k], em(c, ll)[k], em(c + 1, ll)[k], em(c + 2, ll)[k], s);
    saida[k] = catmull(linha(l - 1), linha(l), linha(l + 1), linha(l + 2), t);
  }
  return saida;
}

/** A inversa bilinear: o (s, t) de p no quadrilátero a, b, c, d (a em cima à esquerda, no sentido horário), ou null. */
export function inversaBilinear(p: Ponto, a: Ponto, b: Ponto, c: Ponto, d: Ponto): { s: number; t: number } | null {
  // p = a + s(b − a) + t(d − a) + s·t(a − b + c − d)
  const e = { x: b.x - a.x, y: b.y - a.y };
  const f = { x: d.x - a.x, y: d.y - a.y };
  const g = { x: a.x - b.x + c.x - d.x, y: a.y - b.y + c.y - d.y };
  const h = { x: p.x - a.x, y: p.y - a.y };
  const cruz = (u: Ponto, v: Ponto) => u.x * v.y - u.y * v.x;
  const k2 = cruz(g, f);
  const k1 = cruz(e, f) + cruz(h, g);
  const k0 = cruz(h, e);
  let t: number;
  if (Math.abs(k2) < 1e-9) t = -k0 / k1;
  else {
    const disc = k1 * k1 - 4 * k0 * k2;
    if (disc < 0) return null;
    const raiz = Math.sqrt(disc);
    const t1 = (-k1 - raiz) / (2 * k2);
    const t2 = (-k1 + raiz) / (2 * k2);
    t = t1 >= -1e-6 && t1 <= 1 + 1e-6 ? t1 : t2;
  }
  const denx = e.x + g.x * t;
  const deny = e.y + g.y * t;
  const s = Math.abs(denx) > Math.abs(deny) ? (h.x - f.x * t) / denx : (h.y - f.y * t) / deny;
  if (!Number.isFinite(s) || !Number.isFinite(t)) return null;
  return { s, t };
}

/**
 * Os pixels RGBA da malha num canvas de `largura` × `altura`, com a caixa da forma em `caixa` (pixels do canvas): cada
 * célula pinta os pixels de dentro dela; fora das células, nada.
 */
export function pixelsDaMalha(malha: MalhaDeDegrade, largura: number, altura: number, caixa: { x: number; y: number; largura: number; altura: number }): Uint8ClampedArray {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  const cores = malha.pontos.map((p) => rgb(p.cor));
  const colunas = malha.colunas + 1;
  const lugar = (c: number, l: number) => {
    const p = malha.pontos[l * colunas + c];
    return { x: caixa.x + p.x * caixa.largura, y: caixa.y + p.y * caixa.altura };
  };
  for (let l = 0; l < malha.linhas; l++) {
    for (let c = 0; c < malha.colunas; c++) {
      const a = lugar(c, l);
      const b = lugar(c + 1, l);
      const cc = lugar(c + 1, l + 1);
      const d = lugar(c, l + 1);
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, cc.x, d.x)));
      const x1 = Math.min(largura - 1, Math.ceil(Math.max(a.x, b.x, cc.x, d.x)));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, cc.y, d.y)));
      const y1 = Math.min(altura - 1, Math.ceil(Math.max(a.y, b.y, cc.y, d.y)));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const st = inversaBilinear({ x: x + 0.5, y: y + 0.5 }, a, b, cc, d);
          if (!st || st.s < -1e-6 || st.s > 1 + 1e-6 || st.t < -1e-6 || st.t > 1 + 1e-6) continue;
          const [r, g, bb] = corNaGrade(malha, c, l, Math.min(1, Math.max(0, st.s)), Math.min(1, Math.max(0, st.t)), cores);
          const i = (y * largura + x) * 4;
          dados[i] = r;
          dados[i + 1] = g;
          dados[i + 2] = bb;
          dados[i + 3] = 255;
        }
      }
    }
  }
  return dados;
}

/** A malha com outras linhas e colunas: os pontos novos na grade regular, com a cor da malha de antes ali. */
export function remalhar(malha: MalhaDeDegrade, linhas: number, colunas: number): MalhaDeDegrade {
  return malhaNova(linhas, colunas, (x, y) => {
    const gc = x * malha.colunas;
    const gl = y * malha.linhas;
    const c = Math.min(malha.colunas - 1, Math.floor(gc));
    const l = Math.min(malha.linhas - 1, Math.floor(gl));
    return hex(corNaGrade(malha, c, l, gc - c, gl - l));
  });
}

/** O ponto da malha mais perto (em frações da caixa, com a distância pedida na mesma medida), ou -1. */
export function pontoDaMalhaPerto(malha: MalhaDeDegrade, p: Ponto, raio: number): number {
  let melhor = -1;
  let menor = raio;
  malha.pontos.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= menor) [melhor, menor] = [i, d];
  });
  return melhor;
}
