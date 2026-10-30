// O editor do corte (ADR 0004, 14.7): as contas do painel Corte, quando o projeto veio de um corte do Clipar. As cenas
// da principal (os trechos do original que se seguem, separados pelos pulos e pelas trocas de câmera), o layout
// automático de cada uma pelos rostos (layoutDaCena.ts), o enquadramento parado que a pessoa escolhe (o rastreador
// manual) e o "pôr um trecho do original" (que também estende o corte nas pontas), com o enquadramento, a cor, o
// som e as legendas da cena vizinha. Tudo passa pelos comandos de sempre; funções puras.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import type { Palavra } from "../projeto/fala.ts";
import { pontoVirado, recorteNaFonte, type Tamanho } from "../projeto/geometria.ts";
import { transformacaoNoTempo } from "../projeto/keyframes.ts";
import { escalaParaCobrir, type LayoutDaCena, partesDaDivisao, quadroDaProporcao, recorteDaRegiao, type RegiaoDoLayout } from "../projeto/layoutDaCena.ts";
import { legendasDaFala, opcoesParaOQuadro } from "../projeto/legendasDaFala.ts";
import type { Clipe, Faixa, Projeto, Recorte } from "../projeto/modelo.ts";
import { type AmostraDeRosto, type Reenquadramento, reenquadrarPeloRosto } from "../projeto/reenquadrar.ts";
import { segundosNoClipe } from "../projeto/velocidade.ts";

const S = TICKS_POR_SEGUNDO;
/** Um pulo maior que este no original (entre o fim de um clipe e o começo do seguinte) começa outra cena. */
export const PULO_ENTRE_CENAS_S = 2.5;
/** A troca de câmera precisa estar tanto dentro do clipe para dividir (uma divisão na ponta não faz nada). */
const FOLGA_DA_TROCA_S = 0.25;
/** Quanto o "estender" acrescenta. */
export const ESTENDER_S = 5;
/** O pedaço do original mais curto que vale pôr no corte. */
const TRECHO_MINIMO_S = 0.3;

const limitar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));
const mediana = (valores: number[]) => {
  const ordem = [...valores].sort((a, b) => a - b);
  return ordem.length ? ordem[Math.floor(ordem.length / 2)] : 0;
};

/** O trecho do original que o clipe mostra, em segundos da mídia. */
export function trechoDoClipe(clipe: Pick<Clipe, "entrada" | "duracao" | "velocidade">): { de: number; ate: number } {
  const de = clipe.entrada / S;
  return { de, ate: de + (clipe.duracao / S) * clipe.velocidade };
}

export type Cena = { clipeIds: string[]; inicio: Tick; fim: Tick; midiaId: string; de: number; ate: number };

const principalDe = (projeto: Projeto): Faixa | undefined => projeto.faixas.find((faixa) => faixa.tipo === "principal");

const daMidia = (clipe: Clipe) => Boolean(clipe.midia_id && !clipe.texto && !clipe.ajuste);

/**
 * As cenas da principal: os clipes do mesmo original que se seguem na linha do tempo e no original (a limpeza das
 * pausas deixa pulos pequenos). Um pulo maior, outra mídia ou uma troca de câmera entre dois clipes começam outra.
 */
export function cenasDaPrincipal(clipes: Clipe[], trocasDeCamera: number[] = []): Cena[] {
  const cenas: Cena[] = [];
  for (const clipe of [...clipes].filter(daMidia).sort((a, b) => a.inicio - b.inicio)) {
    const { de, ate } = trechoDoClipe(clipe);
    const anterior = cenas.at(-1);
    const segue =
      anterior &&
      anterior.midiaId === clipe.midia_id &&
      clipe.inicio === anterior.fim &&
      de >= anterior.ate - 0.05 &&
      de - anterior.ate <= PULO_ENTRE_CENAS_S &&
      !trocasDeCamera.some((t) => t > anterior.ate - 0.05 && t <= de + 0.05);
    if (segue) {
      anterior.clipeIds.push(clipe.id);
      anterior.fim = clipe.inicio + clipe.duracao;
      anterior.ate = ate;
    } else cenas.push({ clipeIds: [clipe.id], inicio: clipe.inicio, fim: clipe.inicio + clipe.duracao, midiaId: clipe.midia_id!, de, ate });
  }
  return cenas;
}

