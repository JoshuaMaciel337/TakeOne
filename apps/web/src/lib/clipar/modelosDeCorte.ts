// Modelos de corte (ADR 0004, 14.6): uma receita, não uma linha do tempo fixa. Ela diz como cada corte sai: o
// enquadramento, a limpeza das pausas, a legenda (estilo, lugar, tamanho, ou a animada), o título, os zooms, a
// ênfase, a cor do vídeo, a voz na abertura, as transições e os sons, os gráficos, as imagens de apoio, a cartela, o
// logo do kit, a chamada no fim, a música e a retenção (a barra de progresso, o quadro do original e a distração). A receita vira as opções da montagem (opcoesDoModelo), as partes da
// edição de pregação (partesDoModelo) e, no editor, um plano de edição (planoDoModelo), pelos caminhos que já
// existem; o logo, a chamada e a música entram por comExtras (as mídias, extrasDoModelo.ts pede). Aplicado num vídeo
// já editado, o modelo refaz as legendas, põe ou tira o título, os zooms e a ênfase e põe o que pede; o que ele deixa
// sem nada (a cor, a voz, as transições, o logo, a chamada, a música) fica como está. Funções puras.
import { abaixamentoNaFala, type TrechoDeFala } from "../projeto/abaixar.ts";
import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import type { ModoDaCensura } from "../projeto/censura.ts";
import type { Marca } from "../projeto/marca.ts";
import type { Clipe, Projeto, Transformacao } from "../projeto/modelo.ts";
import { ESTILOS_ANIMADOS } from "../projeto/legendaAnimada.ts";
import { ESTILOS_DE_LEGENDA } from "../projeto/legendas.ts";
import { EFEITOS_PRONTOS } from "../projeto/som.ts";
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Midia } from "../tipos.ts";
import { comMidiasDoPlano, DURACAO_DA_CARTELA, type PartesDaEdicao } from "./modeloDePregacao.ts";
import { ALTURA_DA_POSICAO, type OpcoesDaMontagem } from "./montarCorte.ts";
import type { PlanoDaEdicao } from "./pedidoDeEdicao.ts";
import { barraDoProjeto, ehDistracao, ehFormaDaBarra, ehQuadroNaCaixa, type PosicaoDaBarra, QUANDO_DO_QUADRO, type QuandoDoQuadro } from "./retencao.ts";

export type Transicoes = "nenhuma" | "fusao" | "flash" | "clarao" | "luz";
export type ModeloDeChamada = "chamada_seguir" | "cta" | "chamada_comente";

export type ReceitaDoCorte = {
  enquadrar: "rosto" | "centro" | "inteiro";
  limpar: boolean;
  /** O estilo das legendas de sempre (ESTILOS_DE_LEGENDA), ou null sem legendas. */
  legenda: string | null;
  /** A legenda animada (ESTILOS_ANIMADOS) por cima das legendas, que ficam escondidas; null: as de sempre. */
  legenda_animada: string | null;
  posicao: "baixo" | "meio" | "alto";
  tamanho: "normal" | "menor" | "maior" | "bem_maior";
  titulo: boolean;
  zooms: boolean;
  enfase: boolean;
  /** Um filtro pronto (cinema, frio, quente, vivido...) na principal, ou null. */
  cor: string | null;
  /** O efeito de voz na primeira frase (EFEITOS_PRONTOS), ou null. */
  voz: string | null;
  transicoes: Transicoes;
  sons: boolean;
  graficos: boolean;
  imagens: boolean;
  cartela: boolean;
  logo: boolean;
  chamada: { modelo: ModeloDeChamada; texto: string } | null;
  /** Uma música da biblioteca do espaço (com licença), baixa e abaixando na fala. */
  musica: { midia_id: string; volume: number; abaixar: boolean } | null;
  /** A retenção (14.8): a barra de progresso, o quadro do original numa caixa e os vídeos de distração (um por corte). */
  barra: PosicaoDaBarra | null;
  quadro_original: QuandoDoQuadro | null;
  distracao: string[];
  /** O emoji automático: o LLM põe um emoji acima de algumas legendas (14.8). */
  emojis: boolean;
  /** O gancho narrado: uma frase do LLM falada no começo, com o som do vídeo abaixando (14.8). */
  gancho: boolean;
  /** A censura das palavras da lista do espaço: com um bipe ou o silêncio (14.8). */
  censura: ModoDaCensura | null;
};

