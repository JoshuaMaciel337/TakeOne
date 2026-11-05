/**
 * Tipo usado ao arrastar uma mídia da biblioteca para a linha do tempo. O id vai no próprio nome do
 * tipo porque, enquanto o arrasto acontece, o navegador só deixa ler os tipos, não os dados.
 */
export const TIPO_ARRASTO_MIDIA = "application/x-takeone-midia-";

export function midiaNoArrasto(dados: DataTransfer): string | null {
  const tipo = Array.from(dados.types).find((item) => item.startsWith(TIPO_ARRASTO_MIDIA));
  return tipo ? tipo.slice(TIPO_ARRASTO_MIDIA.length) : null;
}

/**
 * Filtros, efeitos e transições arrastados do painel para um clipe (ADR 0007, 17.3). O navegador põe o nome do tipo
 * em minúsculas, então o id vai em hexadecimal.
 */
export const TIPO_ARRASTO_MATERIAL = "application/x-takeone-material-";
export type TipoDeMaterial = "filtro" | "efeito" | "transicao";

export function tipoDoMaterial(tipo: TipoDeMaterial, id: string): string {
  return `${TIPO_ARRASTO_MATERIAL}${tipo}-${[...new TextEncoder().encode(id)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function materialNoArrasto(dados: DataTransfer): { tipo: TipoDeMaterial; id: string } | null {
  const tipo = Array.from(dados.types).find((item) => item.startsWith(TIPO_ARRASTO_MATERIAL));
  if (!tipo) return null;
  const [qual, hex] = tipo.slice(TIPO_ARRASTO_MATERIAL.length).split("-");
  if ((qual !== "filtro" && qual !== "efeito" && qual !== "transicao") || !hex || hex.length % 2) return null;
  const bytes = new Uint8Array(hex.match(/../g)!.map((par) => parseInt(par, 16)));
  return { tipo: qual, id: new TextDecoder().decode(bytes) };
}
