// O projeto de imagem (editor de imagem): o mesmo documento do vídeo, em que cada camada é uma faixa com um
// clipe só, no começo. Assim os comandos do clipe (posição, cor, efeito, cantos, texto...) valem sem mudar nada,
// e o desfazer, o salvamento e o conflito são os do editor de vídeo. A faixa principal fica vazia, embaixo de
// tudo (a API exige uma). As camadas ficam em qualquer ordem: um texto pode ficar embaixo de uma foto.
import { segundosParaTicks } from "../tempo.ts";
import { type Contexto, ErroEdicao } from "./edicao.ts";
import { COR_PADRAO } from "./cor.ts";
import { caixaDoClipe, type Tamanho } from "./geometria.ts";
import { ancestrais, comDescendentes, paiDaCamada } from "./arvore.ts";
import { type Clipe, type CorDoRotulo, type Faixa, type Projeto, RECORTE_PADRAO, type Transformacao, TRANSFORMACAO_PADRAO, type TravasDaCamada } from "./modelo.ts";
import { type CamadaPronta, encaixarNaCaixa } from "./modelosDeImagem.ts";
import type { Texto } from "./texto.ts";

/** Quanto dura o clipe de cada camada: a imagem não tem tempo, mas a linha do tempo pede uma duração. */
export const DURACAO_DA_CAMADA = segundosParaTicks(5);

/** A escala com que entra uma imagem com transparência (logo, forma). */
export const ESCALA_DO_RECORTADO = 0.5;

export type TamanhoDaImagem = { largura: number; altura: number };

/** Os mesmos limites de core/modelos/projeto.py. */
export const LADO_MINIMO = 16;
export const LADO_MAXIMO = 8192;
export const AREA_MAXIMA = 36_000_000;

export const TAMANHOS_PRONTOS: {
  id: string;
  nome: string;
  largura: number;
  altura: number;
}[] = [
  { id: "post-quadrado", nome: "Post quadrado", largura: 1080, altura: 1080 },
  { id: "post-retrato", nome: "Post retrato", largura: 1080, altura: 1350 },
  { id: "story", nome: "Story e status", largura: 1080, altura: 1920 },
  { id: "capa-video", nome: "Capa de vídeo", largura: 1280, altura: 720 },
  { id: "banner", nome: "Banner largo", largura: 1500, altura: 500 },
  { id: "apresentacao", nome: "Slide", largura: 1920, altura: 1080 },
  { id: "a4", nome: "Folha A4 (impressão)", largura: 2480, altura: 3508 },
];

export function ehImagem(projeto: Pick<Projeto, "tipo">): boolean {
  return projeto.tipo === "imagem";
}

/** O tamanho do quadro do projeto de imagem (o de vídeo não tem: vale a proporção). */
export function tamanhoDaImagem(projeto: Projeto): TamanhoDaImagem {
  return projeto.tamanho ?? { largura: 1080, altura: 1080 };
}

/** As camadas de cima para baixo: a faixa (que guarda esconder e travar) e o clipe dela. */
export function camadasDaImagem(projeto: Projeto): { faixa: Faixa; clipe: Clipe }[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes.length).map((faixa) => ({ faixa, clipe: faixa.clipes[0] }));
}

function clipeDaCamada(id: string, extra: Partial<Clipe>): Clipe {
  return {
    id,
    midia_id: null,
    inicio: 0,
    duracao: DURACAO_DA_CAMADA,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: { ...TRANSFORMACAO_PADRAO },
    recorte: { ...RECORTE_PADRAO },
    ...extra,
  };
}

/**
 * Uma faixa nova logo acima de `acima` (a camada escolhida no painel), na mesma pasta dela, como nos editores
 * profissionais; sem ela, por cima de todas.
 */
function porNoTopo(projeto: Projeto, faixa: Faixa, acima?: string | null): Projeto {
  const indice = acima ? projeto.faixas.findIndex((item) => item.id === acima && item.tipo !== "principal") : -1;
  if (indice < 0) return { ...projeto, faixas: [faixa, ...projeto.faixas] };
  const referencia = projeto.faixas[indice];
  // Acima de uma pasta, a camada nova fica fora dela (ao lado), como lá
  const nova = { ...faixa, pai: paiDaCamada(projeto, referencia) };
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 0, nova);
  return { ...projeto, faixas };
}

