// Mover várias camadas juntas no editor de imagem (ADR 0003, onda 13.1): as escolhidas, as de dentro das pastas
// escolhidas e as vinculadas a elas andam o mesmo tanto; alinhar e distribuir movem cada camada (ou pasta, inteira)
// pela caixa dela na tela. Tudo vira um comando `imagem.posicoes`, um passo só do desfazer.
import { ancestrais, comDescendentes, posicaoTravada } from "./arvore.ts";
import type { Clipe, Projeto, Transformacao } from "./modelo.ts";

/** Uma caixa em frações do quadro (0 a 1), sem giro: o retângulo que a camada ocupa na tela. */
export type CaixaNoQuadro = { x0: number; y0: number; x1: number; y1: number };

/** O retângulo em volta de uma caixa girada (centro, tamanho e giro em pixels do quadro), em frações do quadro. */
export function caixaNoQuadro(caixa: { cx: number; cy: number; largura: number; altura: number; rotacao: number }, quadro: { largura: number; altura: number }): CaixaNoQuadro {
  const angulo = (caixa.rotacao * Math.PI) / 180;
  const meiaLargura = (Math.abs(caixa.largura * Math.cos(angulo)) + Math.abs(caixa.altura * Math.sin(angulo))) / 2;
  const meiaAltura = (Math.abs(caixa.largura * Math.sin(angulo)) + Math.abs(caixa.altura * Math.cos(angulo))) / 2;
  return {
    x0: (caixa.cx - meiaLargura) / quadro.largura,
    y0: (caixa.cy - meiaAltura) / quadro.altura,
    x1: (caixa.cx + meiaLargura) / quadro.largura,
    y1: (caixa.cy + meiaAltura) / quadro.altura,
  };
}

/** Uma camada escolhida (ou pasta) e os clipes que se movem com ela: o dela, ou os de dentro da pasta. */
export type Unidade = { faixaId: string; clipeIds: string[] };

/** Os clipes que desenham algo (sem a pasta) da faixa e das de dentro dela. */
function clipesQueAndam(projeto: Projeto, faixaId: string): string[] {
  return comDescendentes(projeto, faixaId).flatMap((faixa) => (faixa.clipes[0] && !faixa.clipes[0].pasta ? [faixa.clipes[0].id] : []));
}

/** As unidades da seleção (clipes das camadas): uma camada dentro de uma pasta também escolhida anda com a pasta. */
export function unidadesDaSelecao(projeto: Projeto, clipeIds: string[]): Unidade[] {
  const escolhidas = projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes[0] && clipeIds.includes(faixa.clipes[0].id));
  const ids = new Set(escolhidas.map((faixa) => faixa.id));
  return escolhidas
    .filter((faixa) => !ancestrais(projeto, faixa).some((pasta) => ids.has(pasta.id)))
    .map((faixa) => ({ faixaId: faixa.id, clipeIds: clipesQueAndam(projeto, faixa.id) }))
    .filter((unidade) => unidade.clipeIds.length > 0);
}

/** Os clipes que andam quando estes andam: eles, os de dentro das pastas e os das camadas vinculadas. */
export function comVinculadas(projeto: Projeto, clipeIds: string[]): string[] {
  const faixas = projeto.faixas.filter((faixa) => faixa.clipes[0] && clipeIds.includes(faixa.clipes[0].id));
  const vinculos = new Set(faixas.flatMap((faixa) => (faixa.vinculo ? [faixa.vinculo] : [])));
  const todas = [...faixas, ...projeto.faixas.filter((faixa) => faixa.vinculo && vinculos.has(faixa.vinculo))];
  return [...new Set(todas.flatMap((faixa) => clipesQueAndam(projeto, faixa.id)))];
}

/** Os clipes que podem andar (sem a posição travada nelas ou numa pasta em volta). */
function livres(projeto: Projeto, clipeIds: string[]): Clipe[] {
  return projeto.faixas.flatMap((faixa) => {
    const clipe = faixa.clipes[0];
    return clipe && clipeIds.includes(clipe.id) && !posicaoTravada(projeto, faixa) ? [clipe] : [];
  });
}

export type MudancaDePosicao = { clipeId: string; transformacao: Partial<Transformacao> };

/** Deslocar estes clipes (dx e dy em frações do quadro), com as vinculadas; as de posição travada ficam. */
export function deslocar(projeto: Projeto, clipeIds: string[], dx: number, dy: number): MudancaDePosicao[] {
  return livres(projeto, comVinculadas(projeto, clipeIds)).map((clipe) => ({ clipeId: clipe.id, transformacao: { x: clipe.transformacao.x + dx, y: clipe.transformacao.y + dy } }));
}

/**
 * A mudança de um clipe (o painel, as alças da prévia) com as vinculadas: o que mexe na posição leva as outras o
 * mesmo tanto; o resto (escala, giro) fica só nele.
 */
export function mudancaComVinculadas(projeto: Projeto, clipe: Clipe, mudanca: Partial<Transformacao>): MudancaDePosicao[] {
  const dx = mudanca.x === undefined ? 0 : mudanca.x - clipe.transformacao.x;
  const dy = mudanca.y === undefined ? 0 : mudanca.y - clipe.transformacao.y;
  const outras = dx || dy ? deslocar(projeto, [clipe.id], dx, dy).filter((item) => item.clipeId !== clipe.id) : [];
  return [{ clipeId: clipe.id, transformacao: mudanca }, ...outras];
}

export type Alinhamento = "esquerda" | "centroH" | "direita" | "topo" | "centroV" | "base";
export type Distribuicao = Alinhamento | "espacoH" | "espacoV";