export type ModeloDeCorte = { id: string; nome: string; receita: ReceitaDoCorte };

export const RECEITA_PADRAO: ReceitaDoCorte = {
  enquadrar: "rosto",
  limpar: true,
  legenda: "palavra",
  legenda_animada: null,
  posicao: "baixo",
  tamanho: "normal",
  titulo: true,
  zooms: true,
  enfase: true,
  cor: null,
  voz: null,
  transicoes: "nenhuma",
  sons: false,
  graficos: false,
  imagens: false,
  cartela: false,
  logo: false,
  chamada: null,
  musica: null,
  barra: null,
  quadro_original: null,
  distracao: [],
  emojis: false,
  gancho: false,
  censura: null,
};

export const CHAMADAS: { id: ModeloDeChamada; nome: string; padrao: string }[] = [
  { id: "chamada_seguir", nome: "Botão seguir", padrao: "Gostou? Segue para mais" },
  { id: "cta", nome: "Chamada com seta", padrao: "Link na bio" },
  { id: "chamada_comente", nome: "Comente a palavra", padrao: "QUERO" },
];

export const CORES_DO_VIDEO: { id: string; nome: string }[] = [
  { id: "cinema", nome: "Cinema (fria)" },
  { id: "frio", nome: "Fria" },
  { id: "quente", nome: "Quente" },
  { id: "vivido", nome: "Viva" },
  { id: "suave", nome: "Suave" },
  { id: "drama", nome: "Dramática" },
  { id: "pb", nome: "Preto e branco" },
  { id: "antigo", nome: "Antiga" },
];

export const TRANSICOES: { id: Transicoes; nome: string }[] = [
  { id: "nenhuma", nome: "Corte seco" },
  { id: "fusao", nome: "Fusão" },
  { id: "flash", nome: "Flash" },
  { id: "clarao", nome: "Clarão" },
  { id: "luz", nome: "Clarão e flash" },
];

/** Os modelos prontos, desenhados aqui. O "Pregação" é o 14.12; os outros três são o 14.6. */
export const MODELOS_PRONTOS: (ModeloDeCorte & { descricao: string })[] = [
  {
    id: "padrao",
    nome: "Do jeito de sempre",
    descricao: "Rosto no quadro, sem pausas, palavra falada nas legendas, título e zooms nas palavras de foco.",
    receita: RECEITA_PADRAO,
  },
  {
    id: "conversa",
    nome: "Conversa",
    descricao: "Para podcast e entrevista: legenda em caixa no meio, título, a cor suave, o logo do kit e o botão seguir no fim.",
    receita: { ...RECEITA_PADRAO, legenda: "caixa", posicao: "meio", zooms: false, cor: "suave", logo: true, chamada: { modelo: "chamada_seguir", texto: "Gostou? Segue para mais" } },
  },
  {
    id: "ritmo",
    nome: "Ritmo rápido",
    descricao: "Para ganchos e dicas: legenda animada pulando, cor viva, flash com som nos cortes, zooms, emojis, a barra de progresso e o “comente” no fim.",
    receita: {
      ...RECEITA_PADRAO,
      legenda_animada: "pulando",
      tamanho: "maior",
      cor: "vivido",
      transicoes: "flash",
      sons: true,
      chamada: { modelo: "chamada_comente", texto: "QUERO" },
      barra: "baixo",
      emojis: true,
    },
  },
  {
    id: "minimalista",
    nome: "Minimalista",
    descricao: "Só o essencial: legenda pequena com contorno embaixo, sem título, sem zooms e sem ênfase.",
    receita: { ...RECEITA_PADRAO, legenda: "contorno", tamanho: "menor", titulo: false, zooms: false, enfase: false },
  },
  {
    id: "pregacao",
    nome: "Pregação",
    descricao: "Cor fria de cinema, voz de rádio na abertura, clarão e flash com som, gráficos e imagens pela fala, legenda editorial e a cartela final.",
    receita: {
      ...RECEITA_PADRAO,
      legenda_animada: "editorial",
      cor: "cinema",
      voz: "radio",
      transicoes: "luz",
      sons: true,
      graficos: true,
      imagens: true,
      cartela: true,
    },
  },
];

