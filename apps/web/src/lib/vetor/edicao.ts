// A edição dos caminhos (ADR 0003, onda 13.7): achar o nó, a alça ou o trecho perto de um ponto, pôr um nó no meio de
// um trecho sem mudar a curva (de Casteljau), tirar e converter nós, mover alças (a do outro lado segue alinhada se o
// nó é liso), a caneta de curvatura (as alças pelos vizinhos), o ajuste de curva da caneta de forma livre (Schneider,
// "An algorithm for automatically fitting digitized curves", 1990) e o contorno de uma seleção em caminhos.
import { alcasDoTrecho, pontoNaCubica, trechos } from "./contorno.ts";
import type { No, Subcaminho } from "./modelo.ts";

type Ponto = { x: number; y: number };

const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);
const mais = (a: Ponto, b: Ponto): Ponto => ({ x: a.x + b.x, y: a.y + b.y });
const menos = (a: Ponto, b: Ponto): Ponto => ({ x: a.x - b.x, y: a.y - b.y });
const vezes = (a: Ponto, k: number): Ponto => ({ x: a.x * k, y: a.y * k });
const entre = (a: Ponto, b: Ponto, t: number): Ponto => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const ponto = (x: number | undefined, y: number | undefined): Ponto | null => (x === undefined || y === undefined ? null : { x, y });
const unitario = (v: Ponto): Ponto => {
  const d = Math.hypot(v.x, v.y);
  return d < 1e-12 ? { x: 0, y: 0 } : { x: v.x / d, y: v.y / d };
};

export type AlvoNoCaminho = { sub: number; no: number; parte: "ancora" | "e" | "s" };

/** O nó (ou a alça, nos nós em que `comAlcas` diz que elas aparecem) mais perto do ponto, até `tolerancia`. */
export function acharPonto(subcaminhos: Subcaminho[], p: Ponto, tolerancia: number, comAlcas: (sub: number, no: number) => boolean = () => false): AlvoNoCaminho | null {
  let melhor: AlvoNoCaminho | null = null;
  let menor = tolerancia;
  subcaminhos.forEach((sub, i) =>
    sub.nos.forEach((no, j) => {
      const candidatos: [AlvoNoCaminho["parte"], Ponto | null][] = [["ancora", no]];
      if (comAlcas(i, j)) candidatos.push(["e", ponto(no.ex, no.ey)], ["s", ponto(no.sx, no.sy)]);
      for (const [parte, q] of candidatos) {
        if (!q) continue;
        const d = dist(q, p);
        // A âncora ganha da alça no empate (as alças nascem em cima dela)
        if (d < menor || (d === menor && parte === "ancora")) {
          menor = d;
          melhor = { sub: i, no: j, parte };
        }
      }
    }),
  );
  return melhor;
}

/** O ponto do caminho mais perto de `p` (até `tolerancia`): o trecho (índice em `trechos`) e o t nele. */
export function acharTrecho(subcaminhos: Subcaminho[], p: Ponto, tolerancia: number): { sub: number; trecho: number; t: number; ponto: Ponto } | null {
  let melhor: { sub: number; trecho: number; t: number; ponto: Ponto } | null = null;
  let menor = tolerancia;
  subcaminhos.forEach((sub, i) =>
    trechos(sub).forEach(([a, b], k) => {
      const [c0, c1] = alcasDoTrecho(a, b);
      const em = (t: number) => pontoNaCubica(a, c0, c1, b, t);
      // Amostra e depois refina pela busca dourada em volta da melhor amostra
      let tMelhor = 0;
      let dMelhor = Infinity;
      for (let s = 0; s <= 32; s++) {
        const d = dist(em(s / 32), p);
        if (d < dMelhor) [dMelhor, tMelhor] = [d, s / 32];
      }
      let lo = Math.max(0, tMelhor - 1 / 32);
      let hi = Math.min(1, tMelhor + 1 / 32);
      for (let passo = 0; passo < 24; passo++) {
        const m1 = lo + (hi - lo) * 0.382;
        const m2 = lo + (hi - lo) * 0.618;
        if (dist(em(m1), p) < dist(em(m2), p)) hi = m2;
        else lo = m1;
      }
      const t = (lo + hi) / 2;
      const q = em(t);
      const d = dist(q, p);
      if (d < menor) {
        menor = d;
        melhor = { sub: i, trecho: k, t, ponto: q };
      }
    }),
  );
  return melhor;
}

