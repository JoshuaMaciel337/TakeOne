import { PROPORCOES, type Proporcao } from "@/lib/projeto/modelo";

export { PROPORCOES, type Proporcao };

export const NOMES_PROPORCAO: Record<Proporcao, string> = {
  "9:16": "9:16 · Stories, Reels, TikTok",
  "16:9": "16:9 · YouTube",
  "1:1": "1:1 · Quadrado",
  "4:5": "4:5 · Feed",
  "3:4": "3:4 · Retrato",
  "21:9": "21:9 · Cinema",
};

/** "9:16" → 0.5625 (largura dividida pela altura). */
export function razao(proporcao: Proporcao): number {
  const [largura, altura] = proporcao.split(":").map(Number);
  return largura / altura;
}