/** Os instantes (segundos da mídia) das trocas de câmera, pelas notas do worker (core/utils/qualidade.py). */
export function trocasDaQualidade(qualidade: { t: number[]; corte: boolean[] }): number[] {
  return qualidade.t.filter((_, i) => qualidade.corte[i]);
}

/** Onde dividir a principal para cada troca de câmera cair numa divisa: o instante na linha e o clipe. */
export function divisoesNasTrocas(clipes: Clipe[], trocasDeCamera: number[]): { tempo: Tick; clipeId: string }[] {
  const divisoes: { tempo: Tick; clipeId: string }[] = [];
  for (const clipe of clipes.filter(daMidia)) {
    const { de, ate } = trechoDoClipe(clipe);
    for (const troca of trocasDeCamera) {
      if (troca <= de + FOLGA_DA_TROCA_S || troca >= ate - FOLGA_DA_TROCA_S) continue;
      divisoes.push({ tempo: clipe.inicio + Math.round(segundosNoClipe(clipe, troca) * S), clipeId: clipe.id });
    }
  }
  return divisoes.sort((a, b) => b.tempo - a.tempo);
}

// -----------------------------------------------
// Layout e enquadramento
// -----------------------------------------------

/** Um rosto: centro e área em frações da imagem. */
type Rosto = { x: number; y: number; a: number };

/** Os rostos (o principal e os outros) das amostras dentro do trecho. */
function rostosNoTrecho(amostras: AmostraDeRosto[], de: number, ate: number, todos: boolean): Rosto[] {
  return amostras
    .filter((amostra) => amostra.t >= de && amostra.t <= ate)
    .flatMap((amostra) => [{ x: amostra.x, y: amostra.y, a: amostra.a }, ...(todos ? (amostra.outros ?? []).map(([x, y, a]) => ({ x, y, a })) : [])]);
}

/**
 * A região que mostra o rosto numa parte do quadro: a cabeça e os ombros (a altura do recorte é umas 3,2 vezes a do
 * rosto), com o rosto um pouco acima do meio.
 */
export function regiaoDoRosto(rosto: Rosto, midia: Tamanho, parte: Tamanho): RegiaoDoLayout {
  const lado = Math.sqrt(rosto.a * midia.largura * midia.altura);
  const maior = recorteDaRegiao({ x: 0.5, y: 0.5, zoom: 1 }, midia, parte).altura * midia.altura;
  const zoom = limitar(maior / Math.max(1, lado * 3.2), 1, 3);
  const altura = maior / zoom / midia.altura;
  return { x: limitar(rosto.x, 0, 1), y: limitar(rosto.y + 0.12 * altura, 0, 1), zoom };
}

/** Dois grupos pelo x (k-médias em uma dimensão), da esquerda para a direita; null quando não há dois lados. */
function doisGrupos(rostos: Rosto[]): [Rosto[], Rosto[]] | null {
  if (rostos.length < 2) return null;
  const xs = rostos.map((rosto) => rosto.x);
  let centros = [Math.min(...xs), Math.max(...xs)];
  let grupos: [Rosto[], Rosto[]] = [[], []];
  for (let volta = 0; volta < 12; volta++) {
    grupos = [[], []];
    for (const rosto of rostos) grupos[Math.abs(rosto.x - centros[0]) <= Math.abs(rosto.x - centros[1]) ? 0 : 1].push(rosto);
    if (!grupos[0].length || !grupos[1].length) return null;
    centros = grupos.map((grupo) => grupo.reduce((soma, rosto) => soma + rosto.x, 0) / grupo.length);
  }
  // Duas pessoas de verdade: os grupos longe um do outro e o menor com pelo menos um quinto das amostras
  const menor = Math.min(grupos[0].length, grupos[1].length);
  return centros[1] - centros[0] >= 0.15 && menor >= rostos.length / 5 ? grupos : null;
}

const rostoTipico = (rostos: Rosto[]): Rosto => ({ x: mediana(rostos.map((r) => r.x)), y: mediana(rostos.map((r) => r.y)), a: mediana(rostos.map((r) => r.a)) });