/** A caixa de uma unidade: a união das caixas dos clipes dela que estão na tela. */
function caixaDaUnidade(unidade: Unidade, caixas: ReadonlyMap<string, CaixaNoQuadro>): CaixaNoQuadro | null {
  const lista = unidade.clipeIds.flatMap((id) => {
    const caixa = caixas.get(id);
    return caixa ? [caixa] : [];
  });
  if (!lista.length) return null;
  return { x0: Math.min(...lista.map((c) => c.x0)), y0: Math.min(...lista.map((c) => c.y0)), x1: Math.max(...lista.map((c) => c.x1)), y1: Math.max(...lista.map((c) => c.y1)) };
}

function ponto(caixa: CaixaNoQuadro, como: Alinhamento): number {
  if (como === "esquerda") return caixa.x0;
  if (como === "direita") return caixa.x1;
  if (como === "centroH") return (caixa.x0 + caixa.x1) / 2;
  if (como === "topo") return caixa.y0;
  if (como === "base") return caixa.y1;
  return (caixa.y0 + caixa.y1) / 2;
}
const HORIZONTAIS: ReadonlySet<Distribuicao> = new Set(["esquerda", "centroH", "direita", "espacoH"]);

/** Os deslocamentos que levam cada unidade a uma posição (dx e dy em frações do quadro), em mudanças de clipe. */
function mudancasDasUnidades(projeto: Projeto, deslocamentos: { unidade: Unidade; dx: number; dy: number }[]): MudancaDePosicao[] {
  const mudancas = new Map<string, MudancaDePosicao>();
  for (const { unidade, dx, dy } of deslocamentos) {
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
    for (const mudanca of deslocar(projeto, unidade.clipeIds, dx, dy)) if (!mudancas.has(mudanca.clipeId)) mudancas.set(mudanca.clipeId, mudanca);
  }
  return [...mudancas.values()];
}

/**
 * Alinhar as unidades pela caixa de todas juntas; com uma só, pelo quadro (como nos editores de imagem quando não há
 * seleção de pixels).
 */
export function alinhar(projeto: Projeto, clipeIds: string[], caixas: ReadonlyMap<string, CaixaNoQuadro>, como: Alinhamento): MudancaDePosicao[] {
  const unidades = unidadesDaSelecao(projeto, clipeIds).flatMap((unidade) => {
    const caixa = caixaDaUnidade(unidade, caixas);
    return caixa ? [{ unidade, caixa }] : [];
  });
  if (!unidades.length) return [];
  const referencia: CaixaNoQuadro =
    unidades.length === 1
      ? { x0: 0, y0: 0, x1: 1, y1: 1 }
      : {
          x0: Math.min(...unidades.map(({ caixa }) => caixa.x0)),
          y0: Math.min(...unidades.map(({ caixa }) => caixa.y0)),
          x1: Math.max(...unidades.map(({ caixa }) => caixa.x1)),
          y1: Math.max(...unidades.map(({ caixa }) => caixa.y1)),
        };
  const alvo = ponto(referencia, como);
  const horizontal = HORIZONTAIS.has(como);
  return mudancasDasUnidades(
    projeto,
    unidades.map(({ unidade, caixa }) => ({ unidade, dx: horizontal ? alvo - ponto(caixa, como) : 0, dy: horizontal ? 0 : alvo - ponto(caixa, como) })),
  );
}

/**
 * Distribuir (três ou mais): os pontos escolhidos (bordas ou centros) ficam igualmente espaçados entre o primeiro e o
 * último; "espaço" deixa o mesmo vão entre as caixas.
 */
export function distribuir(projeto: Projeto, clipeIds: string[], caixas: ReadonlyMap<string, CaixaNoQuadro>, como: Distribuicao): MudancaDePosicao[] {
  const unidades = unidadesDaSelecao(projeto, clipeIds).flatMap((unidade) => {
    const caixa = caixaDaUnidade(unidade, caixas);
    return caixa ? [{ unidade, caixa }] : [];
  });
  if (unidades.length < 3) return [];
  const horizontal = HORIZONTAIS.has(como);
  if (como === "espacoH" || como === "espacoV") {
    const inicio = (c: CaixaNoQuadro) => (horizontal ? c.x0 : c.y0);
    const fim = (c: CaixaNoQuadro) => (horizontal ? c.x1 : c.y1);
    const ordem = [...unidades].sort((a, b) => inicio(a.caixa) - inicio(b.caixa));
    const total = fim(ordem[ordem.length - 1].caixa) - inicio(ordem[0].caixa);
    const ocupado = ordem.reduce((soma, { caixa }) => soma + fim(caixa) - inicio(caixa), 0);
    const vao = (total - ocupado) / (ordem.length - 1);
    let cursor = inicio(ordem[0].caixa);
    return mudancasDasUnidades(
      projeto,
      ordem.map(({ unidade, caixa }) => {
        const d = cursor - inicio(caixa);
        cursor += fim(caixa) - inicio(caixa) + vao;
        return { unidade, dx: horizontal ? d : 0, dy: horizontal ? 0 : d };
      }),
    );
  }
  const ordem = [...unidades].sort((a, b) => ponto(a.caixa, como) - ponto(b.caixa, como));
  const primeiro = ponto(ordem[0].caixa, como);
  const passo = (ponto(ordem[ordem.length - 1].caixa, como) - primeiro) / (ordem.length - 1);
  return mudancasDasUnidades(
    projeto,
    ordem.map(({ unidade, caixa }, i) => {
      const d = primeiro + passo * i - ponto(caixa, como);
      return { unidade, dx: horizontal ? d : 0, dy: horizontal ? 0 : d };
    }),
  );
}
