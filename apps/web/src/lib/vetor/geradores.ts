// As ferramentas de linha do editor vetorial (ADR 0003, onda 13.16): Segmento de linha, Arco, Espiral, Grade
// retangular e Grade polar. Cada uma transforma o arrasto em caminhos comuns (não são formas vivas), em pixels da
// imagem, que viram uma camada de forma com o traço na cor de primeiro plano e, quando pedido, o preenchimento.
import type { ArrastoDaForma } from "./arrasto.ts";
import { KAPPA, type No, type Subcaminho, subcaminhosDaForma } from "./modelo.ts";

export type GeradorDeCaminhos = "segmento" | "arco" | "espiral" | "gradeRetangular" | "gradePolar";

export type OpcoesDosGeradores = {
  /** A largura do traço, em pixels. */
  espessura: number;
  /** Preencher o que é fechado (o arco fechado e as grades) com a cor de fundo. */
  preencher: boolean;
  arco: {
    fechado: boolean;
    /** O eixo em que o arco começa: no X, ele sai do começo na horizontal. */
    base: "x" | "y";
    /** De -100 (côncavo) a 100 (convexo); 50 é um quarto de elipse e 0, uma reta. */
    inclinacao: number;
  };
  espiral: {
    /** Quanto cada quarto de volta tem do anterior, em % (abaixo de 100 entra, acima sai). */
    decaimento: number;
    /** Quartos de volta. */
    segmentos: number;
    sentido: "horario" | "antiHorario";
  };
  grade: {
    horizontais: number;
    verticais: number;
    /** De -100 a 100: as divisões se juntam embaixo (negativo) ou em cima, à esquerda ou à direita. */
    inclinacaoH: number;
    inclinacaoV: number;
    /** O retângulo de fora como um caminho fechado (sem ele, quatro linhas soltas). */
    moldura: boolean;
  };
  polar: {
    concentricas: number;
    radiais: number;
    inclinacaoC: number;
    inclinacaoR: number;
    /** As elipses como um caminho composto: o preenchimento sai em anéis alternados. */
    composto: boolean;
  };
};

export const GERADORES_PADRAO: OpcoesDosGeradores = {
  espessura: 2,
  preencher: false,
  arco: { fechado: false, base: "x", inclinacao: 50 },
  espiral: { decaimento: 80, segmentos: 10, sentido: "horario" },
  grade: { horizontais: 5, verticais: 5, inclinacaoH: 0, inclinacaoV: 0, moldura: true },
  polar: { concentricas: 5, radiais: 5, inclinacaoC: 0, inclinacaoR: 0, composto: false },
};

export const NOME_DO_GERADOR: Record<GeradorDeCaminhos, string> = { segmento: "Segmento", arco: "Arco", espiral: "Espiral", gradeRetangular: "Grade retangular", gradePolar: "Grade polar" };

type Ponto = { x: number; y: number };
const linha = (a: Ponto, b: Ponto): Subcaminho => ({ nos: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], fechado: false, operacao: "somar" });

/** As frações de n divisões entre 0 e 1, juntas para um lado pela inclinação (-100 a 100). */
export function divisoes(n: number, inclinacao: number): number[] {
  // No máximo 499: uma grade com as duas direções cabe nos 1000 caminhos de uma camada
  const total = Math.max(0, Math.min(499, Math.round(n)));
  const potencia = 2 ** (Math.max(-100, Math.min(100, inclinacao)) / 50);
  return Array.from({ length: total }, (_, i) => ((i + 1) / (total + 1)) ** potencia);
}

