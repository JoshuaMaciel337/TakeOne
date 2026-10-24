// As comps de camada do editor de imagem (ADR 0003, onda 13.15): o estado das camadas (o olho, a posição e a
// aparência: mesclagem, preenchimento e estilo) guardado com um nome, para trocar entre versões de um layout no mesmo
// documento. Aplicar só mexe no que a comp guarda (as três partes, ligadas ou não) e nas camadas que existem; as
// criadas depois ficam como estão, como lá.
import type { Faixa, Mesclagem, Projeto, Transformacao } from "../projeto/modelo.ts";
import type { EstiloDeCamada } from "./estiloDeCamada.ts";

export type EstadoNaComp = { oculta?: boolean; transformacao?: Transformacao; mesclagem?: Mesclagem; preenchimento?: number; estilo_camada?: EstiloDeCamada | null };

export type CompDeCamada = {
  id: string;
  nome: string;
  comentario: string;
  visibilidade: boolean;
  posicao: boolean;
  aparencia: boolean;
  camadas: Record<string, EstadoNaComp>;
};

export const MAXIMO_DE_COMPS = 100;

/** O estado de cada camada agora (as faixas com clipe, menos a principal vazia). */
export function estadoDasCamadas(projeto: Projeto): Record<string, EstadoNaComp> {
  const camadas: Record<string, EstadoNaComp> = {};
  for (const faixa of projeto.faixas) {
    const clipe = faixa.clipes[0];
    if (!clipe) continue;
    camadas[faixa.id] = {
      oculta: Boolean(faixa.oculta),
      transformacao: { ...clipe.transformacao },
      mesclagem: clipe.mesclagem ?? "normal",
      preenchimento: clipe.preenchimento ?? 1,
      ...(clipe.estilo_camada ? { estilo_camada: clipe.estilo_camada } : {}),
    };
  }
  return camadas;
}

export function novaComp(projeto: Projeto, id: string, opcoes: Pick<CompDeCamada, "nome" | "comentario" | "visibilidade" | "posicao" | "aparencia">): CompDeCamada {
  return { id, ...opcoes, camadas: estadoDasCamadas(projeto) };
}

/** Atualizar: a comp passa a guardar o estado de agora (com as mesmas partes ligadas). */
export function atualizarComp(comp: CompDeCamada, projeto: Projeto): CompDeCamada {
  return { ...comp, camadas: estadoDasCamadas(projeto) };
}

/** As camadas como a comp guarda, nas partes ligadas dela; a posição traz junto a opacidade de então. */
export function aplicarComp(projeto: Projeto, comp: CompDeCamada): Projeto {
  let mudou = false;
  const faixas = projeto.faixas.map((faixa): Faixa => {
    const estado = comp.camadas[faixa.id];
    const clipe = faixa.clipes[0];
    if (!estado || !clipe) return faixa;
    let nova = faixa;
    if (comp.visibilidade && estado.oculta !== undefined && Boolean(faixa.oculta) !== estado.oculta) nova = { ...nova, oculta: estado.oculta };
    // Só o que difere muda (o que falta no clipe vale o padrão: normal, 100%, sem estilo)
    let clipeNovo = clipe;
    const t = clipe.transformacao;
    if (comp.posicao && estado.transformacao) {
      const { x, y, escala, rotacao } = estado.transformacao;
      if (x !== t.x || y !== t.y || escala !== t.escala || rotacao !== t.rotacao) clipeNovo = { ...clipeNovo, transformacao: { ...clipeNovo.transformacao, x, y, escala, rotacao } };
    }
    if (comp.aparencia) {
      const mesclagem = estado.mesclagem ?? "normal";
      const preenchimento = estado.preenchimento ?? 1;
      const estilo = estado.estilo_camada ?? null;
      const opacidade = estado.transformacao?.opacidade ?? t.opacidade;
      if (mesclagem !== (clipe.mesclagem ?? "normal")) clipeNovo = { ...clipeNovo, mesclagem };
      if (preenchimento !== (clipe.preenchimento ?? 1)) clipeNovo = { ...clipeNovo, preenchimento };
      if (JSON.stringify(estilo) !== JSON.stringify(clipe.estilo_camada ?? null)) clipeNovo = { ...clipeNovo, estilo_camada: estilo };
      if (opacidade !== clipeNovo.transformacao.opacidade) clipeNovo = { ...clipeNovo, transformacao: { ...clipeNovo.transformacao, opacidade } };
    }
    if (clipeNovo !== clipe) nova = { ...nova, clipes: [clipeNovo, ...faixa.clipes.slice(1)] };
    if (nova !== faixa) mudou = true;
    return nova;
  });
  return mudou ? { ...projeto, faixas } : projeto;
}

/** As camadas que a comp guarda e não existem mais (o aviso do painel, como o triângulo de lá). */
export function camadasQueSumiram(projeto: Projeto, comp: CompDeCamada): number {
  const existem = new Set(projeto.faixas.map((faixa) => faixa.id));
  return Object.keys(comp.camadas).filter((id) => !existem.has(id)).length;
}
