// Arquivo › Scripts › Carregar arquivos em pilha e o modo de pilha (ADR 0003, onda 13.13): imagens do mesmo tamanho
// (já alinhadas) viram uma só, pixel a pixel e canal a canal, pela estatística escolhida dos valores das imagens que
// cobrem o pixel (as transparentes ali ficam de fora). A mediana tira o que passa (gente, carros) de fotos em
// sequência; a média tira o ruído; o máximo junta rastros de luz.

export type ModoDePilha = "media" | "mediana" | "minimo" | "maximo" | "faixa" | "soma" | "desvio" | "variancia" | "entropia" | "assimetria" | "curtose";

export const MODOS_DE_PILHA: { id: ModoDePilha; nome: string }[] = [
  { id: "media", nome: "Média" },
  { id: "mediana", nome: "Mediana" },
  { id: "minimo", nome: "Mínimo" },
  { id: "maximo", nome: "Máximo" },
  { id: "faixa", nome: "Faixa (máximo − mínimo)" },
  { id: "soma", nome: "Soma" },
  { id: "desvio", nome: "Desvio padrão" },
  { id: "variancia", nome: "Variância" },
  { id: "entropia", nome: "Entropia" },
  { id: "assimetria", nome: "Assimetria" },
  { id: "curtose", nome: "Curtose" },
];

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };

/** O valor (0 a 255) da estatística dos valores (0 a 255) das imagens num canal. */
export function estatistica(valores: number[], modo: ModoDePilha): number {
  const n = valores.length;
  if (!n) return 0;
  switch (modo) {
    case "minimo":
      return Math.min(...valores);
    case "maximo":
      return Math.max(...valores);
    case "faixa":
      return Math.max(...valores) - Math.min(...valores);
    case "soma":
      return Math.min(255, valores.reduce((s, v) => s + v, 0));
    case "mediana": {
      const ordem = [...valores].sort((a, b) => a - b);
      return n % 2 ? ordem[n >> 1] : (ordem[n / 2 - 1] + ordem[n / 2]) / 2;
    }
    case "entropia": {
      // A entropia de Shannon dos valores, levada a 0..255 pelo máximo possível com n imagens
      if (n < 2) return 0;
      const contagem = new Map<number, number>();
      for (const v of valores) contagem.set(Math.round(v), (contagem.get(Math.round(v)) ?? 0) + 1);
      let h = 0;
      for (const c of contagem.values()) h -= (c / n) * Math.log2(c / n);
      return (h / Math.log2(n)) * 255;
    }
  }
  const media = valores.reduce((s, v) => s + v, 0) / n;
  if (modo === "media") return media;
  const variancia = valores.reduce((s, v) => s + (v - media) ** 2, 0) / n;
  if (modo === "variancia") return Math.min(255, variancia / 64);
  const desvio = Math.sqrt(variancia);
  if (modo === "desvio") return Math.min(255, desvio * 2);
  if (desvio < 1e-9) return 128;
  if (modo === "assimetria") return 128 + (valores.reduce((s, v) => s + ((v - media) / desvio) ** 3, 0) / n) * 64;
  // Curtose em excesso (0 na distribuição normal)
  return 128 + (valores.reduce((s, v) => s + ((v - media) / desvio) ** 4, 0) / n - 3) * 32;
}

/** A pilha numa imagem só. Todas do mesmo tamanho. */
export function empilhar(imagens: Imagem[], modo: ModoDePilha): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura } = imagens[0];
  const saida = new Uint8ClampedArray(largura * altura * 4);
  const valores: number[][] = [[], [], []];
  for (let p = 0; p < largura * altura; p++) {
    valores[0].length = 0;
    valores[1].length = 0;
    valores[2].length = 0;
    let alfa = 0;
    for (const imagem of imagens) {
      const a = imagem.dados[p * 4 + 3];
      if (a === 0) continue;
      alfa = Math.max(alfa, a);
      for (let e = 0; e < 3; e++) valores[e].push(imagem.dados[p * 4 + e]);
    }
    if (!valores[0].length) continue;
    for (let e = 0; e < 3; e++) saida[p * 4 + e] = Math.round(estatistica(valores[e], modo));
    saida[p * 4 + 3] = alfa;
  }
  return saida;
}