/**
 * O layout de um tipo para a cena, pelos rostos do trecho: no "duas pessoas", a da esquerda em cima e a da direita
 * embaixo; no "tela e rosto", a imagem inteira em cima (a divisão é a altura em que ela cabe na largura) e o rosto
 * embaixo. Sem rostos, as regiões ficam nos lugares comuns.
 */
export function layoutAutomatico(tipo: LayoutDaCena["tipo"], amostras: AmostraDeRosto[], trecho: { de: number; ate: number }, midia: Tamanho, quadro: Tamanho): LayoutDaCena {
  if (tipo === "caber") return { tipo: "caber", desfoque: 0.6 };
  if (tipo === "duas_pessoas") {
    const [cima, baixo] = partesDaDivisao(0.5);
    const parte = (altura: number) => ({ largura: quadro.largura, altura: quadro.altura * altura });
    const grupos = doisGrupos(rostosNoTrecho(amostras, trecho.de, trecho.ate, true));
    if (!grupos)
      return {
        tipo,
        divisao: 0.5,
        quadros: [
          { x: 0.3, y: 0.45, zoom: 1.3 },
          { x: 0.7, y: 0.45, zoom: 1.3 },
        ],
      };
    return { tipo, divisao: 0.5, quadros: [regiaoDoRosto(rostoTipico(grupos[0]), midia, parte(cima)), regiaoDoRosto(rostoTipico(grupos[1]), midia, parte(baixo))] };
  }
  const divisao = limitar(quadro.largura / (quadro.altura * (midia.largura / midia.altura)), 0.2, 0.6);
  const rostos = rostosNoTrecho(amostras, trecho.de, trecho.ate, false);
  const baixo = { largura: quadro.largura, altura: quadro.altura * (1 - divisao) };
  return { tipo, divisao, quadros: [{ x: 0.5, y: 0.5, zoom: 1 }, rostos.length ? regiaoDoRosto(rostoTipico(rostos), midia, baixo) : { x: 0.5, y: 0.45, zoom: 1.6 }] };
}

/**
 * O enquadramento parado do "preencher" (o rastreador manual): o clipe cobre o quadro com o zoom pedido e o ponto da
 * mídia escolhido fica o mais perto do meio que a imagem deixa.
 */
export function enquadramentoParado(clipe: Pick<Clipe, "recorte" | "virar">, ponto: { x: number; y: number }, zoom: number, midia: Tamanho, quadro: Tamanho): Reenquadramento {
  const { recorte } = clipe;
  const largura = midia.largura * recorte.largura;
  const altura = midia.altura * recorte.altura;
  const encaixe = Math.min(quadro.largura / largura, quadro.altura / altura);
  const cobre = Math.max(quadro.largura / largura, quadro.altura / altura) * limitar(zoom, 1, 4);
  const caixa = { largura: largura * cobre, altura: altura * cobre };
  const folgaX = (caixa.largura - quadro.largura) / (2 * quadro.largura);
  const folgaY = (caixa.altura - quadro.altura) / (2 * quadro.altura);
  const visto = pontoVirado(ponto, clipe.virar);
  const u = (visto.x - recorte.x) / recorte.largura;
  const v = (visto.y - recorte.y) / recorte.altura;
  return {
    escala: cobre / encaixe,
    // (+ 0 tira o -0 do meio)
    x: limitar((-(u - 0.5) * caixa.largura) / quadro.largura, -folgaX, folgaX) + 0,
    y: limitar((-(v - 0.5) * caixa.altura) / quadro.altura, -folgaY, folgaY) + 0,
    keyframes: {},
  };
}

/**
 * A cena volta ao preencher: sem layout, e o clipe que não cobre o quadro (um trecho que entrou sem enquadramento, ou
 * todos, com `todos`) segue o rosto, se ele aparece no trecho, ou fica no meio da imagem. Devolve também se achou rosto.
 */
