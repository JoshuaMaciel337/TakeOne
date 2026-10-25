// A largura variável do traço (ADR 0003, onda 13.16, a ferramenta Largura do traço): o perfil são pontos ao longo de
// cada caminho (t de 0 a 1 pelo comprimento), cada um com o quanto o traço vai para a esquerda e para a direita, em
// vezes a metade da largura. Com perfil, o traço é desenhado como o contorno entre as duas bordas, sempre no meio do
// caminho; a prévia e o arquivo usam a mesma conta.
import { achatar } from "./contorno.ts";
import type { Subcaminho } from "./modelo.ts";

type Ponto = { x: number; y: number };

export type PontoDeLargura = { t: number; esquerda: number; direita: number };

/** Os perfis prontos (sem pontos: a largura de sempre). */
export const PERFIS_DE_LARGURA: { id: string; nome: string; pontos: PontoDeLargura[] }[] = [
  { id: "uniforme", nome: "Uniforme", pontos: [] },
  { id: "pontas", nome: "Afinar nas pontas", pontos: [{ t: 0, esquerda: 0, direita: 0 }, { t: 0.5, esquerda: 1, direita: 1 }, { t: 1, esquerda: 0, direita: 0 }] },
  { id: "comeco", nome: "Afinar no começo", pontos: [{ t: 0, esquerda: 0, direita: 0 }, { t: 1, esquerda: 1, direita: 1 }] },
  { id: "fim", nome: "Afinar no fim", pontos: [{ t: 0, esquerda: 1, direita: 1 }, { t: 1, esquerda: 0, direita: 0 }] },
  { id: "bojo", nome: "Bojo", pontos: [{ t: 0, esquerda: 0.3, direita: 0.3 }, { t: 0.5, esquerda: 1.6, direita: 1.6 }, { t: 1, esquerda: 0.3, direita: 0.3 }] },
  { id: "pena", nome: "Pena", pontos: [{ t: 0, esquerda: 0, direita: 0 }, { t: 0.2, esquerda: 1.4, direita: 1.4 }, { t: 1, esquerda: 0, direita: 0 }] },
];

/** O quanto o traço vai para cada lado em t (a reta entre os pontos vizinhos; fora deles, o do ponto da ponta). */
export function larguraEm(perfil: PontoDeLargura[], t: number): { esquerda: number; direita: number } {
  if (!perfil.length) return { esquerda: 1, direita: 1 };
  const ordenado = [...perfil].sort((a, b) => a.t - b.t);
  if (t <= ordenado[0].t) return ordenado[0];
  const ultimo = ordenado[ordenado.length - 1];
  if (t >= ultimo.t) return ultimo;
  const i = ordenado.findIndex((p) => p.t > t);
  const a = ordenado[i - 1];
  const b = ordenado[i];
  const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
  return { esquerda: a.esquerda + (b.esquerda - a.esquerda) * f, direita: a.direita + (b.direita - a.direita) * f };
}

/** O maior lado do perfil (a margem da caixa cresce com ele). */
export const maiorDoPerfil = (perfil: PontoDeLargura[] | null | undefined) => (perfil?.length ? Math.max(1, ...perfil.flatMap((p) => [p.esquerda, p.direita])) : 1);

/** Os pontos do caminho achatado com o t (comprimento andado / total) de cada um; o fechado volta ao primeiro. */
export function pontosComT(sub: Subcaminho, tolerancia = 0.25): { p: Ponto; t: number }[] {
  const pontos = achatar(sub, tolerancia);
  if (sub.fechado && pontos.length > 2) pontos.push({ ...pontos[0] });
  const acumulado = [0];
  for (let i = 1; i < pontos.length; i++) acumulado.push(acumulado[i - 1] + Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y));
  const total = acumulado[acumulado.length - 1] || 1;
  return pontos.map((p, i) => ({ p, t: acumulado[i] / total }));
}

/**
 * O contorno do traço de largura variável de um caminho: anéis para encher com a regra par-ímpar (o aberto, um anel;
 * o fechado, a borda de fora e a de dentro).
 */