function faixaNova(ctx: Contexto, tipo: "video" | "texto", clipe: Clipe): Faixa {
  return {
    id: ctx.novoId(),
    tipo,
    oculta: false,
    muda: false,
    travada: false,
    clipes: [clipe],
  };
}

/** `transformacao`: onde a camada entra (a forma desenhada com a ferramenta Forma), no lugar do padrão. */
export function adicionarCamadaDeMidia(projeto: Projeto, ctx: Contexto, midiaId: string, transformacao?: Partial<Transformacao>, acima?: string | null): { projeto: Projeto; clipeId: string } {
  const info = ctx.midia(midiaId);
  if (!info) throw new ErroEdicao("A mídia ainda não está pronta.");
  if (!info.imagem) throw new ErroEdicao("No editor de imagem entram imagens (JPG, PNG ou WebP).");
  const clipe = clipeDaCamada(ctx.novoId(), { midia_id: midiaId });
  // A foto cabe no quadro; o logo e a forma (com transparência) entram com metade do tamanho, por cima dela
  if (info.transparente)
    clipe.transformacao = {
      ...clipe.transformacao,
      escala: ESCALA_DO_RECORTADO,
    };
  if (transformacao) clipe.transformacao = { ...clipe.transformacao, ...transformacao };
  return {
    projeto: porNoTopo(projeto, faixaNova(ctx, "video", clipe), acima),
    clipeId: clipe.id,
  };
}

/**
 * Uma camada de pixels nova (a mídia já criada, vazia, do tamanho da imagem) acima da escolhida, cobrindo o quadro.
 * Não depende da mídia estar na biblioteca da tela: a pessoa começa a pintar logo depois de criar.
 */
export function adicionarCamadaDePixels(projeto: Projeto, ctx: Contexto, midiaId: string, nome: string, acima?: string | null): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { midia_id: midiaId, pixels: { versao: 0 } });
  return { projeto: porNoTopo(projeto, { ...faixaNova(ctx, "video", clipe), nome }, acima), clipeId: clipe.id };
}

/** A camada de pixels passa a mostrar outra versão do PNG (um traço novo, ou o desfazer). */
export function trocarVersaoDosPixels(projeto: Projeto, clipeId: string, versao: number): Projeto {
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => clipe.id === clipeId)) return faixa;
    if (faixa.travada) throw new ErroEdicao("A camada está travada. Destrave o cadeado para pintar.");
    return {
      ...faixa,
      clipes: faixa.clipes.map((clipe) => {
        if (clipe.id !== clipeId) return clipe;
        if (!clipe.pixels) throw new ErroEdicao("Esta camada não é de pixels.");
        achou = true;
        return { ...clipe, pixels: { versao } };
      }),
    };
  });
  if (!achou) throw new ErroEdicao("Essa camada não existe mais.");
  return { ...projeto, faixas };
}

/** Uma camada de ajuste acima da escolhida (ou de todas): muda a cor do que está embaixo dela. */
export function adicionarCamadaDeAjuste(projeto: Projeto, ctx: Contexto, acima?: string | null): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { ajuste: true });
  return { projeto: porNoTopo(projeto, faixaNova(ctx, "video", clipe), acima), clipeId: clipe.id };
}

/** `transformacao`: onde o texto entra (o clique da ferramenta Texto), no lugar do meio. */
export function adicionarCamadaDeTexto(projeto: Projeto, ctx: Contexto, texto: Texto, transformacao?: Partial<Transformacao>, acima?: string | null): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { texto });
  if (transformacao) clipe.transformacao = { ...clipe.transformacao, ...transformacao };
  return {
    projeto: porNoTopo(projeto, faixaNova(ctx, "texto", clipe), acima),
    clipeId: clipe.id,
  };
}

function indiceDaCamada(projeto: Projeto, faixaId: string): number {
  const indice = projeto.faixas.findIndex((faixa) => faixa.id === faixaId && faixa.tipo !== "principal");
  if (indice < 0) throw new ErroEdicao("Esta camada não existe mais.");
  return indice;
}

/** As camadas na mesma pasta que a faixa (ela inclusive), de cima para baixo. */
function irmasDe(projeto: Projeto, faixa: Faixa): Faixa[] {
  const pai = paiDaCamada(projeto, faixa);
  return projeto.faixas.filter((item) => item.tipo !== "principal" && item.clipes.length && paiDaCamada(projeto, item) === pai);
}

