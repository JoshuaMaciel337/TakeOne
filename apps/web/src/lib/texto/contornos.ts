// Os contornos das letras como caminhos vetoriais (ADR 0003, onda 13.8): para Converter em forma e Criar caminho de
// trabalho, e para o desenho e a medida do texto deformado. Cada letra é desenhada com o preenchimento de enrolamento
// não nulo da fonte; nos caminhos do TakeOne cada componente soma ou subtrai pela ordem, então os contornos de cada
// letra vão do maior para o menor, e o que gira ao contrário do maior (o furo do "o") subtrai. Sublinhados e tachados
// viram retângulos.
import { caminhosDoSvg } from "../vetor/svg.ts";
import type { No, Subcaminho } from "../vetor/modelo.ts";
import { deforma, type Deformacao, deformarCaminhos, deformarPonto, limitesDosPoligonos, type Retangulo } from "./deformar.ts";
import { type Disposicao, disporTexto, type Fontes } from "./layout.ts";
import type { TextoRico } from "./modelo.ts";
import { funcaoDoCaminho, glifoNoCaminho } from "./caminho.ts";

const INCLINACAO = Math.tan((12 * Math.PI) / 180);

/** Os contornos de uma letra (ou de um risco), com a cor e o negrito falso dela. */
export type GrupoDeContornos = { cor: string; negrito: boolean; em: number; caminhos: Subcaminho[]; centro?: number };

/** A área com sinal do contorno (pelos nós, sem as alças: basta para o sentido e para a ordem). */
function areaComSinal(nos: { x: number; y: number }[]): number {
  let soma = 0;
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1) % nos.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return soma / 2;
}

const levar = (no: No, f: (x: number, y: number) => { x: number; y: number }): No => {
  const p = f(no.x, no.y);
  const saida: No = { x: p.x, y: p.y };
  if (no.ex !== undefined && no.ey !== undefined) {
    const e = f(no.ex, no.ey);
    saida.ex = e.x;
    saida.ey = e.y;
  }
  if (no.sx !== undefined && no.sy !== undefined) {
    const s = f(no.sx, no.sy);
    saida.sx = s.x;
    saida.sy = s.y;
  }
  return saida;
};

/** Os contornos de cada letra e de cada risco, nas unidades do texto (sem a origem), na ordem do desenho. */
export function contornosDaDisposicao(disposicao: Disposicao): GrupoDeContornos[] {
  const grupos: GrupoDeContornos[] = [];
  for (const g of disposicao.glifos) {
    if (g.glifo.caixa.x1 <= g.glifo.caixa.x0) continue;
    // A conta do desenho: a escala (com o y da fonte para cima), a inclinação do itálico falso e o lugar
    const f = (x: number, y: number) => {
      const sx = x * g.escalaX;
      const sy = -y * g.escalaY;
      return { x: g.x + sx - (g.italico ? INCLINACAO * sy : 0), y: g.y + sy };
    };
    const contornos = caminhosDoSvg(g.glifo.caminho())
      .filter((sub) => sub.nos.length > 1)
      .map((sub) => ({ ...sub, fechado: true, nos: sub.nos.map((no) => levar(no, f)) }))
      .map((sub) => ({ sub, area: areaComSinal(sub.nos) }))
      .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const sentido = Math.sign(contornos[0]?.area ?? 1);
    grupos.push({
      cor: g.cor,
      negrito: g.negrito,
      em: g.fonte.unidades * g.escalaX,
      // O meio da letra na linha (o texto num caminho gira cada letra em volta dele)
      centro: g.x + (g.glifo.avanco * g.escalaX) / 2,
      caminhos: contornos.map(({ sub, area }, i) => ({ ...sub, operacao: i === 0 || Math.sign(area) === sentido ? "somar" : "subtrair" })),
    });
  }
  for (const r of disposicao.riscos) {
    const y0 = r.y - r.espessura / 2;
    const y1 = y0 + r.espessura;
    grupos.push({ cor: r.cor, negrito: false, em: 0, caminhos: [{ fechado: true, operacao: "somar", nos: [{ x: r.x0, y: y0 }, { x: r.x1, y: y0 }, { x: r.x1, y: y1 }, { x: r.x0, y: y1 }] }] });
  }
  return grupos;
}

