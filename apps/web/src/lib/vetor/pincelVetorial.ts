// Os pincéis e o lápis do editor vetorial (ADR 0003, onda 13.16), em contas puras sobre os pontos do traço (pixels da
// imagem): o traço livre que vira curvas (Pincel de traço e Lápis vetorial, que também continuam um caminho aberto e
// fecham quando as pontas se encontram), o contorno do Pincel de bolha (que se junta à forma escolhida da mesma cor),
// o Suavizar e a Borracha de caminho (só onde o traço passa), o Unir (as pontas abertas perto do traço) e o
// reconhecimento do Modelador (linha, elipse, retângulo, triângulo, polígono ou rabisco).
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";

import { achatar, caminhosDaRegiao, regiaoDosCaminhos } from "./contorno.ts";
import { ajustarCurvas, curvasComCantos, simplificar } from "./edicao.ts";
import type { No, Subcaminho } from "./modelo.ts";

type Ponto = { x: number; y: number };

export type OpcoesDoPincelVetorial = {
  /** De 1 (preciso) a 5 (suave): o quanto o traço pode se afastar dos pontos ao virar curvas. */
  fidelidade: number;
  /** A largura do traço do Pincel de traço e do Lápis vetorial, em pixels. */
  espessura: number;
  /** O traço que começa perto da ponta de um caminho aberto da forma escolhida o continua. */
  editarSelecionados: boolean;
  /** A distância (pixels da tela) que conta como "perto": para continuar, fechar e unir. */
  distancia: number;
  /** Fechar o caminho quando o traço acaba perto de onde começou. */
  fechar: boolean;
  /** O raio do Pincel de bolha, em pixels. */
  raioDaBolha: number;
  /** A bolha se junta à forma escolhida quando ela tem a mesma cor e as duas se tocam. */
  mesclarBolha: boolean;
  /** O raio do Suavizar e da Borracha de caminho, em pixels. */
  raio: number;
  /** De 0 a 100: o quanto cada passada do Suavizar alisa. */
  suavidade: number;
};

export const PINCEL_VETORIAL_PADRAO: OpcoesDoPincelVetorial = { fidelidade: 3, espessura: 4, editarSelecionados: true, distancia: 12, fechar: true, raioDaBolha: 12, mesclarBolha: true, raio: 12, suavidade: 50 };

/** A tolerância do ajuste de curvas (pixels da imagem) para a fidelidade. */
export const toleranciaDaFidelidade = (fidelidade: number) => [0.5, 1, 2.5, 5, 10][Math.max(0, Math.min(4, Math.round(fidelidade) - 1))];

const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);

function comprimento(pontos: Ponto[]): number {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) total += dist(pontos[i - 1], pontos[i]);
  return total;
}

/** A distância de um ponto a um segmento. */
function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** A distância de um ponto à linha do traço (um ponto só vale como um círculo). */
export function distanciaAoTraco(p: Ponto, traco: Ponto[]): number {
  if (traco.length === 1) return dist(p, traco[0]);
  let menor = Infinity;
  for (let i = 1; i < traco.length; i++) menor = Math.min(menor, distanciaAoSegmento(p, traco[i - 1], traco[i]));
  return menor;
}

/** Os pontos com outros no meio dos trechos longos (no máximo `passo` entre dois vizinhos); os cantos ficam. */
export function densificar(pontos: Ponto[], passo: number): Ponto[] {
  const saida: Ponto[] = pontos.length ? [pontos[0]] : [];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const n = Math.ceil(dist(a, b) / passo);
    for (let k = 1; k <= n; k++) saida.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return saida;
}

/** Curvas por uma linha aberta, com os cantos (onde a direção vira mais que `angulo`) guardados. */
export function curvasAbertasComCantos(pontos: Ponto[], tolerancia: number, angulo = 40): No[] {
  if (pontos.length < 3) return pontos.map(({ x, y }) => ({ x, y }));
  const limite = Math.cos((angulo * Math.PI) / 180);
  const cortes = [0];
  for (let i = 1; i < pontos.length - 1; i++) {
    const a = { x: pontos[i].x - pontos[i - 1].x, y: pontos[i].y - pontos[i - 1].y };
    const b = { x: pontos[i + 1].x - pontos[i].x, y: pontos[i + 1].y - pontos[i].y };
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (la > 1e-9 && lb > 1e-9 && (a.x * b.x + a.y * b.y) / (la * lb) < limite) cortes.push(i);
  }
  cortes.push(pontos.length - 1);
  const nos: No[] = [];
  for (let k = 0; k < cortes.length - 1; k++) {
    const trecho = ajustarCurvas(pontos.slice(cortes[k], cortes[k + 1] + 1), tolerancia, false);
    if (!nos.length) nos.push(...trecho);
    else {
      const ultimo = nos[nos.length - 1];
      nos[nos.length - 1] = { ...ultimo, ...(trecho[0].sx !== undefined ? { sx: trecho[0].sx, sy: trecho[0].sy } : {}) };
      nos.push(...trecho.slice(1));
    }
  }
  return nos;
}

