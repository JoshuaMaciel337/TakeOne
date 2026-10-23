// A árvore de camadas do projeto de imagem (ADR 0003, onda 13.1). O projeto continua uma lista de faixas, de cima
// para baixo (a principal, vazia, embaixo de tudo); cada camada é uma faixa com um clipe. A árvore sai de três
// campos da faixa: `pai` (a faixa da pasta em que ela está), `recortada` (presa à camada de baixo) e o clipe com
// `pasta` (o grupo). A ordem entre irmãos é a ordem da lista; camadas de pais diferentes não se comparam.
import type { Clipe, Faixa, Mesclagem, Projeto } from "./modelo.ts";
import { MESCLAGENS_SO_DA_IMAGEM } from "./modelo.ts";

export type NoDaCamada = {
  faixa: Faixa;
  clipe: Clipe;
  /** Numa pasta, as camadas de dentro, de cima para baixo. */
  filhos: NoDaCamada[];
  /** As camadas recortadas por esta (as de cima, presas a ela), de cima para baixo. */
  recortadas: NoDaCamada[];
};

/** Até onde as pastas podem se aninhar (o painel e o compositor usam um framebuffer por nível). */
export const PROFUNDIDADE_MAXIMA = 10;

/** As camadas (faixas com clipe, sem a principal), de cima para baixo, como estão na lista. */
function camadas(projeto: Projeto): { faixa: Faixa; clipe: Clipe }[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes[0]).map((faixa) => ({ faixa, clipe: faixa.clipes[0] }));
}

/** O id da pasta em que a faixa está, ou null na raiz (um `pai` que não é uma pasta conta como raiz). */
export function paiDaCamada(projeto: Projeto, faixa: Faixa): string | null {
  if (!faixa.pai) return null;
  const pai = projeto.faixas.find((item) => item.id === faixa.pai);
  return pai?.clipes[0]?.pasta ? pai.id : null;
}

/**
 * A árvore, de cima para baixo. Cada camada recortada fica presa à primeira não recortada abaixo dela, entre os
 * irmãos; sem nenhuma embaixo, ela aparece como uma camada comum.
 */
export function arvoreDaImagem(projeto: Projeto): NoDaCamada[] {
  const lista = camadas(projeto);
  const porPai = new Map<string | null, { faixa: Faixa; clipe: Clipe }[]>();
  for (const camada of lista) {
    const pai = paiDaCamada(projeto, camada.faixa);
    const irmaos = porPai.get(pai) ?? [];
    irmaos.push(camada);
    porPai.set(pai, irmaos);
  }
  const visitadas = new Set<string>();
  const montar = (pai: string | null, profundidade: number): NoDaCamada[] => {
    const irmaos = porPai.get(pai) ?? [];
    const nos: NoDaCamada[] = [];
    // De baixo para cima: a recortada procura a base embaixo dela
    for (const { faixa, clipe } of [...irmaos].reverse()) {
      if (visitadas.has(faixa.id)) continue;
      visitadas.add(faixa.id);
      const no: NoDaCamada = { faixa, clipe, filhos: clipe.pasta && profundidade < PROFUNDIDADE_MAXIMA ? montar(faixa.id, profundidade + 1) : [], recortadas: [] };
      const base = nos.length ? nos[nos.length - 1] : null;
      if (faixa.recortada && base) base.recortadas.unshift(no);
      else nos.push(no);
    }
    return nos.reverse();
  };
  return montar(null, 0);
}

/** A faixa e todas as que estão dentro dela (os descendentes de uma pasta), na ordem da lista. */
export function comDescendentes(projeto: Projeto, faixaId: string): Faixa[] {
  const ids = new Set([faixaId]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const faixa of projeto.faixas) {
      if (faixa.pai && ids.has(faixa.pai) && !ids.has(faixa.id)) {
        ids.add(faixa.id);
        cresceu = true;
      }
    }
  }
  return projeto.faixas.filter((faixa) => ids.has(faixa.id));
}

/** Os ancestrais da faixa (as pastas em volta), do mais perto ao mais longe. */
export function ancestrais(projeto: Projeto, faixa: Faixa): Faixa[] {
  const lista: Faixa[] = [];
  let atual = paiDaCamada(projeto, faixa);
  while (atual && lista.length <= PROFUNDIDADE_MAXIMA) {
    const pai = projeto.faixas.find((item) => item.id === atual);
    if (!pai) break;
    lista.push(pai);
    atual = paiDaCamada(projeto, pai);
  }
  return lista;
}

