// A geometria dos caminhos sem o canvas: o ponto de uma curva de Bézier, os caminhos achatados em polígonos e o
// contorno da região combinada (somar, subtrair, intersectar, excluir) pelo polygon-clipping (MIT), que é o que o traço
// de uma forma com vários componentes segue e o que "Mesclar componentes da forma" guarda.
import polygonClipping, { type MultiPolygon, type Ring } from "polygon-clipping";

import { type No, type Subcaminho, temArea } from "./modelo.ts";

type Ponto = { x: number; y: number };

/** O ponto em t de uma cúbica. */
export function pontoNaCubica(p0: Ponto, c0: Ponto, c1: Ponto, p1: Ponto, t: number): Ponto {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c0.x + c * c1.x + d * p1.x, y: a * p0.y + b * c0.y + c * c1.y + d * p1.y };
}

/** As alças de saída de `a` e de entrada de `b` (a própria âncora quando não há). */
export function alcasDoTrecho(a: No, b: No): [Ponto, Ponto] {
  return [
    { x: a.sx ?? a.x, y: a.sy ?? a.y },
    { x: b.ex ?? b.x, y: b.ey ?? b.y },
  ];
}

const reto = (a: No, b: No) => a.sx === undefined && a.sy === undefined && b.ex === undefined && b.ey === undefined;

/** Os trechos do caminho (cada par de nós vizinhos, e o de volta ao primeiro quando fechado). */
export function trechos(sub: Subcaminho): [No, No][] {
  const lista: [No, No][] = [];
  for (let i = 0; i + 1 < sub.nos.length; i++) lista.push([sub.nos[i], sub.nos[i + 1]]);
  if (sub.fechado && sub.nos.length > 1) lista.push([sub.nos[sub.nos.length - 1], sub.nos[0]]);
  return lista;
}

/** O caminho achatado em pontos, com as curvas divididas para ficarem a menos de `tolerancia` da reta. */
export function achatar(sub: Subcaminho, tolerancia = 0.25): Ponto[] {
  if (!sub.nos.length) return [];
  const pontos: Ponto[] = [{ x: sub.nos[0].x, y: sub.nos[0].y }];
  for (const [a, b] of trechos(sub)) {
    if (!reto(a, b)) {
      const [c0, c1] = alcasDoTrecho(a, b);
      // O desvio da cúbica até a corda é no máximo 3/4 do maior desvio das alças; com n pedaços, cai com n²
      const desvio = Math.max(Math.hypot(a.x - 2 * c0.x + c1.x, a.y - 2 * c0.y + c1.y), Math.hypot(c0.x - 2 * c1.x + b.x, c0.y - 2 * c1.y + b.y));
      const n = Math.min(256, Math.max(1, Math.ceil(Math.sqrt((0.75 * desvio) / tolerancia))));
      for (let k = 1; k < n; k++) pontos.push(pontoNaCubica(a, c0, c1, b, k / n));
    }
    pontos.push({ x: b.x, y: b.y });
  }
  // O fechado volta ao primeiro: o último ponto repetido sai
  if (sub.fechado && pontos.length > 1) pontos.pop();
  return pontos;
}

/** A área com sinal (positiva no sentido horário, com o y para baixo). */
export function areaDoPoligono(pontos: Ponto[]): number {
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return soma / 2;
}

const anel = (pontos: Ponto[]): Ring => pontos.map((p) => [p.x, p.y]);

/**
 * A região dos caminhos fechados, combinados na ordem (o primeiro sempre soma), como polígonos: cada polígono é o
 * anel de fora e os buracos. Os abertos ficam de fora (eles só têm traço).
 */