/** O traço livre em curvas: aberto, ou fechado quando acaba a menos de `fecharEm` de onde começou. */
export function caminhoLivre(pontos: Ponto[], tolerancia: number, fecharEm = 0): Subcaminho | null {
  if (pontos.length < 2 || comprimento(pontos) < 1) return null;
  const fechado = fecharEm > 0 && pontos.length > 3 && dist(pontos[0], pontos[pontos.length - 1]) <= fecharEm && comprimento(pontos) > 3 * fecharEm;
  const base = fechado ? pontos.slice(0, -1) : pontos;
  return { nos: ajustarCurvas(base, tolerancia, fechado), fechado, operacao: "somar" };
}

/** O caminho no sentido contrário (as alças trocam de lado). */
export function inverterCaminho(sub: Subcaminho): Subcaminho {
  return {
    ...sub,
    nos: [...sub.nos].reverse().map((no) => {
      const saida: No = { x: no.x, y: no.y };
      if (no.sx !== undefined && no.sy !== undefined) Object.assign(saida, { ex: no.sx, ey: no.sy });
      if (no.ex !== undefined && no.ey !== undefined) Object.assign(saida, { sx: no.ex, sy: no.ey });
      return saida;
    }),
  };
}

/** Junta `b` ao fim de `a` (o último nó de `a` e o primeiro de `b` viram um só quando estão a menos de 0,5). */
function emendar(a: Subcaminho, b: Subcaminho): Subcaminho {
  const ultimo = a.nos[a.nos.length - 1];
  const primeiro = b.nos[0];
  if (dist(ultimo, primeiro) < 0.5) {
    const juntado: No = { x: ultimo.x, y: ultimo.y };
    if (ultimo.ex !== undefined) Object.assign(juntado, { ex: ultimo.ex, ey: ultimo.ey });
    if (primeiro.sx !== undefined) Object.assign(juntado, { sx: primeiro.sx, sy: primeiro.sy });
    return { ...a, nos: [...a.nos.slice(0, -1), juntado, ...b.nos.slice(1)] };
  }
  return { ...a, nos: [...a.nos, ...b.nos] };
}

/**
 * O traço que começa perto da ponta de um caminho aberto o continua (e o fecha, se acabar perto da outra ponta);
 * null quando nenhuma ponta está perto.
 */
export function continuarCaminho(caminhos: Subcaminho[], novo: Subcaminho, distancia: number): Subcaminho[] | null {
  if (novo.fechado || novo.nos.length < 2) return null;
  const inicio = novo.nos[0];
  const fim = novo.nos[novo.nos.length - 1];
  let melhor: { indice: number; doFim: boolean; d: number } | null = null;
  for (let indice = 0; indice < caminhos.length; indice++) {
    const sub = caminhos[indice];
    if (sub.fechado || sub.nos.length < 1) continue;
    for (const doFim of [true, false]) {
      const ponta = doFim ? sub.nos[sub.nos.length - 1] : sub.nos[0];
      const d = dist(ponta, inicio);
      if (d <= distancia && (!melhor || d < melhor.d)) melhor = { indice, doFim, d };
    }
  }
  if (!melhor) return null;
  const { indice, doFim } = melhor;
  const alvo = doFim ? caminhos[indice] : inverterCaminho(caminhos[indice]);
  // O começo do traço novo cai na ponta do caminho
  const ponta = alvo.nos[alvo.nos.length - 1];
  const encaixado: Subcaminho = { ...novo, nos: [{ ...novo.nos[0], x: ponta.x, y: ponta.y, sx: (novo.nos[0].sx ?? novo.nos[0].x) + ponta.x - inicio.x, sy: (novo.nos[0].sy ?? novo.nos[0].y) + ponta.y - inicio.y }, ...novo.nos.slice(1)] };
  let junto = emendar(alvo, encaixado);
  // Acabou perto da outra ponta: fecha
  if (junto.nos.length > 2 && dist(fim, junto.nos[0]) <= distancia) {
    const ultimo = junto.nos.pop()!;
    junto = { ...junto, fechado: true, nos: [{ ...junto.nos[0], ...(ultimo.ex !== undefined ? { ex: ultimo.ex + junto.nos[0].x - ultimo.x, ey: ultimo.ey! + junto.nos[0].y - ultimo.y } : {}) }, ...junto.nos.slice(1)] };
  }
  return caminhos.map((sub, i) => (i === indice ? junto : sub));
}