const um = <T extends string>(valor: unknown, validos: readonly T[], padrao: T): T => (validos.includes(valor as T) ? (valor as T) : padrao);
const ou = <T>(valor: unknown, validos: readonly string[], padrao: T): string | T => (typeof valor === "string" && validos.includes(valor) ? valor : padrao);
const sim = (valor: unknown, padrao: boolean) => (typeof valor === "boolean" ? valor : padrao);

/** A receita guardada (de uma versão antiga, ou de fora) com tudo o que falta no padrão e o que não vale tirado. */
export function receitaValida(dados: unknown): ReceitaDoCorte {
  const d = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;
  const p = RECEITA_PADRAO;
  const chamada = d.chamada as Record<string, unknown> | null | undefined;
  const musica = d.musica as Record<string, unknown> | null | undefined;
  return {
    enquadrar: um(d.enquadrar, ["rosto", "centro", "inteiro"] as const, p.enquadrar),
    limpar: sim(d.limpar, p.limpar),
    legenda: d.legenda === null ? null : ou(d.legenda, ESTILOS_DE_LEGENDA.map((e) => e.id), p.legenda),
    legenda_animada: ou(d.legenda_animada, ESTILOS_ANIMADOS.map((e) => e.id), null),
    posicao: um(d.posicao, ["baixo", "meio", "alto"] as const, p.posicao),
    tamanho: um(d.tamanho, ["normal", "menor", "maior", "bem_maior"] as const, p.tamanho),
    titulo: sim(d.titulo, p.titulo),
    zooms: sim(d.zooms, p.zooms),
    enfase: sim(d.enfase, p.enfase),
    cor: ou(d.cor, CORES_DO_VIDEO.map((c) => c.id), null),
    voz: ou(d.voz, EFEITOS_PRONTOS.filter((e) => e.id !== "nenhum").map((e) => e.id), null),
    transicoes: um(d.transicoes, TRANSICOES.map((t) => t.id), p.transicoes),
    sons: sim(d.sons, p.sons),
    graficos: sim(d.graficos, p.graficos),
    imagens: sim(d.imagens, p.imagens),
    cartela: sim(d.cartela, p.cartela),
    logo: sim(d.logo, p.logo),
    chamada:
      chamada && typeof chamada === "object"
        ? { modelo: um(chamada.modelo, CHAMADAS.map((c) => c.id), "chamada_seguir"), texto: String(chamada.texto ?? "").slice(0, 60) }
        : null,
    musica:
      musica && typeof musica === "object" && typeof musica.midia_id === "string"
        ? { midia_id: musica.midia_id, volume: Math.min(1, Math.max(0, Number(musica.volume) || 0.18)), abaixar: sim(musica.abaixar, true) }
        : null,
    barra: ou(d.barra, ["baixo", "alto"], null) as PosicaoDaBarra | null,
    quadro_original: ou(d.quadro_original, QUANDO_DO_QUADRO.map((q) => q.id), null) as QuandoDoQuadro | null,
    emojis: sim(d.emojis, p.emojis),
    gancho: sim(d.gancho, p.gancho),
    censura: ou(d.censura, ["bipe", "silencio"], null) as ModoDaCensura | null,
    distracao: Array.isArray(d.distracao) ? [...new Set(d.distracao.filter((id): id is string => typeof id === "string" && /^[0-9a-f]{24}$/.test(id)))].slice(0, 10) : [],
  };
}

/** O modelo da clipagem: o escolhido na página de opções, ou o de pregação (das clipagens de antes), ou o padrão. */
export function modeloDasOpcoes(opcoes: { modelo_corte?: ModeloDeCorte | null; modelo_edicao?: string }): ModeloDeCorte {
  if (opcoes.modelo_corte) return { ...opcoes.modelo_corte, receita: receitaValida(opcoes.modelo_corte.receita) };
  const id = opcoes.modelo_edicao === "pregacao" ? "pregacao" : "padrao";
  return MODELOS_PRONTOS.find((modelo) => modelo.id === id)!;
}

