// As camadas vetoriais do editor de imagem (ADR 0003, onda 13.7): caminhos de Bézier (os nós com as alças de entrada e
// de saída) combinados entre si (somar, subtrair, intersectar, excluir), com o preenchimento e o traço. As formas vivas
// (retângulo com um raio por canto, elipse, triângulo, polígono e estrela, linha com setas) guardam as medidas e geram
// os caminhos; mexer num ponto à mão as torna caminhos comuns. As coordenadas são da caixa da camada (largura × altura,
// já com a margem do traço), que vai para o quadro como uma imagem desse tamanho.
import type { Degrade, FormaDoDegrade } from "../pintura/degrade.ts";
import type { IdDoPadrao } from "../pintura/padroes.ts";

/** Um nó: a âncora e as alças de entrada (e) e de saída (s), absolutas; sem alça, o nó é um canto. */
export type No = { x: number; y: number; ex?: number; ey?: number; sx?: number; sy?: number };
export type OperacaoDoCaminho = "somar" | "subtrair" | "intersectar" | "excluir";
export type Subcaminho = { nos: No[]; fechado: boolean; operacao: OperacaoDoCaminho };

export type TintaDaForma =
  | { tipo: "nenhuma" }
  | { tipo: "cor"; cor: string }
  | { tipo: "degrade"; degrade: Degrade; forma: FormaDoDegrade; angulo: number; escala: number; inverter: boolean }
  | { tipo: "padrao"; padrao: IdDoPadrao; escala: number };

export type TracoDaForma = {
  tinta: TintaDaForma;
  largura: number;
  alinhamento: "dentro" | "centro" | "fora";
  tipo: "solido" | "tracejado" | "pontilhado";
  pontas: "reta" | "redonda" | "quadrada";
  cantos: "vivo" | "redondo" | "chanfrado";
  /** O limite de mitra (os cantos vivos mais finos que isso viram chanfrados). */
  mitra: number;
};

export type FormaViva =
  | { tipo: "retangulo"; largura: number; altura: number; raios: [number, number, number, number] }
  | { tipo: "elipse"; largura: number; altura: number }
  | { tipo: "triangulo"; largura: number; altura: number; raio: number }
  | { tipo: "poligono"; largura: number; altura: number; lados: number; estrela: number; raio: number }
  | { tipo: "linha"; comprimento: number; angulo: number; setaInicio: boolean; setaFim: boolean; tamanhoDaSeta: number };

export type CamadaVetorial = {
  /** O espaço da camada (com a margem do traço), em pixels da imagem. */
  caixa: { largura: number; altura: number };
  subcaminhos: Subcaminho[];
  preenchimento: TintaDaForma;
  traco: TracoDaForma | null;
  /** As medidas da forma viva, enquanto ela é viva, e a margem em volta dela na caixa. */
  forma?: FormaViva | null;
  margem?: number;
};

export const TRACO_PADRAO: TracoDaForma = { tinta: { tipo: "cor", cor: "#000000" }, largura: 3, alinhamento: "dentro", tipo: "solido", pontas: "reta", cantos: "vivo", mitra: 4 };

/** O quanto da curva de Bézier vai nas alças para um quarto de círculo. */
export const KAPPA = 0.5522847498;

/** Um canto arredondado (ou vivo, com raio 0) para o caminho: os dois nós da curva, no sentido horário. */
function canto(cx: number, cy: number, r: number, de: number): No[] {
  // O canto em (cx, cy); a curva vai do ponto antes dele (no lado de entrada) ao depois (no de saída). `de` é o ângulo
  // da direção de entrada, em quartos de volta (0 indo para a direita, 1 para baixo, 2 para a esquerda, 3 para cima)
  if (r <= 0) return [{ x: cx, y: cy }];
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const [ix, iy] = dirs[de % 4];
  const [ox, oy] = dirs[(de + 1) % 4];
  const a = { x: cx - ix * r, y: cy - iy * r };
  const b = { x: cx + ox * r, y: cy + oy * r };
  return [
    { x: a.x, y: a.y, sx: a.x + ix * r * KAPPA, sy: a.y + iy * r * KAPPA },
    { x: b.x, y: b.y, ex: b.x - ox * r * KAPPA, ey: b.y - oy * r * KAPPA },
  ];
}