/** Põe um nó no trecho `k` em `t`, sem mudar a curva. */
export function dividirTrecho(sub: Subcaminho, k: number, t: number): Subcaminho {
  const n = sub.nos.length;
  const ia = k;
  const ib = (k + 1) % n;
  const a = sub.nos[ia];
  const b = sub.nos[ib];
  const nos = sub.nos.map((no) => ({ ...no }));
  const temCurva = a.sx !== undefined || b.ex !== undefined;
  let novo: No;
  if (!temCurva) {
    const m = entre(a, b, t);
    novo = { x: m.x, y: m.y };
  } else {
    const [p1, p2] = alcasDoTrecho(a, b);
    const q0 = entre(a, p1, t);
    const q1 = entre(p1, p2, t);
    const q2 = entre(p2, b, t);
    const r0 = entre(q0, q1, t);
    const r1 = entre(q1, q2, t);
    const s = entre(r0, r1, t);
    nos[ia] = { ...nos[ia], sx: q0.x, sy: q0.y };
    nos[ib] = { ...nos[ib], ex: q2.x, ey: q2.y };
    novo = { x: s.x, y: s.y, ex: r0.x, ey: r0.y, sx: r1.x, sy: r1.y };
  }
  nos.splice(ia + 1, 0, novo);
  return { ...sub, nos };
}

/** Tira o nó `i`; o caminho segue do anterior ao seguinte. Sem nós que bastem (um só), devolve null. */
export function excluirNo(sub: Subcaminho, i: number): Subcaminho | null {
  const nos = sub.nos.filter((_, j) => j !== i);
  if (nos.length < 2) return null;
  return { ...sub, nos, fechado: sub.fechado && nos.length > 2 };
}

const semAlcas = ({ x, y }: No): No => ({ x, y });

/** Converter ponto (clique): o nó com alças vira canto; o canto ganha alças lisas na direção dos vizinhos. */
export function converterNo(sub: Subcaminho, i: number): Subcaminho {
  const no = sub.nos[i];
  const nos = [...sub.nos];
  if (no.ex !== undefined || no.sx !== undefined) {
    nos[i] = semAlcas(no);
    return { ...sub, nos };
  }
  const n = nos.length;
  const antes = i > 0 ? nos[i - 1] : sub.fechado ? nos[n - 1] : null;
  const depois = i < n - 1 ? nos[i + 1] : sub.fechado ? nos[0] : null;
  const direcao = unitario(menos(depois ?? no, antes ?? no));
  const comprimento = (Math.max(antes ? dist(antes, no) : 0, depois ? dist(depois, no) : 0) || 30) / 3;
  nos[i] = { x: no.x, y: no.y, ex: no.x - direcao.x * comprimento, ey: no.y - direcao.y * comprimento, sx: no.x + direcao.x * comprimento, sy: no.y + direcao.y * comprimento };
  return { ...sub, nos };
}

/** As alças simétricas puxadas do nó até `para` (a de saída em `para`, a de entrada espelhada): a caneta arrastando. */
export function alcasSimetricas(no: No, para: Ponto): No {
  if (dist(no, para) < 0.5) return semAlcas(no);
  return { x: no.x, y: no.y, sx: para.x, sy: para.y, ex: 2 * no.x - para.x, ey: 2 * no.y - para.y };
}

/** Se as duas alças do nó estão alinhadas (o nó é liso). */
export function noLiso(no: No): boolean {
  const e = ponto(no.ex, no.ey);
  const s = ponto(no.sx, no.sy);
  if (!e || !s) return false;
  const a = unitario(menos(no, e));
  const b = unitario(menos(s, no));
  return a.x * b.x + a.y * b.y > 0.999;
}

