// Rasterizar, mesclar, achatar e carimbar (ADR 0003, onda 13.2): o plano de cada um, sem desenhar. O editor desenha
// o projeto do plano (`desenhar`) com a exportação do editor de imagem, sobe o PNG como camada de pixels e o comando
// `imagem.substituirPorPixels` troca as camadas pela nova, num passo só do desfazer.
import { ancestrais, camadaVisivel, comDescendentes, paiDaCamada } from "./arvore.ts";
import { ErroEdicao } from "./edicao.ts";
import type { Clipe, Faixa, Mesclagem, Projeto } from "./modelo.ts";

export type TipoDaMesclagem =
  | "rasterizar"
  | "rasterizarEstilo"
  | "baixo"
  | "selecionadas"
  | "visiveis"
  | "achatar"
  | "carimbarBaixo"
  | "carimbarVisiveis"
  | "grupo";

/** O que a camada nova guarda da camada de antes (as propriedades que não vão para os pixels). */
export type ManterNaCamada = {
  opacidade: number;
  mesclagem?: Mesclagem;
  contorno?: Clipe["contorno"];
  sombra?: Clipe["sombra"];
  preenchimento?: number;
  faixa: Pick<Faixa, "nome" | "rotulo" | "travas" | "vinculo" | "recortada">;
};

export type PlanoDosPixels = {
  /** O projeto que é desenhado (só as camadas que entram, já com as propriedades certas). */
  desenhar: Projeto;
  /** As camadas que saem (com as de dentro delas). */
  remover: string[];
  /** A camada nova entra no lugar desta (com a mesma pasta); null: no topo de tudo. */
  lugar: string | null;
  nome: string;
  manter: ManterNaCamada;
  /** A camada nova é o fundo (Achatar imagem): fica embaixo, com a transparência e a posição travadas. */
  fundo?: boolean;
  /** Camada a partir do fundo: a nova (a cor do fundo pintada) fica embaixo de todas e a imagem perde a cor de fundo. */
  doFundoDoDocumento?: boolean;
};

const NADA: ManterNaCamada = { opacidade: 1, faixa: {} };

/** As camadas (faixas com clipe, sem a principal). */
function camadas(projeto: Projeto): Faixa[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes[0]);
}

/** A faixa com o clipe sem a opacidade e a mesclagem dele (e sem os estilos, quando pedido). */
function neutra(faixa: Faixa, semEstilo: boolean): Faixa {
  const clipe: Clipe = { ...faixa.clipes[0], transformacao: { ...faixa.clipes[0].transformacao, opacidade: 1 } };
  delete clipe.mesclagem;
  if (semEstilo) {
    delete clipe.contorno;
    delete clipe.sombra;
    delete clipe.preenchimento;
  }
  return { ...faixa, oculta: false, clipes: [clipe] };
}

/**
 * O projeto com só estas camadas (e as de dentro das pastas delas), na ordem de sempre; quem estava numa pasta que
 * não entrou vai para a raiz. `neutras` perdem a opacidade e a mesclagem (ficam na camada nova).
 */
export function projetoSoCom(projeto: Projeto, faixaIds: string[], { neutras = new Set<string>(), semEstilo = false, comFundo = false }: { neutras?: ReadonlySet<string>; semEstilo?: boolean; comFundo?: boolean } = {}): Projeto {
  const ids = new Set(faixaIds.flatMap((id) => comDescendentes(projeto, id).map((faixa) => faixa.id)));
  const faixas = projeto.faixas.flatMap((faixa): Faixa[] => {
    if (faixa.tipo === "principal") return [faixa];
    if (!ids.has(faixa.id)) return [];
    const ajustada = neutras.has(faixa.id) ? neutra(faixa, semEstilo) : faixa;
    return [ajustada.pai && !ids.has(ajustada.pai) ? { ...ajustada, pai: null } : ajustada];
  });
  return { ...projeto, faixas, fundo: comFundo ? projeto.fundo : { ...projeto.fundo, transparente: true } };
}

/** As do mesmo pai, de cima para baixo. */
function irmas(projeto: Projeto, faixa: Faixa): Faixa[] {
  const pai = paiDaCamada(projeto, faixa);
  return camadas(projeto).filter((item) => paiDaCamada(projeto, item) === pai);
}

/** O que a camada nova guarda de uma camada (as propriedades que não entram nos pixels). */
function propriedadesDe(faixa: Faixa, comEstilo: boolean): ManterNaCamada {
  const clipe = faixa.clipes[0];
  const mesclagem = clipe.mesclagem === "passagem" ? undefined : clipe.mesclagem;
  return {
    opacidade: clipe.transformacao.opacidade,
    mesclagem,
    ...(comEstilo ? { contorno: clipe.contorno, sombra: clipe.sombra, preenchimento: clipe.preenchimento } : {}),
    faixa: { nome: faixa.nome, rotulo: faixa.rotulo, travas: faixa.travas, vinculo: faixa.vinculo, recortada: faixa.recortada },
  };
}

