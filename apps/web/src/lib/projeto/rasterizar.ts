// Rasterizar, mesclar, achatar e carimbar (ADR 0003, onda 13.2): o plano de cada um, sem desenhar. O editor desenha
// o projeto do plano (`desenhar`) com a exportação do editor de imagem, sobe o PNG como camada de pixels e o comando
// `imagem.substituirPorPixels` troca as camadas pela nova, num passo só do desfazer.
import { type Efeito, efeitosLigados, nomeDoEfeito } from "../imagem/estiloDeCamada.ts";
import { ancestrais, camadaVisivel, comDescendentes, paiDaCamada } from "./arvore.ts";
import { ErroEdicao } from "./edicao.ts";
import type { Clipe, Faixa, Mesclagem, Projeto } from "./modelo.ts";
import type { Afim, MascaraDePixels } from "./mascaraDePixels.ts";
import type { MascaraVetorial } from "../vetor/mascaraVetorial.ts";

export type TipoDaMesclagem =
  | "aplicarMascara"
  | "rasterizar"
  | "rasterizarEstilo"
  | "transformar"
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
  /** O estilo de camada do editor de imagem (as medidas são em pixels do documento: valem na caixa nova). */
  estilo_camada?: Clipe["estilo_camada"];
  preenchimento?: number;
  /** A máscara de camada que continua separada (rasterizar), já com a matriz da caixa nova. */
  mascara?: MascaraDePixels;
  mascaraVetorial?: MascaraVetorial;
  faixa: Pick<Faixa, "nome" | "rotulo" | "travas" | "vinculo" | "recortada">;
};