/** Leva a alça `lado` a `para`; a do outro lado segue alinhada (com o comprimento dela) no nó liso, a menos de `quebrar`. */
export function moverAlca(no: No, lado: "e" | "s", para: Ponto, quebrar = false): No {
  const liso = noLiso(no);
  const novo: No = lado === "e" ? { ...no, ex: para.x, ey: para.y } : { ...no, sx: para.x, sy: para.y };
  if (!liso || quebrar) return novo;
  const outra = lado === "e" ? ponto(no.sx, no.sy)! : ponto(no.ex, no.ey)!;
  const direcao = unitario(menos(no, para));
  const comprimento = dist(outra, no);
  const q = mais(no, vezes(direcao, comprimento));
  return lado === "e" ? { ...novo, sx: q.x, sy: q.y } : { ...novo, ex: q.x, ey: q.y };
}

/** Move os nós (as âncoras e as alças deles). */
export function moverNos(subcaminhos: Subcaminho[], alvos: { sub: number; no: number }[], dx: number, dy: number): Subcaminho[] {
  const mover = (v: number | undefined, d: number) => (v === undefined ? undefined : v + d);
  const marcados = new Set(alvos.map((alvo) => `${alvo.sub}:${alvo.no}`));
  return subcaminhos.map((sub, i) => ({
    ...sub,
    nos: sub.nos.map((no, j) => {
      if (!marcados.has(`${i}:${j}`)) return no;
      const movido: No = { x: no.x + dx, y: no.y + dy };
      if (no.ex !== undefined) Object.assign(movido, { ex: mover(no.ex, dx), ey: mover(no.ey, dy) });
      if (no.sx !== undefined) Object.assign(movido, { sx: mover(no.sx, dx), sy: mover(no.sy, dy) });
      return movido;
    }),
  }));
}

/** Leva todos os pontos (e as alças) por uma função (uma transformação afim ou projetiva). */
export function transformarCaminhos(subcaminhos: Subcaminho[], f: (p: Ponto) => Ponto): Subcaminho[] {
  return subcaminhos.map((sub) => ({
    ...sub,
    nos: sub.nos.map((no) => {
      const a = f(no);
      const novo: No = { x: a.x, y: a.y };
      const e = ponto(no.ex, no.ey);
      const s = ponto(no.sx, no.sy);
      if (e) Object.assign(novo, { ex: f(e).x, ey: f(e).y });
      if (s) Object.assign(novo, { sx: f(s).x, sy: f(s).y });
      return novo;
    }),
  }));
}

/** A caneta de curvatura: o caminho passa pelos pontos, e cada ponto liso tem as alças pela direção dos vizinhos. */
export function caminhoDeCurvatura(pontos: (Ponto & { canto?: boolean })[], fechado: boolean): Subcaminho {
  const n = pontos.length;
  const nos: No[] = pontos.map((p, i) => {
    const antes = i > 0 ? pontos[i - 1] : fechado ? pontos[n - 1] : null;
    const depois = i < n - 1 ? pontos[i + 1] : fechado ? pontos[0] : null;
    if (p.canto || !antes || !depois || n < 3) return { x: p.x, y: p.y };
    // Catmull-Rom, com as alças proporcionais à distância de cada lado (não estica um lado curto)
    const direcao = unitario(menos(depois, antes));
    const e = mais(p, vezes(direcao, -dist(antes, p) / 3));
    const s = mais(p, vezes(direcao, dist(depois, p) / 3));
    return { x: p.x, y: p.y, ex: e.x, ey: e.y, sx: s.x, sy: s.y };
  });
  return { nos, fechado, operacao: "somar" };
}

// ——— Ajuste de curva (Schneider) ———

type Cubica = [Ponto, Ponto, Ponto, Ponto];

function bezier(c: Cubica, t: number): Ponto {
  return pontoNaCubica(c[0], c[1], c[2], c[3], t);
}
function derivada(c: Cubica, t: number): Ponto {
  const u = 1 - t;
  return mais(mais(vezes(menos(c[1], c[0]), 3 * u * u), vezes(menos(c[2], c[1]), 6 * u * t)), vezes(menos(c[3], c[2]), 3 * t * t));
}
function segunda(c: Cubica, t: number): Ponto {
  return mais(vezes(mais(menos(c[2], vezes(c[1], 2)), c[0]), 6 * (1 - t)), vezes(mais(menos(c[3], vezes(c[2], 2)), c[1]), 6 * t));
}