/** As visíveis da raiz (as de dentro vêm com elas), de cima para baixo. */
function visiveisDaRaiz(projeto: Projeto): Faixa[] {
  return camadas(projeto).filter((faixa) => !paiDaCamada(projeto, faixa) && camadaVisivel(projeto, faixa));
}

/**
 * O plano de rasterizar, mesclar, achatar ou carimbar as escolhidas (`faixaIds`, de cima para baixo). `nomeDe` dá o
 * nome de cada camada (o do painel). Lança ErroEdicao com a mensagem para a pessoa quando não dá.
 */
export function planoDosPixels(
  projeto: Projeto,
  tipo: TipoDaMesclagem,
  faixaIds: string[],
  nomeDe: (faixa: Faixa) => string,
  /** A altura da caixa da camada em frações do quadro (a prévia mede): o estilo guardado é refeito na caixa nova. */
  alturaDaCaixa: (faixa: Faixa) => number | null = () => null,
): PlanoDosPixels {
  const todas = camadas(projeto);
  const escolhidas = todas.filter((faixa) => faixaIds.includes(faixa.id));
  const primeira = escolhidas[0];
  if (escolhidas.some((faixa) => faixa.travada) && tipo !== "carimbarVisiveis") throw new ErroEdicao("Uma das camadas está travada.");
  switch (tipo) {
    case "rasterizar":
    case "rasterizarEstilo": {
      if (escolhidas.length !== 1) throw new ErroEdicao("Escolha uma camada para rasterizar.");
      const clipe = primeira.clipes[0];
      if (clipe.pasta || clipe.ajuste) throw new ErroEdicao("Grupos e camadas de ajuste não têm pixels para rasterizar.");
      if (tipo === "rasterizar" && clipe.pixels) throw new ErroEdicao("A camada já é de pixels.");
      if (tipo === "rasterizarEstilo" && !clipe.contorno && !clipe.sombra) throw new ErroEdicao("A camada não tem estilo para rasterizar.");
      const comEstilo = tipo === "rasterizarEstilo";
      // Rasterizar a camada guarda o estilo para continuar editável; rasterizar o estilo grava ele nos pixels
      const manter = propriedadesDe(primeira, !comEstilo);
      // O contorno e a sombra são medidos na altura da caixa da camada; a nova cobre o quadro inteiro
      const fator = alturaDaCaixa(primeira) ?? 1;
      if (manter.contorno) manter.contorno = { ...manter.contorno, largura: manter.contorno.largura * fator };
      if (manter.sombra) manter.sombra = { ...manter.sombra, distancia: manter.sombra.distancia * fator, desfoque: manter.sombra.desfoque * fator };
      return {
        desenhar: projetoSoCom(projeto, [primeira.id], { neutras: new Set([primeira.id]), semEstilo: !comEstilo }),
        remover: [primeira.id],
        lugar: primeira.id,
        nome: nomeDe(primeira),
        manter,
      };
    }
    case "baixo":
    case "carimbarBaixo": {
      if (escolhidas.length !== 1) throw new ErroEdicao("Escolha uma camada para mesclar com a de baixo.");
      if (primeira.clipes[0].pasta) return planoDosPixels(projeto, "grupo", faixaIds, nomeDe);
      const lista = irmas(projeto, primeira);
      const debaixo = lista[lista.indexOf(primeira) + 1];
      if (!debaixo) throw new ErroEdicao("Não há camada embaixo desta para mesclar.");
      if (debaixo.clipes[0].pasta || debaixo.clipes[0].ajuste) throw new ErroEdicao("A camada de baixo é um grupo ou um ajuste: não dá para mesclar nela.");
      if (debaixo.travada) throw new ErroEdicao("A camada de baixo está travada.");
      return {
        desenhar: projetoSoCom(projeto, [primeira.id, debaixo.id], { neutras: new Set([debaixo.id]) }),
        remover: tipo === "baixo" ? [primeira.id, debaixo.id] : [debaixo.id],
        lugar: debaixo.id,
        nome: nomeDe(debaixo),
        manter: { ...propriedadesDe(debaixo, false), faixa: { ...propriedadesDe(debaixo, false).faixa } },
      };
    }
    case "selecionadas": {
      if (escolhidas.length < 2) throw new ErroEdicao("Escolha duas camadas ou mais para mesclar.");
      // As de dentro de uma pasta escolhida vêm com ela
      const topo = escolhidas.filter((faixa) => !ancestrais(projeto, faixa).some((pasta) => faixaIds.includes(pasta.id)));
      return { desenhar: projetoSoCom(projeto, topo.map((faixa) => faixa.id)), remover: topo.map((faixa) => faixa.id), lugar: topo[0].id, nome: nomeDe(topo[0]), manter: NADA };
    }
    case "grupo": {
      if (escolhidas.length !== 1 || !primeira.clipes[0].pasta) throw new ErroEdicao("Escolha um grupo para mesclar.");
      return {
        desenhar: projetoSoCom(projeto, [primeira.id], { neutras: new Set([primeira.id]) }),
        remover: [primeira.id],
        lugar: primeira.id,
        nome: nomeDe(primeira),
        manter: propriedadesDe(primeira, false),
      };
    }
    case "visiveis":
    case "carimbarVisiveis":
    case "achatar": {
      const visiveis = visiveisDaRaiz(projeto);
      if (!visiveis.length) throw new ErroEdicao("Não há camadas visíveis.");
      if (tipo === "visiveis" && visiveis.length < 2) throw new ErroEdicao("Só uma camada está visível: não há o que mesclar.");
      if (tipo !== "carimbarVisiveis" && visiveis.some((faixa) => comDescendentes(projeto, faixa.id).some((item) => item.travada))) throw new ErroEdicao("Uma das camadas visíveis está travada.");
      const ids = visiveis.map((faixa) => faixa.id);
      if (tipo === "carimbarVisiveis") return { desenhar: projetoSoCom(projeto, ids), remover: [], lugar: null, nome: "Carimbo", manter: NADA };
      if (tipo === "visiveis") return { desenhar: projetoSoCom(projeto, ids), remover: ids, lugar: ids[0], nome: nomeDe(visiveis[0]), manter: NADA };
      // Achatar: as visíveis sobre a cor do fundo, numa camada só; as ocultas são descartadas
      return {
        desenhar: projetoSoCom(projeto, ids, { comFundo: true }),
        remover: todas.filter((faixa) => !paiDaCamada(projeto, faixa)).map((faixa) => faixa.id),
        lugar: null,
        nome: "Fundo",
        manter: NADA,
        fundo: !projeto.fundo.transparente,
      };
    }
  }
}