/** As opções da montagem do corte pela receita. */
export function opcoesDoModelo(receita: ReceitaDoCorte, corDeDestaque: string): OpcoesDaMontagem {
  return {
    limpar: receita.limpar,
    legenda: receita.legenda ?? (receita.legenda_animada ? "palavra" : null),
    titulo: receita.titulo,
    zooms: receita.zooms,
    corDeDestaque,
    enquadrar: receita.enquadrar,
    ajusteDaLegenda: { ...(receita.tamanho !== "normal" ? { tamanho: receita.tamanho } : {}), ...(receita.posicao !== "baixo" ? { posicao: receita.posicao } : {}) },
  };
}

/** As partes da edição de pregação que a receita liga, ou null sem nenhuma. */
export function partesDoModelo(receita: ReceitaDoCorte): PartesDaEdicao | null {
  const partes: PartesDaEdicao = {};
  if (receita.cor) partes.cor = receita.cor;
  if (receita.voz) partes.voz = { efeito: receita.voz };
  if (receita.transicoes !== "nenhuma") partes.transicoes = receita.transicoes;
  if (receita.sons) partes.sons = true;
  if (receita.graficos) partes.graficos = {};
  if (receita.imagens) partes.imagens = {};
  if (receita.cartela) partes.cartela = {};
  return Object.keys(partes).length ? partes : null;
}

/**
 * A receita como plano de edição, para aplicar num projeto aberto (aplicarPlano): refaz as legendas no estilo, põe ou
 * tira o título, os zooms (nas palavras de foco do corte) e a ênfase, tira as pausas e enquadra. A legenda animada e
 * as partes de pregação vão pelo caminho delas.
 */
export function planoDoModelo(receita: ReceitaDoCorte, foco: string[] = []): PlanoDaEdicao {
  const comLegenda = receita.legenda !== null || receita.legenda_animada !== null;
  return {
    resumo: "",
    legenda: {
      acao: comLegenda ? "por" : "tirar",
      estilo: receita.legenda ?? "palavra",
      tamanho: receita.tamanho === "normal" ? "manter" : receita.tamanho,
      cor: "manter",
      posicao: receita.posicao,
      caixa_alta: "manter",
    },
    enfase: { acao: receita.enfase ? "manter" : "tirar", cor: receita.enfase ? "marca" : "manter" },
    titulo: { acao: receita.titulo ? "por" : "tirar", texto: "" },
    zoom: { acao: receita.zooms ? (foco.length ? "por" : "manter") : "tirar", palavras: receita.zooms ? foco : [], frases: [] },
    pausas: receita.limpar ? "tirar" : "manter",
    cortar_frases: [],
    formato: "manter",
    enquadrar: receita.enquadrar,
    musica: "manter",
    legenda_animada: receita.legenda_animada ?? "manter",
    pergunta: { texto: "", opcoes: [] },
    nao_deu: [],
  };
}

// -----------------------------------------------
// Salvar o corte aberto como modelo: a receita lida do projeto
// -----------------------------------------------
const principalDe = (projeto: Projeto): Clipe[] => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
const clipesDo = (projeto: Projeto, tipo: string) => projeto.faixas.filter((faixa) => faixa.tipo === tipo).flatMap((faixa) => faixa.clipes);

/** O estilo de legenda pronto mais parecido com o texto (pela fonte, pela caixa, pelo fundo e pelo destaque). */
function estiloMaisPerto(texto: NonNullable<Clipe["texto"]>): string {
  const nota = (outro: (typeof ESTILOS_DE_LEGENDA)[number]["texto"]) =>
    Number(outro.fonte === texto.fonte) +
    Number(Boolean(outro.caixa_alta) === Boolean(texto.caixa_alta)) +
    Number((outro.fundo_opacidade ?? 0) > 0.3 === (texto.fundo_opacidade ?? 0) > 0.3) +
    2 * Number((outro.destaque?.modo ?? null) === (texto.destaque?.modo ?? null)) +
    Number(outro.cor.toLowerCase() === texto.cor.toLowerCase());
  return [...ESTILOS_DE_LEGENDA].sort((a, b) => nota(b.texto) - nota(a.texto))[0].id;
}