/** Troca a ordem das irmãs: cada uma vai para a vaga (o índice na lista) de quem estava naquela posição. */
function comIrmasEmOrdem(projeto: Projeto, antes: Faixa[], depois: Faixa[]): Projeto {
  const vagas = antes.map((faixa) => projeto.faixas.indexOf(faixa));
  const faixas = [...projeto.faixas];
  vagas.forEach((vaga, i) => {
    faixas[vaga] = depois[i];
  });
  return { ...projeto, faixas };
}

/**
 * Sobe (para a frente) ou desce (para trás) uma posição entre as camadas da mesma pasta, vai direto para o topo ou o
 * fundo dela, ou vai para a posição dada (0 é a de cima). As camadas de dentro de uma pasta andam com ela.
 */
export function moverCamada(projeto: Projeto, faixaId: string, para: "cima" | "baixo" | "topo" | "fundo" | number): Projeto {
  const faixa = projeto.faixas[indiceDaCamada(projeto, faixaId)];
  const irmas = irmasDe(projeto, faixa);
  const indice = irmas.indexOf(faixa);
  const outras = irmas.filter((item) => item !== faixa);
  const destino =
    typeof para === "number"
      ? Math.min(outras.length, Math.max(0, Math.round(para)))
      : para === "topo"
        ? 0
        : para === "fundo"
          ? outras.length
          : para === "cima"
            ? Math.max(0, indice - 1)
            : Math.min(outras.length, indice + 1);
  outras.splice(destino, 0, faixa);
  return comIrmasEmOrdem(projeto, irmas, outras);
}

/** Organizar › Inverter: as camadas escolhidas (da mesma pasta) trocam de ordem entre si. */
export function inverterCamadas(projeto: Projeto, faixaIds: string[]): Projeto {
  const escolhidas = projeto.faixas.filter((faixa) => faixaIds.includes(faixa.id) && faixa.tipo !== "principal");
  if (escolhidas.length < 2) throw new ErroEdicao("Escolha duas camadas ou mais para inverter a ordem.");
  const pai = paiDaCamada(projeto, escolhidas[0]);
  if (escolhidas.some((faixa) => paiDaCamada(projeto, faixa) !== pai)) throw new ErroEdicao("As camadas para inverter precisam estar na mesma pasta.");
  const faixas = [...projeto.faixas];
  const vagas = escolhidas.map((faixa) => faixas.indexOf(faixa));
  [...escolhidas].reverse().forEach((faixa, i) => {
    faixas[vagas[i]] = faixa;
  });
  return { ...projeto, faixas };
}

/**
 * Leva as camadas (com o que há dentro das pastas) para a pasta `pai` (null é a raiz), logo acima de `acimaDe` (uma
 * camada dessa pasta) ou no fundo dela. É o arrastar do painel Camadas.
 */
export function moverCamadasPara(projeto: Projeto, faixaIds: string[], pai: string | null, acimaDe: string | null): Projeto {
  const pasta = pai ? projeto.faixas.find((faixa) => faixa.id === pai) : null;
  if (pai && !pasta?.clipes[0]?.pasta) throw new ErroEdicao("Essa pasta não existe mais.");
  // Só as de cima: quem está dentro de uma pasta que também vai anda junto com ela
  const escolhidas = projeto.faixas.filter(
    (faixa) => faixaIds.includes(faixa.id) && faixa.tipo !== "principal" && !ancestrais(projeto, faixa).some((ancestral) => faixaIds.includes(ancestral.id)),
  );
  if (!escolhidas.length) return projeto;
  if (pasta && escolhidas.some((faixa) => faixa.id === pasta.id || ancestrais(projeto, pasta).some((ancestral) => ancestral.id === faixa.id))) {
    throw new ErroEdicao("Uma pasta não entra dentro dela mesma.");
  }
  if (escolhidas.some((faixa) => faixa.travada)) throw new ErroEdicao("Uma das camadas está travada.");
  const blocos = escolhidas.map((faixa) => comDescendentes(projeto, faixa.id));
  const ids = new Set(blocos.flat().map((faixa) => faixa.id));
  const restantes = projeto.faixas.filter((faixa) => !ids.has(faixa.id));
  const movidas = blocos.flatMap((bloco) => bloco.map((faixa) => (faixa.id === bloco[0].id ? { ...faixa, pai } : faixa)));
  let vaga = acimaDe ? restantes.findIndex((faixa) => faixa.id === acimaDe) : -1;
  if (vaga < 0) {
    // No fundo da pasta: logo depois da última camada dela (ou da própria pasta); na raiz, logo acima da principal
    const daPasta = restantes.filter((faixa) => faixa.tipo !== "principal" && paiDaCamada({ ...projeto, faixas: restantes }, faixa) === pai);
    const ultima = daPasta[daPasta.length - 1];
    vaga = ultima ? restantes.indexOf(ultima) + 1 : pasta ? restantes.indexOf(pasta) + 1 : restantes.findIndex((faixa) => faixa.tipo === "principal");
    if (vaga < 0) vaga = restantes.length;
  }
  return { ...projeto, faixas: [...restantes.slice(0, vaga), ...movidas, ...restantes.slice(vaga)] };
}

