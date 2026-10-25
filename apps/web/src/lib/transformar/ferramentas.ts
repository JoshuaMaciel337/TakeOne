// As ferramentas de transformar do editor vetorial (ADR 0003, onda 13.16): Girar, Refletir, Escalar e Inclinar levam
// as camadas escolhidas por uma afim em volta de um ponto de origem (o clique muda a origem; o arrasto, a afim), e o
// Remodelar puxa um ponto do caminho com os vizinhos indo junto, cada vez menos com a distância. As contas são puras,
// em pixels da imagem.
import type { Subcaminho } from "../vetor/modelo.ts";
import { semelhanca } from "./livre.ts";

type Ponto = { x: number; y: number };

/** x' = a·x + b·y + e, y' = c·x + d·y + f (a ordem de `linearEntre`). */
export type Afim = { a: number; b: number; c: number; d: number; e: number; f: number };
export type FerramentaDeTransformar = "girar" | "refletir" | "escalar" | "inclinar";

export const IDENTIDADE: Afim = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const aplicarAfim = (m: Afim, p: Ponto): Ponto => ({ x: m.a * p.x + m.b * p.y + m.e, y: m.c * p.x + m.d * p.y + m.f });

/** A parte linear `l` em volta da origem `o`: p ↦ o + l·(p − o). */
function emVolta(o: Ponto, a: number, b: number, c: number, d: number): Afim {
  return { a, b, c, d, e: o.x - a * o.x - b * o.y, f: o.y - c * o.x - d * o.y };
}

export const giroEmVolta = (o: Ponto, graus: number): Afim => {
  const r = (graus * Math.PI) / 180;
  return emVolta(o, Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r));
};

/** O espelho no eixo que passa pela origem com o ângulo dado (0: o eixo deitado, que vira de cima para baixo). */
export const reflexoEmVolta = (o: Ponto, grausDoEixo: number): Afim => {
  const r = (2 * grausDoEixo * Math.PI) / 180;
  return emVolta(o, Math.cos(r), Math.sin(r), Math.sin(r), -Math.cos(r));
};

export const escalaEmVolta = (o: Ponto, sx: number, sy: number): Afim => emVolta(o, sx, 0, 0, sy);

/** A inclinação ao longo do eixo com o ângulo dado (0: os pontos andam para o lado conforme a altura). */
export const inclinacaoEmVolta = (o: Ponto, grausDaInclinacao: number, grausDoEixo = 0): Afim => {
  const k = Math.tan((grausDaInclinacao * Math.PI) / 180);
  const r = (grausDoEixo * Math.PI) / 180;
  const ux = Math.cos(r);
  const uy = Math.sin(r);
  // p ↦ p + k·(p·n)·u, com n a normal do eixo (−uy, ux)
  return emVolta(o, 1 - k * ux * uy, k * ux * ux, -k * uy * uy, 1 + k * ux * uy);
};

const angulo = (o: Ponto, p: Ponto) => (Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI;
const prender = (graus: number, passo: number) => Math.round(graus / passo) * passo;

/** A afim do arrasto de `de` até `ate`, em volta da origem; Shift prende o giro e o eixo a 45° e a escala por igual. */
export function afimDoGesto(ferramenta: FerramentaDeTransformar, origem: Ponto, de: Ponto, ate: Ponto, shift = false): Afim {
  if (ferramenta === "girar") {
    const graus = angulo(origem, ate) - angulo(origem, de);
    return giroEmVolta(origem, shift ? prender(graus, 45) : graus);
  }
  if (ferramenta === "refletir") {
    const eixo = angulo(origem, ate);
    return reflexoEmVolta(origem, shift ? prender(eixo, 45) : eixo);
  }
  const dx0 = de.x - origem.x;
  const dy0 = de.y - origem.y;
  if (ferramenta === "escalar") {
    if (shift) {
      const s = Math.hypot(ate.x - origem.x, ate.y - origem.y) / Math.max(1e-6, Math.hypot(dx0, dy0));
      return escalaEmVolta(origem, s, s);
    }
    // Perto da origem num eixo, ele não muda (a divisão explodiria)
    const sx = Math.abs(dx0) < 2 ? 1 : (ate.x - origem.x) / dx0;
    const sy = Math.abs(dy0) < 2 ? 1 : (ate.y - origem.y) / dy0;
    return escalaEmVolta(origem, sx, sy);
  }
  // Inclinar: o arrasto mais deitado inclina na horizontal (pela altura do começo), o mais em pé, na vertical
  const mx = ate.x - de.x;
  const my = ate.y - de.y;
  if (Math.abs(mx) >= Math.abs(my)) {
    if (Math.abs(dy0) < 2) return IDENTIDADE;
    const graus = (Math.atan2(mx, Math.abs(dy0)) * 180) / Math.PI * Math.sign(dy0);
    return inclinacaoEmVolta(origem, Math.max(-85, Math.min(85, graus)), 0);
  }
  if (Math.abs(dx0) < 2) return IDENTIDADE;
  const graus = (Math.atan2(my, Math.abs(dx0)) * 180) / Math.PI * Math.sign(dx0);
  return inclinacaoEmVolta(origem, Math.max(-85, Math.min(85, -graus)), 90);
}

/**
 * A afim como posição de uma camada (o centro levado, a escala, o giro e o espelho), para ela continuar editável;
 * null quando estica ou inclina (aí vale só nas formas, pelos pontos, ou nos pixels).
 */
export function posicaoPelaAfim(m: Afim, centro: Ponto, escala: number, rotacao: number): { centro: Ponto; escala: number; rotacao: number; espelhado: boolean } | null {
  const quadrado: [Ponto, Ponto, Ponto, Ponto] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const levado = quadrado.map((p) => aplicarAfim(m, p)) as [Ponto, Ponto, Ponto, Ponto];
  const parecida = semelhanca(quadrado, levado);
  if (!parecida) return null;
  return {
    centro: aplicarAfim(m, centro),
    escala: escala * parecida.escala,
    rotacao: parecida.espelhado ? parecida.giro - rotacao : rotacao + parecida.giro,
    espelhado: parecida.espelhado,
  };
}

/**
 * O Remodelar: os nós (e as alças) do caminho andam `delta`, com o peso que cai em curva suave de 1, no ponto agarrado,
 * a 0, a `alcance` dele.
 */
export function remodelarCaminhos(caminhos: Subcaminho[], agarrado: Ponto, delta: Ponto, alcance: number): Subcaminho[] {
  const peso = (x: number, y: number) => {
    const t = Math.max(0, 1 - Math.hypot(x - agarrado.x, y - agarrado.y) / Math.max(1e-6, alcance));
    return t * t * (3 - 2 * t);
  };
  return caminhos.map((sub) => ({
    ...sub,
    nos: sub.nos.map((no) => {
      // O nó e as alças dele andam com o peso do nó (a curva em volta não se deforma)
      const w = peso(no.x, no.y);
      if (!w) return no;
      const dx = delta.x * w;
      const dy = delta.y * w;
      return {
        x: no.x + dx,
        y: no.y + dy,
        ...(no.ex !== undefined && no.ey !== undefined ? { ex: no.ex + dx, ey: no.ey + dy } : {}),
        ...(no.sx !== undefined && no.sy !== undefined ? { sx: no.sx + dx, sy: no.sy + dy } : {}),
      };
    }),
  }));
}