export type PlanoDosPixels = {
  /** O projeto que é desenhado (só as camadas que entram, já com as propriedades certas). */
  desenhar: Projeto;
  /** As camadas que saem (com as de dentro delas). */
  remover: string[];
  /** A camada nova entra no lugar desta (com a mesma pasta); null: no topo de tudo. */
  lugar: string | null;
  /** Sem tirar o `lugar`, a camada nova fica logo abaixo dele (e não logo acima). */
  abaixo?: boolean;
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

/** A faixa com o clipe sem a opacidade e a mesclagem dele (e sem os estilos e a máscara de camada, quando pedido). */
function neutra(faixa: Faixa, semEstilo: boolean, semMascara = false): Faixa {
  const clipe: Clipe = { ...faixa.clipes[0], transformacao: { ...faixa.clipes[0].transformacao, opacidade: 1 } };
  delete clipe.mesclagem;
  if (semMascara) {
    delete clipe.mascara_pixels;
    delete clipe.mascara_vetorial;
  }
  if (semEstilo) {
    delete clipe.contorno;
    delete clipe.sombra;
    delete clipe.estilo_camada;
    delete clipe.preenchimento;
  }
  return { ...faixa, oculta: false, clipes: [clipe] };
}

/**
 * O projeto com só estas camadas (e as de dentro das pastas delas), na ordem de sempre; quem estava numa pasta que
 * não entrou vai para a raiz. `neutras` perdem a opacidade e a mesclagem (ficam na camada nova).
 */
export function projetoSoCom(
  projeto: Projeto,
  faixaIds: string[],
  { neutras = new Set<string>(), semEstilo = false, comFundo = false, semMascara = false }: { neutras?: ReadonlySet<string>; semEstilo?: boolean; comFundo?: boolean; semMascara?: boolean } = {},
): Projeto {
  const ids = new Set(faixaIds.flatMap((id) => comDescendentes(projeto, id).map((faixa) => faixa.id)));
  const faixas = projeto.faixas.flatMap((faixa): Faixa[] => {
    if (faixa.tipo === "principal") return [faixa];
    if (!ids.has(faixa.id)) return [];
    const ajustada = neutras.has(faixa.id) ? neutra(faixa, semEstilo, semMascara) : faixa;
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
    ...(comEstilo ? { contorno: clipe.contorno, sombra: clipe.sombra, estilo_camada: clipe.estilo_camada, preenchimento: clipe.preenchimento } : {}),
    faixa: { nome: faixa.nome, rotulo: faixa.rotulo, travas: faixa.travas, vinculo: faixa.vinculo, recortada: faixa.recortada },
  };
}

/**
 * Camada › Estilo de camada › Criar camadas: um plano por efeito (o chanfro dá dois, o realce e a sombra), cada um com
 * a camada sozinha, só aquele efeito (normal e inteiro) e o conteúdo escondido; a camada nova guarda o modo e a
 * opacidade do efeito. Os de fora entram logo abaixo da camada e os de dentro logo acima, na ordem dos editores de
 * imagem (os planos já vêm na ordem de criar: cada camada nova encosta na original).
 */
export function planosDosEfeitos(projeto: Projeto, faixaId: string, nomeDe: (faixa: Faixa) => string): PlanoDosPixels[] {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  const clipe = faixa?.clipes[0];
  if (!faixa || !clipe) throw new ErroEdicao("Escolha uma camada.");
  if (faixa.travada) throw new ErroEdicao("A camada está travada.");
  const efeitos = efeitosLigados(clipe.estilo_camada);
  if (!efeitos.length) throw new ErroEdicao("A camada não tem efeitos para virar camadas.");
  type Parte = { efeito: Efeito; nome: string; modo: Mesclagem; opacidade: number; abaixo: boolean };
  const partes: Parte[] = efeitos.flatMap((efeito): Parte[] => {
    const abaixo = efeito.tipo === "sombra" || efeito.tipo === "brilho_externo";
    if (efeito.tipo !== "chanfro") return [{ efeito: { ...efeito, opacidade: 1, modo: "normal" }, nome: nomeDoEfeito(efeito.tipo), modo: efeito.modo, opacidade: efeito.opacidade, abaixo }];
    return [
      { efeito: { ...efeito, opacidade: 1, opacidade_sombra: 0, opacidade_realce: 1, modo_realce: "normal" }, nome: "Realce do chanfro", modo: efeito.modo_realce ?? "tela", opacidade: (efeito.opacidade_realce ?? 0.75) * efeito.opacidade, abaixo: false },
      { efeito: { ...efeito, opacidade: 1, opacidade_realce: 0, opacidade_sombra: 1, modo_sombra: "normal" }, nome: "Sombra do chanfro", modo: efeito.modo_sombra ?? "multiplicar", opacidade: (efeito.opacidade_sombra ?? 0.75) * efeito.opacidade, abaixo: false },
    ];
  });
  const ordem: Efeito["tipo"][] = ["sombra", "brilho_externo", "sobreposicao_padrao", "sobreposicao_degrade", "sobreposicao_cor", "cetim", "brilho_interno", "sombra_interna", "tracado", "chanfro"];
  const porOrdem = (a: Parte, b: Parte) => ordem.indexOf(a.efeito.tipo) - ordem.indexOf(b.efeito.tipo);
  // Os de baixo de baixo para cima (cada um encosta embaixo da original); os de cima de cima para baixo
  const emOrdem = [...partes.filter((parte) => parte.abaixo).sort(porOrdem), ...partes.filter((parte) => !parte.abaixo).sort(porOrdem).reverse()];
  return emOrdem.map((parte) => {
    const so: Clipe = { ...clipe, transformacao: { ...clipe.transformacao, opacidade: 1 }, preenchimento: 0, estilo_camada: { ...clipe.estilo_camada!, ligado: true, efeitos: [parte.efeito] } };
    delete so.mesclagem;
    delete so.contorno;
    delete so.sombra;
    const comSo = { ...projeto, faixas: projeto.faixas.map((item) => (item.id === faixa.id ? { ...item, oculta: false, clipes: [so] } : item)) };
    return {
      desenhar: projetoSoCom(comSo, [faixa.id]),
      remover: [],
      lugar: faixa.id,
      abaixo: parte.abaixo,
      nome: `${parte.nome} de ${nomeDe(faixa)}`,
      manter: { opacidade: parte.opacidade, ...(parte.modo === "normal" ? {} : { mesclagem: parte.modo }), faixa: {} },
    };
  });
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
  /**
   * A matriz de uma máscara da camada (a de pixels, sem `mascara`) para a caixa do quadro inteiro (a camada nova): ela
   * continua no mesmo lugar.
   */
  matrizNoQuadro: (faixa: Faixa, mascara?: Pick<MascaraDePixels, "vinculada" | "matriz">) => Afim | null = () => null,
): PlanoDosPixels {
  const todas = camadas(projeto);
  const escolhidas = todas.filter((faixa) => faixaIds.includes(faixa.id));
  const primeira = escolhidas[0];
  if (escolhidas.some((faixa) => faixa.travada) && tipo !== "carimbarVisiveis") throw new ErroEdicao("Uma das camadas está travada.");
  switch (tipo) {
    case "aplicarMascara": {
      if (escolhidas.length !== 1 || !primeira.clipes[0].mascara_pixels) throw new ErroEdicao("Escolha uma camada com máscara para aplicar.");
      // A máscara vai para os pixels; a opacidade, a mesclagem e o estilo continuam na camada
      return {
        desenhar: projetoSoCom(projeto, [primeira.id], { neutras: new Set([primeira.id]), semEstilo: true }),
        remover: [primeira.id],
        lugar: primeira.id,
        nome: nomeDe(primeira),
        manter: propriedadesDe(primeira, true),
      };
    }
    case "rasterizar":
    case "rasterizarEstilo": {
      if (escolhidas.length !== 1) throw new ErroEdicao("Escolha uma camada para rasterizar.");
      const clipe = primeira.clipes[0];
      if (clipe.pasta || clipe.ajuste) throw new ErroEdicao("Grupos e camadas de ajuste não têm pixels para rasterizar.");
      if (tipo === "rasterizar" && clipe.pixels) throw new ErroEdicao("A camada já é de pixels.");
      if (tipo === "rasterizarEstilo" && !clipe.contorno && !clipe.sombra && !clipe.estilo_camada?.efeitos.length) throw new ErroEdicao("A camada não tem estilo para rasterizar.");
      const comEstilo = tipo === "rasterizarEstilo";
      // Rasterizar a camada guarda o estilo para continuar editável; rasterizar o estilo grava ele nos pixels
      const manter = propriedadesDe(primeira, !comEstilo);
      // O contorno e a sombra são medidos na altura da caixa da camada; a nova cobre o quadro inteiro
      const fator = alturaDaCaixa(primeira) ?? 1;
      if (manter.contorno) manter.contorno = { ...manter.contorno, largura: manter.contorno.largura * fator };
      if (manter.sombra) manter.sombra = { ...manter.sombra, distancia: manter.sombra.distancia * fator, desfoque: manter.sombra.desfoque * fator };
      // A máscara de camada continua separada: os pixels saem sem ela, e ela passa para a caixa nova
      const mascara = clipe.mascara_pixels;
      const matriz = mascara ? matrizNoQuadro(primeira) : null;
      if (mascara && matriz) manter.mascara = { ...mascara, vinculada: true, matriz };
      // A vetorial também continua vetorial, na caixa nova
      const vetorial = clipe.mascara_vetorial;
      const matrizVetorial = vetorial ? matrizNoQuadro(primeira, vetorial) : null;
      if (vetorial && matrizVetorial) manter.mascaraVetorial = { ...vetorial, vinculada: true, matriz: matrizVetorial };
      return {
        desenhar: projetoSoCom(projeto, [primeira.id], { neutras: new Set([primeira.id]), semEstilo: !comEstilo, semMascara: Boolean(manter.mascara || manter.mascaraVetorial) }),
        remover: [primeira.id],
        lugar: primeira.id,
        nome: nomeDe(primeira),
        manter,
      };
    }
    case "transformar": {
      // A transformação que não cabe na posição (esticar, inclinar, distorcer, perspectiva, deformar) ou a cópia
      // transformada: a camada desenhada sozinha, sem o estilo, que continua editável na camada nova
      if (escolhidas.length !== 1) throw new ErroEdicao("Escolha uma camada para transformar.");
      const clipe = primeira.clipes[0];
      if (clipe.pasta || clipe.ajuste || clipe.camada_de_preenchimento) throw new ErroEdicao("Grupos, camadas de ajuste e de preenchimento não se transformam assim.");
      if (clipe.mascara_pixels || clipe.mascara_vetorial) throw new ErroEdicao("Aplique ou exclua a máscara da camada antes de distorcer.");
      const manter = propriedadesDe(primeira, true);
      const fator = alturaDaCaixa(primeira) ?? 1;
      if (manter.contorno) manter.contorno = { ...manter.contorno, largura: manter.contorno.largura * fator };
      if (manter.sombra) manter.sombra = { ...manter.sombra, distancia: manter.sombra.distancia * fator, desfoque: manter.sombra.desfoque * fator };
      return { desenhar: projetoSoCom(projeto, [primeira.id], { neutras: new Set([primeira.id]), semEstilo: true }), remover: [primeira.id], lugar: primeira.id, nome: nomeDe(primeira), manter };
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
  { remover, lugar, nome, manter, fundo, doFundoDoDocumento, abaixo, midiaId, versao }: Omit<PlanoDosPixels, "desenhar"> & { midiaId: string; versao: number },
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
    ...(manter.estilo_camada ? { estilo_camada: manter.estilo_camada } : {}),
    ...(manter.preenchimento !== undefined && manter.preenchimento < 1 ? { preenchimento: manter.preenchimento } : {}),
    ...(manter.mascara ? { mascara_pixels: manter.mascara } : {}),
    ...(manter.mascaraVetorial ? { mascara_vetorial: manter.mascaraVetorial } : {}),
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
    if (referencia && item.id === referencia.id && !abaixo) lista.push(faixa);
    if (!saem.has(item.id)) lista.push(item);
    if (referencia && item.id === referencia.id && abaixo) lista.push(faixa);
  }
  if (!referencia) {
    // Sem lugar: no topo (carimbo) ou embaixo de tudo, logo acima da principal (achatar)
    if (fundo || remover.length || doFundoDoDocumento) lista.splice(Math.max(0, lista.findIndex((item) => item.tipo === "principal")), 0, faixa);
    else lista.unshift(faixa);
  }
  const comFundo = doFundoDoDocumento ? { ...projeto.fundo, transparente: true } : projeto.fundo;
  return { projeto: { ...projeto, faixas: lista, fundo: comFundo }, clipeId: clipe.id };
}