/**
 * Camada › Agrupar camadas (Ctrl+G): uma pasta nova no lugar da de cima das escolhidas, com elas dentro (na ordem de
 * antes). A pasta começa aberta, com a mesclagem Passagem.
 */
export function agruparCamadas(projeto: Projeto, ctx: Contexto, faixaIds: string[]): { projeto: Projeto; clipeId: string } {
  const escolhidas = projeto.faixas.filter((faixa) => faixaIds.includes(faixa.id) && faixa.tipo !== "principal");
  const pasta: Faixa = {
    ...faixaNova(ctx, "video", clipeDaCamada(ctx.novoId(), { pasta: true, mesclagem: "passagem" })),
    pai: escolhidas.length ? paiDaCamada(projeto, escolhidas[0]) : null,
    aberta: true,
    nome: `Grupo ${projeto.faixas.filter((faixa) => faixa.clipes[0]?.pasta).length + 1}`,
  };
  // Sem camadas escolhidas: uma pasta vazia no topo (o botão de pasta do painel)
  if (!escolhidas.length) return { projeto: porNoTopo(projeto, pasta), clipeId: pasta.clipes[0].id };
  const faixas = [...projeto.faixas];
  faixas.splice(faixas.indexOf(escolhidas[0]), 0, pasta);
  const comPasta = { ...projeto, faixas };
  return { projeto: moverCamadasPara(comPasta, escolhidas.map((faixa) => faixa.id), pasta.id, null), clipeId: pasta.clipes[0].id };
}

/** Camada › Desagrupar (Ctrl+Shift+G): a pasta sai e as camadas de dentro ficam onde ela estava. */
export function desagruparCamadas(projeto: Projeto, faixaId: string): Projeto {
  const pasta = projeto.faixas.find((faixa) => faixa.id === faixaId);
  if (!pasta?.clipes[0]?.pasta) throw new ErroEdicao("Escolha uma pasta para desagrupar.");
  if (pasta.travada) throw new ErroEdicao("A pasta está travada.");
  const pai = paiDaCamada(projeto, pasta);
  return { ...projeto, faixas: projeto.faixas.filter((faixa) => faixa !== pasta).map((faixa) => (faixa.pai === pasta.id ? { ...faixa, pai } : faixa)) };
}

export type MudancaDaCamada = {
  nome?: string | null;
  rotulo?: CorDoRotulo | null;
  travas?: TravasDaCamada | null;
  recortada?: boolean;
  aberta?: boolean;
  oculta?: boolean;
  travada?: boolean;
  /** O preenchimento do clipe (0 a 1): a opacidade da camada sem os estilos. */
  preenchimento?: number;
};