/**
 * Troca as camadas do plano pela camada de pixels nova (a mídia já criada e com a versão no servidor), no lugar e
 * com as propriedades do plano. Devolve o projeto e o clipe novo.
 */
export function substituirPorPixels(
  projeto: Projeto,
  novoId: () => string,
  { remover, lugar, nome, manter, fundo, doFundoDoDocumento, midiaId, versao }: Omit<PlanoDosPixels, "desenhar"> & { midiaId: string; versao: number },
): { projeto: Projeto; clipeId: string } {
  const referencia = lugar ? projeto.faixas.find((faixa) => faixa.id === lugar) : null;
  if (lugar && !referencia) throw new ErroEdicao("A camada mudou enquanto os pixels eram gerados. Tente de novo.");
  const clipe: Clipe = {
    id: novoId(),
    midia_id: midiaId,
    inicio: 0,
    duracao: referencia?.clipes[0]?.duracao ?? projeto.faixas.find((faixa) => faixa.clipes[0])?.clipes[0].duracao ?? 0,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: manter.opacidade },
    recorte: { x: 0, y: 0, largura: 1, altura: 1 },
    pixels: { versao },
    ...(manter.mesclagem ? { mesclagem: manter.mesclagem } : {}),
    ...(manter.contorno ? { contorno: manter.contorno } : {}),
    ...(manter.sombra ? { sombra: manter.sombra } : {}),
    ...(manter.preenchimento !== undefined && manter.preenchimento < 1 ? { preenchimento: manter.preenchimento } : {}),
  };
  if (!clipe.duracao) clipe.duracao = projeto.faixas.flatMap((faixa) => faixa.clipes).reduce((maior, item) => Math.max(maior, item.duracao), 1);
  const faixa: Faixa = {
    id: novoId(),
    tipo: "video",
    oculta: false,
    muda: false,
    travada: false,
    clipes: [clipe],
    nome,
    pai: referencia ? paiDaCamada(projeto, referencia) : null,
    ...(manter.faixa.rotulo ? { rotulo: manter.faixa.rotulo } : {}),
    ...(manter.faixa.vinculo ? { vinculo: manter.faixa.vinculo } : {}),
    ...(manter.faixa.recortada ? { recortada: true } : {}),
    ...(fundo ? { fundo: true, travas: { transparencia: true, posicao: true } } : manter.faixa.travas ? { travas: manter.faixa.travas } : {}),
  };
  const saem = new Set(remover.flatMap((id) => comDescendentes(projeto, id).map((item) => item.id)));
  const lista: Faixa[] = [];
  for (const item of projeto.faixas) {
    if (referencia && item.id === referencia.id) lista.push(faixa);
    if (!saem.has(item.id)) lista.push(item);
  }
  if (!referencia) {
    // Sem lugar: no topo (carimbo) ou embaixo de tudo, logo acima da principal (achatar)
    if (fundo || remover.length || doFundoDoDocumento) lista.splice(Math.max(0, lista.findIndex((item) => item.tipo === "principal")), 0, faixa);
    else lista.unshift(faixa);
  }
  const comFundo = doFundoDoDocumento ? { ...projeto.fundo, transparente: true } : projeto.fundo;
  return { projeto: { ...projeto, faixas: lista, fundo: comFundo }, clipeId: clipe.id };
}
