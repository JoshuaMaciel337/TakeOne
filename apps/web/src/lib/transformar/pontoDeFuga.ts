// Filtro › Ponto de fuga (ADR 0003, onda 13.6): os planos em perspectiva (quatro cantos de uma parede, um chão) e o
// colar dentro deles. O que é colado ocupa um retângulo do plano (u, v de 0 a 1), e o retângulo vai para a foto pela
// homografia do plano; como ela leva retângulos do plano a quadriláteros, a imagem colada é desenhada pela homografia
// dos quatro cantos, sem aproximação.
import { homografia, type Ponto, type Quadrilatero } from "./malha.ts";

/** A proporção do plano (largura sobre altura de verdade), estimada pela média dos lados opostos. */
export function proporcaoDoPlano(q: Quadrilatero): number {
  const lado = (a: Ponto, b: Ponto) => Math.hypot(b.x - a.x, b.y - a.y);
  const largura = (lado(q[0], q[1]) + lado(q[3], q[2])) / 2;
  const altura = (lado(q[0], q[3]) + lado(q[1], q[2])) / 2;
  return largura / Math.max(1e-9, altura);
}

/** O colado no plano: o centro (u, v) e a largura em frações da largura do plano. */
export type Colado = { u: number; v: number; largura: number };

/**
 * Os quatro cantos da imagem colada (largura × altura em pixels) na foto: o retângulo do plano com a proporção dela
 * (corrigida pela do plano) e levado pela homografia dele.
 */
export function quadDoColado(plano: Quadrilatero, colado: Colado, largura: number, altura: number): Quadrilatero {
  const du = colado.largura;
  // A altura em frações do plano: a da imagem, convertida pela proporção do plano
  const dv = du * (altura / largura) * proporcaoDoPlano(plano);
  const mapa = homografia(plano);
  const u0 = colado.u - du / 2;
  const v0 = colado.v - dv / 2;
  return [mapa(u0, v0), mapa(u0 + du, v0), mapa(u0 + du, v0 + dv), mapa(u0, v0 + dv)];
}
