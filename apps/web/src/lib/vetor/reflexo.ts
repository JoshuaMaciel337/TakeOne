// A ferramenta Reflexo do editor vetorial (ADR 0003, onda 13.16): o arrasto do meio do brilho até onde vão os anéis
// faz um grupo de camadas de forma em "tela": o halo (um degradê da cor), os raios (triângulos finos em volta do meio,
// num degradê branco que some nas pontas), o centro (branco no meio) e os anéis espalhados ao longo da linha. Tudo
// continua vetorial e editável, camada por camada.
import type { Degrade } from "../pintura/degrade.ts";
import { KAPPA, type Subcaminho, type TintaDaForma } from "./modelo.ts";

export type OpcoesDoReflexo = {
  /** O diâmetro do centro, em pixels. */
  diametro: number;
  /** A cor do halo e dos anéis. */
  cor: string;
  raios: number;
  /** O comprimento dos raios mais longos, em % do diâmetro. */
  comprimento: number;
  aneis: number;
  /** O diâmetro do maior anel, em % do diâmetro do centro. */
  maiorAnel: number;
  /** O sorteio dos raios e dos anéis. */
  semente: number;
};

export const REFLEXO_PADRAO: OpcoesDoReflexo = { diametro: 100, cor: "#ffc46b", raios: 16, comprimento: 300, aneis: 10, maiorAnel: 50, semente: 1 };

export type CamadaDoReflexo = { nome: string; caminhos: Subcaminho[]; preenchimento: TintaDaForma; opacidade: number };
type Ponto = { x: number; y: number };

/** Um sorteio repetível (mulberry32). */
function sorteador(semente: number) {
  let a = Math.round(semente) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Um círculo de quatro cúbicas. */
export function circulo(c: Ponto, r: number): Subcaminho {
  const k = r * KAPPA;
  return {
    nos: [
      { x: c.x, y: c.y - r, ex: c.x - k, ey: c.y - r, sx: c.x + k, sy: c.y - r },
      { x: c.x + r, y: c.y, ex: c.x + r, ey: c.y - k, sx: c.x + r, sy: c.y + k },
      { x: c.x, y: c.y + r, ex: c.x + k, ey: c.y + r, sx: c.x - k, sy: c.y + r },
      { x: c.x - r, y: c.y, ex: c.x - r, ey: c.y + k, sx: c.x - r, sy: c.y - k },
    ],
    fechado: true,
    operacao: "somar",
  };
}

/** O degradê radial do meio para fora, de uma cor e opacidade até a transparência (com uma parada no meio do caminho). */
function radial(cor: string, opacidades: [number, number, number], escala = 1): TintaDaForma {
  const degrade: Degrade = {
    nome: "Reflexo",
    tipo: "solido",
    cores: [
      { posicao: 0, cor, meio: 0.5 },
      { posicao: 1, cor, meio: 0.5 },
    ],
    opacidades: [
      { posicao: 0, opacidade: opacidades[0], meio: 0.5 },
      { posicao: 0.35, opacidade: opacidades[1], meio: 0.5 },
      { posicao: 1, opacidade: opacidades[2], meio: 0.5 },
    ],
    suavidade: 1,
    aspereza: 0,
    semente: 0,
  };
  return { tipo: "degrade", degrade, forma: "radial", angulo: 0, escala, inverter: false };
}

/** As camadas do reflexo, de baixo para cima, em pixels da imagem. */
export function camadasDoReflexo(centro: Ponto, fim: Ponto, opcoes: OpcoesDoReflexo): CamadaDoReflexo[] {
  const sortear = sorteador(opcoes.semente);
  const r = Math.max(1, opcoes.diametro / 2);
  const camadas: CamadaDoReflexo[] = [];
  // O halo: a cor em volta do meio, sumindo até 1,6 vez o raio
  camadas.push({ nome: "Halo", caminhos: [circulo(centro, r * 1.6)], preenchimento: radial(opcoes.cor, [0.55, 0.3, 0]), opacidade: 1 });
  // Os raios: em pares opostos com o mesmo comprimento (a caixa fica com o meio no centro, e o degradê também)
  const pares = Math.max(0, Math.round(opcoes.raios / 2));
  if (pares) {
    const maximo = Math.max(r, (opcoes.diametro * opcoes.comprimento) / 100 / 2);
    const largura = Math.max(0.75, opcoes.diametro * 0.012);
    const caminhos: Subcaminho[] = [];
    let alcanceX = 0;
    for (let i = 0; i < pares; i++) {
      const angulo = (i / pares) * Math.PI + (sortear() - 0.5) * (Math.PI / pares);
      const comprimento = maximo * (0.35 + 0.65 * sortear());
      for (const lado of [0, Math.PI]) {
        const a = angulo + lado;
        const ponta = { x: centro.x + Math.cos(a) * comprimento, y: centro.y + Math.sin(a) * comprimento };
        const px = -Math.sin(a) * largura;
        const py = Math.cos(a) * largura;
        caminhos.push({ nos: [{ x: centro.x + px, y: centro.y + py }, ponta, { x: centro.x - px, y: centro.y - py }], fechado: true, operacao: "somar" });
        alcanceX = Math.max(alcanceX, Math.abs(ponta.x - centro.x) + Math.abs(px));
      }
    }
    // O degradê radial vai até a metade da largura da caixa: a escala o leva até a ponta do raio mais longo
    camadas.push({ nome: "Raios", caminhos, preenchimento: radial("#ffffff", [0.9, 0.35, 0], maximo / Math.max(1e-6, alcanceX)), opacidade: 1 });
  }
  // O centro: branco no meio, a cor na borda
  camadas.push({ nome: "Centro", caminhos: [circulo(centro, r)], preenchimento: radial("#ffffff", [1, 0.85, 0]), opacidade: 1 });
  // Os anéis: ao longo da linha até o fim (o maior no fim), na cor, meio transparentes
  const n = Math.max(0, Math.round(opcoes.aneis));
  if (n && Math.hypot(fim.x - centro.x, fim.y - centro.y) > 1) {
    const maior = Math.max(1, (opcoes.diametro * opcoes.maiorAnel) / 100 / 2);
    const caminhos: Subcaminho[] = [];
    for (let i = 0; i < n; i++) {
      const t = i === n - 1 ? 1 : 0.2 + 0.8 * sortear();
      const raio = i === n - 1 ? maior : maior * (0.15 + 0.6 * sortear());
      caminhos.push(circulo({ x: centro.x + (fim.x - centro.x) * t, y: centro.y + (fim.y - centro.y) * t }, raio));
    }
    camadas.push({ nome: "Anéis", caminhos, preenchimento: { tipo: "cor", cor: opcoes.cor }, opacidade: 0.3 });
  }
  return camadas;
}