/**
 * O retângulo de referência da deformação, nas unidades do texto: no parágrafo, a caixa; no ponto, o que as letras
 * ocupam sem deformar.
 */
function referencia(texto: TextoRico, disposicao: Disposicao): Retangulo | null {
  if (texto.modo === "paragrafo") return { x0: 0, y0: 0, x1: texto.caixa.largura, y1: texto.caixa.altura };
  return disposicao.limites;
}

/**
 * A deformação do texto como uma função das unidades do texto, ou null quando não deforma. No parágrafo, o resultado
 * é reduzido (em volta do meio da caixa) até caber nela, porque o que passa da caixa não aparece.
 */
export function funcaoDaDeformacao(texto: TextoRico, disposicao: Disposicao): ((p: { x: number; y: number }) => { x: number; y: number }) | null {
  // No caminho, a curva dele (a deformação não vale junto)
  if (texto.caminho?.tipo === "linha") return funcaoDoCaminho(texto.caminho);
  const d: Deformacao | null | undefined = texto.deformar;
  if (!deforma(d)) return null;
  const r = referencia(texto, disposicao);
  if (!r || r.x1 <= r.x0 || r.y1 <= r.y0) return null;
  if (texto.modo !== "paragrafo") return (p) => deformarPonto(p, r, d);
  // Uma grade do retângulo diz até onde a deformação vai
  const grade: { x: number; y: number }[] = [];
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) grade.push(deformarPonto({ x: r.x0 + ((r.x1 - r.x0) * i) / 12, y: r.y0 + ((r.y1 - r.y0) * j) / 12 }, r, d));
  const limites = limitesDosPoligonos([grade])!;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const k = Math.min(1, (r.x1 - cx) / Math.max(1e-6, limites.x1 - cx), (cx - r.x0) / Math.max(1e-6, cx - limites.x0), (r.y1 - cy) / Math.max(1e-6, limites.y1 - cy), (cy - r.y0) / Math.max(1e-6, cy - limites.y0));
  return (p) => {
    const q = deformarPonto(p, r, d);
    return { x: cx + (q.x - cx) * k, y: cy + (q.y - cy) * k };
  };
}

/** Os polígonos deformados de cada grupo (nas unidades do texto), ou null quando o texto não deforma. */
export function gruposDeformados(texto: TextoRico, disposicao: Disposicao, tolerancia: number): { cor: string; negrito: boolean; em: number; poligonos: { x: number; y: number }[][]; operacoes: Subcaminho["operacao"][] }[] | null {
  const f = funcaoDaDeformacao(texto, disposicao);
  if (!f) return null;
  // A deformação só precisa de um retângulo: a função já traz a referência (e o encaixe do parágrafo)
  const identidade = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const caminho = texto.caminho?.tipo === "linha" ? texto.caminho : null;
  return contornosDaDisposicao(disposicao).map((grupo) => {
    // No caminho, cada letra vai rígida (girada pela tangente no meio dela); a que cai fora do caminho não aparece
    const rigida = caminho && grupo.centro !== undefined ? glifoNoCaminho(caminho, grupo.centro) : null;
    const fora = caminho && grupo.centro !== undefined && !rigida;
    return {
      cor: grupo.cor,
      negrito: grupo.negrito,
      em: grupo.em,
      operacoes: grupo.caminhos.map((sub) => sub.operacao),
      poligonos: fora ? [] : deformarCaminhos(grupo.caminhos, identidade, null, tolerancia, rigida ?? f),
    };
  });
}

/** Os contornos do texto, nas unidades da caixa (a origem do texto já somada; deformados quando o texto deforma). */
export function caminhosDoTexto(texto: TextoRico, fontes: Fontes): Subcaminho[] {
  const disposicao = disporTexto(texto, fontes);
  const deformados = gruposDeformados(texto, disposicao, 0.1);
  const comOrigem = (x: number, y: number) => ({ x: x + texto.origem.x, y: y + texto.origem.y });
  if (deformados) {
    return deformados.flatMap((grupo) => grupo.poligonos.map((poligono, i) => ({ fechado: true, operacao: grupo.operacoes[i], nos: poligono.map((p) => comOrigem(p.x, p.y)) })));
  }
  return contornosDaDisposicao(disposicao).flatMap((grupo) => grupo.caminhos.map((sub) => ({ ...sub, nos: sub.nos.map((no) => levar(no, comOrigem)) })));
}