/** A região de um traço grosso: círculos nos pontos e retângulos entre eles, somados. */
export function regiaoDaBolha(pontos: Ponto[], raio: number): MultiPolygon {
  if (!pontos.length || raio <= 0) return [];
  const passo = Math.max(0.5, raio / 3);
  const lista = simplificar(densificar(pontos, passo), Math.max(0.1, raio / 20));
  const lados = Math.max(12, Math.min(48, Math.round(raio)));
  const pecas: Polygon[] = [];
  const circulo = (c: Ponto): Polygon => {
    const anel: [number, number][] = [];
    for (let k = 0; k < lados; k++) {
      const a = (k / lados) * 2 * Math.PI;
      anel.push([c.x + Math.cos(a) * raio, c.y + Math.sin(a) * raio]);
    }
    anel.push(anel[0]);
    return [anel];
  };
  lista.forEach((p, i) => {
    pecas.push(circulo(p));
    if (i === 0) return;
    const a = lista[i - 1];
    const d = dist(a, p);
    if (d < 1e-9) return;
    const nx = (-(p.y - a.y) / d) * raio;
    const ny = ((p.x - a.x) / d) * raio;
    pecas.push([[[a.x + nx, a.y + ny], [p.x + nx, p.y + ny], [p.x - nx, p.y - ny], [a.x - nx, a.y - ny], [a.x + nx, a.y + ny]]]);
  });
  return polygonClipping.union(pecas[0], ...pecas.slice(1));
}

/** A região em caminhos com curvas (os cantos guardados). */
export function caminhosDaRegiaoEmCurvas(regiao: MultiPolygon, tolerancia: number): Subcaminho[] {
  return caminhosDaRegiao(regiao)
    .filter((sub) => sub.nos.length >= 3)
    .map((sub) => ({ ...sub, nos: curvasComCantos(sub.nos, tolerancia, 50) }));
}

/** A bolha somada aos caminhos da forma (quando se tocam), ou null quando não se tocam. */
export function juntarBolha(existentes: Subcaminho[], bolha: MultiPolygon, tolerancia: number): Subcaminho[] | null {
  const regiao = regiaoDosCaminhos(existentes, 0.25);
  if (!regiao.length || !polygonClipping.intersection(regiao, bolha).length) return null;
  const abertos = existentes.filter((sub) => !sub.fechado);
  return [...caminhosDaRegiaoEmCurvas(polygonClipping.union(regiao, bolha), tolerancia), ...abertos];
}

/** Os pontos de um caminho achatado e com pontos a cada `passo` (o fechado sem repetir o primeiro). */
function pontosDoCaminho(sub: Subcaminho, passo: number): Ponto[] {
  const achatados = achatar(sub, 0.2);
  if (sub.fechado && achatados.length > 2) {
    const tudo = densificar([...achatados, achatados[0]], passo);
    tudo.pop();
    return tudo;
  }
  return densificar(achatados, passo);
}

/**
 * O Suavizar: os pontos dos caminhos a menos de `raio` do traço são alisados (a média com os vizinhos, mais vezes
 * quanto maior a suavidade) e o caminho tocado vira curvas de novo; os que o traço não toca ficam como estão.
 */
export function suavizarCaminhos(caminhos: Subcaminho[], traco: Ponto[], raio: number, suavidade: number): Subcaminho[] {
  const vezes = 1 + Math.round((Math.max(0, Math.min(100, suavidade)) / 100) * 19);
  // Os pontos a um quinto do raio: a média com os vizinhos alisa na escala do pincel
  const passo = Math.max(1.5, raio / 5);
  return caminhos.map((sub) => {
    const pontos = pontosDoCaminho(sub, passo);
    const n = pontos.length;
    const peso = pontos.map((p) => Math.max(0, 1 - distanciaAoTraco(p, traco) / raio));
    if (n < 3 || !peso.some((w) => w > 0)) return sub;
    let atual = pontos;
    for (let v = 0; v < vezes; v++) {
      atual = atual.map((p, i) => {
        const w = peso[i] * 0.5;
        if (!w) return p;
        const antes = sub.fechado ? atual[(i + n - 1) % n] : atual[i - 1];
        const depois = sub.fechado ? atual[(i + 1) % n] : atual[i + 1];
        if (!antes || !depois) return p;
        return { x: p.x * (1 - w) + ((antes.x + depois.x) / 2) * w, y: p.y * (1 - w) + ((antes.y + depois.y) / 2) * w };
      });
    }
    return { ...sub, nos: sub.fechado ? curvasComCantos(atual, 0.35, 40) : curvasAbertasComCantos(atual, 0.35) };
  });
}