/** O nome, a cor do rótulo, as travas, o recorte na de baixo, a pasta aberta no painel, o olho e o preenchimento. */
export function mudarCamada(projeto: Projeto, faixaIds: string[], mudanca: MudancaDaCamada): Projeto {
  if (mudanca.nome !== undefined && mudanca.nome !== null && !mudanca.nome.trim()) throw new ErroEdicao("A camada precisa de um nome.");
  const nome = mudanca.nome === undefined ? undefined : mudanca.nome?.trim().slice(0, 60) || null;
  return {
    ...projeto,
    faixas: projeto.faixas.map((faixa) => {
      if (!faixaIds.includes(faixa.id) || faixa.tipo === "principal") return faixa;
      // Mudar o recorte e o preenchimento mexe no que aparece: travada, não muda (as outras são do painel)
      if ((mudanca.recortada !== undefined || mudanca.preenchimento !== undefined) && faixa.travada) throw new ErroEdicao("A camada está travada.");
      const clipe = faixa.clipes[0];
      const preenchimento = mudanca.preenchimento === undefined || clipe?.pasta ? undefined : Math.min(1, Math.max(0, mudanca.preenchimento));
      return {
        ...faixa,
        ...(mudanca.oculta !== undefined ? { oculta: mudanca.oculta } : {}),
        ...(mudanca.travada !== undefined ? { travada: mudanca.travada } : {}),
        ...(preenchimento !== undefined && clipe ? { clipes: [preenchimentoNoClipe(clipe, preenchimento), ...faixa.clipes.slice(1)] } : {}),
        ...(nome !== undefined ? { nome } : {}),
        ...(mudanca.rotulo !== undefined ? { rotulo: mudanca.rotulo } : {}),
        ...(mudanca.travas !== undefined ? { travas: travasJuntas(faixa.travas, mudanca.travas) } : {}),
        ...(mudanca.recortada !== undefined ? { recortada: mudanca.recortada } : {}),
        ...(mudanca.aberta !== undefined ? { aberta: mudanca.aberta } : {}),
      };
    }),
  };
}

/** As travas da camada com as mudadas (null tira todas); sem nenhuma ligada, o campo sai. */
function travasJuntas(atuais: TravasDaCamada | null | undefined, mudadas: TravasDaCamada | null): TravasDaCamada | null {
  if (!mudadas) return null;
  const juntas = { ...atuais, ...mudadas };
  const ligadas = Object.fromEntries(Object.entries(juntas).filter(([, valor]) => valor)) as TravasDaCamada;
  return Object.keys(ligadas).length ? ligadas : null;
}

/** O clipe com o preenchimento; o 100% tira o campo, para o projeto ficar como antes. */
function preenchimentoNoClipe(clipe: Clipe, preenchimento: number): Clipe {
  if (preenchimento < 1) return { ...clipe, preenchimento };
  const semCampo = { ...clipe };
  delete semCampo.preenchimento;
  return semCampo;
}

/**
 * Alt + clique no olho: só esta camada aparece (com as pastas em volta e o que está dentro dela); se já era assim,
 * todas voltam a aparecer.
 */
export function soEstaVisivel(projeto: Projeto, faixaId: string): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa || faixa.tipo === "principal") throw new ErroEdicao("Essa camada não existe mais.");
  const ficam = new Set([...comDescendentes(projeto, faixaId), ...ancestrais(projeto, faixa)].map((item) => item.id));
  const outras = projeto.faixas.filter((item) => item.tipo !== "principal" && item.clipes.length && !ficam.has(item.id));
  const jaEstava = outras.every((item) => item.oculta) && [...ficam].every((id) => !projeto.faixas.find((item) => item.id === id)?.oculta);
  return {
    ...projeto,
    faixas: projeto.faixas.map((item) => {
      if (item.tipo === "principal" || !item.clipes.length) return item;
      const oculta = jaEstava ? false : !ficam.has(item.id);
      return item.oculta === oculta ? item : { ...item, oculta };
    }),
  };
}

/** Vincular camadas (todas com o mesmo vínculo) ou desvincular (`ligar` falso). */
export function vincularCamadas(projeto: Projeto, ctx: Contexto, faixaIds: string[], ligar: boolean): Projeto {
  if (ligar && faixaIds.length < 2) throw new ErroEdicao("Escolha duas camadas ou mais para vincular.");
  const vinculo = ligar ? ctx.novoId() : null;
  return { ...projeto, faixas: projeto.faixas.map((faixa) => (faixaIds.includes(faixa.id) ? { ...faixa, vinculo } : faixa)) };
}

export function apagarCamada(projeto: Projeto, faixaId: string): Projeto {
  indiceDaCamada(projeto, faixaId);
  const saem = comDescendentes(projeto, faixaId);
  if (saem.some((faixa) => faixa.travada)) throw new ErroEdicao("A camada está travada. Destrave o cadeado para apagar.");
  const ids = new Set(saem.map((faixa) => faixa.id));
  return { ...projeto, faixas: projeto.faixas.filter((faixa) => !ids.has(faixa.id)) };
}

