// Fundo desfocado no vídeo: a pessoa nítida (a máscara do recorte do fundo) sobre uma cópia desfocada do próprio clipe.
// O clipe guarda só `fundo_desfocado` (a intensidade); na hora de desenhar e de exportar, o projeto é expandido: o
// clipe vira a cópia desfocada (sem a máscara) e uma faixa logo acima recebe a cópia recortada, sem som. Assim as
// duas cópias nunca se desalinham na edição. A mesma conta em core/utils/fundo_desfocado.py.
import type { Clipe, Faixa, Projeto } from "./modelo.ts";

/** O sufixo do id da cópia recortada e da faixa dela (não aparecem na linha do tempo). */
export const SUFIXO_DO_RECORTE = "~recorte";

export function temFundoDesfocado(clipe: Pick<Clipe, "fundo_desfocado" | "texto" | "ajuste">): boolean {
  return Boolean(clipe.fundo_desfocado && clipe.fundo_desfocado > 0 && !clipe.texto && !clipe.ajuste);
}

/** O projeto como é desenhado: cada clipe com fundo desfocado vira dois, em duas faixas. */
export function expandirFundoDesfocado(projeto: Projeto): Projeto {
  if (!projeto.faixas.some((faixa) => faixa.clipes.some(temFundoDesfocado))) return projeto;
  const faixas: Faixa[] = [];
  for (const faixa of projeto.faixas) {
    const comFundo = faixa.clipes.filter(temFundoDesfocado);
    if (!comFundo.length) {
      faixas.push(faixa);
      continue;
    }
    // A lista vai de cima para baixo: a faixa da cópia recortada entra antes da original
    faixas.push({
      ...faixa,
      id: `${faixa.id}${SUFIXO_DO_RECORTE}`,
      tipo: faixa.tipo === "principal" ? "video" : faixa.tipo,
      clipes: comFundo.map((clipe) => ({ ...clipe, id: `${clipe.id}${SUFIXO_DO_RECORTE}`, fundo_desfocado: null, remover_fundo: true, som_separado: true, transicao: null })),
    });
    faixas.push({
      ...faixa,
      clipes: faixa.clipes.map((clipe) =>
        temFundoDesfocado(clipe) ? { ...clipe, fundo_desfocado: null, remover_fundo: false, efeito: { tipo: "desfoque", intensidade: clipe.fundo_desfocado! } } : clipe,
      ),
    });
  }
  return { ...projeto, faixas };
}
