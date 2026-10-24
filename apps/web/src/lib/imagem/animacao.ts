// A linha do tempo de quadros do editor de imagem (ADR 0003, onda 13.15): cada quadro é o estado das camadas (o olho,
// a posição e a aparência, como uma comp de camada) e quanto tempo ele fica na tela; a animação toca os quadros em
// ordem, quantas vezes for pedido (0 é sempre). Interpolar cria os quadros do meio entre dois.
import type { Projeto } from "../projeto/modelo.ts";
import { type CompDeCamada, type EstadoNaComp, estadoDasCamadas } from "./comps.ts";

export type QuadroDaAnimacao = { id: string; atraso: number; camadas: Record<string, EstadoNaComp> };
export type AnimacaoDaImagem = { quadros: QuadroDaAnimacao[]; repetir: number };

export const MAXIMO_DE_QUADROS = 500;
/** Os tempos prontos de cada quadro, em segundos. */
export const ATRASOS = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10];
/** As repetições prontas (0 é sempre). */
export const REPETICOES = [
  { vezes: 1, nome: "Uma vez" },
  { vezes: 3, nome: "3 vezes" },
  { vezes: 0, nome: "Sempre" },
];

/** O quadro como comp (com as três partes ligadas), para aplicar nas camadas. */
export function compDoQuadro(quadro: QuadroDaAnimacao): CompDeCamada {
  return { id: quadro.id, nome: "", comentario: "", visibilidade: true, posicao: true, aparencia: true, camadas: quadro.camadas };
}

export function novoQuadro(projeto: Projeto, id: string, atraso = 0.5): QuadroDaAnimacao {
  return { id, atraso, camadas: estadoDasCamadas(projeto) };
}

/** Quanto a animação dura numa volta, em segundos. */
export function duracaoDaAnimacao(animacao: AnimacaoDaImagem): number {
  return animacao.quadros.reduce((soma, quadro) => soma + quadro.atraso, 0);
}

const misturar = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Os `n` quadros do meio entre `a` e `b`: a posição, a escala, o giro e a opacidade de cada camada andam em linha
 * reta; a camada que aparece ou some entre os dois vai e volta pela opacidade (como o "opacidade" do interpolar de lá),
 * e o resto (mesclagem, preenchimento, estilo) fica o de `a`. Cada um com o tempo de `a`.
 */
export function interpolar(a: QuadroDaAnimacao, b: QuadroDaAnimacao, n: number, novoId: () => string): QuadroDaAnimacao[] {
  const ids = [...new Set([...Object.keys(a.camadas), ...Object.keys(b.camadas)])];
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1);
    const camadas: Record<string, EstadoNaComp> = {};
    for (const id of ids) {
      const de = a.camadas[id] ?? b.camadas[id];
      const ate = b.camadas[id] ?? a.camadas[id];
      const ta = de.transformacao;
      const tb = ate.transformacao ?? ta;
      const visivelDe = !de.oculta;
      const visivelAte = !ate.oculta;
      // A opacidade de quem está escondido conta como zero na ida e na volta
      const opacidadeDe = visivelDe ? (ta?.opacidade ?? 1) : 0;
      const opacidadeAte = visivelAte ? (tb?.opacidade ?? 1) : 0;
      const transformacao = ta && tb ? { x: misturar(ta.x, tb.x, t), y: misturar(ta.y, tb.y, t), escala: misturar(ta.escala, tb.escala, t), rotacao: misturar(ta.rotacao, tb.rotacao, t), opacidade: misturar(opacidadeDe, opacidadeAte, t) } : undefined;
      camadas[id] = { ...de, oculta: !visivelDe && !visivelAte, ...(transformacao ? { transformacao } : {}) };
    }
    return { id: novoId(), atraso: a.atraso, camadas };
  });
}
