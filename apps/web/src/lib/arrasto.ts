/**
 * Tipo usado ao arrastar uma mídia da biblioteca para a linha do tempo. O id vai no próprio nome do
 * tipo porque, enquanto o arrasto acontece, o navegador só deixa ler os tipos, não os dados.
 */
export const TIPO_ARRASTO_MIDIA = "application/x-takeone-midia-";

export function midiaNoArrasto(dados: DataTransfer): string | null {
  const tipo = Array.from(dados.types).find((item) => item.startsWith(TIPO_ARRASTO_MIDIA));
  return tipo ? tipo.slice(TIPO_ARRASTO_MIDIA.length) : null;
}