/** A camada aparece: ela e as pastas em volta estão visíveis. */
export function camadaVisivel(projeto: Projeto, faixa: Faixa): boolean {
  return !faixa.oculta && ancestrais(projeto, faixa).every((pasta) => !pasta.oculta);
}

/** A camada (ou uma pasta em volta) está travada de vez. */
export function camadaTravada(projeto: Projeto, faixa: Faixa): boolean {
  return faixa.travada || ancestrais(projeto, faixa).some((pasta) => pasta.travada);
}

/** A posição está presa (trava de posição ou de tudo, nela ou numa pasta em volta). */
export function posicaoTravada(projeto: Projeto, faixa: Faixa): boolean {
  return camadaTravada(projeto, faixa) || [faixa, ...ancestrais(projeto, faixa)].some((item) => item.travas?.posicao);
}

/**
 * Confere as regras da árvore (a API confere as mesmas, em core/modelos/projeto.py): `pai` aponta para uma pasta,
 * sem ciclos e até a profundidade máxima; pasta só numa faixa de sobreposição, sem mídia nem texto; os campos e os
 * modos que só existem na imagem não aparecem num projeto de vídeo. Devolve a mensagem do primeiro problema.
 */
export function problemaNaArvore(projeto: Projeto): string | null {
  const imagem = projeto.tipo === "imagem";
  for (const faixa of projeto.faixas) {
    const clipe = faixa.clipes[0];
    const daImagem = faixa.pai || faixa.recortada || faixa.travas || faixa.rotulo || faixa.vinculo || faixa.nome || faixa.aberta;
    if (!imagem) {
      if (daImagem || faixa.clipes.some((item) => item.pasta || item.pixels || item.preenchimento !== undefined || (item.mesclagem && MESCLAGENS_SO_DA_IMAGEM.has(item.mesclagem)))) {
        return "Grupos, recortes, travas parciais, camadas de pixels e os modos de mesclagem novos só existem no editor de imagem.";
      }
      continue;
    }
    if (clipe?.pasta && (faixa.tipo !== "video" || clipe.midia_id || clipe.texto || clipe.ajuste)) return "A pasta fica numa faixa de sobreposição, sem mídia nem texto.";
    if (clipe?.mesclagem === "passagem" && !clipe.pasta) return "Só uma pasta usa a mesclagem Passagem.";
    if (faixa.pai) {
      const pai = projeto.faixas.find((item) => item.id === faixa.pai);
      if (!pai?.clipes[0]?.pasta) return "Uma camada está dentro de uma pasta que não existe.";
      const visto = new Set([faixa.id]);
      let atual: Faixa | undefined = pai;
      let nivel = 1;
      while (atual) {
        if (visto.has(atual.id)) return "Uma pasta está dentro dela mesma.";
        visto.add(atual.id);
        nivel++;
        if (nivel > PROFUNDIDADE_MAXIMA + 1) return `As pastas vão até ${PROFUNDIDADE_MAXIMA} níveis.`;
        atual = atual.pai ? projeto.faixas.find((item) => item.id === atual!.pai) : undefined;
      }
    }
  }
  return null;
}

/** A mesclagem com que a pasta entra: a dela, ou passagem quando não foi escolhida. */
export function mesclagemDaPasta(clipe: Clipe): Mesclagem {
  return clipe.mesclagem ?? "passagem";
}

/**
 * As faixas na ordem em que aparecem, de cima para baixo: as recortadas logo acima da base, a pasta e logo abaixo
 * dela as de dentro (a ordem do painel e do clique na prévia; a lista do projeto não precisa estar nessa ordem).
 */
export function faixasEmOrdem(projeto: Projeto): Faixa[] {
  const lista: Faixa[] = [];
  const andar = (nos: NoDaCamada[]) => {
    for (const no of nos) {
      andar(no.recortadas);
      lista.push(no.faixa);
      andar(no.filhos);
    }
  };
  andar(arvoreDaImagem(projeto));
  return lista;
}