/** Os caminhos da forma, de (0, 0) a (largura, altura) (a linha, do começo ao fim). */
export function subcaminhosDaForma(forma: FormaViva): Subcaminho[] {
  if (forma.tipo === "retangulo") {
    const { largura: l, altura: a } = forma;
    const limite = Math.min(l, a) / 2;
    const [r0, r1, r2, r3] = forma.raios.map((r) => Math.max(0, Math.min(limite, r)));
    // Em cima à esquerda, em cima à direita, embaixo à direita, embaixo à esquerda, no sentido horário
    const nos = [...canto(0, 0, r0, 3), ...canto(l, 0, r1, 0), ...canto(l, a, r2, 1), ...canto(0, a, r3, 2)];
    return [{ nos, fechado: true, operacao: "somar" }];
  }
  if (forma.tipo === "elipse") {
    const rx = forma.largura / 2;
    const ry = forma.altura / 2;
    const kx = rx * KAPPA;
    const ky = ry * KAPPA;
    return [
      {
        nos: [
          { x: rx, y: 0, ex: rx - kx, ey: 0, sx: rx + kx, sy: 0 },
          { x: 2 * rx, y: ry, ex: 2 * rx, ey: ry - ky, sx: 2 * rx, sy: ry + ky },
          { x: rx, y: 2 * ry, ex: rx + kx, ey: 2 * ry, sx: rx - kx, sy: 2 * ry },
          { x: 0, y: ry, ex: 0, ey: ry + ky, sx: 0, sy: ry - ky },
        ],
        fechado: true,
        operacao: "somar",
      },
    ];
  }
  if (forma.tipo === "linha") {
    const r = (forma.angulo * Math.PI) / 180;
    return [{ nos: [{ x: 0, y: 0 }, { x: Math.cos(r) * forma.comprimento, y: Math.sin(r) * forma.comprimento }], fechado: false, operacao: "somar" }];
  }
  // Triângulo e polígono: os vértices na elipse da caixa (o triângulo, com a ponta em cima e a base embaixo)
  const vertices: { x: number; y: number }[] = [];
  if (forma.tipo === "triangulo") vertices.push({ x: forma.largura / 2, y: 0 }, { x: forma.largura, y: forma.altura }, { x: 0, y: forma.altura });
  else {
    const n = Math.max(3, Math.round(forma.lados));
    const estrela = Math.max(0, Math.min(0.99, forma.estrela));
    for (let k = 0; k < n * (estrela > 0 ? 2 : 1); k++) {
      const passo = estrela > 0 ? k / (2 * n) : k / n;
      const angulo = -Math.PI / 2 + passo * 2 * Math.PI;
      const raio = estrela > 0 && k % 2 ? 1 - estrela : 1;
      vertices.push({ x: forma.largura / 2 + (Math.cos(angulo) * raio * forma.largura) / 2, y: forma.altura / 2 + (Math.sin(angulo) * raio * forma.altura) / 2 });
    }
  }
  const raio = forma.raio;
  if (raio <= 0) return [{ nos: vertices.map((v) => ({ x: v.x, y: v.y })), fechado: true, operacao: "somar" }];
  // Cantos arredondados: cada vértice vira uma curva entre os pontos a `raio` dele nos dois lados
  const nos: No[] = [];
  vertices.forEach((v, i) => {
    const antes = vertices[(i + vertices.length - 1) % vertices.length];
    const depois = vertices[(i + 1) % vertices.length];
    const ate = (de: { x: number; y: number }) => {
      const d = Math.hypot(de.x - v.x, de.y - v.y) || 1;
      const t = Math.min(raio, d / 2) / d;
      return { x: v.x + (de.x - v.x) * t, y: v.y + (de.y - v.y) * t };
    };
    const a = ate(antes);
    const b = ate(depois);
    nos.push({ x: a.x, y: a.y, sx: a.x + (v.x - a.x) * KAPPA, sy: a.y + (v.y - a.y) * KAPPA }, { x: b.x, y: b.y, ex: b.x + (v.x - b.x) * KAPPA, ey: b.y + (v.y - b.y) * KAPPA });
  });
  return [{ nos, fechado: true, operacao: "somar" }];
}