/** Camada › Excluir › Camadas ocultas: as escondidas (com o que há dentro, nas pastas) saem. */
/** Excluir as camadas escolhidas (as de dentro de uma pasta escolhida já saem com ela). */
export function apagarCamadas(projeto: Projeto, faixaIds: string[]): Projeto {
  let resultado = projeto;
  for (const faixaId of faixaIds) if (resultado.faixas.some((faixa) => faixa.id === faixaId)) resultado = apagarCamada(resultado, faixaId);
  return resultado;
}

/** Duplicar as escolhidas, cada cópia acima da original; devolve os clipes das cópias. */
export function duplicarCamadas(projeto: Projeto, ctx: Contexto, faixaIds: string[]): { projeto: Projeto; clipeIds: string[] } {
  // As de dentro de uma pasta escolhida já vão na cópia dela
  const escolhidas = projeto.faixas.filter((faixa) => faixaIds.includes(faixa.id) && !ancestrais(projeto, faixa).some((pasta) => faixaIds.includes(pasta.id)));
  let resultado = projeto;
  const clipeIds: string[] = [];
  for (const faixa of escolhidas) {
    const copia = duplicarCamada(resultado, ctx, faixa.id);
    resultado = copia.projeto;
    clipeIds.push(copia.clipeId);
  }
  return { projeto: resultado, clipeIds };
}

export function apagarCamadasOcultas(projeto: Projeto): Projeto {
  const ocultas = projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.oculta && !faixa.travada);
  if (!ocultas.length) throw new ErroEdicao("Não há camadas ocultas para excluir.");
  const ids = new Set(ocultas.flatMap((faixa) => comDescendentes(projeto, faixa.id)).map((faixa) => faixa.id));
  return { ...projeto, faixas: projeto.faixas.filter((faixa) => !ids.has(faixa.id)) };
}

/**
 * A cópia entra logo acima da original, com ids novos e um pouco deslocada (para dar para ver que são duas). Uma
 * pasta é copiada com tudo o que há dentro (as cópias ficam na pasta copiada).
 */
export function duplicarCamada(projeto: Projeto, ctx: Contexto, faixaId: string): { projeto: Projeto; clipeId: string } {
  const indice = indiceDaCamada(projeto, faixaId);
  const original = projeto.faixas[indice];
  const bloco = comDescendentes(projeto, faixaId);
  const novosIds = new Map(bloco.map((faixa) => [faixa.id, ctx.novoId()]));
  const copias = bloco.map((faixa) => {
    const clipe = structuredClone(faixa.clipes[0]);
    const t = clipe.transformacao;
    const deslocar = faixa === original && !clipe.pasta;
    return {
      ...faixa,
      id: novosIds.get(faixa.id)!,
      pai: faixa === original ? faixa.pai : (novosIds.get(faixa.pai ?? "") ?? faixa.pai),
      travada: false,
      // Copiar não leva o vínculo: a cópia anda sozinha
      vinculo: null,
      nome: faixa === original && faixa.nome ? `${faixa.nome} cópia`.slice(0, 60) : faixa.nome,
      clipes: [{ ...clipe, id: ctx.novoId(), transformacao: deslocar ? { ...t, x: Math.min(t.x + 0.03, 10), y: Math.min(t.y + 0.03, 10) } : t }],
    };
  });
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 0, ...copias);
  return { projeto: { ...projeto, faixas }, clipeId: copias[0].clipes[0].id };
}

/** A força do desfoque da cópia de baixo no "Desfocar o fundo". */
export const DESFOQUE_DO_FUNDO = 0.4;

/**
 * Desfocar o fundo de uma foto: a camada fica com o fundo removido (só a pessoa) e ganha embaixo uma cópia
 * inteira com o efeito de desfoque. São duas camadas comuns: a pessoa ajusta, move ou apaga cada uma.
 */