export function preencherACena(
  projeto: Projeto,
  ctx: Contexto,
  clipeIds: string[],
  rosto: AmostraDeRosto[],
  midia: Tamanho,
  todos = false,
): { projeto: Projeto; seguiu: boolean } {
  const quadro = quadroDaProporcao(projeto.proporcao);
  let resultado = executarComando(projeto, { comando: "clipe.layout", parametros: { clipeIds, layout: null } }, ctx).projeto;
  let seguiu = false;
  for (const clipe of (principalDe(resultado)?.clipes ?? []).filter((item) => clipeIds.includes(item.id))) {
    const recortada = { largura: midia.largura * clipe.recorte.largura, altura: midia.altura * clipe.recorte.altura };
    const cobre = clipe.transformacao.escala >= escalaParaCobrir(recortada, quadro) - 1e-6;
    if (cobre && !todos) continue;
    const pelo = reenquadrarPeloRosto(clipe, rosto, midia, quadro);
    seguiu ||= Boolean(pelo);
    const reenquadramento = pelo ?? enquadramentoParado(clipe, { x: 0.5, y: 0.5 }, 1, midia, quadro);
    resultado = executarComando(resultado, { comando: "clipe.reenquadrar", parametros: { clipeId: clipe.id, reenquadramento } }, ctx).projeto;
  }
  return { projeto: resultado, seguiu };
}

/**
 * O pedaço da mídia (frações, como ela é) que aparece no quadro no instante `t` da linha: a janela do "preencher",
 * que o painel desenha sobre o quadro do original. Sem giro (o enquadramento não gira).
 */
export function janelaNoQuadro(clipe: Clipe, t: Tick, midia: Tamanho, quadro: Tamanho): Recorte {
  const transformacao = transformacaoNoTempo(clipe, t);
  const { recorte } = clipe;
  const largura = midia.largura * recorte.largura;
  const altura = midia.altura * recorte.altura;
  const escala = Math.min(quadro.largura / largura, quadro.altura / altura) * transformacao.escala;
  const caixa = { largura: largura * escala, altura: altura * escala };
  const esquerda = quadro.largura / 2 + transformacao.x * quadro.largura - caixa.largura / 2;
  const topo = quadro.altura / 2 + transformacao.y * quadro.altura - caixa.altura / 2;
  // O quadro [0, largura] × [0, altura] na caixa do clipe, em frações do recorte, e daí na mídia
  const u0 = limitar(-esquerda / caixa.largura, 0, 1);
  const u1 = limitar((quadro.largura - esquerda) / caixa.largura, 0, 1);
  const v0 = limitar(-topo / caixa.altura, 0, 1);
  const v1 = limitar((quadro.altura - topo) / caixa.altura, 0, 1);
  const visivel = { x: recorte.x + u0 * recorte.largura, y: recorte.y + v0 * recorte.altura, largura: (u1 - u0) * recorte.largura, altura: (v1 - v0) * recorte.altura };
  return recorteNaFonte(visivel, clipe.virar);
}

// -----------------------------------------------
// Trechos do original
// -----------------------------------------------

/** Os trechos do original (segundos da mídia) que a principal mostra, juntos e em ordem. */
export function trechosNoCorte(clipes: Clipe[], midiaId: string): { de: number; ate: number }[] {
  const trechos = clipes
    .filter((clipe) => daMidia(clipe) && clipe.midia_id === midiaId)
    .map(trechoDoClipe)
    .sort((a, b) => a.de - b.de);
  const juntos: { de: number; ate: number }[] = [];
  for (const trecho of trechos) {
    const ultimo = juntos.at(-1);
    if (ultimo && trecho.de <= ultimo.ate + 0.01) ultimo.ate = Math.max(ultimo.ate, trecho.ate);
    else juntos.push({ ...trecho });
  }
  return juntos;
}

/** O que falta de [de, ate] fora dos trechos dados, sem os pedaços curtos demais. */
export function foraDosTrechos(de: number, ate: number, trechos: { de: number; ate: number }[]): { de: number; ate: number }[] {
  const resto: { de: number; ate: number }[] = [];
  let atual = de;
  for (const trecho of [...trechos].sort((a, b) => a.de - b.de)) {
    if (trecho.ate <= atual || trecho.de >= ate) continue;
    if (trecho.de > atual) resto.push({ de: atual, ate: Math.min(trecho.de, ate) });
    atual = Math.max(atual, trecho.ate);
  }
  if (atual < ate) resto.push({ de: atual, ate });
  return resto.filter((pedaco) => pedaco.ate - pedaco.de >= TRECHO_MINIMO_S);
}