/** A caixa dos caminhos (pelos nós e pelas alças, que cobrem a curva). */
export function caixaDosCaminhos(subcaminhos: Subcaminho[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const sub of subcaminhos) {
    for (const no of sub.nos) {
      for (const [x, y] of [
        [no.x, no.y],
        [no.ex, no.ey],
        [no.sx, no.sy],
      ]) {
        if (x === undefined || y === undefined) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 };
}

/** O quanto o traço (e as setas) passam da forma: a margem da caixa. */
export function margemDoTraco(traco: TracoDaForma | null, forma?: FormaViva | null): number {
  if (!traco || traco.tinta.tipo === "nenhuma" || traco.largura <= 0) return 1;
  const fator = traco.alinhamento === "dentro" ? 0 : traco.alinhamento === "centro" ? 0.5 : 1;
  // Os cantos vivos passam até metade do limite de mitra além do traço
  const mitra = traco.cantos === "vivo" ? Math.max(1, traco.mitra / 2) : 1;
  const seta = forma?.tipo === "linha" && (forma.setaInicio || forma.setaFim) ? forma.tamanhoDaSeta * traco.largura : 0;
  return Math.ceil(traco.largura * fator * mitra + seta + 2);
}

/** Desloca todos os pontos. */
export function deslocar(subcaminhos: Subcaminho[], dx: number, dy: number): Subcaminho[] {
  const mover = (v: number | undefined, d: number) => (v === undefined ? undefined : v + d);
  return subcaminhos.map((sub) => ({ ...sub, nos: sub.nos.map((no) => ({ x: no.x + dx, y: no.y + dy, ex: mover(no.ex, dx), ey: mover(no.ey, dy), sx: mover(no.sx, dx), sy: mover(no.sy, dy) })).map(semIndefinidos) }));
}
const semIndefinidos = (no: No): No => Object.fromEntries(Object.entries(no).filter(([, v]) => v !== undefined)) as No;

/** A camada de uma forma viva: os caminhos dela deslocados pela margem, e a caixa com a margem em volta. */
export function camadaDaForma(forma: FormaViva, preenchimento: TintaDaForma, traco: TracoDaForma | null): CamadaVetorial {
  const crus = subcaminhosDaForma(forma);
  const caixa = caixaDosCaminhos(crus) ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const margem = margemDoTraco(traco, forma);
  const subcaminhos = deslocar(crus, margem - caixa.x0, margem - caixa.y0);
  return { caixa: { largura: Math.max(1, caixa.x1 - caixa.x0) + 2 * margem, altura: Math.max(1, caixa.y1 - caixa.y0) + 2 * margem }, subcaminhos, preenchimento: forma.tipo === "linha" ? { tipo: "nenhuma" } : preenchimento, traco, forma, margem };
}

/** A mesma camada com a forma viva (ou o traço) mudada: os caminhos e a caixa refeitos. */
export function refazerForma(camada: CamadaVetorial, mudanca: { forma?: FormaViva; preenchimento?: TintaDaForma; traco?: TracoDaForma | null }): CamadaVetorial {
  const forma = mudanca.forma ?? camada.forma;
  const traco = mudanca.traco === undefined ? camada.traco : mudanca.traco;
  const preenchimento = mudanca.preenchimento ?? camada.preenchimento;
  if (forma) return camadaDaForma(forma, preenchimento, traco);
  // Um caminho comum: só a margem muda com o traço
  const caixa = caixaDosCaminhos(camada.subcaminhos) ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const margem = margemDoTraco(traco, null);
  return {
    ...camada,
    preenchimento,
    traco,
    subcaminhos: deslocar(camada.subcaminhos, margem - caixa.x0, margem - caixa.y0),
    caixa: { largura: Math.max(1, caixa.x1 - caixa.x0) + 2 * margem, altura: Math.max(1, caixa.y1 - caixa.y0) + 2 * margem },
    margem,
  };
}

/** Estica os pontos (e as alças) em volta da origem. */
export function escalar(subcaminhos: Subcaminho[], sx: number, sy: number): Subcaminho[] {
  const em = (v: number | undefined, s: number) => (v === undefined ? undefined : v * s);
  return subcaminhos.map((sub) => ({ ...sub, nos: sub.nos.map((no) => semIndefinidos({ x: no.x * sx, y: no.y * sy, ex: em(no.ex, sx), ey: em(no.ey, sy), sx: em(no.sx, sx), sy: em(no.sy, sy) })) }));
}

/** O tamanho dos caminhos (sem a margem do traço), em unidades da caixa. */
export function tamanhoDosCaminhos(camada: CamadaVetorial): { largura: number; altura: number } {
  const caixa = caixaDosCaminhos(camada.subcaminhos);
  return caixa ? { largura: caixa.x1 - caixa.x0, altura: caixa.y1 - caixa.y0 } : { largura: 0, altura: 0 };
}

/** A camada com os caminhos esticados até `largura` × `altura` (a forma viva muda as medidas; o caminho, os pontos). */
export function redimensionar(camada: CamadaVetorial, largura: number, altura: number): CamadaVetorial {
  const forma = camada.forma;
  if (forma && forma.tipo !== "linha") return refazerForma(camada, { forma: { ...forma, largura: Math.max(1, largura), altura: Math.max(1, altura) } });
  const atual = tamanhoDosCaminhos(camada);
  const sx = atual.largura > 1e-9 ? largura / atual.largura : 1;
  const sy = atual.altura > 1e-9 ? altura / atual.altura : 1;
  return refazerForma({ ...camada, forma: null, subcaminhos: escalar(camada.subcaminhos, sx, sy) }, {});
}
