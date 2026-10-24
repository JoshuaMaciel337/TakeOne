// Editar › Substituição do céu (ADR 0003, onda 13.12): os céus prontos, desenhados aqui por contas (o degradê do
// alto até o horizonte, as nuvens pelo ruído fractal, o sol e as estrelas), e as contas do céu novo: o brilho, a
// temperatura e a cor média dele, que tinge o primeiro plano.
import { fractal } from "./filtros/renderizacao.ts";
import { limitar, sorteio } from "./filtros/comum.ts";

export type CeuPronto = "azul" | "nuvens" | "por_do_sol" | "crepusculo" | "noite" | "nublado";
export const CEUS_PRONTOS: { id: CeuPronto; nome: string }[] = [
  { id: "azul", nome: "Azul limpo" },
  { id: "nuvens", nome: "Nuvens de tarde" },
  { id: "por_do_sol", nome: "Pôr do sol" },
  { id: "crepusculo", nome: "Crepúsculo" },
  { id: "noite", nome: "Noite estrelada" },
  { id: "nublado", nome: "Nublado" },
];

type Rgb = [number, number, number];
const hex = (cor: string): Rgb => {
  const v = Number.parseInt(cor.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const misturar = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** As paradas do degradê (do alto, 0, ao horizonte, 1), a cor e a quantidade das nuvens e o que mais o céu tem. */
const RECEITAS: Record<CeuPronto, { paradas: [number, string][]; nuvem: string; nuvens: number; tamanho: number; sol?: [number, number, string]; estrelas?: boolean }> = {
  azul: { paradas: [[0, "#1f5fc9"], [0.6, "#5d97e0"], [1, "#c4dcf2"]], nuvem: "#ffffff", nuvens: 0.15, tamanho: 0.35 },
  nuvens: { paradas: [[0, "#2a66c4"], [0.7, "#7aa9de"], [1, "#d6e4f0"]], nuvem: "#fbfbfd", nuvens: 0.55, tamanho: 0.28 },
  por_do_sol: { paradas: [[0, "#28306a"], [0.45, "#a1488a"], [0.75, "#ec7a52"], [1, "#ffd27a"]], nuvem: "#ffb07a", nuvens: 0.4, tamanho: 0.3, sol: [0.7, 0.95, "#fff1c4"] },
  crepusculo: { paradas: [[0, "#0d1736"], [0.55, "#3b3a78"], [0.85, "#b36a8e"], [1, "#f2a37c"]], nuvem: "#57487a", nuvens: 0.3, tamanho: 0.32 },
  noite: { paradas: [[0, "#02040d"], [0.7, "#0b1530"], [1, "#22325a"]], nuvem: "#1b2440", nuvens: 0.12, tamanho: 0.4, estrelas: true },
  nublado: { paradas: [[0, "#7e858f"], [1, "#c8ccd2"]], nuvem: "#e4e6ea", nuvens: 0.85, tamanho: 0.22 },
};

/** Um céu pronto em RGBA (opaco), no tamanho pedido; o horizonte fica na linha de baixo. */
export function pintarCeu(id: CeuPronto, largura: number, altura: number, semente = 1): Uint8ClampedArray {
  const receita = RECEITAS[id];
  const paradas = receita.paradas.map(([p, cor]) => [p, hex(cor)] as [number, Rgb]);
  const nuvem = hex(receita.nuvem);
  const tamanho = Math.max(4, receita.tamanho * Math.max(largura, altura));
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    const t = altura > 1 ? y / (altura - 1) : 1;
    let k = 0;
    while (k < paradas.length - 2 && t > paradas[k + 1][0]) k++;
    const [p0, c0] = paradas[k];
    const [p1, c1] = paradas[Math.min(k + 1, paradas.length - 1)];
    const fundo = misturar(c0, c1, p1 > p0 ? limitar((t - p0) / (p1 - p0)) : 0);
    for (let x = 0; x < largura; x++) {
      // As nuvens: o ruído acima de um limiar, achatadas perto do horizonte (a perspectiva)
      const ruido = fractal(x, y * (1.6 + t * 1.4), tamanho, semente, 5);
      const nuvemAqui = limitar((ruido - (1 - receita.nuvens * 0.75)) * 3.2) * (0.35 + 0.65 * (1 - t * 0.6));
      let cor = misturar(fundo, nuvem, nuvemAqui);
      if (receita.sol) {
        const [sx, sy, corDoSol] = receita.sol;
        const d = Math.hypot(x / largura - sx, (y / altura - sy) * (altura / largura));
        cor = misturar(cor, hex(corDoSol), limitar(Math.exp(-d * 9) * 0.9));
      }
      if (receita.estrelas && nuvemAqui < 0.2) {
        const s = sorteio(x, y, 91 + semente);
        if (s > 0.9985) cor = misturar(cor, [1, 1, 1], (s - 0.9985) / 0.0015 * (1 - t));
      }
      const i = (y * largura + x) * 4;
      dados[i] = Math.round(limitar(cor[0]) * 255);
      dados[i + 1] = Math.round(limitar(cor[1]) * 255);
      dados[i + 2] = Math.round(limitar(cor[2]) * 255);
      dados[i + 3] = 255;
    }
  }
  return dados;
}

/** O brilho (−100 a 100) e a temperatura (−100 frio a 100 quente) no céu, em RGBA de 8 bits (no lugar). */
export function ajustarCeu(dados: Uint8ClampedArray, brilho: number, temperatura: number): void {
  const ganho = 2 ** (brilho / 100);
  const quente = temperatura / 100;
  for (let i = 0; i < dados.length; i += 4) {
    dados[i] = dados[i] * ganho * (1 + 0.18 * quente);
    dados[i + 1] = dados[i + 1] * ganho * (1 + 0.03 * quente);
    dados[i + 2] = dados[i + 2] * ganho * (1 - 0.18 * quente);
  }
}

/** A cor média do céu (0 a 1) onde a máscara (0 a 255, do mesmo tamanho) cobre; sem cobertura, a média de tudo. */
export function corMediaDoCeu(dados: Uint8ClampedArray, mascara?: Uint8Array): Rgb {
  const soma = [0, 0, 0];
  let peso = 0;
  for (let p = 0, i = 0; i < dados.length; p++, i += 4) {
    const w = mascara ? mascara[p] / 255 : 1;
    if (!w) continue;
    for (let k = 0; k < 3; k++) soma[k] += (dados[i + k] / 255) * w;
    peso += w;
  }
  if (!peso) return mascara ? corMediaDoCeu(dados) : [0.5, 0.5, 0.5];
  return [soma[0] / peso, soma[1] / peso, soma[2] / peso];
}

/** A linha mais baixa que tem céu (a base dele), em pixels; sem céu, -1. */
export function baseDoCeu(mascara: { largura: number; altura: number; dados: Uint8Array }): number {
  for (let y = mascara.altura - 1; y >= 0; y--) {
    const linha = mascara.dados.subarray(y * mascara.largura, (y + 1) * mascara.largura);
    if (linha.some((v) => v >= 128)) return y;
  }
  return -1;
}