/**
 * A receita de um projeto (o corte aberto no editor): o que ele tem vira o que o modelo põe. O que não dá para ler
 * do projeto (se as pausas foram tiradas) fica como no padrão.
 */
export function receitaDoProjeto(projeto: Projeto, midias: Map<string, Midia>, logoDaMarca: string | null): ReceitaDoCorte {
  const principal = principalDe(projeto);
  const legendas = clipesDo(projeto, "legenda").filter((clipe) => clipe.texto);
  const texto = legendas[0]?.texto;
  const y = legendas[0]?.transformacao.y ?? ALTURA_DA_POSICAO.baixo;
  const posicao = (Object.entries(ALTURA_DA_POSICAO) as [ReceitaDoCorte["posicao"], number][]).sort((a, b) => Math.abs(a[1] - y) - Math.abs(b[1] - y))[0][0];
  const base = texto ? ESTILOS_DE_LEGENDA.find((estilo) => estilo.id === estiloMaisPerto(texto))!.texto : null;
  const razao = base && texto ? texto.tamanho / base.tamanho : 1;
  const tamanho: ReceitaDoCorte["tamanho"] = razao < 0.9 ? "menor" : razao > 1.45 ? "bem_maior" : razao > 1.15 ? "maior" : "normal";
  const todas = projeto.faixas.flatMap((faixa) => faixa.clipes);
  const midiaDe = (clipe: Clipe) => (clipe.midia_id ? midias.get(clipe.midia_id) : undefined);
  const animada = todas.map((clipe) => midiaDe(clipe)?.legenda_animada?.estilo).find((estilo): estilo is string => Boolean(estilo)) ?? null;
  const animacoes = todas.flatMap((clipe) => (midiaDe(clipe)?.animacao ? [midiaDe(clipe)!.animacao!] : []));
  const chamadaAchada = animacoes.find((animacao) => CHAMADAS.some((chamada) => chamada.id === animacao.modelo));
  const transicoes = new Set(principal.map((clipe) => clipe.transicao?.tipo).filter(Boolean));
  const tipoDasTransicoes: Transicoes = transicoes.has("flash") && transicoes.has("clarao") ? "luz" : transicoes.has("flash") ? "flash" : transicoes.has("clarao") ? "clarao" : transicoes.has("fusao") ? "fusao" : "nenhuma";
  const audios = clipesDo(projeto, "audio");
  const sons = audios.some((clipe) => midiaDe(clipe)?.efeito_sonoro);
  const musica = audios.find((clipe) => {
    const midia = midiaDe(clipe);
    return midia && !midia.efeito_sonoro && clipe.duracao > 10 * TICKS_POR_SEGUNDO;
  });
  const filtro = principal.find((clipe) => clipe.cor?.filtro)?.cor?.filtro ?? null;
  const voz = principal.find((clipe) => clipe.efeitos_voz)?.efeitos_voz;
  const nomeDaVoz = voz ? (EFEITOS_PRONTOS.find((efeito) => JSON.stringify(efeito.efeitos) === JSON.stringify(voz))?.id ?? null) : null;
  return receitaValida({
    ...RECEITA_PADRAO,
    enquadrar: principal.some((clipe) => clipe.transformacao.escala > 1.01 || clipe.keyframes?.x?.length) ? "rosto" : "inteiro",
    legenda: base ? estiloMaisPerto(texto!) : null,
    legenda_animada: animada,
    posicao,
    tamanho,
    titulo: clipesDo(projeto, "texto").some((clipe) => clipe.texto && clipe.inicio < TICKS_POR_SEGUNDO),
    zooms: principal.some((clipe) => (clipe.keyframes?.escala?.length ?? 0) > 1),
    enfase: legendas.some((clipe) => clipe.texto?.palavras_chave?.length),
    cor: filtro,
    voz: nomeDaVoz === "nenhum" ? null : nomeDaVoz,
    transicoes: tipoDasTransicoes,
    sons,
    graficos: animacoes.some((animacao) => animacao.modelo.startsWith("pregacao_")),
    imagens: todas.some((clipe) => midiaDe(clipe)?.pixabay),
    cartela: animacoes.some((animacao) => animacao.modelo === "cartela_impacto"),
    logo: Boolean(logoDaMarca) && todas.some((clipe) => clipe.midia_id === logoDaMarca),
    chamada: chamadaAchada ? { modelo: chamadaAchada.modelo, texto: String(chamadaAchada.campos?.chamada ?? chamadaAchada.campos?.palavra ?? chamadaAchada.campos?.texto ?? "") } : null,
    musica: musica ? { midia_id: musica.midia_id, volume: Math.min(1, musica.volume), abaixar: Boolean(musica.abaixamento) } : null,
    barra: barraDoProjeto(projeto, (id) => ehFormaDaBarra(midias.get(id)?.elemento))?.posicao ?? null,
    quadro_original: todas.some((clipe) => ehQuadroNaCaixa(clipe, midiaDe(clipe))) ? "meio" : null,
    emojis: todas.some((clipe) => midiaDe(clipe)?.elemento?.tipo === "emoji"),
    gancho: todas.some((clipe) => midiaDe(clipe)?.fala?.gancho),
    censura: todas.some((clipe) => midiaDe(clipe)?.efeito_sonoro?.id === "bipe") ? "bipe" : null,
    // Os vídeos mudos na faixa de baixo (ou no canto) por cima da principal
    distracao: [
      ...new Set(
        projeto.faixas
          .filter((faixa) => faixa.tipo === "video")
          .flatMap((faixa) => faixa.clipes)
          .filter((clipe) => ehDistracao(clipe, midiaDe(clipe)))
          .map((clipe) => clipe.midia_id!),
      ),
    ],
  });
}