/** Onde, na linha, entra um trecho que começa em `de` no original: depois do último clipe que começa antes dele. */
export function tempoParaOTrecho(clipes: Clipe[], midiaId: string, de: number): Tick {
  let tempo = 0;
  for (const clipe of [...clipes].filter((c) => daMidia(c) && c.midia_id === midiaId).sort((a, b) => a.inicio - b.inicio)) {
    if (trechoDoClipe(clipe).de <= de) tempo = clipe.inicio + clipe.duracao;
  }
  return tempo;
}

/** Uma sobra de clipe mais curta que isto, numa ponta do que sai do corte, sai junto. */
const SOBRA_MINIMA_S = 0.2;

/**
 * Os intervalos da linha em que a principal mostra [de, ate] do original (para tirar do corte). A sobra curta de um
 * clipe numa ponta (a folga que o "pôr" deixa antes da primeira palavra) sai junto, em vez de virar um pedaço solto.
 */
export function intervalosDoTrecho(clipes: Clipe[], midiaId: string, de: number, ate: number): { inicio: Tick; fim: Tick }[] {
  const intervalos: { inicio: Tick; fim: Tick }[] = [];
  for (const clipe of clipes.filter((c) => daMidia(c) && c.midia_id === midiaId)) {
    const trecho = trechoDoClipe(clipe);
    let a = Math.max(de, trecho.de);
    let b = Math.min(ate, trecho.ate);
    if (b - a < 0.02) continue;
    if (a - trecho.de < SOBRA_MINIMA_S) a = trecho.de;
    if (trecho.ate - b < SOBRA_MINIMA_S) b = trecho.ate;
    const inicio = clipe.inicio + Math.round(segundosNoClipe(clipe, a) * S);
    const fim = clipe.inicio + Math.round(segundosNoClipe(clipe, b) * S);
    intervalos.push({ inicio: Math.max(clipe.inicio, inicio), fim: Math.min(clipe.inicio + clipe.duracao, fim) });
  }
  return intervalos.sort((x, y) => x.inicio - y.inicio);
}

export type EntradaDoTrecho = {
  midiaId: string;
  /** Segundos do original. */
  de: number;
  ate: number;
  /** As palavras do original (pelo menos as do trecho), para as legendas da parte nova. */
  palavras: Palavra[];
  /** As amostras do rosto do original (vazias: o enquadramento vem da cena vizinha). */
  rosto: AmostraDeRosto[];
  midia: Tamanho;
  /** As mídias que andam com a fala (as trilhas da legenda animada): nunca ficam presas às pontas. */
  comAFala?: ReadonlySet<string>;
};

const fimDaPrincipal = (projeto: Projeto): Tick => Math.max(0, ...(principalDe(projeto)?.clipes ?? []).map((clipe) => clipe.inicio + clipe.duracao));

/** O clipe muda no lugar (pelo id), em qualquer faixa. */
function mudarClipe(projeto: Projeto, id: string, mudar: (clipe: Clipe) => Clipe): Projeto {
  return { ...projeto, faixas: projeto.faixas.map((faixa) => (faixa.clipes.some((clipe) => clipe.id === id) ? { ...faixa, clipes: faixa.clipes.map((clipe) => (clipe.id === id ? mudar(clipe) : clipe)) } : faixa)) };
}

/** Quanto o clipe pode crescer no fim sem passar do fim da mídia dele. */
function podeCrescer(clipe: Clipe, ctx: Contexto, mais: Tick): boolean {
  if (!clipe.midia_id || clipe.texto) return true;
  const info = ctx.midia(clipe.midia_id);
  if (!info || info.imagem || !Number.isFinite(info.duracao)) return true;
  return clipe.entrada + (clipe.duracao + mais) * clipe.velocidade <= info.duracao + 1;
}

/**
 * Põe [de, ate] do original no corte, na ordem do original, com o que a cena vizinha tem: o layout ou o enquadramento
 * (seguindo o rosto, se ele aparece; senão, parado onde a vizinha está na emenda), a cor, o efeito e o som, e as
 * legendas da fala nova no estilo das de antes. O espaço abre em todas as faixas destravadas (as legendas, os
 * gráficos e a música da fala de depois andam junto). Nas pontas, o que marca o começo ou o fim do vídeo fica nele:
 * o título e o logo continuam começando no zero; o logo, a música e a chamada continuam indo até o fim.
 */