function gerarBezier(d: Ponto[], primeiro: number, ultimo: number, u: number[], t1: Ponto, t2: Ponto): Cubica {
  const p0 = d[primeiro];
  const p3 = d[ultimo];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i];
    const b0 = (1 - t) ** 3;
    const b1 = 3 * t * (1 - t) ** 2;
    const b2 = 3 * t * t * (1 - t);
    const b3 = t ** 3;
    const a1 = vezes(t1, b1);
    const a2 = vezes(t2, b2);
    c00 += a1.x * a1.x + a1.y * a1.y;
    c01 += a1.x * a2.x + a1.y * a2.y;
    c11 += a2.x * a2.x + a2.y * a2.y;
    const tmp = menos(d[primeiro + i], mais(vezes(p0, b0 + b1), vezes(p3, b2 + b3)));
    x0 += a1.x * tmp.x + a1.y * tmp.y;
    x1 += a2.x * tmp.x + a2.y * tmp.y;
  }
  const det = c00 * c11 - c01 * c01;
  let alfa1 = det === 0 ? 0 : (x0 * c11 - c01 * x1) / det;
  let alfa2 = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det;
  const corda = dist(p0, p3);
  // Alfas pequenos ou negativos: a heurística de Wu e Barsky (um terço da corda)
  if (alfa1 < corda * 1e-6 || alfa2 < corda * 1e-6) alfa1 = alfa2 = corda / 3;
  return [p0, mais(p0, vezes(t1, alfa1)), mais(p3, vezes(t2, alfa2)), p3];
}

function erroMaximo(d: Ponto[], primeiro: number, ultimo: number, c: Cubica, u: number[]): { erro: number; onde: number } {
  let erro = 0;
  let onde = Math.floor((ultimo - primeiro + 1) / 2) + primeiro;
  for (let i = primeiro + 1; i < ultimo; i++) {
    const v = menos(bezier(c, u[i - primeiro]), d[i]);
    const e = v.x * v.x + v.y * v.y;
    if (e >= erro) {
      erro = e;
      onde = i;
    }
  }
  return { erro, onde };
}

function ajustar(d: Ponto[], primeiro: number, ultimo: number, t1: Ponto, t2: Ponto, erro: number, saida: Cubica[]) {
  if (ultimo - primeiro === 1) {
    const corda = dist(d[primeiro], d[ultimo]) / 3;
    saida.push([d[primeiro], mais(d[primeiro], vezes(t1, corda)), mais(d[ultimo], vezes(t2, corda)), d[ultimo]]);
    return;
  }
  // Parâmetros pelo comprimento da corda
  let u = [0];
  for (let i = primeiro + 1; i <= ultimo; i++) u.push(u[u.length - 1] + dist(d[i], d[i - 1]));
  const total = u[u.length - 1] || 1;
  u = u.map((v) => v / total);
  let c = gerarBezier(d, primeiro, ultimo, u, t1, t2);
  let { erro: maximo, onde } = erroMaximo(d, primeiro, ultimo, c, u);
  if (maximo < erro) {
    saida.push(c);
    return;
  }
  if (maximo < erro * 4) {
    // Newton-Raphson nos parâmetros, algumas vezes
    for (let passo = 0; passo < 6; passo++) {
      u = u.map((t, i) => {
        const p = d[primeiro + i];
        const q = menos(bezier(c, t), p);
        const q1 = derivada(c, t);
        const q2 = segunda(c, t);
        const num = q.x * q1.x + q.y * q1.y;
        const den = q1.x * q1.x + q1.y * q1.y + q.x * q2.x + q.y * q2.y;
        return den === 0 ? t : Math.min(1, Math.max(0, t - num / den));
      });
      c = gerarBezier(d, primeiro, ultimo, u, t1, t2);
      ({ erro: maximo, onde } = erroMaximo(d, primeiro, ultimo, c, u));
      if (maximo < erro) {
        saida.push(c);
        return;
      }
    }
  }
  const centro = unitario(menos(d[onde - 1], d[onde + 1]));
  ajustar(d, primeiro, onde, t1, centro, erro, saida);
  ajustar(d, onde, ultimo, vezes(centro, -1), t2, erro, saida);
}

