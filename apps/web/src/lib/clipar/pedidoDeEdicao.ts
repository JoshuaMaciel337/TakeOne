// O pedido de edição em palavras (ADR 0004, 14.10): o plano que o modelo local devolve (core/modelos/pedido_edicao.py)
// vira opções da montagem dos cortes (opcoesDoPlano) ou, no editor, um projeto novo feito pelos comandos de sempre
// (aplicarPlano), que entra num passo só do desfazer. A ordem importa: o formato e o enquadramento primeiro (o
// enquadramento refaz os keyframes de posição e tira os de escala), depois os cortes de tempo (as pausas e as
// frases), e só então as legendas, o título, a ênfase e os zooms sobre a linha já cortada. Funções puras: a fala,
// o rosto e os tamanhos das mídias chegam prontos.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { executarComando, type Comando } from "../projeto/comandos.ts";
import { type Contexto, ZOOM_DO_DESTAQUE } from "../projeto/edicao.ts";
import { falaDosClipes, type Palavra, palavrasDaLinha, type PalavraDaLinha } from "../projeto/fala.ts";
import { ESTILOS_ANIMADOS } from "../projeto/legendaAnimada.ts";
import { ESTILOS_DE_LEGENDA } from "../projeto/legendas.ts";
import { legendasDaFala, opcoesParaOQuadro } from "../projeto/legendasDaFala.ts";
import { trechosParaLimpar } from "../projeto/limpezaDeFala.ts";
import type { Clipe, Faixa, Projeto, Proporcao } from "../projeto/modelo.ts";
import { type AmostraDeRosto, reenquadrarPeloRosto } from "../projeto/reenquadrar.ts";
import { EFEITOS_PRONTOS } from "../projeto/som.ts";
import type { Texto } from "../projeto/texto.ts";
import {
  type AjusteDaLegenda,
  ALTURA_DA_POSICAO,
  estiloComAjuste,
  linhasDoTitulo,
  type OpcoesDaMontagem,
  porTitulo,
  zoomsNasPalavrasDeFoco,
} from "./montarCorte.ts";
import { PARTES_DA_PREGACAO, type PartesDaEdicao } from "./modeloDePregacao.ts";

type Acao = "manter" | "por" | "tirar";

export type PlanoDaEdicao = {
  resumo: string;
  legenda: {
    acao: Acao | "mudar";
    estilo: string;
    tamanho: "manter" | "menor" | "maior" | "bem_maior";
    cor: string;
    posicao: "manter" | "baixo" | "meio" | "alto";
    caixa_alta: "manter" | "sim" | "nao";
  };
  enfase: { acao: Acao; cor: string };
  titulo: { acao: Acao | "trocar"; texto: string };
  zoom: { acao: Acao; palavras: string[]; frases: number[] };
  pausas: "manter" | "tirar";
  cortar_frases: number[];
  formato: "manter" | Proporcao;
  enquadrar: "manter" | "rosto" | "centro" | "inteiro";
  musica: "manter" | "abaixar" | "aumentar" | "tirar";
  // O modelo de pregação e as ações dele (14.12g); opcionais, porque os planos guardados antes deles não os têm
  modelo?: "manter" | "pregacao";
  cor_video?: string;
  voz?: { efeito: string; frases: number[] };
  transicoes?: "manter" | "luz" | "flash" | "clarao" | "fusao" | "nenhuma";
  sons?: "manter" | "sim" | "nao";
  graficos?: { acao: "manter" | "por"; assunto: string };
  imagens?: { acao: "manter" | "por"; busca: string };
  cartela?: { acao: "manter" | "por"; texto: string };
  legenda_animada?: string;
  pergunta: { texto: string; opcoes: string[] };
  nao_deu: string[];
};

/**
 * As partes do modelo de pregação que o plano pede (lib/clipar/modeloDePregacao.ts), ou null quando não pede
 * nenhuma. O modelo de pregação inteiro liga todas; as frases da voz viram os trechos delas na linha.
 */
