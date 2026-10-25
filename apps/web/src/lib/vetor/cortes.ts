// Os cortes do editor vetorial (ADR 0003, onda 13.16), em contas puras sobre os caminhos em pixels da imagem: a
// Tesoura (o clique no caminho o abre ali, ou o divide em dois), a Faca (o traço, livre ou reto, corta as formas
// fechadas em pedaços) e a Borracha vetorial (o traço grosso, ou um retângulo, tira a área das formas e o pedaço dos
// caminhos abertos).
import polygonClipping, { type MultiPolygon } from "polygon-clipping";

import { achatar, regiaoDosCaminhos } from "./contorno.ts";
import { acharTrecho, dividirTrecho } from "./edicao.ts";
import type { No, Subcaminho } from "./modelo.ts";
import { caminhosDaRegiaoEmCurvas, curvasAbertasComCantos, densificar, pontoNaRegiao, regiaoDaBolha } from "./pincelVetorial.ts";

type Ponto = { x: number; y: number };

/** O nó sem a alça de entrada (o começo de um caminho aberto) ou sem a de saída (o fim). */
const semEntrada = (no: No): No => ({ x: no.x, y: no.y, ...(no.sx !== undefined ? { sx: no.sx, sy: no.sy } : {}) });
const semSaida = (no: No): No => ({ x: no.x, y: no.y, ...(no.ex !== undefined ? { ex: no.ex, ey: no.ey } : {}) });

/**
 * A Tesoura: o ponto do caminho mais perto do clique (até `tolerancia`) vira um nó; o caminho fechado abre ali, e o
 * aberto vira dois. null quando o clique não pega o caminho (ou cai na ponta de um aberto).
 */
export function cortarComTesoura(caminhos: Subcaminho[], p: Ponto, tolerancia: number): Subcaminho[] | null {
  const alvo = acharTrecho(caminhos, p, tolerancia);
  if (!alvo) return null;
  const original = caminhos[alvo.sub];
  // Perto de um nó, corta nele (não cria um nó repetido)
  let sub = original;
  let j: number;
  const seguinte = (alvo.trecho + 1) % original.nos.length;
  const pertoDoNo = (i: number) => Math.hypot(original.nos[i].x - alvo.ponto.x, original.nos[i].y - alvo.ponto.y) < Math.min(1, tolerancia / 3);
  if (pertoDoNo(alvo.trecho)) j = alvo.trecho;
  else if (pertoDoNo(seguinte)) j = seguinte;
  else {
    sub = dividirTrecho(original, alvo.trecho, alvo.t);
    j = alvo.trecho + 1;
  }
  const n = sub.nos.length;
  let pedacos: Subcaminho[];
  if (sub.fechado) {
    // Abre no nó j: começa nele e volta a ele
    const nos = [...sub.nos.slice(j), ...sub.nos.slice(0, j), sub.nos[j]];
    pedacos = [{ ...sub, fechado: false, nos: [semEntrada(nos[0]), ...nos.slice(1, -1), semSaida(nos[nos.length - 1])] }];
  } else {
    if (j <= 0 || j >= n - 1) return null;
    pedacos = [
      { ...sub, nos: [...sub.nos.slice(0, j), semSaida(sub.nos[j])] },
      { ...sub, nos: [semEntrada(sub.nos[j]), ...sub.nos.slice(j + 1)] },
    ];
  }
  return [...caminhos.slice(0, alvo.sub), ...pedacos, ...caminhos.slice(alvo.sub + 1)];
}

/** A faixa fina de um corte (a Faca): o traço com 0,02 pixel de cada lado. */
export const regiaoDoCorte = (traco: Ponto[]) => regiaoDaBolha(traco, 0.02);

/**
 * A Faca: as formas fechadas cortadas pela faixa do traço, um grupo de caminhos por pedaço (o primeiro fica na camada,
 * os outros viram camadas); null quando o traço não passa pela forma ou não a divide.
 */
export function cortarComFaca(caminhos: Subcaminho[], corte: MultiPolygon, tolerancia = 0.35): Subcaminho[][] | null {
  const regiao = regiaoDosCaminhos(caminhos, 0.2);
  if (!regiao.length || !polygonClipping.intersection(regiao, corte).length) return null;
  const pedacos = polygonClipping.difference(regiao, corte);
  if (pedacos.length < 2) return null;
  const abertos = caminhos.filter((sub) => !sub.fechado);
  return pedacos.map((poligono, i) => [...caminhosDaRegiaoEmCurvas([poligono], tolerancia), ...(i === 0 ? abertos : [])]);
}

/**
 * A Borracha vetorial: a área tirada das formas fechadas e o pedaço dos caminhos abertos que cai nela; null quando ela
 * não toca os caminhos. A lista vazia quer dizer que não sobrou nada.
 */
export function apagarArea(caminhos: Subcaminho[], area: MultiPolygon, tolerancia = 0.35): Subcaminho[] | null {
  if (!area.length) return null;
  const fechados = caminhos.filter((sub) => sub.fechado);
  const regiao = regiaoDosCaminhos(fechados, 0.2);
  const tocaArea = regiao.length > 0 && polygonClipping.intersection(regiao, area).length > 0;
  let tocou = tocaArea;
  const novos: Subcaminho[] = tocaArea ? caminhosDaRegiaoEmCurvas(polygonClipping.difference(regiao, area), tolerancia) : fechados;
  for (const sub of caminhos.filter((item) => !item.fechado)) {
    const pontos = densificar(achatar(sub, 0.2), 1);
    const fora = pontos.map((p) => !pontoNaRegiao(area, p));
    if (fora.every(Boolean)) {
      novos.push(sub);
      continue;
    }
    tocou = true;
    let atual: Ponto[] = [];
    const fechar = () => {
      if (atual.length >= 2) novos.push({ nos: curvasAbertasComCantos(atual, tolerancia), fechado: false, operacao: sub.operacao });
      atual = [];
    };
    pontos.forEach((p, i) => (fora[i] ? atual.push(p) : fechar()));
    fechar();
  }
  return tocou ? novos : null;
}

/** O retângulo de dois cantos como região. */
export function regiaoDoRetangulo(a: Ponto, b: Ponto): MultiPolygon {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return [];
  return [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]];
}