export function regiaoDosCaminhos(subcaminhos: Subcaminho[], tolerancia = 0.25): MultiPolygon {
  let regiao: MultiPolygon = [];
  let primeiro = true;
  for (const sub of subcaminhos) {
    if (!sub.fechado) continue;
    const pontos = achatar(sub, tolerancia);
    if (pontos.length < 3 || Math.abs(areaDoPoligono(pontos)) < 1e-9) continue;
    const forma: MultiPolygon = [[anel(pontos)]];
    if (primeiro || sub.operacao === "somar") regiao = primeiro ? polygonClipping.union(forma) : polygonClipping.union(regiao, forma);
    else if (sub.operacao === "subtrair") regiao = polygonClipping.difference(regiao, forma);
    else if (sub.operacao === "intersectar") regiao = polygonClipping.intersection(regiao, forma);
    else regiao = polygonClipping.xor(regiao, forma);
    primeiro = false;
  }
  return regiao;
}

/** A região de volta em caminhos (um por anel, sem curvas), todos somando: o anel fechado sem o ponto repetido. */
export function caminhosDaRegiao(regiao: MultiPolygon): Subcaminho[] {
  // Os buracos vão no sentido contrário do de fora, para a regra do não zero também os deixar vazados
  return regiao.flatMap((poligono) =>
    poligono.map((anelDoPoligono, k) => {
      const pontos = anelDoPoligono.slice(0, -1).map(([x, y]) => ({ x, y }));
      const horario = areaDoPoligono(pontos) > 0;
      const ordenados = (k === 0) === horario ? pontos : [...pontos].reverse();
      return { nos: ordenados, fechado: true, operacao: "somar" as const };
    }),
  );
}

/** Se os caminhos fechados se combinam de um jeito que só a região diz (mais de um componente). */
export function precisaDaRegiao(subcaminhos: Subcaminho[]): boolean {
  return subcaminhos.filter((sub) => sub.fechado && temArea(sub)).length > 1;
}

const n = (v: number) => Math.round(v * 100) / 100;

/** O atributo `d` de um caminho SVG com os caminhos (as curvas como cúbicas). */
export function svgDosCaminhos(subcaminhos: Subcaminho[]): string {
  return subcaminhos
    .filter((sub) => sub.nos.length)
    .map((sub) => {
      let d = `M${n(sub.nos[0].x)} ${n(sub.nos[0].y)}`;
      for (const [a, b] of trechos(sub)) {
        if (reto(a, b)) d += `L${n(b.x)} ${n(b.y)}`;
        else {
          const [c0, c1] = alcasDoTrecho(a, b);
          d += `C${n(c0.x)} ${n(c0.y)} ${n(c1.x)} ${n(c1.y)} ${n(b.x)} ${n(b.y)}`;
        }
      }
      return sub.fechado ? `${d}Z` : d;
    })
    .join("");
}

/**
 * Pontos a cada `passo` pixels ao longo do caminho, com a fração do comprimento (0 no começo, 1 no fim): o "Traçar
 * caminho" leva o pincel por eles, e a pressão simulada vem da fração.
 */
export function pontosAoLongo(sub: Subcaminho, passo = 1): { x: number; y: number; fracao: number }[] {
  const pontos = achatar(sub, 0.1);
  if (sub.fechado && pontos.length) pontos.push({ ...pontos[0] });
  if (pontos.length < 2) return pontos.map((p) => ({ ...p, fracao: 0 }));
  const acumulado = [0];
  for (let i = 1; i < pontos.length; i++) acumulado.push(acumulado[i - 1] + Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y));
  const total = acumulado[acumulado.length - 1];
  const saida: { x: number; y: number; fracao: number }[] = [];
  let k = 0;
  const n = Math.max(1, Math.ceil(total / passo));
  for (let s = 0; s <= n; s++) {
    const d = (total * s) / n;
    while (k < pontos.length - 2 && acumulado[k + 1] < d) k++;
    const trecho = acumulado[k + 1] - acumulado[k] || 1;
    const t = Math.min(1, Math.max(0, (d - acumulado[k]) / trecho));
    saida.push({ x: pontos[k].x + (pontos[k + 1].x - pontos[k].x) * t, y: pontos[k].y + (pontos[k + 1].y - pontos[k].y) * t, fracao: total ? d / total : 0 });
  }
  return saida;
}
