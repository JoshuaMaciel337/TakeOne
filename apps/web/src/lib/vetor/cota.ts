// A ferramenta Cota do editor vetorial (ADR 0003, onda 13.16): o arrasto entre dois pontos faz a linha de cota (com as
// setas nas pontas e, afastada, as linhas de chamada até os pontos) e o número da distância, na escala de medida do
// documento. A linha é uma forma (os traços e as setas), o número é um texto, e os dois ficam num grupo "Cota".
import { type EscalaDeMedida, naEscala } from "../imagem/medicao.ts";
import type { Subcaminho } from "./modelo.ts";

type Ponto = { x: number; y: number };

export type OpcoesDaCota = {
  cor: string;
  /** A espessura das linhas, em pixels. */
  espessura: number;
  /** O tamanho do número, em pixels. */
  tamanhoDoTexto: number;
  /** O quanto a linha de cota fica afastada dos pontos medidos (as linhas de chamada ligam os dois). */
  afastamento: number;
  casas: number;
};

export const COTA_PADRAO: OpcoesDaCota = { cor: "#e11d48", espessura: 1.5, tamanhoDoTexto: 16, afastamento: 20, casas: 1 };

/** "123,4 cm" (na escala de medida; sem ela, em pixels). */
export function textoDaCota(pixels: number, escala: EscalaDeMedida | null | undefined, casas: number): string {
  const valor = naEscala(pixels, escala);
  const unidade = escala?.unidade && escala.unidade !== "pixels" ? escala.unidade : "px";
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: Math.max(0, Math.min(4, casas)) })} ${unidade}`;
}

/**
 * A geometria da cota: as linhas (a de cota e as de chamada, abertas), as setas (triângulos fechados), o meio do número
 * (um pouco acima da linha) e o giro dele (sempre de pé para leitura, de −90° a menos de 90°).
 */
export function geometriaDaCota(de: Ponto, ate: Ponto, opcoes: OpcoesDaCota): { caminhos: Subcaminho[]; meioDoTexto: Ponto; giro: number } {
  const dx = ate.x - de.x;
  const dy = ate.y - de.y;
  const comprimento = Math.hypot(dx, dy) || 1;
  const ux = dx / comprimento;
  const uy = dy / comprimento;
  // A normal "para cima" na tela (a do lado de y menor; na vertical, para a esquerda)
  let nx = uy;
  let ny = -ux;
  if (ny > 0 || (Math.abs(ny) < 1e-9 && nx > 0)) [nx, ny] = [-nx, -ny];
  const a = opcoes.afastamento;
  const p0 = { x: de.x + nx * a, y: de.y + ny * a };
  const p1 = { x: ate.x + nx * a, y: ate.y + ny * a };
  const linha = (q0: Ponto, q1: Ponto): Subcaminho => ({ nos: [{ x: q0.x, y: q0.y }, { x: q1.x, y: q1.y }], fechado: false, operacao: "somar" });
  const seta = Math.max(4, opcoes.espessura * 5);
  const ponta = (q: Ponto, sentido: number): Subcaminho => ({
    nos: [
      { x: q.x, y: q.y },
      { x: q.x + (ux * sentido * seta) + (nx * seta) / 3, y: q.y + (uy * sentido * seta) + (ny * seta) / 3 },
      { x: q.x + (ux * sentido * seta) - (nx * seta) / 3, y: q.y + (uy * sentido * seta) - (ny * seta) / 3 },
    ],
    fechado: true,
    operacao: "somar",
  });
  const caminhos = [linha(p0, p1), ponta(p0, 1), ponta(p1, -1)];
  if (Math.abs(a) > 0.5) {
    // As linhas de chamada passam um pouco da linha de cota
    const alem = Math.sign(a) * Math.min(6, Math.abs(a) / 3);
    caminhos.push(linha(de, { x: p0.x + nx * alem, y: p0.y + ny * alem }), linha(ate, { x: p1.x + nx * alem, y: p1.y + ny * alem }));
  }
  // De pé para leitura; na vertical, de baixo para cima (como nos desenhos técnicos)
  let giro = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (giro >= 90) giro -= 180;
  if (giro < -90) giro += 180;
  const acima = opcoes.tamanhoDoTexto * 0.8;
  return { caminhos, meioDoTexto: { x: (p0.x + p1.x) / 2 + nx * acima, y: (p0.y + p1.y) / 2 + ny * acima }, giro };
}
