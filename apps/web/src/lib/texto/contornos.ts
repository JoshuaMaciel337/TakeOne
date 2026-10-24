// Os contornos das letras como caminhos vetoriais (ADR 0003, onda 13.8: Converter em forma e Criar caminho de trabalho),
// nas unidades da caixa do texto. Cada letra é desenhada com o preenchimento de enrolamento não nulo da fonte; nos
// caminhos do TakeOne cada componente soma ou subtrai pela ordem, então os contornos de cada letra vão do maior para o
// menor, e o que gira ao contrário do maior (o furo do "o") subtrai. Sublinhados e tachados viram retângulos.
import { caminhosDoSvg } from "../vetor/svg.ts";
import type { No, Subcaminho } from "../vetor/modelo.ts";
import { disporTexto, type Fontes } from "./layout.ts";
import type { TextoRico } from "./modelo.ts";

const INCLINACAO = Math.tan((12 * Math.PI) / 180);

/** A área com sinal do contorno (pelos nós, sem as alças: basta para o sentido e para a ordem). */
function areaComSinal(sub: Subcaminho): number {
  let soma = 0;
  const nos = sub.nos;
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

/** Os contornos do texto, nas unidades da caixa (a origem do texto já somada). */
export function caminhosDoTexto(texto: TextoRico, fontes: Fontes): Subcaminho[] {
  const disposicao = disporTexto(texto, fontes);
  const saida: Subcaminho[] = [];
  for (const g of disposicao.glifos) {
    if (g.glifo.caixa.x1 <= g.glifo.caixa.x0) continue;
    const ox = g.x + texto.origem.x;
    const oy = g.y + texto.origem.y;
    // A conta do desenho: a escala (com o y da fonte para cima), a inclinação do itálico falso e o lugar
    const f = (x: number, y: number) => {
      const sx = x * g.escalaX;
      const sy = -y * g.escalaY;
      return { x: ox + sx - (g.italico ? INCLINACAO * sy : 0), y: oy + sy };
    };
    const contornos = caminhosDoSvg(g.glifo.caminho())
      .filter((sub) => sub.nos.length > 1)
      .map((sub) => ({ ...sub, fechado: true, nos: sub.nos.map((no) => levar(no, f)) }))
      .map((sub) => ({ sub, area: areaComSinal(sub) }))
      .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const sentido = Math.sign(contornos[0]?.area ?? 1);
    for (const { sub, area } of contornos) saida.push({ ...sub, operacao: Math.sign(area) === sentido || saida.length === 0 ? "somar" : "subtrair" });
  }
  for (const r of disposicao.riscos) {
    const x0 = r.x0 + texto.origem.x;
    const x1 = r.x1 + texto.origem.x;
    const y0 = r.y - r.espessura / 2 + texto.origem.y;
    const y1 = y0 + r.espessura;
    saida.push({ fechado: true, operacao: "somar", nos: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
  }
  // O primeiro componente sempre soma (subtrair do nada não faz sentido)
  if (saida[0]) saida[0] = { ...saida[0], operacao: "somar" };
  return saida;
}