// -----------------------------------------------
// Os extras: o logo, a chamada no fim e a música (extrasDoModelo.ts pede e espera as mídias)
// -----------------------------------------------
const S = TICKS_POR_SEGUNDO;
export const DURACAO_DA_CHAMADA = 4;
const FADE_DA_MUSICA = 1.5 * S;

export type Extras = {
  logo?: { midiaId: string; transformacao: Transformacao } | null;
  chamada?: { midiaId: string; inicio: Tick } | null;
  musica?: { midiaId: string; volume: number; falas: TrechoDeFala[] | null } | null;
};

const fimDe = (projeto: Projeto): Tick => Math.max(0, ...projeto.faixas.flatMap((faixa) => faixa.clipes.map((clipe) => clipe.inicio + clipe.duracao)));

/** Onde a chamada entra: nos últimos segundos, antes da cartela quando o modelo também a põe. */
export function inicioDaChamada(projeto: Projeto, comCartela: boolean): Tick | null {
  const fim = fimDe(projeto) - (comCartela ? DURACAO_DA_CARTELA * S : 0);
  const inicio = fim - DURACAO_DA_CHAMADA * S;
  return inicio >= 2 * S ? inicio : null;
}

/** Os campos da chamada: o texto no campo dela e as duas cores da marca, quando há. */
export function camposDaChamada(receita: ReceitaDoCorte, marca: Marca): Record<string, string> {
  const chamada = receita.chamada!;
  const campo = chamada.modelo === "chamada_comente" ? "palavra" : chamada.modelo === "chamada_seguir" ? "chamada" : "texto";
  return {
    ...(chamada.texto.trim() ? { [campo]: chamada.texto.trim() } : {}),
    ...(marca.cores[0] ? { cor_1: marca.cores[0] } : {}),
    ...(marca.cores[1] ? { cor_2: marca.cores[1] } : {}),
  };
}