/** A Borracha de caminho: o que fica a menos de `raio` do traço sai; o resto vira pedaços abertos. */
export function apagarDoCaminho(caminhos: Subcaminho[], traco: Ponto[], raio: number): Subcaminho[] {
  const saida: Subcaminho[] = [];
  for (const sub of caminhos) {
    const pontos = pontosDoCaminho(sub, 1);
    const fora = pontos.map((p) => distanciaAoTraco(p, traco) > raio);
    if (fora.every(Boolean)) {
      saida.push(sub);
      continue;
    }
    if (!fora.some(Boolean)) continue;
    // Os pedaços seguidos que ficam; no fechado, o que passa pelo começo é um só
    const n = pontos.length;
    let inicio = 0;
    if (sub.fechado) while (fora[inicio]) inicio++;
    const pedacos: Ponto[][] = [];
    let atual: Ponto[] = [];
    for (let k = 0; k < n + (sub.fechado ? 1 : 0); k++) {
      const i = (inicio + k) % n;
      if (k < n && fora[i]) atual.push(pontos[i]);
      else {
        if (atual.length) pedacos.push(atual);
        atual = [];
      }
    }
    if (atual.length) pedacos.push(atual);
    for (const pedaco of pedacos) if (pedaco.length >= 2 && comprimento(pedaco) >= 1) saida.push({ nos: curvasAbertasComCantos(pedaco, 0.35), fechado: false, operacao: sub.operacao });
  }
  return saida;
}

/**
 * O Unir: as duas pontas abertas mais perto uma da outra entre as que ficam a menos de `distancia` do traço viram
 * uma (de dois caminhos, um só; do mesmo caminho, ele fecha); null quando não há duas.
 */
export function unirCaminhos(caminhos: Subcaminho[], traco: Ponto[], distancia: number): Subcaminho[] | null {
  const pontas: { sub: number; doFim: boolean; p: Ponto }[] = [];
  caminhos.forEach((sub, i) => {
    if (sub.fechado || sub.nos.length < 2) return;
    for (const doFim of [false, true]) {
      const p = doFim ? sub.nos[sub.nos.length - 1] : sub.nos[0];
      if (distanciaAoTraco(p, traco) <= distancia) pontas.push({ sub: i, doFim, p });
    }
  });
  let melhor: [(typeof pontas)[number], (typeof pontas)[number]] | null = null;
  for (let a = 0; a < pontas.length; a++) {
    for (let b = a + 1; b < pontas.length; b++) {
      if (!melhor || dist(pontas[a].p, pontas[b].p) < dist(melhor[0].p, melhor[1].p)) melhor = [pontas[a], pontas[b]];
    }
  }
  if (!melhor) return null;
  const [a, b] = melhor;
  if (a.sub === b.sub) {
    const sub = caminhos[a.sub];
    const ultimo = sub.nos[sub.nos.length - 1];
    // As pontas quase juntas viram um nó só
    const nos = dist(sub.nos[0], ultimo) < 0.5 && sub.nos.length > 2 ? [{ ...sub.nos[0], ...(ultimo.ex !== undefined ? { ex: ultimo.ex, ey: ultimo.ey } : {}) }, ...sub.nos.slice(1, -1)] : sub.nos;
    return caminhos.map((item, i) => (i === a.sub ? { ...item, nos, fechado: true } : item));
  }
  // a termina no fim; b começa no começo
  const primeiro = a.doFim ? caminhos[a.sub] : inverterCaminho(caminhos[a.sub]);
  const segundo = b.doFim ? inverterCaminho(caminhos[b.sub]) : caminhos[b.sub];
  const junto = emendar(primeiro, segundo);
  return [...caminhos.filter((_, i) => i !== a.sub && i !== b.sub), junto];
}

export type FormaReconhecida =
  | { tipo: "linha"; de: Ponto; ate: Ponto }
  | { tipo: "elipse" | "retangulo"; caixa: { x: number; y: number; largura: number; altura: number } }
  | { tipo: "poligono"; pontos: Ponto[] }
  | { tipo: "rabisco" };

