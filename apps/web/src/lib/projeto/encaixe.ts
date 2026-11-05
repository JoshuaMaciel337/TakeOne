// Caber, cobrir e alinhar um clipe no quadro (ADR 0007, 17.4), pela mesma caixa da prévia e do render (geometria.ts):
// caber é a escala 1 (a mídia recortada inteira no quadro), cobrir é a escala que enche o quadro sem faixas, e
// alinhar leva a borda da caixa (sem o giro) até a borda do quadro.
import { caixaDoClipe, type Tamanho } from "./geometria.ts";
import { type Recorte, type Transformacao, TRANSFORMACAO_PADRAO } from "./modelo.ts";

export type Alinhamento = "esquerda" | "centro" | "direita" | "topo" | "meio" | "base";

/** A escala que faz a mídia recortada cobrir o quadro inteiro. */
export function escalaParaCobrir(midia: Tamanho, recorte: Recorte, quadro: Tamanho): number {
  const caixa = caixaDoClipe(TRANSFORMACAO_PADRAO, recorte, midia, quadro);
  return Math.max(quadro.largura / caixa.largura, quadro.altura / caixa.altura);
}

/** O x ou o y (em frações do quadro) que encosta a caixa na borda pedida, na escala de agora. */
export function posicaoAlinhada(alinhamento: Alinhamento, transformacao: Transformacao, midia: Tamanho, recorte: Recorte, quadro: Tamanho): Partial<Transformacao> {
  const caixa = caixaDoClipe({ ...transformacao, x: 0, y: 0, rotacao: 0 }, recorte, midia, quadro);
  const meiaLargura = caixa.largura / quadro.largura / 2;
  const meiaAltura = caixa.altura / quadro.altura / 2;
  switch (alinhamento) {
    case "esquerda":
      return { x: meiaLargura - 0.5 };
    case "direita":
      return { x: 0.5 - meiaLargura };
    case "centro":
      return { x: 0 };
    case "topo":
      return { y: meiaAltura - 0.5 };
    case "base":
      return { y: 0.5 - meiaAltura };
    default:
      return { y: 0 };
  }
}
