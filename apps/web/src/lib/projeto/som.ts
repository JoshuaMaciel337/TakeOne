// Som dos clipes: formato dos fades. Espelha core/utils/som.py, com as curvas do `afade` do FFmpeg
// (a mesma fórmula do af_afade.c), conferidas pelos casos de tests/casos/fades.json.

export type CurvaDoFade = "linear" | "suave" | "s" | "exponencial";

export const CURVAS_DO_FADE: { id: CurvaDoFade; nome: string }[] = [
  { id: "linear", nome: "Linear" },
  { id: "suave", nome: "Suave" },
  { id: "s", nome: "Em S" },
  { id: "exponencial", nome: "Exponencial" },
];

/** O ganho (0 a 1) quando o fade já andou `p` (0 a 1) do caminho, como o afade calcula. */
export function ganhoDoFade(curva: CurvaDoFade | undefined, p: number): number {
  p = Math.min(1, Math.max(0, p));
  if (curva === "suave") return Math.sin((p * Math.PI) / 2);
  if (curva === "s") return (1 - Math.cos(p * Math.PI)) / 2;
  // -100 dB no começo, como o afade
  if (curva === "exponencial") return Math.exp(-11.512925464970227 * (1 - p));
  return p;
}

// Igualar o volume: cada mídia medida na ingestão (LUFS integrado), como em core/utils/som.py
export const LUFS_IGUALAR = -14;
const GANHO_IGUALAR_MAXIMO_DB = 20;

/** Os dB que levam a mídia a -14 LUFS; 0 se ela não foi medida ou é silêncio. */
export function ganhoParaIgualar(lufs: number | null | undefined): number {
  if (lufs === null || lufs === undefined || lufs <= -70) return 0;
  return Math.min(Math.max(LUFS_IGUALAR - lufs, -GANHO_IGUALAR_MAXIMO_DB), GANHO_IGUALAR_MAXIMO_DB);
}
