// Mesclar objetos do editor vetorial (ADR 0003, onda 13.16): entre duas formas, os passos do meio, com o contorno, a
// cor do preenchimento e do traço, a largura do traço e a opacidade indo de uma à outra. O contorno de cada uma (o maior
// caminho fechado, ou o caminho aberto) vira o mesmo número de pontos pelo comprimento, no mesmo sentido e começando
// no ponto que deixa as duas mais parecidas; cada passo é a mistura ponto a ponto, de volta em curvas.
import { achatar, areaDoPoligono } from "./contorno.ts";
import { curvasComCantos } from "./edicao.ts";
import type { Subcaminho, TintaDaForma, TracoDaForma } from "./modelo.ts";
import { curvasAbertasComCantos, densificar } from "./pincelVetorial.ts";

type Ponto = { x: number; y: number };

export type FormaDaMescla = { caminhos: Subcaminho[]; preenchimento: TintaDaForma; traco: TracoDaForma | null; opacidade: number };

const PONTOS = 200;

/** O contorno principal: o maior caminho fechado (ou, sem nenhum, o primeiro aberto). */
function principal(caminhos: Subcaminho[]): Subcaminho | null {
  const fechados = caminhos.filter((sub) => sub.fechado && sub.nos.length >= 2);
  if (fechados.length) return fechados.reduce((maior, sub) => (Math.abs(areaDoPoligono(achatar(sub, 0.5))) > Math.abs(areaDoPoligono(achatar(maior, 0.5))) ? sub : maior));
  return caminhos.find((sub) => sub.nos.length >= 2) ?? null;
}

/** `n` pontos igualmente espaçados pelo comprimento (o fechado no sentido horário da tela, sem repetir o primeiro). */
export function pontosIguais(sub: Subcaminho, n: number): Ponto[] {
  let linha = achatar(sub, 0.2);
  if (sub.fechado) {
    if (areaDoPoligono(linha) < 0) linha = [...linha].reverse();
    linha = [...linha, linha[0]];
  }
  const tudo = densificar(linha, 0.5);
  const acumulado = [0];
  for (let i = 1; i < tudo.length; i++) acumulado.push(acumulado[i - 1] + Math.hypot(tudo[i].x - tudo[i - 1].x, tudo[i].y - tudo[i - 1].y));
  const total = acumulado[acumulado.length - 1] || 1;
  const saida: Ponto[] = [];
  const passos = sub.fechado ? n : n - 1;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const d = (total * i) / passos;
    while (k < tudo.length - 2 && acumulado[k + 1] < d) k++;
    const trecho = acumulado[k + 1] - acumulado[k] || 1;
    const t = Math.min(1, Math.max(0, (d - acumulado[k]) / trecho));
    saida.push({ x: tudo[k].x + (tudo[k + 1].x - tudo[k].x) * t, y: tudo[k].y + (tudo[k + 1].y - tudo[k].y) * t });
  }
  return saida;
}

/** O deslocamento de `b` (girado pelo índice) que mais aproxima os pontos dos de `a`, tirando as médias. */
function melhorInicio(a: Ponto[], b: Ponto[]): number {
  const media = (lista: Ponto[]) => ({ x: lista.reduce((s, p) => s + p.x, 0) / lista.length, y: lista.reduce((s, p) => s + p.y, 0) / lista.length });
  const ma = media(a);
  const mb = media(b);
  let melhor = 0;
  let menor = Infinity;
  for (let k = 0; k < b.length; k++) {
    let soma = 0;
    for (let i = 0; i < a.length && soma < menor; i += 2) {
      const q = b[(i + k) % b.length];
      soma += (a[i].x - ma.x - (q.x - mb.x)) ** 2 + (a[i].y - ma.y - (q.y - mb.y)) ** 2;
    }
    if (soma < menor) [menor, melhor] = [soma, k];
  }
  return melhor;
}

const hex = (cor: string) => [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16));
export function misturarCores(a: string, b: string, t: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return t < 0.5 ? a : b;
  const [ra, ga, ba] = hex(a);
  const [rb, gb, bb] = hex(b);
  return `#${[ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function misturarTinta(a: TintaDaForma, b: TintaDaForma, t: number): TintaDaForma {
  if (a.tipo === "cor" && b.tipo === "cor") return { tipo: "cor", cor: misturarCores(a.cor, b.cor, t) };
  return t < 0.5 ? a : b;
}

/** Os `passos` do meio entre `a` e `b` (sem as duas). */
export function passosDaMescla(a: FormaDaMescla, b: FormaDaMescla, passos: number): FormaDaMescla[] {
  const ca = principal(a.caminhos);
  const cb = principal(b.caminhos);
  if (!ca || !cb) return [];
  const fechado = ca.fechado && cb.fechado;
  const pa = pontosIguais({ ...ca, fechado }, PONTOS);
  let pb = pontosIguais({ ...cb, fechado }, PONTOS);
  if (fechado) {
    const k = melhorInicio(pa, pb);
    pb = pb.map((_, i) => pb[(i + k) % pb.length]);
  }
  const n = Math.max(1, Math.min(100, Math.round(passos)));
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1);
    const pontos = pa.map((p, j) => ({ x: p.x + (pb[j].x - p.x) * t, y: p.y + (pb[j].y - p.y) * t }));
    const caminho: Subcaminho = { nos: fechado ? curvasComCantos(pontos, 0.35, 35) : curvasAbertasComCantos(pontos, 0.35, 35), fechado, operacao: "somar" };
    const traco = a.traco && b.traco ? { ...a.traco, tinta: misturarTinta(a.traco.tinta, b.traco.tinta, t), largura: a.traco.largura + (b.traco.largura - a.traco.largura) * t } : t < 0.5 ? a.traco : b.traco;
    return { caminhos: [caminho], preenchimento: misturarTinta(a.preenchimento, b.preenchimento, t), traco, opacidade: a.opacidade + (b.opacidade - a.opacidade) * t };
  });
}
