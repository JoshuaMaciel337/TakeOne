// A reamostragem do Tamanho da imagem (ADR 0003, onda 13.6): as camadas de pixels vão para o tamanho novo pelo
// método escolhido, em duas passadas (largura e altura) com o núcleo alargado na redução (para fazer a média, e não
// pular pixels), no alfa pré-multiplicado.

export type MetodoDeReamostragem = "automatica" | "preservarDetalhes" | "bicubica" | "bilinear" | "vizinho" | "lanczos";

export const METODOS_DE_REAMOSTRAGEM: { id: MetodoDeReamostragem; nome: string }[] = [
  { id: "automatica", nome: "Automática" },
  { id: "preservarDetalhes", nome: "Preservar detalhes (ampliação)" },
  { id: "bicubica", nome: "Bicúbica (degradês suaves)" },
  { id: "lanczos", nome: "Lanczos (redução nítida)" },
  { id: "bilinear", nome: "Bilinear" },
  { id: "vizinho", nome: "Vizinho mais próximo (bordas duras)" },
];

type Imagem = { dados: Uint8ClampedArray; largura: number; altura: number };
type Nucleo = { peso: (x: number) => number; suporte: number };

const NUCLEOS: Record<"bilinear" | "bicubica" | "lanczos", Nucleo> = {
  bilinear: { peso: (x) => Math.max(0, 1 - Math.abs(x)), suporte: 1 },
  bicubica: {
    peso: (t) => {
      const x = Math.abs(t);
      if (x <= 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
      if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
      return 0;
    },
    suporte: 2,
  },
  lanczos: {
    peso: (t) => {
      const x = Math.abs(t);
      if (x < 1e-8) return 1;
      if (x >= 3) return 0;
      const px = Math.PI * x;
      return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
    },
    suporte: 3,
  },
};

/** Uma passada: muda só um eixo (a largura, ou a altura com `vertical`), nos quatro canais pré-multiplicados. */
function passada(entrada: Float32Array, largura: number, altura: number, novo: number, vertical: boolean, nucleo: Nucleo): Float32Array {
  const antes = vertical ? altura : largura;
  const outro = vertical ? largura : altura;
  const saida = new Float32Array((vertical ? largura * novo : novo * altura) * 4);
  const escala = antes / novo;
  // Na redução, o núcleo cobre `escala` pixels de entrada por pixel de saída
  const alargar = Math.max(1, escala);
  const suporte = nucleo.suporte * alargar;
  for (let o = 0; o < novo; o++) {
    const centro = (o + 0.5) * escala - 0.5;
    const i0 = Math.max(0, Math.ceil(centro - suporte));
    const i1 = Math.min(antes - 1, Math.floor(centro + suporte));
    const pesos: number[] = [];
    let soma = 0;
    for (let i = i0; i <= i1; i++) {
      const peso = nucleo.peso((i - centro) / alargar);
      pesos.push(peso);
      soma += peso;
    }
    if (!soma) continue;
    for (let k = 0; k < outro; k++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = i0; i <= i1; i++) {
        const peso = pesos[i - i0] / soma;
        const p = (vertical ? i * largura + k : k * largura + i) * 4;
        r += entrada[p] * peso;
        g += entrada[p + 1] * peso;
        b += entrada[p + 2] * peso;
        a += entrada[p + 3] * peso;
      }
      const q = (vertical ? o * largura + k : k * novo + o) * 4;
      saida[q] = r;
      saida[q + 1] = g;
      saida[q + 2] = b;
      saida[q + 3] = a;
    }
  }
  return saida;
}

/** A imagem no tamanho novo pelo método. */
export function redimensionar(imagem: Imagem, largura: number, altura: number, metodo: MetodoDeReamostragem): Uint8ClampedArray<ArrayBuffer> {
  const { dados, largura: lo, altura: ao } = imagem;
  const saida = new Uint8ClampedArray(largura * altura * 4);
  if (metodo === "vizinho") {
    for (let y = 0; y < altura; y++) {
      const ys = Math.min(ao - 1, Math.floor(((y + 0.5) * ao) / altura));
      for (let x = 0; x < largura; x++) {
        const xs = Math.min(lo - 1, Math.floor(((x + 0.5) * lo) / largura));
        saida.set(dados.subarray((ys * lo + xs) * 4, (ys * lo + xs) * 4 + 4), (y * largura + x) * 4);
      }
    }
    return saida;
  }
  const ampliando = largura * altura > lo * ao;
  const nucleo = NUCLEOS[metodo === "bilinear" ? "bilinear" : metodo === "lanczos" || (metodo === "automatica" && !ampliando) ? "lanczos" : metodo === "preservarDetalhes" ? "lanczos" : "bicubica"];
  // Pré-multiplicada, em float
  const pre = new Float32Array(lo * ao * 4);
  for (let i = 0; i < lo * ao; i++) {
    const a = dados[i * 4 + 3];
    pre[i * 4] = (dados[i * 4] * a) / 255;
    pre[i * 4 + 1] = (dados[i * 4 + 1] * a) / 255;
    pre[i * 4 + 2] = (dados[i * 4 + 2] * a) / 255;
    pre[i * 4 + 3] = a;
  }
  let canais = passada(pre, lo, ao, largura, false, nucleo);
  canais = passada(canais, largura, ao, altura, true, nucleo);
  // Preservar detalhes: a máscara de nitidez leve por cima (o contorno das coisas volta depois de ampliar)
  if (metodo === "preservarDetalhes" && ampliando) {
    const tenda: Nucleo = { peso: (x) => Math.max(0, 1 - Math.abs(x) / 2), suporte: 2 };
    const borrada = passada(passada(canais, largura, altura, largura, false, tenda), largura, altura, altura, true, tenda);
    for (let i = 0; i < canais.length; i++) canais[i] += 0.6 * (canais[i] - borrada[i]);
  }
  for (let i = 0; i < largura * altura; i++) {
    const a = Math.min(255, Math.max(0, canais[i * 4 + 3]));
    saida[i * 4 + 3] = Math.round(a);
    for (let c = 0; c < 3; c++) saida[i * 4 + c] = a > 0 ? Math.round(Math.min(255, Math.max(0, (canais[i * 4 + c] * 255) / a))) : 0;
  }
  return saida;
}