export function porTrechoNoCorte(projeto: Projeto, ctx: Contexto, entrada: EntradaDoTrecho): { projeto: Projeto; clipeId: string } {
  const principal = principalDe(projeto)?.clipes ?? [];
  const tempo = tempoParaOTrecho(principal, entrada.midiaId, entrada.de);
  const fimAntes = fimDaPrincipal(projeto);
  const noComeco = tempo === 0 && principal.length > 0;
  const noFim = tempo >= fimAntes && principal.length > 0;
  // Os clipes que marcam as pontas, antes de o espaço abrir
  const pontas = new Map<string, { comeca: boolean; termina: boolean }>();
  // (as legendas e as trilhas da legenda animada são da fala e andam com ela; no começo, só os textos, como o título, e o
  // que vai do começo ao fim ficam presos ao zero)
  for (const faixa of projeto.faixas) {
    if (faixa.tipo === "principal" || faixa.tipo === "legenda" || faixa.travada) continue;
    for (const clipe of faixa.clipes) {
      if (clipe.midia_id && entrada.comAFala?.has(clipe.midia_id)) continue;
      const termina = Math.abs(clipe.inicio + clipe.duracao - fimAntes) <= 1;
      const comeca = clipe.inicio === 0 && (faixa.tipo === "texto" || termina);
      if (comeca || termina) pontas.set(clipe.id, { comeca, termina });
    }
  }
  const vizinho = noComeco ? [...principal].sort((a, b) => a.inicio - b.inicio)[0] : [...principal].filter((c) => c.inicio + c.duracao <= tempo).sort((a, b) => b.inicio - a.inicio)[0];

  const inserido = executarComando(projeto, { comando: "clipe.inserirTrecho", parametros: { midiaId: entrada.midiaId, de: Math.round(entrada.de * S), ate: Math.round(entrada.ate * S), tempo, modo: "inserir" } }, ctx);
  let resultado = inserido.projeto;
  const clipeId = inserido.selecao?.[0];
  if (!clipeId) throw new Error("O trecho não entrou no corte.");
  const novo = principalDe(resultado)!.clipes.find((clipe) => clipe.id === clipeId)!;
  const mais = novo.duracao;

  // As pontas: no começo, o que começava no zero volta para ele (e o que ia até o fim cresce); no fim, o que ia até o
  // fim vai junto (crescendo, se começava no zero)
  if (noComeco || noFim) {
    for (const [id, ponta] of pontas) {
      resultado = mudarClipe(resultado, id, (clipe) => {
        if (noComeco && ponta.comeca) return { ...clipe, inicio: 0, duracao: ponta.termina && podeCrescer(clipe, ctx, mais) ? clipe.duracao + mais : clipe.duracao };
        if (noFim && ponta.termina) return ponta.comeca ? (podeCrescer(clipe, ctx, mais) ? { ...clipe, duracao: clipe.duracao + mais } : clipe) : { ...clipe, inicio: clipe.inicio + mais };
        return clipe;
      });
    }
  }

  // O que a cena vizinha tem
  if (vizinho) {
    resultado = mudarClipe(resultado, clipeId, (clipe) => ({
      ...clipe,
      cor: vizinho.cor ?? null,
      efeito: vizinho.efeito ?? null,
      layout: vizinho.layout ?? null,
      virar: vizinho.virar ?? null,
      recorte: vizinho.recorte,
      volume: vizinho.volume,
      voz_limpa: vizinho.voz_limpa,
      efeitos_voz: vizinho.efeitos_voz ?? null,
      tom: vizinho.tom,
      igualar_volume: vizinho.igualar_volume,
      imagem_limpa: vizinho.imagem_limpa,
    }));
    // O enquadramento vale mesmo com o layout (ele fica guardado para quando a cena voltar ao preencher)
    const comNovo = principalDe(resultado)!.clipes.find((clipe) => clipe.id === clipeId)!;
    const quadro = quadroDaProporcao(resultado.proporcao);
    // Seguindo o rosto, se a vizinha segue (tem o caminho em keyframes) e ele aparece no trecho; senão, parado
    const seguia = Boolean(vizinho.keyframes?.x?.length || vizinho.keyframes?.y?.length);
    const peloRosto = seguia ? reenquadrarPeloRosto(comNovo, entrada.rosto, entrada.midia, quadro) : null;
    const naEmenda = transformacaoNoTempo(vizinho, noComeco ? vizinho.inicio : vizinho.inicio + vizinho.duracao - 1);
    const reenquadramento = peloRosto ?? { escala: naEmenda.escala, x: naEmenda.x, y: naEmenda.y, keyframes: {} };
    if (peloRosto || Math.abs(naEmenda.escala - 1) > 1e-6 || naEmenda.x || naEmenda.y) {
      resultado = executarComando(resultado, { comando: "clipe.reenquadrar", parametros: { clipeId, reenquadramento } }, ctx).projeto;
    }
  }

  // As legendas da fala nova, no estilo e no lugar das de antes, na mesma faixa
  const faixaDasLegendas = resultado.faixas.find((faixa) => faixa.tipo === "legenda" && faixa.clipes.some((clipe) => clipe.texto));
  const modelo = faixaDasLegendas?.clipes.find((clipe) => clipe.texto);
  if (faixaDasLegendas && modelo?.texto) {
    const comNovo = principalDe(resultado)!.clipes.find((clipe) => clipe.id === clipeId)!;
    const legendas = legendasDaFala([comNovo], new Map([[entrada.midiaId, entrada.palavras]]), opcoesParaOQuadro(resultado.proporcao, modelo.texto));
    const ocupados = faixaDasLegendas.clipes.map((clipe) => [clipe.inicio, clipe.inicio + clipe.duracao]);
    const novas: Clipe[] = legendas
      .filter((legenda) => legenda.fim > legenda.inicio && !ocupados.some(([i, f]) => legenda.inicio < f && i < legenda.fim))
      .map((legenda) => ({
        ...modelo,
        id: ctx.novoId(),
        inicio: legenda.inicio,
        duracao: legenda.fim - legenda.inicio,
        keyframes: null,
        texto: { ...modelo.texto!, conteudo: legenda.conteudo, tempos: legenda.tempos?.map((t) => t - legenda.inicio) ?? null, palavras_chave: null },
      }));
    if (novas.length) {
      resultado = {
        ...resultado,
        faixas: resultado.faixas.map((faixa) => (faixa.id === faixaDasLegendas.id ? { ...faixa, clipes: [...faixa.clipes, ...novas].sort((a, b) => a.inicio - b.inicio) } : faixa)),
      };
    }
  }
  return { projeto: resultado, clipeId };
}

