// A camada de preenchimento do editor de imagem (ADR 0003, onda 13.9): uma camada sem mídia que cobre o documento
// com uma cor sólida, um degradê ou um padrão. Como a camada de ajuste, ela não tem caixa: muda com o tamanho do
// documento. A opacidade, a mesclagem, a máscara e o estilo de camada valem como numa camada comum.
import type { TintaDaForma } from "../vetor/modelo.ts";

export type PontoNoDocumento = { x: number; y: number };

export type CamadaDePreenchimento = {
  tinta: Extract<TintaDaForma, { tipo: "cor" | "degrade" | "padrao" }>;
  /** No degradê: o começo e o fim (o meio e a borda, no radial), em frações do documento; sem eles, pelo ângulo. */
  de?: PontoNoDocumento | null;
  ate?: PontoNoDocumento | null;
};

export const NOMES_DO_PREENCHIMENTO = { cor: "Preenchimento de cor", degrade: "Preenchimento de degradê", padrao: "Preenchimento de padrão" } as const;

/**
 * As pontas do degradê em pixels de um quadro `largura` × `altura`: as alças, quando há, ou a linha que atravessa o
 * documento no ângulo (de canto a canto da projeção, como na sobreposição de degradê), vezes a escala.
 */
export function pontasDoDegrade(
  preenchimento: CamadaDePreenchimento,
  largura: number,
  altura: number,
): { de: PontoNoDocumento; ate: PontoNoDocumento } {
  const tinta = preenchimento.tinta;
  if (preenchimento.de && preenchimento.ate) {
    return { de: { x: preenchimento.de.x * largura, y: preenchimento.de.y * altura }, ate: { x: preenchimento.ate.x * largura, y: preenchimento.ate.y * altura } };
  }
  const angulo = tinta.tipo === "degrade" ? tinta.angulo : 90;
  const escala = tinta.tipo === "degrade" ? tinta.escala : 1;
  const radial = tinta.tipo === "degrade" && tinta.forma !== "linear";
  const r = (angulo * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = -Math.sin(r);
  const meio = ((Math.abs(largura * dx) + Math.abs(altura * dy)) / 2) * escala;
  const cx = largura / 2;
  const cy = altura / 2;
  return { de: radial ? { x: cx, y: cy } : { x: cx - dx * meio, y: cy - dy * meio }, ate: { x: cx + dx * meio, y: cy + dy * meio } };
}

/** As alças em frações do documento (para começar a arrastar um degradê que ainda segue o ângulo). */
export function alcasDoDegrade(preenchimento: CamadaDePreenchimento, documento: { largura: number; altura: number }): { de: PontoNoDocumento; ate: PontoNoDocumento } {
  const { de, ate } = pontasDoDegrade(preenchimento, documento.largura, documento.altura);
  return { de: { x: de.x / documento.largura, y: de.y / documento.altura }, ate: { x: ate.x / documento.largura, y: ate.y / documento.altura } };
}