/** O Modelador: o que o traço livre parece (ou null, quando não parece nada). */
export function reconhecerForma(pontos: Ponto[]): FormaReconhecida | null {
  if (pontos.length < 2) return null;
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  const caixa = { x: Math.min(...xs), y: Math.min(...ys), largura: Math.max(...xs) - Math.min(...xs), altura: Math.max(...ys) - Math.min(...ys) };
  const diagonal = Math.hypot(caixa.largura, caixa.altura);
  if (diagonal < 4) return null;
  const total = comprimento(pontos);
  // O rabisco: a direção volta (mais de 120°) muitas vezes ao longo do traço
  const grossos = simplificar(pontos, diagonal * 0.04);
  let voltas = 0;
  for (let i = 1; i < grossos.length - 1; i++) {
    const a = { x: grossos[i].x - grossos[i - 1].x, y: grossos[i].y - grossos[i - 1].y };
    const b = { x: grossos[i + 1].x - grossos[i].x, y: grossos[i + 1].y - grossos[i].y };
    const cos = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) || 1);
    if (cos < -0.5) voltas++;
  }
  if (voltas >= 3 && total > 2 * diagonal) return { tipo: "rabisco" };
  const fechado = dist(pontos[0], pontos[pontos.length - 1]) < Math.max(8, diagonal * 0.2);
  if (!fechado) {
    const de = pontos[0];
    const ate = pontos[pontos.length - 1];
    const corda = dist(de, ate);
    const desvio = Math.max(...pontos.map((p) => distanciaAoSegmento(p, de, ate)));
    return corda > 4 && desvio < corda * 0.08 ? { tipo: "linha", de, ate } : null;
  }
  const anel = pontos.slice(0, -1);
  let area = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) / 2;
  const perimetro = total + dist(pontos[pontos.length - 1], pontos[0]);
  const redondeza = (4 * Math.PI * area) / (perimetro * perimetro);
  // Os cantos: o anel simplificado a 7% da diagonal, sem o ponto repetido
  const cantos = simplificar([...anel, anel[0]], diagonal * 0.07).slice(0, -1);
  const unidos = semCantosRetos(cantos);
  if (redondeza > 0.86 || unidos.length > 8) return { tipo: "elipse", caixa };
  if (unidos.length === 3) return { tipo: "poligono", pontos: unidos };
  if (unidos.length === 4) {
    // Quatro cantos perto de retos e os lados perto dos eixos: o retângulo da caixa
    const retos = unidos.every((p, i) => {
      const a = unidos[(i + 3) % 4];
      const b = unidos[(i + 1) % 4];
      const u = { x: a.x - p.x, y: a.y - p.y };
      const v = { x: b.x - p.x, y: b.y - p.y };
      return Math.abs((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1)) < 0.35;
    });
    const deitados = unidos.every((p, i) => {
      const q = unidos[(i + 1) % 4];
      const angulo = Math.abs(Math.atan2(q.y - p.y, q.x - p.x)) % (Math.PI / 2);
      return Math.min(angulo, Math.PI / 2 - angulo) < 0.3;
    });
    if (retos && deitados) return { tipo: "retangulo", caixa };
    return { tipo: "poligono", pontos: unidos };
  }
  if (unidos.length >= 5) return { tipo: "poligono", pontos: unidos };
  return redondeza > 0.7 ? { tipo: "elipse", caixa } : null;
}

/** Tira os "cantos" quase retos (o lado que só desvia um pouco) da lista de cantos de um anel. */
function semCantosRetos(cantos: Ponto[]): Ponto[] {
  let lista = cantos;
  for (let volta = 0; volta < 4 && lista.length > 3; volta++) {
    const n = lista.length;
    const fica = lista.filter((p, i) => {
      const a = lista[(i + n - 1) % n];
      const b = lista[(i + 1) % n];
      const u = { x: p.x - a.x, y: p.y - a.y };
      const v = { x: b.x - p.x, y: b.y - p.y };
      return (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1) < Math.cos((25 * Math.PI) / 180);
    });
    if (fica.length === lista.length || fica.length < 3) break;
    lista = fica;
  }
  return lista;
}

/** Se o ponto está na região (a regra par-ímpar em todos os anéis). */
export function pontoNaRegiao(regiao: MultiPolygon, p: Ponto): boolean {
  let dentro = false;
  for (const poligono of regiao) {
    for (const anel of poligono) {
      for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
        const [ax, ay] = anel[i];
        const [bx, by] = anel[j];
        if (ay > p.y !== by > p.y && p.x < ((bx - ax) * (p.y - ay)) / (by - ay) + ax) dentro = !dentro;
      }
    }
  }
  return dentro;
}