export function desfocarFundo(projeto: Projeto, ctx: Contexto, faixaId: string): { projeto: Projeto; clipeId: string } {
  const indice = indiceDaCamada(projeto, faixaId);
  const original = projeto.faixas[indice];
  const clipe = original.clipes[0];
  const info = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
  if (!info?.imagem || info.transparente) throw new ErroEdicao("O fundo desfocado vale em fotos.");
  if (original.travada) throw new ErroEdicao("A camada está travada.");
  const recortada: Clipe = { ...clipe, remover_fundo: true };
  const desfocada: Clipe = { ...structuredClone(clipe), id: ctx.novoId(), remover_fundo: false, efeito: { tipo: "desfoque", intensidade: DESFOQUE_DO_FUNDO } };
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 1, { ...original, clipes: [recortada] }, { ...original, id: ctx.novoId(), clipes: [desfocada] });
  return { projeto: { ...projeto, faixas }, clipeId: recortada.id };
}

/**
 * Põe as camadas de um modelo de imagem por cima do que já existe, num passo, e muda o tamanho e o fundo para os
 * do modelo (as camadas que já estavam ficam no mesmo lugar em frações do quadro).
 */
export function aplicarModeloDeImagem(projeto: Projeto, ctx: Contexto, modelo: { camadas: CamadaPronta[]; tamanho: TamanhoDaImagem; fundo: string }): Projeto {
  let novo = mudarFundoDaImagem(mudarTamanhoDaImagem(projeto, modelo.tamanho), { cor: modelo.fundo, transparente: false });
  for (const camada of modelo.camadas) {
    if (camada.tipo === "texto") {
      novo = porNoTopo(novo, faixaNova(ctx, "texto", clipeDaCamada(ctx.novoId(), { texto: camada.texto, transformacao: camada.transformacao })));
      continue;
    }
    if (!ctx.midia(camada.midiaId)) throw new ErroEdicao("Uma imagem do modelo ainda não está pronta.");
    const clipe = clipeDaCamada(ctx.novoId(), {
      midia_id: camada.midiaId,
      transformacao: camada.transformacao,
      recorte: camada.recorte,
      ...(camada.cantos ? { cantos: camada.cantos } : {}),
      ...(camada.filtro ? { cor: { ...COR_PADRAO, filtro: camada.filtro } } : {}),
    });
    novo = porNoTopo(novo, faixaNova(ctx, "video", clipe));
  }
  return novo;
}

/**
 * Troca a imagem de uma camada mantendo o lugar dela: a nova cobre a mesma caixa (cortada no meio). Os tamanhos
 * em pixels das duas vêm de quem chama, porque o contexto da edição não sabe o tamanho das mídias.
 */
export function trocarImagemDaCamada(projeto: Projeto, ctx: Contexto, clipeId: string, midiaId: string, tamanhoAtual: Tamanho, tamanhoNovo: Tamanho): Projeto {
  const info = ctx.midia(midiaId);
  if (!info?.imagem) throw new ErroEdicao("Escolha uma imagem pronta da biblioteca.");
  const quadro = tamanhoDaImagem(projeto);
  const faixas = projeto.faixas.map((faixa) => {
    const clipe = faixa.clipes[0];
    if (faixa.tipo === "principal" || !clipe || clipe.id !== clipeId) return faixa;
    if (faixa.travada) throw new ErroEdicao("A camada está travada.");
    if (!clipe.midia_id) throw new ErroEdicao("Só camadas de imagem trocam de imagem.");
    const caixa = caixaDoClipe({ ...clipe.transformacao, rotacao: 0 }, clipe.recorte, tamanhoAtual, quadro);
    const noQuadro = { cx: caixa.cx / quadro.largura, cy: caixa.cy / quadro.altura, largura: caixa.largura / quadro.largura, altura: caixa.altura / quadro.altura };
    const { transformacao, recorte } = encaixarNaCaixa(tamanhoNovo, noQuadro, quadro, "cobrir");
    const t = clipe.transformacao;
    return {
      ...faixa,
      clipes: [{ ...clipe, midia_id: midiaId, recorte, remover_fundo: false, transformacao: { ...t, escala: transformacao.escala } }],
    };
  });
  return { ...projeto, faixas };
}

/**
 * Uma camada nova logo acima da camada dada, no mesmo lugar e com tudo dela, mas com outra mídia do mesmo tamanho
 * (o objeto recortado de uma foto cai em cima da foto).
 */
export function camadaComOutraMidia(projeto: Projeto, ctx: Contexto, faixaId: string, midiaId: string): { projeto: Projeto; clipeId: string } {
  const indice = indiceDaCamada(projeto, faixaId);
  const original = projeto.faixas[indice];
  if (!ctx.midia(midiaId)?.imagem) throw new ErroEdicao("A imagem nova ainda não está pronta.");
  const clipe: Clipe = { ...structuredClone(original.clipes[0]), id: ctx.novoId(), midia_id: midiaId, remover_fundo: false };
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 0, { ...original, id: ctx.novoId(), travada: false, oculta: false, clipes: [clipe] });
  return { projeto: { ...projeto, faixas }, clipeId: clipe.id };
}