/** O arco do começo ao fim do arrasto: uma cúbica com as alças na direção do canto (convexo) ou do canto oposto. */
export function caminhoDoArco(de: Ponto, ate: Ponto, opcoes: OpcoesDosGeradores["arco"]): Subcaminho[] {
  const s = Math.max(-100, Math.min(100, opcoes.inclinacao));
  // O canto da base: no X, à altura do começo e na coluna do fim
  const naBase = opcoes.base === "x" ? { x: ate.x, y: de.y } : { x: de.x, y: ate.y };
  const oposto = opcoes.base === "x" ? { x: de.x, y: ate.y } : { x: ate.x, y: de.y };
  const canto = s >= 0 ? naBase : oposto;
  const k = (Math.abs(s) / 50) * KAPPA;
  const inicio: No = { x: de.x, y: de.y, sx: de.x + (canto.x - de.x) * k, sy: de.y + (canto.y - de.y) * k };
  const fim: No = { x: ate.x, y: ate.y, ex: ate.x + (canto.x - ate.x) * k, ey: ate.y + (canto.y - ate.y) * k };
  if (!opcoes.fechado) return [{ nos: [inicio, fim], fechado: false, operacao: "somar" }];
  // Fechado: volta pelo centro da elipse (o canto do outro lado da curva)
  const centro = s >= 0 ? oposto : naBase;
  return [{ nos: [inicio, fim, { x: centro.x, y: centro.y }], fechado: true, operacao: "somar" }];
}

/**
 * A espiral do ponto de fora (o fim do arrasto) para dentro, em volta do começo: cada quarto de volta com o raio do
 * anterior vezes o decaimento (uma espiral logarítmica), cada quarto uma cúbica pela tangente nas pontas.
 */
export function caminhoDaEspiral(centro: Ponto, fora: Ponto, opcoes: OpcoesDosGeradores["espiral"]): Subcaminho[] {
  const raio = Math.hypot(fora.x - centro.x, fora.y - centro.y);
  const decaimento = Math.max(0.05, Math.min(1.5, opcoes.decaimento / 100));
  const segmentos = Math.max(1, Math.min(1000, Math.round(opcoes.segmentos)));
  const sentido = opcoes.sentido === "horario" ? 1 : -1;
  const angulo0 = Math.atan2(fora.y - centro.y, fora.x - centro.x);
  const quarto = Math.PI / 2;
  const taxa = Math.log(decaimento) / quarto;
  // O comprimento das alças de um quarto de círculo (4/3 · tan(θ/4)), que no decaimento de 100% dá o círculo exato
  const h = (4 / 3) * Math.tan(quarto / 4);
  const nos: No[] = [];
  for (let k = 0; k <= segmentos; k++) {
    const phi = k * quarto;
    const r = raio * decaimento ** k;
    const a = angulo0 + sentido * phi;
    const cos = Math.cos(a);
    const sen = Math.sin(a);
    const p = { x: centro.x + r * cos, y: centro.y + r * sen };
    // A tangente pelo quarto de volta andado: r' (cos, sen) + sentido · r (−sen, cos)
    const tx = r * taxa * cos - sentido * r * sen;
    const ty = r * taxa * sen + sentido * r * cos;
    const no: No = { x: p.x, y: p.y };
    if (k > 0) Object.assign(no, { ex: p.x - tx * h, ey: p.y - ty * h });
    if (k < segmentos) Object.assign(no, { sx: p.x + tx * h, sy: p.y + ty * h });
    nos.push(no);
  }
  return [{ nos, fechado: false, operacao: "somar" }];
}

/** A grade no retângulo do arrasto: a moldura (ou as quatro bordas) e as divisões. */
export function caminhosDaGrade(caixa: { x: number; y: number; largura: number; altura: number }, opcoes: OpcoesDosGeradores["grade"], fechar: boolean): Subcaminho[] {
  const { x, y, largura: l, altura: a } = caixa;
  const saida: Subcaminho[] = [];
  if (opcoes.moldura || fechar) saida.push({ nos: [{ x, y }, { x: x + l, y }, { x: x + l, y: y + a }, { x, y: y + a }], fechado: true, operacao: "somar" });
  else saida.push(linha({ x, y }, { x: x + l, y }), linha({ x: x + l, y }, { x: x + l, y: y + a }), linha({ x: x + l, y: y + a }, { x, y: y + a }), linha({ x, y: y + a }, { x, y }));
  for (const t of divisoes(opcoes.horizontais, opcoes.inclinacaoH)) saida.push(linha({ x, y: y + t * a }, { x: x + l, y: y + t * a }));
  for (const t of divisoes(opcoes.verticais, opcoes.inclinacaoV)) saida.push(linha({ x: x + t * l, y }, { x: x + t * l, y: y + a }));
  return saida;
}