export function partesDoPlano(plano: PlanoDaEdicao, frases: FraseDaLinha[]): PartesDaEdicao | null {
  if (plano.modelo === "pregacao") return PARTES_DA_PREGACAO;
  const partes: PartesDaEdicao = {};
  if (plano.cor_video && plano.cor_video !== "manter") partes.cor = plano.cor_video;
  if (plano.voz && plano.voz.efeito !== "manter") {
    const porNumero = new Map(frases.map((frase) => [frase.n, frase]));
    const trechos = plano.voz.frases.flatMap((n) => (porNumero.has(n) ? [{ inicio: porNumero.get(n)!.inicio, fim: porNumero.get(n)!.fim }] : []));
    partes.voz = { efeito: plano.voz.efeito, trechos };
  }
  if (plano.transicoes && plano.transicoes !== "manter") partes.transicoes = plano.transicoes;
  if (plano.sons === "sim") partes.sons = true;
  if (plano.graficos?.acao === "por") partes.graficos = plano.graficos.assunto ? { assunto: plano.graficos.assunto } : {};
  if (plano.imagens?.acao === "por") partes.imagens = plano.imagens.busca ? { busca: plano.imagens.busca } : {};
  if (plano.cartela?.acao === "por") partes.cartela = plano.cartela.texto ? { texto: plano.cartela.texto } : {};
  return Object.keys(partes).length ? partes : null;
}

/** O estilo da legenda animada que o plano pede (o modelo de pregação usa a editorial), ou null. */
export function legendaAnimadaDoPlano(plano: PlanoDaEdicao | null | undefined): string | null {
  if (!plano) return null;
  if (plano.legenda_animada && plano.legenda_animada !== "manter") return plano.legenda_animada;
  return plano.modelo === "pregacao" ? "editorial" : null;
}

/** As cores do plano (as mesmas de core/modelos/pedido_edicao.py). */
export const CORES_DO_PLANO: Record<string, string> = {
  branco: "#ffffff",
  preto: "#000000",
  amarelo: "#ffd60a",
  vermelho: "#ff3b30",
  verde: "#2ee6a6",
  azul: "#2f80ff",
  ciano: "#22d3ee",
  rosa: "#ff3d77",
  laranja: "#ff8a00",
  roxo: "#9b5cff",
  dourado: "#e6b422",
  cinza: "#9aa0a6",
};

/** O hex de uma cor do plano: "marca" é a principal do kit; "manter" (ou o kit vazio) não muda nada. */
export function corDoPlano(nome: string, corDaMarca: string | null): string | undefined {
  if (nome === "marca") return corDaMarca ?? undefined;
  return CORES_DO_PLANO[nome];
}

/** O que o plano muda no estilo das legendas. */
export function ajusteDoPlano(plano: PlanoDaEdicao, corDaMarca: string | null): AjusteDaLegenda {
  const { legenda } = plano;
  return {
    ...(legenda.tamanho !== "manter" ? { tamanho: legenda.tamanho } : {}),
    ...(corDoPlano(legenda.cor, corDaMarca) ? { cor: corDoPlano(legenda.cor, corDaMarca) } : {}),
    ...(legenda.caixa_alta !== "manter" ? { caixaAlta: legenda.caixa_alta === "sim" } : {}),
    ...(legenda.posicao !== "manter" ? { posicao: legenda.posicao } : {}),
  };
}

/**
 * O "Como quer a edição" da clipagem nas opções da montagem de todos os cortes. Vale o que é de todos os cortes: as
 * legendas, a ênfase, o título ligado ou não, os zooms (e as palavras deles), as pausas e o enquadramento.
 */
export function opcoesDoPlano(plano: PlanoDaEdicao | null | undefined, base: OpcoesDaMontagem, corDaMarca: string | null): OpcoesDaMontagem {
  if (!plano) return base;
  const opcoes: OpcoesDaMontagem = { ...base, ajusteDaLegenda: ajusteDoPlano(plano, corDaMarca) };
  if (plano.legenda.acao === "tirar") opcoes.legenda = null;
  else if (plano.legenda.estilo !== "manter") opcoes.legenda = plano.legenda.estilo;
  else if (plano.legenda.acao === "por" && !opcoes.legenda) opcoes.legenda = "palavra";
  const corDaEnfase = corDoPlano(plano.enfase.cor, corDaMarca);
  if (corDaEnfase) opcoes.corDeDestaque = corDaEnfase;
  if (plano.titulo.acao === "tirar") opcoes.titulo = false;
  else if (plano.titulo.acao === "por") opcoes.titulo = true;
  if (plano.zoom.acao === "tirar") opcoes.zooms = false;
  else if (plano.zoom.acao === "por") {
    opcoes.zooms = true;
    opcoes.palavrasDeZoom = plano.zoom.palavras;
  }
  if (plano.pausas === "tirar") opcoes.limpar = true;
  if (plano.enquadrar !== "manter") opcoes.enquadrar = plano.enquadrar;
  return opcoes;
}

// -----------------------------------------------
// As frases da linha do tempo (as que vão ao modelo, numeradas)
// -----------------------------------------------
export type FraseDaLinha = { n: number; texto: string; inicio: Tick; fim: Tick };