export function contornoDaLargura(sub: Subcaminho, largura: number, perfil: PontoDeLargura[]): Ponto[][] {
  // Um vértice em cada t do perfil: entre dois vértices a largura é a reta, então o contorno sai exato
  const lista = pontosComT(sub);
  for (const ponto of perfil) {
    const i = lista.findIndex((item) => item.t >= ponto.t);
    if (i <= 0 || Math.abs(lista[i].t - ponto.t) < 1e-9) continue;
    const a = lista[i - 1];
    const b = lista[i];
    const f = (ponto.t - a.t) / Math.max(1e-12, b.t - a.t);
    lista.splice(i, 0, { p: { x: a.p.x + (b.p.x - a.p.x) * f, y: a.p.y + (b.p.y - a.p.y) * f }, t: ponto.t });
  }
  const n = lista.length;
  if (n < 2) return [];
  const meia = largura / 2;
  const esquerda: Ponto[] = [];
  const direita: Ponto[] = [];
  lista.forEach(({ p, t }, i) => {
    // A normal pela média das direções dos dois trechos em volta
    const antes = lista[i - 1]?.p ?? (sub.fechado ? lista[n - 2].p : p);
    const depois = lista[i + 1]?.p ?? (sub.fechado ? lista[1].p : p);
    let dx = depois.x - antes.x;
    let dy = depois.y - antes.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const { esquerda: le, direita: ld } = larguraEm(perfil, t);
    // A esquerda de quem anda pelo caminho (na tela, com o y para baixo): (dy, −dx)
    esquerda.push({ x: p.x + dy * meia * le, y: p.y - dx * meia * le });
    direita.push({ x: p.x - dy * meia * ld, y: p.y + dx * meia * ld });
  });
  if (sub.fechado) return [esquerda, direita];
  return [[...esquerda, ...direita.reverse()]];
}

/** O ponto do caminho mais perto de `q`: o caminho, o t, o ponto e a distância. */
export function tNoCaminho(subcaminhos: Subcaminho[], q: Ponto): { sub: number; t: number; ponto: Ponto; distancia: number } | null {
  let melhor: { sub: number; t: number; ponto: Ponto; distancia: number } | null = null;
  subcaminhos.forEach((sub, s) => {
    const lista = pontosComT(sub);
    for (let i = 1; i < lista.length; i++) {
      const a = lista[i - 1];
      const b = lista[i];
      const vx = b.p.x - a.p.x;
      const vy = b.p.y - a.p.y;
      const l2 = vx * vx + vy * vy;
      const f = l2 ? Math.max(0, Math.min(1, ((q.x - a.p.x) * vx + (q.y - a.p.y) * vy) / l2)) : 0;
      const ponto = { x: a.p.x + vx * f, y: a.p.y + vy * f };
      const distancia = Math.hypot(q.x - ponto.x, q.y - ponto.y);
      if (!melhor || distancia < melhor.distancia) melhor = { sub: s, t: a.t + (b.t - a.t) * f, ponto, distancia };
    }
  });
  return melhor;
}

/**
 * Põe (ou muda) o ponto de largura em t: perto (a menos de `perto` em t) de um que existe, ele é o que muda; os lados
 * ficam entre 0 e 20.
 */
export function comPontoDeLargura(perfil: PontoDeLargura[], t: number, esquerda: number, direita: number, perto = 0.02): PontoDeLargura[] {
  const limitar = (v: number) => Math.max(0, Math.min(20, v));
  const novo = { t: Math.max(0, Math.min(1, t)), esquerda: limitar(esquerda), direita: limitar(direita) };
  const existente = perfil.findIndex((p) => Math.abs(p.t - t) < perto);
  const lista = existente >= 0 ? perfil.map((p, i) => (i === existente ? { ...novo, t: p.t } : p)) : [...perfil, novo];
  return lista.sort((a, b) => a.t - b.t);
}
