// A máscara de camada pintável do editor de imagem (ADR 0003, onda 13.2). A máscara é uma imagem cinza do tamanho do
// documento (uma camada de pixels: lib/pixels.ts), onde o branco mostra a camada e o preto esconde. Ela é lida pela
// posição dentro da caixa da camada (o `v_local` do shader, de 0 a 1) e uma matriz afim leva essa posição ao ponto da
// máscara (frações do documento). Vinculada, a matriz é a da caixa na hora em que a máscara foi feita ou vinculada, e
// a máscara anda com a camada; desvinculada, a matriz é a da caixa de agora, e a máscara fica parada no documento.
import type { Caixa, Tamanho } from "./geometria.ts";

/** Uma afim 2D: (x, y) → (a·x + c·y + e, b·x + d·y + f). */
export type Afim = [number, number, number, number, number, number];

export const IDENTIDADE: Afim = [1, 0, 0, 1, 0, 0];

export type MascaraDePixels = {
  midia_id: string;
  versao: number;
  /** Desativada, a camada aparece inteira (a máscara continua guardada). */
  ligada: boolean;
  vinculada: boolean;
  /** 1 é a máscara inteira; 0 não esconde nada. */
  densidade: number;
  /** O desfoque da borda, em pixels do documento. */
  difusao: number;
  /** A posição na camada (0 a 1) → o ponto na máscara (0 a 1), quando vinculada. */
  matriz: Afim;
};

export function aplicar(m: Afim, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** a ∘ b: primeiro b, depois a. */
export function compor(a: Afim, b: Afim): Afim {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

export function inverter(m: Afim): Afim {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return IDENTIDADE;
  const [a, b, c, d, e, f] = m;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** A posição dentro da caixa (0 a 1) → o ponto do quadro em frações (0 a 1), pela caixa (pixels do quadro) e o giro. */
export function matrizDaCaixa(caixa: Pick<Caixa, "cx" | "cy" | "largura" | "altura" | "rotacao">, quadro: Tamanho): Afim {
  const angulo = (caixa.rotacao * Math.PI) / 180;
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);
  // p = centro + R·((L − 0,5)·(largura, altura)), dividido pelo quadro
  const a = (cos * caixa.largura) / quadro.largura;
  const b = (sen * caixa.largura) / quadro.altura;
  const c = (-sen * caixa.altura) / quadro.largura;
  const d = (cos * caixa.altura) / quadro.altura;
  const e = caixa.cx / quadro.largura - 0.5 * (a + c);
  const f = caixa.cy / quadro.altura - 0.5 * (b + d);
  return [a, b, c, d, e, f];
}

/** A matriz que o shader usa: a guardada (vinculada) ou a da caixa de agora (desvinculada). */
export function matrizEmUso(mascara: Pick<MascaraDePixels, "vinculada" | "matriz">, caixa: Caixa, quadro: Tamanho): Afim {
  return mascara.vinculada ? mascara.matriz : matrizDaCaixa(caixa, quadro);
}

/** O ponto da prévia (pixels do quadro) no pixel da máscara (que tem o tamanho do documento). */
export function pontoNaMascara(ponto: { x: number; y: number }, mascara: Pick<MascaraDePixels, "vinculada" | "matriz">, caixa: Caixa, quadro: Tamanho, documento: Tamanho): { x: number; y: number } {
  const local = aplicar(inverter(matrizDaCaixa(caixa, quadro)), ponto.x / quadro.largura, ponto.y / quadro.altura);
  const [u, v] = aplicar(matrizEmUso(mascara, caixa, quadro), local[0], local[1]);
  return { x: u * documento.largura, y: v * documento.altura };
}

/**
 * A matriz de uma máscara que passa para outra caixa (rasterizar troca a caixa da camada pelo quadro inteiro): a
 * máscara continua no mesmo lugar do documento. `antes` e `depois` são as caixas em pixels do quadro.
 */
export function matrizParaOutraCaixa(mascara: Pick<MascaraDePixels, "vinculada" | "matriz">, antes: Caixa, depois: Caixa, quadro: Tamanho): Afim {
  // Na posição L' da caixa nova: o ponto do quadro é Q'(L'); na caixa velha, L = Q⁻¹(Q'(L')); na máscara, M(L)
  return compor(matrizEmUso(mascara, antes, quadro), compor(inverter(matrizDaCaixa(antes, quadro)), matrizDaCaixa(depois, quadro)));
}

/**
 * O pixel da mídia da camada → o pixel do documento: o recorte e a virada (a mídia como aparece na caixa), a caixa
 * (pixels do quadro da prévia) e o documento. É a conta que leva a seleção do documento para a foto e volta.
 */
export function matrizDaMidiaNoDocumento(
  caixa: Pick<Caixa, "cx" | "cy" | "largura" | "altura" | "rotacao">,
  recorte: { x: number; y: number; largura: number; altura: number },
  virar: { horizontal: boolean; vertical: boolean } | null | undefined,
  midia: Tamanho,
  quadro: Tamanho,
  documento: Tamanho,
): Afim {
  // A mídia (pixels) → a posição na caixa (0 a 1): virar, depois o recorte
  const sx = (virar?.horizontal ? -1 : 1) / midia.largura;
  const sy = (virar?.vertical ? -1 : 1) / midia.altura;
  const naCaixa: Afim = [sx / recorte.largura, 0, 0, sy / recorte.altura, ((virar?.horizontal ? 1 : 0) - recorte.x) / recorte.largura, ((virar?.vertical ? 1 : 0) - recorte.y) / recorte.altura];
  const noDocumento: Afim = [documento.largura, 0, 0, documento.altura, 0, 0];
  return compor(noDocumento, compor(matrizDaCaixa(caixa, quadro), naCaixa));
}

/** O pixel da máscara (do tamanho do documento) → o pixel do documento: a conta inversa do `pontoNaMascara`. */
export function matrizDaMascaraNoDocumento(mascara: Pick<MascaraDePixels, "vinculada" | "matriz">, caixa: Caixa, quadro: Tamanho, documento: Tamanho): Afim {
  // Pixel da máscara → fração dela → posição na caixa (M⁻¹) → fração do quadro (Q) → pixel do documento
  const daMascara: Afim = [1 / documento.largura, 0, 0, 1 / documento.altura, 0, 0];
  const noDocumento: Afim = [documento.largura, 0, 0, documento.altura, 0, 0];
  return compor(noDocumento, compor(matrizDaCaixa(caixa, quadro), compor(inverter(matrizEmUso(mascara, caixa, quadro)), daMascara)));
}