/** A grade polar no retângulo do arrasto: as elipses (de fora para dentro) e os raios a partir do meio. */
export function caminhosDaGradePolar(caixa: { x: number; y: number; largura: number; altura: number }, opcoes: OpcoesDosGeradores["polar"]): Subcaminho[] {
  const cx = caixa.x + caixa.largura / 2;
  const cy = caixa.y + caixa.altura / 2;
  const elipse = (fracao: number, i: number): Subcaminho => {
    const l = caixa.largura * fracao;
    const a = caixa.altura * fracao;
    const [sub] = subcaminhosDaForma({ tipo: "elipse", largura: l, altura: a });
    const nos = sub.nos.map((no) => deslocarNo(no, cx - l / 2, cy - a / 2));
    if (opcoes.composto || i === 0) return { ...sub, operacao: i > 0 ? "excluir" : "somar", nos };
    // Sem o caminho composto, as de dentro são abertas (voltando ao primeiro nó): o traço de uma camada segue o
    // contorno da região somada, que esconderia as elipses de dentro
    const primeiro = nos[0];
    return { ...sub, fechado: false, operacao: "somar", nos: [...nos, { x: primeiro.x, y: primeiro.y, ex: primeiro.ex, ey: primeiro.ey }] };
  };
  const fracoes = [1, ...divisoes(opcoes.concentricas, opcoes.inclinacaoC).reverse()];
  const saida = fracoes.map((f, i) => elipse(f, i));
  const radiais = Math.max(0, Math.round(opcoes.radiais));
  // Os raios: a volta dividida, a partir de cima, juntos para um lado pela inclinação
  const angulos = radiais ? [0, ...divisoes(radiais - 1, opcoes.inclinacaoR)] : [];
  for (const t of angulos) {
    const a = -Math.PI / 2 + t * 2 * Math.PI;
    saida.push(linha({ x: cx, y: cy }, { x: cx + (Math.cos(a) * caixa.largura) / 2, y: cy + (Math.sin(a) * caixa.altura) / 2 }));
  }
  return saida;
}

function deslocarNo(no: No, dx: number, dy: number): No {
  const saida: No = { x: no.x + dx, y: no.y + dy };
  if (no.ex !== undefined && no.ey !== undefined) Object.assign(saida, { ex: no.ex + dx, ey: no.ey + dy });
  if (no.sx !== undefined && no.sy !== undefined) Object.assign(saida, { sx: no.sx + dx, sy: no.sy + dy });
  return saida;
}

/** Os caminhos de uma ferramenta de linha para o arrasto (o segmento, o arco e a espiral usam o começo e o fim). */
export function caminhosDoGerador(tipo: GeradorDeCaminhos, arrasto: ArrastoDaForma, opcoes: OpcoesDosGeradores): Subcaminho[] {
  const caixa = { x: arrasto.x, y: arrasto.y, largura: Math.max(1, arrasto.largura), altura: Math.max(1, arrasto.altura) };
  switch (tipo) {
    case "segmento":
      return [linha(arrasto.de, arrasto.ate)];
    case "arco":
      return caminhoDoArco(arrasto.de, arrasto.ate, opcoes.arco);
    case "espiral":
      return caminhoDaEspiral(arrasto.de, arrasto.ate, opcoes.espiral);
    case "gradeRetangular":
      return caminhosDaGrade(caixa, opcoes.grade, opcoes.preencher);
    case "gradePolar":
      return caminhosDaGradePolar(caixa, opcoes.polar);
  }
}