/** Põe os extras prontos no projeto. Um que não entra não derruba os outros; feitos diz o que entrou. */
export function comExtras(projetoInicial: Projeto, ctx: Contexto, extras: Extras): { projeto: Projeto; feitos: string[] } {
  let projeto = projetoInicial;
  const feitos: string[] = [];
  const fim = fimDe(projetoInicial);
  if (extras.musica && fim > 0) {
    try {
      const { musica } = extras;
      const adicionado = executarComando(projeto, { comando: "clipe.adicionar", parametros: { midiaId: musica.midiaId, inicio: 0 } }, ctx);
      projeto = adicionado.projeto;
      const clipeId = adicionado.selecao![0];
      const clipe = projeto.faixas.flatMap((faixa) => faixa.clipes).find((item) => item.id === clipeId)!;
      if (clipe.duracao > fim) projeto = executarComando(projeto, { comando: "clipe.aparar", parametros: { clipeId, borda: "fim", tempo: fim } }, ctx).projeto;
      const duracao = Math.min(clipe.duracao, fim);
      projeto = executarComando(projeto, { comando: "clipe.audio", parametros: { clipeIds: [clipeId], volume: musica.volume, fade_saida: Math.min(FADE_DA_MUSICA, Math.floor(duracao / 2)) } }, ctx).projeto;
      if (musica.falas?.length) {
        const curva = abaixamentoNaFala({ inicio: 0, duracao }, musica.falas);
        if (curva) projeto = executarComando(projeto, { comando: "clipe.abaixar", parametros: { clipeId, abaixamento: curva } }, ctx).projeto;
      }
      feitos.push("a música");
    } catch {
      // A música que não entrou (outro tipo de mídia, apagada) fica de fora
    }
  }
  if (extras.logo) {
    try {
      projeto = executarComando(projeto, { comando: "marca.logo", parametros: extras.logo }, ctx).projeto;
      feitos.push("o logo");
    } catch {
      // Sem logo
    }
  }
  if (extras.chamada) {
    const antes = projeto;
    projeto = comMidiasDoPlano(projeto, ctx, [{ tipo: "cartela", midiaId: extras.chamada.midiaId, inicio: extras.chamada.inicio }]);
    if (projeto !== antes) feitos.push("a chamada no fim");
  }
  return { projeto, feitos };
}


/** A receita em frases curtas, para o cartão do modelo. */
export function resumoDaReceita(receita: ReceitaDoCorte): string[] {
  const itens: string[] = [];
  const legenda = ESTILOS_DE_LEGENDA.find((estilo) => estilo.id === receita.legenda)?.nome;
  const animada = ESTILOS_ANIMADOS.find((estilo) => estilo.id === receita.legenda_animada)?.nome;
  const lugar = { baixo: "embaixo", meio: "no meio", alto: "no alto" }[receita.posicao];
  if (animada) itens.push(`Legenda animada: ${animada.toLowerCase()}`);
  else if (legenda) itens.push(`Legenda ${legenda.toLowerCase()} ${lugar}`);
  else itens.push("Sem legendas");
  itens.push(receita.enquadrar === "rosto" ? "Rosto no quadro" : receita.enquadrar === "centro" ? "Enquadrado pelo meio" : "A imagem inteira");
  if (receita.limpar) itens.push("Sem pausas");
  if (receita.titulo) itens.push("Título");
  if (receita.zooms) itens.push("Zooms");
  const cor = CORES_DO_VIDEO.find((item) => item.id === receita.cor)?.nome;
  if (cor) itens.push(`Cor ${cor.toLowerCase()}`);
  if (receita.voz) itens.push("Voz com efeito na abertura");
  const transicao = TRANSICOES.find((item) => item.id === receita.transicoes);
  if (transicao && receita.transicoes !== "nenhuma") itens.push(`${transicao.nome}${receita.sons ? " com som" : ""}`);
  if (receita.graficos) itens.push("Gráficos pela fala");
  if (receita.imagens) itens.push("Imagens de apoio");
  if (receita.cartela) itens.push("Cartela final");
  if (receita.logo) itens.push("Logo do kit");
  if (receita.chamada) itens.push(`${CHAMADAS.find((item) => item.id === receita.chamada!.modelo)?.nome ?? "Chamada"} no fim`);
  if (receita.musica) itens.push("Música");
  if (receita.barra) itens.push(`Barra de progresso ${receita.barra === "baixo" ? "embaixo" : "no alto"}`);
  if (receita.quadro_original) itens.push("Quadro do original numa caixa");
  if (receita.emojis) itens.push("Emojis nas legendas");
  if (receita.gancho) itens.push("Gancho narrado");
  if (receita.censura) itens.push(receita.censura === "bipe" ? "Palavras censuradas com bipe" : "Palavras censuradas no silêncio");
  if (receita.distracao.length) itens.push(receita.distracao.length === 1 ? "Vídeo de distração" : `${receita.distracao.length} vídeos de distração`);
  return itens;
}