/** Pontos sem os repetidos (a menos de meio pixel do anterior). */
function semRepetidos(pontos: Ponto[]): Ponto[] {
  const saida: Ponto[] = [];
  for (const p of pontos) if (!saida.length || dist(saida[saida.length - 1], p) > 0.5) saida.push({ x: p.x, y: p.y });
  return saida;
}

/** O traço à mão em nós de Bézier, a menos de `tolerancia` pixels dos pontos; fechado, o fim volta ao começo. */
export function ajustarCurvas(pontos: Ponto[], tolerancia: number, fechado = false): No[] {
  const d = semRepetidos(pontos);
  if (fechado && d.length > 2 && dist(d[0], d[d.length - 1]) > 0.5) d.push({ ...d[0] });
  if (d.length < 2) return d.map(({ x, y }) => ({ x, y }));
  const n = d.length;
  // As tangentes das pontas; fechado, as duas pela direção em volta do começo
  let t1 = unitario(menos(d[1], d[0]));
  let t2 = unitario(menos(d[n - 2], d[n - 1]));
  if (fechado && n > 3) {
    t1 = unitario(menos(d[1], d[n - 2]));
    t2 = vezes(t1, -1);
  }
  const cubicas: Cubica[] = [];
  const erro = Math.max(0.01, tolerancia) ** 2;
  if (fechado && n > 12) {
    // O anel em quatro partes (pelo índice), com a tangente de cada emenda pelos vizinhos: o resultado fica simétrico
    // e com pelo menos quatro nós, como o de uma elipse
    const emendas = [0, 1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 4));
    const tangente = (i: number) => unitario(menos(d[i === n - 1 || i === 0 ? 1 : i + 1], d[i === 0 || i === n - 1 ? n - 2 : i - 1]));
    for (let k = 0; k < 4; k++) ajustar(d, emendas[k], emendas[k + 1], tangente(emendas[k]), vezes(tangente(emendas[k + 1]), -1), erro, cubicas);
  } else ajustar(d, 0, n - 1, t1, t2, erro, cubicas);
  const nos: No[] = [{ x: cubicas[0][0].x, y: cubicas[0][0].y }];
  cubicas.forEach((c, i) => {
    nos[nos.length - 1] = { ...nos[nos.length - 1], sx: c[1].x, sy: c[1].y };
    nos.push({ x: c[3].x, y: c[3].y, ex: c[2].x, ey: c[2].y });
    if (i === cubicas.length - 1 && fechado) {
      // O último nó é o primeiro de novo: a alça de entrada vai para o primeiro
      const ultimo = nos.pop()!;
      nos[0] = { ...nos[0], ex: ultimo.ex, ey: ultimo.ey };
    }
  });
  return nos;
}

// ——— Seleção em caminho ———