/**
 * O trecho do original que as palavras marcadas ocupam, com a mesma folga no pôr e no tirar (para um desfazer o
 * outro): 0,15 s antes da primeira e 0,2 s depois da última, sem entrar nas palavras vizinhas.
 */
export function trechoDasPalavrasDoOriginal(palavras: Palavra[], de: number, ate: number): { de: number; ate: number } {
  const [i, j] = de <= ate ? [de, ate] : [ate, de];
  return {
    de: Math.max(palavras[i - 1]?.fim ?? 0, palavras[i].inicio - 0.15),
    ate: Math.min(palavras[j + 1]?.inicio ?? Number.POSITIVE_INFINITY, palavras[j].fim + 0.2),
  };
}

/** O trecho que estende o corte numa ponta: os segundos do original logo antes do começo ou logo depois do fim. */
export function trechoParaEstender(clipes: Clipe[], midiaId: string, lado: "comeco" | "fim", duracaoDaMidia: number, segundos = ESTENDER_S): { de: number; ate: number } | null {
  const trechos = trechosNoCorte(clipes, midiaId);
  if (!trechos.length) return null;
  const pedaco =
    lado === "comeco"
      ? { de: Math.max(0, trechos[0].de - segundos), ate: trechos[0].de }
      : { de: trechos.at(-1)!.ate, ate: Math.min(duracaoDaMidia, trechos.at(-1)!.ate + segundos) };
  return pedaco.ate - pedaco.de >= TRECHO_MINIMO_S ? pedaco : null;
}