const PAUSA_DE_FRASE = 0.7 * TICKS_POR_SEGUNDO;
const PALAVRAS_POR_FRASE = 40;

/** A fala da linha em frases (pela pontuação, uma pausa de 0,7 s ou 40 palavras), como core/modelos/cortes.py. */
export function frasesDaLinha(palavras: PalavraDaLinha[]): FraseDaLinha[] {
  const frases: FraseDaLinha[] = [];
  let comeco = 0;
  palavras.forEach((palavra, i) => {
    const proxima = palavras[i + 1];
    const fecha =
      !proxima || /[.!?…]["»”)]?$/.test(palavra.texto) || proxima.inicio - palavra.fim >= PAUSA_DE_FRASE || i - comeco + 1 >= PALAVRAS_POR_FRASE;
    if (!fecha) return;
    const grupo = palavras.slice(comeco, i + 1);
    frases.push({ n: frases.length, texto: grupo.map((p) => p.texto.trim()).join(" "), inicio: grupo[0].inicio, fim: grupo[grupo.length - 1].fim });
    comeco = i + 1;
  });
  return frases;
}

/** O instante t depois de tirar os intervalos (em ordem e sem sobreposição): o que caía num deles vai ao começo dele. */
export function depoisDosCortes(t: Tick, intervalos: { inicio: Tick; fim: Tick }[]): Tick {
  let tirado = 0;
  for (const { inicio, fim } of intervalos) {
    if (t <= inicio) break;
    tirado += Math.min(t, fim) - inicio;
  }
  return t - tirado;
}

/** Junta os intervalos em ordem, sem sobreposição. */
function juntar(intervalos: { inicio: Tick; fim: Tick }[]): { inicio: Tick; fim: Tick }[] {
  const ordenados = [...intervalos].filter((i) => i.fim > i.inicio).sort((a, b) => a.inicio - b.inicio);
  const saida: { inicio: Tick; fim: Tick }[] = [];
  for (const intervalo of ordenados) {
    const ultimo = saida.at(-1);
    if (ultimo && intervalo.inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, intervalo.fim);
    else saida.push({ ...intervalo });
  }
  return saida;
}

// -----------------------------------------------
// O que o projeto tem hoje (vai ao modelo)
// -----------------------------------------------
const principalDe = (projeto: Projeto): Clipe[] => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
const faixasDo = (projeto: Projeto, tipo: Faixa["tipo"]) => projeto.faixas.filter((faixa) => faixa.tipo === tipo);

/** O título: o primeiro texto que começa no primeiro segundo. */
export function tituloDoProjeto(projeto: Projeto): Clipe | undefined {
  return faixasDo(projeto, "texto")
    .flatMap((faixa) => faixa.clipes)
    .filter((clipe) => clipe.texto && clipe.inicio < TICKS_POR_SEGUNDO)
    .sort((a, b) => a.inicio - b.inicio)[0];
}

export type EstadoDoProjeto = { formato: string; legendas: boolean; titulo: string | null; zooms: boolean; musica: boolean };

export function estadoDoProjeto(projeto: Projeto): EstadoDoProjeto {
  return {
    formato: projeto.proporcao,
    legendas: faixasDo(projeto, "legenda").some((faixa) => faixa.clipes.length > 0),
    titulo: tituloDoProjeto(projeto)?.texto?.conteudo.replace(/\s+/g, " ") ?? null,
    zooms: principalDe(projeto).some((clipe) => (clipe.keyframes?.escala?.length ?? 0) > 0),
    musica: faixasDo(projeto, "audio").some((faixa) => faixa.clipes.length > 0),
  };
}

// -----------------------------------------------
// Aplicar o plano no editor
// -----------------------------------------------
export type DadosDoPlano = {
  ctx: Contexto;
  /** As palavras da transcrição de cada mídia da principal (segundos da mídia). */
  palavras: Map<string, Palavra[]>;
  /** As frases que foram ao modelo (as mesmas da linha de agora, ou nada se a linha mudou). */
  frases: FraseDaLinha[];
  /** Os tamanhos das mídias (como aparecem), para enquadrar. */
  tamanhos: Map<string, { largura: number; altura: number }>;
  /** As amostras do rosto de cada mídia, quando o plano enquadra no rosto. */
  rostos: Map<string, AmostraDeRosto[]>;
  corDaMarca: string | null;
  /** O título a usar quando o plano pede um sem dizer qual (o do corte, num corte do Clipar). */
  tituloPadrao?: { texto: string; foco: string[] } | null;
};

export type ResultadoDoPlano = { projeto: Projeto; feitos: string[]; naoDeu: string[] };

const FATOR_DA_MUSICA = { abaixar: 0.4, aumentar: 1.6 } as const;
const DURACAO_DO_ZOOM_NA_FRASE = 2.5 * TICKS_POR_SEGUNDO;
const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/**
 * Os zooms que a principal já tem, como trechos da linha (a inversa do zoomNosTrechos: cada grupo sai do tamanho do
 * clipe, vai ao zoom e volta). O zoomNosTrechos pula o clipe que já tem zoom, então pôr mais um é tirar os de antes e
 * pôr os de antes com os novos.
 */
export function zoomsDaPrincipal(projeto: Projeto): { inicio: Tick; fim: Tick }[] {
  const entrada = Math.round(ZOOM_DO_DESTAQUE.entrada * TICKS_POR_SEGUNDO);
  const saida = Math.round(ZOOM_DO_DESTAQUE.saida * TICKS_POR_SEGUNDO);
  const trechos: { inicio: Tick; fim: Tick }[] = [];
  for (const clipe of principalDe(projeto)) {
    const pontos = clipe.keyframes?.escala ?? [];
    if (pontos.length < 2) continue;
    const base = Math.min(...pontos.map((ponto) => ponto.valor));
    let comeco: Tick | null = null;
    for (let i = 0; i < pontos.length; i++) {
      const noZoom = pontos[i].valor > base * 1.001;
      if (noZoom && comeco === null) comeco = pontos[i - 1]?.t ?? pontos[i].t;
      if (!noZoom && comeco !== null) {
        trechos.push({ inicio: clipe.inicio + comeco + entrada, fim: clipe.inicio + pontos[i].t - saida });
        comeco = null;
      }
    }
  }
  return trechos.filter((trecho) => trecho.fim > trecho.inicio);
}

/** Os textos das legendas que existem, com as palavras de ênfase pelo instante em que começam (na linha). */
function enfaseDasLegendas(projeto: Projeto): Set<Tick> {
  const marcadas = new Set<Tick>();
  for (const faixa of faixasDo(projeto, "legenda")) {
    for (const clipe of faixa.clipes) {
      const tempos = clipe.texto?.tempos;
      for (const j of clipe.texto?.palavras_chave ?? []) if (tempos?.[j] !== undefined) marcadas.add(clipe.inicio + tempos[j]);
    }
  }
  return marcadas;
}

/** O estilo das legendas de hoje (o do primeiro clipe), ou null sem legendas. */
function estiloDasLegendas(projeto: Projeto): Texto | null {
  const clipe = faixasDo(projeto, "legenda").flatMap((faixa) => faixa.clipes)[0];
  return clipe?.texto ?? null;
}

export function aplicarPlano(original: Projeto, plano: PlanoDaEdicao, dados: DadosDoPlano): ResultadoDoPlano {
  const { ctx } = dados;
  let projeto = original;
  const feitos: string[] = [];
  const naoDeu = [...plano.nao_deu];
  const aplicar = (comando: Comando) => {
    projeto = executarComando(projeto, comando, ctx).projeto;
  };
  const tentar = (descricao: string, passo: () => void) => {
    try {
      passo();
    } catch (erro) {
      naoDeu.push(`${descricao}: ${erro instanceof Error ? erro.message : "não deu"}`);
    }
  };

  // 1. O formato e o enquadramento (refaz a posição dos clipes da principal; os zooms vêm depois)
  if (plano.formato !== "manter" && plano.formato !== projeto.proporcao) {
    aplicar({ comando: "projeto.proporcao", parametros: { proporcao: plano.formato } });
    feitos.push(`formato ${plano.formato}`);
  }
  const enquadrar = plano.enquadrar !== "manter" ? plano.enquadrar : plano.formato !== "manter" && plano.formato !== original.proporcao ? "rosto" : null;
  if (enquadrar) {
    const [largura, altura] = projeto.proporcao.split(":").map(Number);
    let mudou = 0;
    let noRosto = 0;
    tentar("enquadrar", () => {
      for (const clipe of principalDe(projeto)) {
        const tamanho = clipe.midia_id ? dados.tamanhos.get(clipe.midia_id) : undefined;
        if (!tamanho || clipe.texto) continue;
        if (enquadrar === "inteiro") {
          aplicar({ comando: "clipe.reenquadrar", parametros: { clipeId: clipe.id, reenquadramento: { escala: 1, x: 0, y: 0, keyframes: {} } } });
          mudou++;
          continue;
        }
        const amostras = enquadrar === "rosto" ? (dados.rostos.get(clipe.midia_id!) ?? []) : [];
        const pelo = amostras.length ? reenquadrarPeloRosto(clipe, amostras, tamanho, { largura, altura }) : null;
        const reenquadramento = pelo ?? reenquadrarPeloRosto(clipe, [{ t: clipe.entrada / TICKS_POR_SEGUNDO, x: 0.5, y: 0.5, a: 1 }], tamanho, { largura, altura });
        if (!reenquadramento) continue;
        aplicar({ comando: "clipe.reenquadrar", parametros: { clipeId: clipe.id, reenquadramento } });
        mudou++;
        if (pelo) noRosto++;
      }
    });
    if (mudou) feitos.push(enquadrar === "inteiro" ? "a imagem inteira" : noRosto ? "enquadrado no rosto" : "enquadrado pelo meio");
    if (enquadrar === "rosto" && mudou && !noRosto) naoDeu.push("não achei rosto: enquadrei pelo meio");
  }

  // 2. Os cortes de tempo, na linha de antes: as frases pedidas e as pausas, num passo
  const marcadasAntes = enfaseDasLegendas(projeto);
  const porNumero = new Map(dados.frases.map((frase, i) => [frase.n, { frase, seguinte: dados.frases[i + 1] }]));
  const cortadas = plano.cortar_frases.flatMap((n) => {
    const achada = porNumero.get(n);
    // Até o começo da frase seguinte: a pausa depois da frase vai junto
    return achada ? [{ inicio: achada.frase.inicio, fim: achada.seguinte ? Math.min(achada.seguinte.inicio, achada.frase.fim + PAUSA_DE_FRASE) : achada.frase.fim }] : [];
  });
  if (plano.cortar_frases.length && !cortadas.length) naoDeu.push("cortar as frases: a linha do tempo mudou desde o pedido");
  const pausas = plano.pausas === "tirar" ? trechosParaLimpar(principalDe(projeto), dados.palavras).map(({ inicio, fim }) => ({ inicio, fim })) : [];
  const intervalos = juntar([...cortadas, ...pausas]);
  if (intervalos.length) {
    tentar("cortar", () => {
      aplicar({ comando: "linha.removerIntervalos", parametros: { intervalos } });
      if (cortadas.length) feitos.push(plural(cortadas.length, "frase cortada", "frases cortadas"));
      if (pausas.length) feitos.push(plural(pausas.length, "pausa tirada", "pausas e hesitações tiradas"));
    });
  } else if (plano.pausas === "tirar") naoDeu.push("tirar as pausas: não achei pausas longas");
  const naLinhaNova = (t: Tick) => depoisDosCortes(t, intervalos);

  // 3. As legendas
  const estiloDeHoje = estiloDasLegendas(projeto);
  const corDaMarca = dados.corDaMarca;
  const ajuste = ajusteDoPlano(plano, corDaMarca);
  const corDaEnfase = corDoPlano(plano.enfase.cor, corDaMarca);
  const acaoDaLegenda = plano.legenda.acao;
  const refazer = acaoDaLegenda === "por" || (acaoDaLegenda === "mudar" && (plano.legenda.estilo !== "manter" || ajuste.tamanho !== undefined || ajuste.caixaAlta !== undefined));
  const idsDasLegendas = () => faixasDo(projeto, "legenda").flatMap((faixa) => faixa.clipes.map((clipe) => clipe.id));
  if (acaoDaLegenda === "tirar") {
    const ids = idsDasLegendas();
    if (ids.length) {
      aplicar({ comando: "clipe.apagar", parametros: { clipeIds: ids } });
      feitos.push("legendas tiradas");
    } else naoDeu.push("tirar as legendas: o vídeo não tem");
  } else if (refazer) {
    // Com outro estilo ou outro tamanho, as linhas precisam caber de novo: as legendas são refeitas pela fala, com
    // as palavras de ênfase de antes pelo instante em que começam
    const escolhido = plano.legenda.estilo !== "manter" ? ESTILOS_DE_LEGENDA.find((estilo) => estilo.id === plano.legenda.estilo)?.texto : null;
    const base = escolhido ?? (estiloDeHoje ? { ...estiloDeHoje, conteudo: "", tempos: null, palavras_chave: null } : ESTILOS_DE_LEGENDA.find((estilo) => estilo.id === "palavra")!.texto);
    const estilo: Texto = { ...estiloComAjuste(base, ajuste), ...(corDaEnfase ? { cor_chave: corDaEnfase } : estiloDeHoje?.cor_chave ? { cor_chave: estiloDeHoje.cor_chave } : {}) };
    const novas = legendasDaFala(principalDe(projeto), dados.palavras, opcoesParaOQuadro(projeto.proporcao, estilo));
    if (!novas.length) naoDeu.push("legendas: não achei fala na faixa principal");
    else {
      tentar("legendas", () => {
        const marcadas = new Set([...marcadasAntes].map(naLinhaNova));
        const antigas = idsDasLegendas();
        if (antigas.length) aplicar({ comando: "clipe.apagar", parametros: { clipeIds: antigas } });
        const legendas = novas.map((legenda) => {
          const numeros = (legenda.tempos ?? []).flatMap((tempo, j) => (marcadas.has(tempo) ? [j] : []));
          return { ...legenda, palavras_chave: numeros.length ? numeros : null };
        });
        aplicar({ comando: "legenda.importar", parametros: { legendas, estilo } });
        feitos.push(antigas.length ? "legendas refeitas no estilo pedido" : `${legendas.length} legendas`);
      });
    }
  } else if (acaoDaLegenda === "mudar") {
    const faixas = faixasDo(projeto, "legenda");
    if (!faixas.length) naoDeu.push("mudar as legendas: o vídeo não tem");
    else if (ajuste.cor) {
      for (const faixa of faixas) aplicar({ comando: "legenda.estilo", parametros: { faixaId: faixa.id, estilo: { cor: ajuste.cor } } });
      feitos.push("cor das legendas");
    }
  }
  if (ajuste.posicao && acaoDaLegenda !== "tirar" && idsDasLegendas().length) {
    aplicar({ comando: "clipe.transformar", parametros: { clipeIds: idsDasLegendas(), transformacao: { y: ALTURA_DA_POSICAO[ajuste.posicao] } } });
    feitos.push(`legendas ${ajuste.posicao === "meio" ? "no meio" : ajuste.posicao === "alto" ? "no alto" : "embaixo"}`);
  }

  // 4. A ênfase das legendas
  if (plano.enfase.acao === "tirar") {
    const ids = faixasDo(projeto, "legenda").flatMap((faixa) => faixa.clipes.filter((clipe) => clipe.texto?.palavras_chave?.length).map((clipe) => clipe.id));
    if (ids.length) {
      aplicar({ comando: "texto.mudar", parametros: { clipeIds: ids, texto: { palavras_chave: null } } });
      feitos.push("palavras de ênfase tiradas");
    }
  } else if (plano.enfase.acao === "por" && corDaEnfase && !refazer) {
    const faixas = faixasDo(projeto, "legenda");
    for (const faixa of faixas) aplicar({ comando: "legenda.estilo", parametros: { faixaId: faixa.id, estilo: { cor_chave: corDaEnfase } } });
    if (faixas.length) feitos.push("cor das palavras de ênfase");
    if (!enfaseDasLegendas(projeto).size) naoDeu.push("escolher as palavras de ênfase: use \"Destacar palavras-chave\" na ferramenta Legendas");
  }

  // 5. O título
  const titulo = tituloDoProjeto(projeto);
  const corDoTitulo = corDaEnfase ?? corDaMarca ?? "#ffd60a";
  if (plano.titulo.acao === "tirar") {
    if (titulo) {
      aplicar({ comando: "clipe.apagar", parametros: { clipeIds: [titulo.id] } });
      feitos.push("título tirado");
    } else naoDeu.push("tirar o título: o vídeo não tem");
  } else if (plano.titulo.acao === "trocar" && titulo) {
    const opcoes = opcoesParaOQuadro(projeto.proporcao, titulo.texto!);
    const linhas = linhasDoTitulo(titulo.texto!.caixa_alta ? plano.titulo.texto.toUpperCase() : plano.titulo.texto, opcoes.maxCaracteres, 3);
    aplicar({ comando: "texto.mudar", parametros: { clipeIds: [titulo.id], texto: { conteudo: (linhas ?? [plano.titulo.texto]).join("\n"), palavras_chave: null } } });
    feitos.push("título trocado");
  } else if (plano.titulo.acao === "por" || (plano.titulo.acao === "trocar" && !titulo)) {
    const texto = plano.titulo.texto || dados.tituloPadrao?.texto || "";
    if (titulo && plano.titulo.acao === "por") naoDeu.push("pôr o título: o vídeo já tem um");
    else if (!texto) naoDeu.push("pôr o título: diga qual");
    else {
      const comTitulo = porTitulo(projeto, ctx, texto, plano.titulo.texto ? [] : (dados.tituloPadrao?.foco ?? []), corDoTitulo);
      if (comTitulo) {
        projeto = comTitulo;
        feitos.push("título");
      } else naoDeu.push("pôr o título: longo demais para o quadro");
    }
  }

  // 6. Os zooms
  if (plano.zoom.acao === "tirar") {
    if (principalDe(projeto).some((clipe) => clipe.keyframes?.escala?.length)) {
      aplicar({ comando: "linha.tirarZooms", parametros: {} });
      feitos.push("zooms tirados");
    } else naoDeu.push("tirar os zooms: o vídeo não tem");
  } else if (plano.zoom.acao === "por") {
    const nasFrases = plano.zoom.frases.flatMap((n) => {
      const achada = porNumero.get(n)?.frase;
      if (!achada) return [];
      const inicio = naLinhaNova(achada.inicio);
      return [{ inicio, fim: Math.min(naLinhaNova(achada.fim), inicio + DURACAO_DO_ZOOM_NA_FRASE) }];
    });
    const nasPalavras = plano.zoom.palavras.length ? zoomsNasPalavrasDeFoco(palavrasDaLinha(falaDosClipes(principalDe(projeto), dados.palavras)), plano.zoom.palavras) : [];
    const trechos = juntar([...nasFrases, ...nasPalavras]);
    if (!trechos.length) naoDeu.push("zoom: não achei onde a fala diz isso");
    else {
      tentar("zoom", () => {
        const deAntes = zoomsDaPrincipal(projeto);
        if (deAntes.length) aplicar({ comando: "linha.tirarZooms", parametros: {} });
        aplicar({ comando: "linha.zoomNosTrechos", parametros: { trechos: juntar([...deAntes, ...trechos]) } });
        // O zoom pedido pode juntar com um de antes que encosta nele: conta o pedido, não os grupos
        const depois = zoomsDaPrincipal(projeto);
        if (JSON.stringify(depois) !== JSON.stringify(deAntes)) feitos.push(plural(trechos.length, "zoom", "zooms"));
        else naoDeu.push("zoom: os trechos pedidos já têm zoom");
      });
    }
  }

  // 7. A música (as faixas de áudio)
  if (plano.musica !== "manter") {
    const clipes = faixasDo(projeto, "audio").flatMap((faixa) => faixa.clipes);
    if (!clipes.length) naoDeu.push("a música: o vídeo não tem música");
    else if (plano.musica === "tirar") {
      aplicar({ comando: "clipe.apagar", parametros: { clipeIds: clipes.map((clipe) => clipe.id) } });
      feitos.push("música tirada");
    } else {
      const fator = FATOR_DA_MUSICA[plano.musica];
      for (const clipe of clipes) aplicar({ comando: "clipe.audio", parametros: { clipeIds: [clipe.id], volume: Math.min(4, Math.max(0, clipe.volume * fator)) } });
      feitos.push(plano.musica === "abaixar" ? "música mais baixa" : "música mais alta");
    }
  }
  return { projeto, feitos, naoDeu };
}

/** O plano em frases curtas, para a pessoa conferir antes de aplicar. */
export function descreverPlano(plano: PlanoDaEdicao): string[] {
  const itens: string[] = [];
  const { legenda } = plano;
  if (legenda.acao === "tirar") itens.push("Tirar as legendas");
  else if (legenda.acao !== "manter") {
    const partes = [
      legenda.estilo !== "manter" ? `estilo ${ESTILOS_DE_LEGENDA.find((e) => e.id === legenda.estilo)?.nome ?? legenda.estilo}` : null,
      legenda.tamanho !== "manter" ? { menor: "menores", maior: "maiores", bem_maior: "bem maiores" }[legenda.tamanho] : null,
      legenda.cor !== "manter" ? (legenda.cor === "marca" ? "na cor da marca" : `em ${legenda.cor}`) : null,
      legenda.caixa_alta !== "manter" ? (legenda.caixa_alta === "sim" ? "em caixa alta" : "sem caixa alta") : null,
      legenda.posicao !== "manter" ? { baixo: "embaixo", meio: "no meio", alto: "no alto" }[legenda.posicao] : null,
    ].filter(Boolean);
    itens.push(`${legenda.acao === "por" ? "Pôr legendas" : "Legendas"}${partes.length ? `: ${partes.join(", ")}` : ""}`);
  }
  if (plano.enfase.acao === "tirar") itens.push("Tirar as palavras de ênfase");
  else if (plano.enfase.acao === "por") itens.push(`Palavras de ênfase${plano.enfase.cor !== "manter" ? ` em ${plano.enfase.cor === "marca" ? "cor da marca" : plano.enfase.cor}` : ""}`);
  if (plano.titulo.acao === "tirar") itens.push("Tirar o título");
  else if (plano.titulo.acao === "trocar") itens.push(`Trocar o título por "${plano.titulo.texto}"`);
  else if (plano.titulo.acao === "por") itens.push(plano.titulo.texto ? `Pôr o título "${plano.titulo.texto}"` : "Pôr o título");
  if (plano.zoom.acao === "tirar") itens.push("Tirar os zooms");
  else if (plano.zoom.acao === "por") {
    const onde = [plano.zoom.palavras.length ? `quando a fala diz ${plano.zoom.palavras.map((p) => `"${p}"`).join(", ")}` : null, plano.zoom.frases.length ? plural(plano.zoom.frases.length, "frase", "frases") : null];
    itens.push(`Zoom ${onde.filter(Boolean).join(" e em ")}`);
  }
  if (plano.pausas === "tirar") itens.push("Tirar as pausas e as hesitações");
  if (plano.cortar_frases.length) itens.push(`Cortar ${plural(plano.cortar_frases.length, "frase", "frases")}`);
  if (plano.formato !== "manter") itens.push(`Formato ${plano.formato}`);
  if (plano.enquadrar !== "manter") itens.push({ rosto: "Enquadrar no rosto", centro: "Enquadrar pelo meio", inteiro: "Mostrar a imagem inteira" }[plano.enquadrar]);
  if (plano.musica !== "manter") itens.push({ abaixar: "Abaixar a música", aumentar: "Aumentar a música", tirar: "Tirar a música" }[plano.musica]);
  if (plano.modelo === "pregacao") itens.push("O modelo de pregação inteiro: cor de cinema, voz de rádio, luzes nos cortes com som, gráficos, imagens de apoio, cartela e legenda editorial");
  else {
    const cores: Record<string, string> = { cinema: "de cinema", frio: "fria", quente: "quente", pb: "preto e branco", vivido: "viva", drama: "dramática", antigo: "antiga", natural: "natural" };
    if (plano.cor_video && plano.cor_video !== "manter") itens.push(`Cor ${cores[plano.cor_video] ?? plano.cor_video} no vídeo`);
    if (plano.voz && plano.voz.efeito !== "manter") {
      const nome = EFEITOS_PRONTOS.find((efeito) => efeito.id === plano.voz!.efeito)?.nome ?? plano.voz.efeito;
      const onde = plano.voz.frases.length ? `em ${plural(plano.voz.frases.length, "frase", "frases")}` : "na primeira frase";
      itens.push(plano.voz.efeito === "nenhum" ? `Tirar o efeito da voz ${onde}` : `Voz "${nome}" ${onde}`);
    }
    const transicoes: Record<string, string> = { luz: "Clarões e flashes nos cortes", flash: "Flash nos cortes", clarao: "Clarão nos cortes", fusao: "Fusão nos cortes", nenhuma: "Tirar as transições" };
    if (plano.transicoes && plano.transicoes !== "manter") itens.push(transicoes[plano.transicoes]);
    if (plano.sons === "sim") itens.push("Efeitos sonoros nas transições, nos gráficos e na cartela");
    if (plano.graficos?.acao === "por") itens.push(plano.graficos.assunto ? `Gráfico quando a fala toca em "${plano.graficos.assunto}"` : "Gráficos quando a fala toca nos assuntos");
    if (plano.imagens?.acao === "por") itens.push(plano.imagens.busca ? `Imagem de apoio: "${plano.imagens.busca}"` : "Imagens de apoio pela fala");
    if (plano.cartela?.acao === "por") itens.push(plano.cartela.texto ? `Cartela final: "${plano.cartela.texto}"` : "Cartela final com o título");
  }
  const animada = legendaAnimadaDoPlano(plano);
  if (animada && plano.modelo !== "pregacao") itens.push(`Legenda animada: ${ESTILOS_ANIMADOS.find((estilo) => estilo.id === animada)?.nome ?? animada}`);
  return itens;
}

/** As frases do plano que vão cortar, no texto (para conferir). */
export function frasesCortadas(plano: PlanoDaEdicao, frases: FraseDaLinha[]): string[] {
  const porNumero = new Map(frases.map((frase) => [frase.n, frase.texto]));
  return plano.cortar_frases.flatMap((n) => (porNumero.has(n) ? [porNumero.get(n)!] : []));
}