export function mudarFundoDaImagem(projeto: Projeto, fundo: { cor?: string; transparente?: boolean }): Projeto {
  if (fundo.cor !== undefined && !/^#[0-9a-f]{6}$/i.test(fundo.cor)) throw new ErroEdicao("Cor inválida.");
  return { ...projeto, fundo: { ...projeto.fundo, ...fundo } };
}

/** Confere o tamanho: os lados entre 16 e 8192 e no máximo 36 milhões de pixels. Devolve a mensagem ou null. */
export function problemaNoTamanho({ largura, altura }: TamanhoDaImagem): string | null {
  if (![largura, altura].every((lado) => Number.isInteger(lado) && lado >= LADO_MINIMO && lado <= LADO_MAXIMO)) {
    return `Os lados vão de ${LADO_MINIMO} a ${LADO_MAXIMO} pixels.`;
  }
  if (largura * altura > AREA_MAXIMA) return "A imagem pode ter no máximo 36 milhões de pixels (6000 × 6000).";
  return null;
}

/** Um retângulo do quadro, em pixels da imagem (o canto de cima à esquerda e o tamanho). */
export type RetanguloDaImagem = { x: number; y: number; largura: number; altura: number };

/**
 * Recorta o quadro no retângulo: o tamanho passa a ser o dele, e cada camada fica no mesmo lugar e do mesmo tamanho
 * em pixels (só o que fica fora some). A escala de uma mídia é relativa a caber no quadro e a de um texto, ao lado
 * menor dele, então as duas são refeitas para o quadro novo; os tamanhos das mídias vêm de quem chama.
 */
export function recortarImagem(projeto: Projeto, retangulo: RetanguloDaImagem, tamanhos: Record<string, Tamanho>): Projeto {
  const antes = tamanhoDaImagem(projeto);
  const depois = { largura: Math.round(retangulo.largura), altura: Math.round(retangulo.altura) };
  const problema = problemaNoTamanho(depois);
  if (problema) throw new ErroEdicao(problema);
  const ladoAntes = Math.min(antes.largura, antes.altura);
  const ladoDepois = Math.min(depois.largura, depois.altura);
  const faixas = projeto.faixas.map((faixa) => {
    if (faixa.tipo === "principal") return faixa;
    const clipes = faixa.clipes.map((clipe) => {
      // A camada de ajuste cobre o quadro, qualquer que seja ele
      if (clipe.ajuste) return clipe;
      const t = clipe.transformacao;
      const cx = antes.largura / 2 + t.x * antes.largura - retangulo.x;
      const cy = antes.altura / 2 + t.y * antes.altura - retangulo.y;
      let escala = t.escala;
      if (clipe.texto) escala = (t.escala * ladoAntes) / ladoDepois;
      else if (clipe.midia_id && tamanhos[clipe.midia_id]) {
        const midia = tamanhos[clipe.midia_id];
        const largura = midia.largura * clipe.recorte.largura;
        const altura = midia.altura * clipe.recorte.altura;
        const caberAntes = Math.min(antes.largura / largura, antes.altura / altura);
        const caberDepois = Math.min(depois.largura / largura, depois.altura / altura);
        escala = (t.escala * caberAntes) / caberDepois;
      }
      const transformacao = { ...t, x: (cx - depois.largura / 2) / depois.largura, y: (cy - depois.altura / 2) / depois.altura, escala };
      return { ...clipe, transformacao };
    });
    return { ...faixa, clipes };
  });
  return { ...projeto, tamanho: depois, faixas };
}

/** Muda o tamanho do quadro. As camadas ficam no mesmo lugar em frações (o meio continua no meio). */
export function mudarTamanhoDaImagem(projeto: Projeto, tamanho: TamanhoDaImagem): Projeto {
  const problema = problemaNoTamanho(tamanho);
  if (problema) throw new ErroEdicao(problema);
  return {
    ...projeto,
    tamanho: { largura: tamanho.largura, altura: tamanho.altura },
  };
}
