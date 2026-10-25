// As ferramentas de deformar do editor vetorial (ADR 0003, onda 13.16): Deformar, Torcer, Franzir, Inflar, Recortar,
// Cristalizar e Enrugar. Enquanto o pincel anda (ou fica parado, apertado) sobre a forma escolhida, os caminhos que ele
// toca viram muitos pontos, e cada passo mexe nos pontos debaixo dele, mais no meio e nada na borda; no fim, os pontos
// voltam a ser curvas. As contas são puras, em pixels da imagem.
import { achatar } from "./contorno.ts";
import type { Subcaminho } from "./modelo.ts";
import { curvasAbertasComCantos, densificar, distanciaAoTraco } from "./pincelVetorial.ts";
import { curvasComCantos } from "./edicao.ts";

type Ponto = { x: number; y: number };

export type FerramentaDeLiquefazer = "deformar" | "torcer" | "franzir" | "inflar" | "recortar" | "cristalizar" | "enrugar";

export type OpcoesDoLiquefazer = {
  /** O raio do pincel, em pixels. */
  raio: number;
  /** De 1 a 100: o quanto cada passo mexe. */
  intensidade: number;
  /** Torcer: para que lado gira. */
  sentido: "horario" | "antiHorario";
  /** Recortar e Cristalizar: quantas ondas (ou pontas) cabem numa volta do pincel. */
  detalhe: number;
};

export const LIQUEFAZER_PADRAO: OpcoesDoLiquefazer = { raio: 40, intensidade: 50, sentido: "antiHorario", detalhe: 10 };

/** Os caminhos no meio da deformação: os tocados como pontos (o fechado sem repetir o primeiro), os outros como eram. */
export type EstadoDoLiquefazer = { caminhos: Subcaminho[]; pontos: (Ponto[] | null)[]; passo: number; vezes: number };

export function comecarLiquefazer(caminhos: Subcaminho[], raio: number): EstadoDoLiquefazer {
  return { caminhos, pontos: caminhos.map(() => null), passo: Math.max(1, raio / 12), vezes: 0 };
}

/** Os pontos de um caminho achatado e adensado (o fechado sem repetir o primeiro). */
function pontosDe(sub: Subcaminho, passo: number): Ponto[] {
  const achatados = achatar(sub, 0.2);
  if (sub.fechado && achatados.length > 2) {
    const tudo = densificar([...achatados, achatados[0]], passo);
    tudo.pop();
    return tudo;
  }
  return densificar(achatados, passo);
}

/** Um sorteio de -1 a 1 que só depende dos números (o mesmo ponto, no mesmo passo, sorteia igual). */
function ruido(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

/** Um passo do pincel em `centro` (vindo de `anterior`): os pontos debaixo dele mexem. */
export function passoDoLiquefazer(estado: EstadoDoLiquefazer, ferramenta: FerramentaDeLiquefazer, centro: Ponto, anterior: Ponto, opcoes: OpcoesDoLiquefazer): EstadoDoLiquefazer {
  const raio = Math.max(1, opcoes.raio);
  const forca = Math.max(1, Math.min(100, opcoes.intensidade)) / 100;
  const vezes = estado.vezes + 1;
  const pontos = estado.caminhos.map((sub, i) => {
    let lista = estado.pontos[i];
    if (!lista) {
      // Só vira pontos o caminho que o pincel alcança
      const achatados = achatar(sub, 0.5);
      if (sub.fechado && achatados.length) achatados.push(achatados[0]);
      if (distanciaAoTraco(centro, achatados) >= raio) return null;
      lista = pontosDe(sub, estado.passo);
    }
    const fechado = sub.fechado;
    const movidos = lista.map((p, k) => {
      const dx = p.x - centro.x;
      const dy = p.y - centro.y;
      const d = Math.hypot(dx, dy);
      if (d >= raio) return p;
      const t = 1 - d / raio;
      const w = t * t * (3 - 2 * t);
      const angulo = Math.atan2(dy, dx);
      switch (ferramenta) {
        case "deformar":
          return { x: p.x + (centro.x - anterior.x) * w, y: p.y + (centro.y - anterior.y) * w };
        case "torcer": {
          const a = (opcoes.sentido === "horario" ? 1 : -1) * 0.12 * forca * w;
          return { x: centro.x + dx * Math.cos(a) - dy * Math.sin(a), y: centro.y + dx * Math.sin(a) + dy * Math.cos(a) };
        }
        case "franzir":
          return { x: p.x - dx * 0.1 * forca * w, y: p.y - dy * 0.1 * forca * w };
        case "inflar": {
          // Até a borda do pincel, sem passar dela
          const s = Math.min(0.1 * forca * w, raio / Math.max(1e-6, d) - 1);
          return { x: p.x + dx * s, y: p.y + dy * s };
        }
        case "recortar": {
          // Para dentro em ondas (os arcos ficam entre as ondas)
          const onda = 0.5 + 0.5 * Math.cos(angulo * Math.max(2, Math.round(opcoes.detalhe)));
          return { x: p.x - dx * 0.2 * forca * w * onda, y: p.y - dy * 0.2 * forca * w * onda };
        }
        case "cristalizar": {
          // Para fora em pontas finas
          const ponta = Math.pow(0.5 + 0.5 * Math.cos(angulo * Math.max(2, Math.round(opcoes.detalhe))), 6);
          const s = Math.min(0.4 * forca * w * ponta, raio / Math.max(1e-6, d) - 1);
          return { x: p.x + dx * s, y: p.y + dy * s };
        }
        case "enrugar": {
          // Para os lados, sorteado por ponto e por passo, mais na vertical (como lá)
          const amplitude = 0.12 * raio * forca * w;
          return { x: p.x + ruido(k, vezes) * amplitude * 0.5, y: p.y + ruido(k + 7919, vezes) * amplitude };
        }
      }
    });
    // Onde os pontos se afastaram demais, entra um no meio (a curva continua lisa)
    const adensados: Ponto[] = [];
    movidos.forEach((p, k) => {
      adensados.push(p);
      const proximo = movidos[k + 1] ?? (fechado ? movidos[0] : null);
      if (proximo && Math.hypot(proximo.x - p.x, proximo.y - p.y) > 2 * estado.passo) adensados.push({ x: (p.x + proximo.x) / 2, y: (p.y + proximo.y) / 2 });
    });
    return adensados;
  });
  return { ...estado, pontos, vezes };
}

/** Os caminhos do meio da deformação (os tocados como polígonos), para mostrar enquanto o pincel anda. */
export function caminhosDoLiquefazer(estado: EstadoDoLiquefazer): Subcaminho[] {
  return estado.caminhos.map((sub, i) => {
    const lista = estado.pontos[i];
    return lista ? { ...sub, nos: lista.map(({ x, y }) => ({ x, y })) } : sub;
  });
}

/** O fim: os caminhos tocados voltam a ser curvas (com os cantos). */
export function terminarLiquefazer(estado: EstadoDoLiquefazer, tolerancia = 0.35): Subcaminho[] {
  return estado.caminhos.map((sub, i) => {
    const lista = estado.pontos[i];
    if (!lista) return sub;
    return { ...sub, nos: sub.fechado ? curvasComCantos(lista, tolerancia, 45) : curvasAbertasComCantos(lista, tolerancia, 45) };
  });
}
