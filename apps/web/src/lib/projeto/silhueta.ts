// Contorno e sombra em volta do que aparece do clipe (recortes, logos, formas, adesivos), a mesma conta de
// core/utils/silhueta.py. O contorno é o alfa desfocado (sigma = metade da largura) cortado no limiar Φ(−2), onde a
// borda de um degrau desfocado fica a dois sigmas; a sombra é o alfa do conjunto (clipe e contorno) desfocado e
// deslocado. As medidas são frações da altura do clipe. Casos em tests/casos/silhueta.json.

export type Contorno = { cor: string; largura: number };
export type Sombra = { cor: string; opacidade: number; desfoque: number; distancia: number; angulo: number };

export const LIMIAR_DO_CONTORNO = 0.02275;
export const DENSIDADE_NA_BORDA = 0.05399;

export const LARGURA_MAXIMA_DO_CONTORNO = 0.08;
export const DESFOQUE_MAXIMO_DA_SOMBRA = 0.08;
export const DISTANCIA_MAXIMA_DA_SOMBRA = 0.15;

export const CONTORNO_PADRAO: Contorno = { cor: "#ffffff", largura: 0.02 };
export const SOMBRA_PADRAO: Sombra = { cor: "#000000", opacidade: 0.5, desfoque: 0.02, distancia: 0.03, angulo: 90 };

type ComSilhueta = { contorno?: Contorno | null; sombra?: Sombra | null };

export function temSilhueta(clipe: ComSilhueta): boolean {
  return Boolean((clipe.contorno && clipe.contorno.largura > 0) || (clipe.sombra && clipe.sombra.opacidade > 0));
}

/** Os pixels de margem em volta do clipe (de `altura` pixels) para caber o contorno e a sombra. */
export function margemDaSilhueta(clipe: ComSilhueta, altura: number): number {
  let margem = 0;
  if (clipe.contorno && clipe.contorno.largura > 0) margem = Math.max(margem, clipe.contorno.largura * altura + 2);
  if (clipe.sombra && clipe.sombra.opacidade > 0) margem = Math.max(margem, (clipe.sombra.distancia + 3 * clipe.sombra.desfoque) * altura + 2);
  return Math.ceil(margem);
}

/** [dx, dy] da sombra em pixels: o ângulo em graus, 0 para a direita e 90 para baixo. */
export function deslocamentoDaSombra(sombra: Sombra, altura: number): [number, number] {
  const angulo = (sombra.angulo * Math.PI) / 180;
  const distancia = sombra.distancia * altura;
  return [distancia * Math.cos(angulo), distancia * Math.sin(angulo)];
}

/**
 * Quanto o alfa desfocado anda em um pixel na borda do contorno; no contorno fino (sigma abaixo de 1,2 px), no máximo o
 * dobro do limiar, para o alfa 0 dar cobertura 0 (senão o contorno tingia a caixa inteira do clipe).
 */
export function rampaDoContorno(sigma: number): number {
  return Math.min(DENSIDADE_NA_BORDA / Math.max(sigma, 1e-6), 2 * LIMIAR_DO_CONTORNO);
}

/** Quanto do contorno cobre o pixel, pelo alfa desfocado (0 a 1) e o sigma do desfoque em pixels. */
export function coberturaDoContorno(alfaDesfocado: number, sigma: number): number {
  return Math.min(Math.max((alfaDesfocado - LIMIAR_DO_CONTORNO) / rampaDoContorno(sigma) + 0.5, 0), 1);
}