/** Ramer–Douglas–Peucker num anel ou numa linha (os pontos que ficam a mais de `tolerancia` da reta). */
export function simplificar(pontos: Ponto[], tolerancia: number): Ponto[] {
  if (pontos.length < 3) return pontos;
  const manter = new Uint8Array(pontos.length);
  manter[0] = manter[pontos.length - 1] = 1;
  const pilha: [number, number][] = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop()!;
    let maior = 0;
    let onde = -1;
    const pa = pontos[a];
    const pb = pontos[b];
    const comprimento = dist(pa, pb);
    for (let i = a + 1; i < b; i++) {
      const p = pontos[i];
      const d = comprimento < 1e-9 ? dist(p, pa) : Math.abs((pb.x - pa.x) * (pa.y - p.y) - (pa.x - p.x) * (pb.y - pa.y)) / comprimento;
      if (d > maior) [maior, onde] = [d, i];
    }
    if (onde >= 0 && maior > tolerancia) {
      manter[onde] = 1;
      pilha.push([a, onde], [onde, b]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
}

/**
 * Os contornos da seleção (o que passa de metade) como anéis pelas bordas dos pixels, o de dentro sempre à direita:
 * os de fora no sentido horário, os buracos no anti-horário. Onde dois pixels só se tocam na ponta, o contorno vira
 * para a direita (cada um fica com o seu).
 */
export function contornosDaMascara(mascara: { largura: number; altura: number; dados: ArrayLike<number> }): Ponto[][] {
  const { largura: l, altura: a, dados } = mascara;
  const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < l && y < a && dados[y * l + x] >= 128;
  // As arestas saindo de cada vértice (x, y), guardadas pela chave do vértice
  const saidas = new Map<number, [number, number][]>();
  const chave = (x: number, y: number) => y * (l + 1) + x;
  const aresta = (x0: number, y0: number, x1: number, y1: number) => {
    const k = chave(x0, y0);
    const lista = saidas.get(k);
    if (lista) lista.push([x1, y1]);
    else saidas.set(k, [[x1, y1]]);
  };
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      if (!dentro(x, y)) continue;
      if (!dentro(x, y - 1)) aresta(x, y, x + 1, y);
      if (!dentro(x + 1, y)) aresta(x + 1, y, x + 1, y + 1);
      if (!dentro(x, y + 1)) aresta(x + 1, y + 1, x, y + 1);
      if (!dentro(x - 1, y)) aresta(x, y + 1, x, y);
    }
  }
  const aneis: Ponto[][] = [];
  for (const [inicio, lista] of saidas) {
    while (lista.length) {
      const x0 = inicio % (l + 1);
      const y0 = Math.floor(inicio / (l + 1));
      const anel: Ponto[] = [{ x: x0, y: y0 }];
      let [x, y] = lista.pop()!;
      let dx = x - x0;
      let dy = y - y0;
      while (!(x === x0 && y === y0)) {
        anel.push({ x, y });
        const opcoes = saidas.get(chave(x, y))!;
        // A que vira mais para a direita (y para baixo: a direita de (dx, dy) é (−dy, dx))
        let escolhida = 0;
        if (opcoes.length > 1) {
          const nota = ([nx, ny]: [number, number]) => {
            const vx = nx - x;
            const vy = ny - y;
            return vx * -dy + vy * dx;
          };
          escolhida = opcoes.reduce((melhor, item, i) => (nota(item) > nota(opcoes[melhor]) ? i : melhor), 0);
        }
        const [nx, ny] = opcoes.splice(escolhida, 1)[0];
        dx = nx - x;
        dy = ny - y;
        [x, y] = [nx, ny];
      }
      aneis.push(anel);
    }
  }
  return aneis;
}

/**
 * Selecionar › Criar caminho de trabalho: os contornos da seleção sem a escada dos pixels (os meios das arestas,
 * suavizados), simplificados e ajustados em curvas a menos de `tolerancia` pixels.
 */
export function caminhosDaMascara(mascara: { largura: number; altura: number; dados: ArrayLike<number> }, tolerancia: number): Subcaminho[] {
  const saida: Subcaminho[] = [];
  for (const anel of contornosDaMascara(mascara)) {
    if (anel.length < 4) continue;
    const n = anel.length;
    const meios = anel.map((p, i) => entre(p, anel[(i + 1) % n], 0.5));
    // Uma passada de média com os vizinhos tira o resto da escada
    const lisos = meios.map((p, i) => vezes(mais(mais(meios[(i + n - 1) % n], vezes(p, 2)), meios[(i + 1) % n]), 0.25));
    const simples = simplificar([...lisos, lisos[0]], Math.max(0.3, tolerancia * 0.5)).slice(0, -1);
    if (simples.length < 3) continue;
    const nos = tolerancia <= 0.5 ? simples.map(({ x, y }) => ({ x, y })) : ajustarCurvas(simples, tolerancia, true);
    if (nos.length >= 2) saida.push({ nos, fechado: true, operacao: "somar" });
  }
  return saida;
}
