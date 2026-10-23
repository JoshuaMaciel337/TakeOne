// O projeto de edição, no mesmo formato que a API salva (core/modelos/projeto.py).
// Tempos em ticks (lib/tempo.ts). As faixas vão de cima para baixo, como aparecem na linha do tempo.
import type { Taxa, Tick } from "../tempo.ts";
import type { Abaixamento } from "./abaixar.ts";
import type { Nivelamento } from "./nivelar.ts";
import type { Animacoes } from "./animacao.ts";
import type { Cor } from "./cor.ts";
import type { Efeito } from "./efeitos.ts";
import type { Expressoes, Keyframes } from "./keyframes.ts";
import { type CurvaDoFade, type EfeitosVoz, ganhoDoFade } from "./som.ts";
import { type PontoDeVelocidade, tempoNaMidiaComCurva } from "./velocidade.ts";
import type { Transicao } from "./transicao.ts";
import { type Texto, TEXTO_PADRAO } from "./texto.ts";

export const PROPORCOES = ["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"] as const;
export type Proporcao = (typeof PROPORCOES)[number];

/**
 * "principal" é a faixa magnética, sem espaço vazio; "video" fica por cima dela; "audio", embaixo;
 * "texto" guarda os clipes de texto, por cima dos vídeos; "legenda", as legendas, por cima de tudo.
 */
export type TipoFaixa = "principal" | "video" | "audio" | "texto" | "legenda";

/** Faixas cujos clipes são textos (sem mídia). */
export function faixaDeTexto(tipo: TipoFaixa): boolean {
  return tipo === "texto" || tipo === "legenda";
}

/**
 * Onde a imagem do clipe fica no quadro (lib/projeto/geometria.ts). Sem mudança, a mídia aparece
 * inteira e centralizada, do maior tamanho que cabe.
 */
export type Transformacao = {
  /** Deslocamento do centro, em frações da largura e da altura do quadro (0 é o meio). */
  x: number;
  y: number;
  /** 1 é o tamanho em que a mídia cabe inteira no quadro. */
  escala: number;
  /** Em graus, no sentido horário. */
  rotacao: number;
  /** De 0 (invisível) a 1. */
  opacidade: number;
};

/** Parte da mídia que aparece, em frações da largura e da altura dela (como ela aparece, já virada). */
export type Recorte = { x: number; y: number; largura: number; altura: number };

/**
 * Cantos arredondados e borda: o raio e a espessura em frações do lado menor do clipe (como ele aparece), e a
 * cor da borda. A conta é a de core/utils/cantos.py, que o shader da prévia repete.
 */
export type Cantos = { raio: number; borda: number; cor: string };
export const CANTOS_PADRAO: Cantos = { raio: 0.08, borda: 0, cor: "#ffffff" };
export const RAIO_MAXIMO = 0.5;
export const BORDA_MAXIMA = 0.25;

/**
 * Máscara de forma: só a parte do clipe dentro (ou fora, invertida) de um retângulo ou de uma elipse aparece. O
 * centro e o tamanho são frações do clipe como ele aparece; a suavidade, do lado menor dele. A conta é a de
 * core/utils/cantos.py (cobertura_da_mascara), que o shader da prévia repete.
 */
export type MascaraDeForma = { forma: "retangulo" | "elipse"; x: number; y: number; largura: number; altura: number; suavidade: number; inverter: boolean };
export const MASCARA_PADRAO: MascaraDeForma = { forma: "elipse", x: 0.5, y: 0.5, largura: 0.7, altura: 0.7, suavidade: 0.08, inverter: false };
export const LIMITES_DA_MASCARA = { centro: { minimo: -0.5, maximo: 1.5 }, tamanho: { minimo: 0.02, maximo: 2 }, suavidade: { minimo: 0, maximo: 0.5 } } as const;

/** A imagem do clipe espelhada na horizontal, na vertical ou nos dois sentidos. */
export type Virar = { horizontal: boolean; vertical: boolean };

/**
 * Como o clipe se mistura com o que está embaixo. "normal" cobre; "multiplicar" escurece; "tela"
 * clareia; "somar" soma a luz. A conta é a mesma no compositor da prévia e no blend do render.
 */
export type Mesclagem = "normal" | "multiplicar" | "tela" | "somar";

export const MESCLAGENS: { id: Mesclagem; nome: string }[] = [
  { id: "normal", nome: "Normal" },
  { id: "multiplicar", nome: "Multiplicar" },
  { id: "tela", nome: "Tela" },
  { id: "somar", nome: "Somar" },
];

/**
 * Tela verde (chroma key): some o que tem cor perto de `cor`. A distância é a do colorkey do FFmpeg
 * (em RGB, de 0 a 1); até `semelhanca` some de vez, e some aos poucos por mais `suavidade`.
 */
export type Chroma = { cor: string; semelhanca: number; suavidade: number };
export const CHROMA_PADRAO: Chroma = { cor: "#00ff00", semelhanca: 0.3, suavidade: 0.1 };

/**
 * Chave de luminância: some o escuro (ou o claro) pela luma BT.709 da cor. No escuro, abaixo de `limiar`
 * some de vez e aparece aos poucos por mais `suavidade`; no claro, o contrário. Para luz, fogo e fumaça
 * gravados sobre preto, e desenhos sobre papel branco.
 */
export type ChaveLuma = { tirar: "escuro" | "claro"; limiar: number; suavidade: number };
export const CHAVE_LUMA_PADRAO: ChaveLuma = { tirar: "escuro", limiar: 0.1, suavidade: 0.1 };

export const TRANSFORMACAO_PADRAO: Transformacao = { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 };
export const RECORTE_PADRAO: Recorte = { x: 0, y: 0, largura: 1, altura: 1 };

export type Clipe = {
  id: string;
  /** null nos clipes de texto, que não têm mídia. */
  midia_id: string | null;
  texto?: Texto | null;
  /** Posição na linha do tempo. */
  inicio: Tick;
  duracao: Tick;
  /** De onde o clipe começa dentro da mídia. */
  entrada: Tick;
  velocidade: number;
  /** De 0 a 4 (400%). */
  volume: number;
  /** Quanto o som leva para subir do zero no começo e descer a zero no fim. */
  fade_entrada: Tick;
  fade_saida: Tick;
  /** Formato dos dois fades (lib/projeto/som.ts); sem ele, linear. */
  curva_fade?: CurvaDoFade;
  /** Toca a voz sem ruído da mídia (gerada pelo worker) no lugar do som original. */
  voz_limpa?: boolean;
  /** Equalizador, eco e reverb (lib/projeto/som.ts); sem eles, o som como veio. */
  efeitos_voz?: EfeitosVoz | null;
  /** Tom da voz em semitons (-12 a 12); o som vem do arquivo que o worker gera para o tom. */
  tom?: number;
  /** Leva a mídia a -14 LUFS pelo loudness medido na ingestão (lib/projeto/som.ts). */
  igualar_volume?: boolean;
  /** Toca ao contrário: a imagem e o som vêm do vídeo invertido que o worker gera (lib/previa/arquivos.ts). */
  inverter?: boolean;
  /** O som foi para um clipe de áudio próprio ("Separar o som"): este clipe não soa. */
  som_separado?: boolean;
  /** Curva que abaixa o som durante a fala das outras faixas (lib/projeto/abaixar.ts). */
  abaixamento?: Abaixamento | null;
  /** Curva que deixa a fala num volume só (lib/projeto/nivelar.ts). */
  nivelamento?: Nivelamento | null;
  transformacao: Transformacao;
  /** Posição, escala, rotação e opacidade mudando ao longo do clipe (lib/projeto/keyframes.ts). */
  keyframes?: Keyframes | null;
  /** Repetir os keyframes e tremer, por propriedade (lib/projeto/keyframes.ts). */
  expressoes?: Expressoes | null;
  recorte: Recorte;
  /** Espelha a imagem dentro da caixa (lib/projeto/geometria.ts, recorteNaFonte); sem ele, como veio. */
  virar?: Virar | null;
  /** Cantos arredondados e borda; sem eles, o retângulo inteiro. */
  cantos?: Cantos | null;
  /** Máscara de forma (retângulo ou elipse); sem ela, o clipe inteiro aparece. */
  mascara?: MascaraDeForma | null;
  /**
   * Camada de ajuste: sem mídia nem texto, cobre o quadro e muda a cor (com a vinheta, a máscara e a opacidade) de
   * tudo o que está embaixo dela, durante o clipe.
   */
  ajuste?: boolean;
  /** Mistura com o que está embaixo; sem ela, normal. */
  mesclagem?: Mesclagem;
  /** Efeito de vídeo (lib/projeto/efeitos.ts); sem ele, a imagem como veio. */
  efeito?: Efeito | null;
  /** Usa a imagem sem ruído que o worker gera no lugar da original (só em vídeos). */
  imagem_limpa?: boolean;
  /** Recorta o fundo pela máscara da pessoa que o worker gera (só em vídeos). */
  remover_fundo?: boolean;
  /** Usa a imagem estável que o worker gera (sobre a sem ruído, se ela está ligada); não combina com o recorte do fundo. */
  estabilizar?: boolean;
  /** Tela verde: a cor que some (só em vídeos e imagens). */
  chroma?: Chroma | null;
  /** Chave de luminância: some o preto ou o branco (só em vídeos e imagens). */
  chave_luma?: ChaveLuma | null;
  /** Velocidade com curva (lib/projeto/velocidade.ts); sem ela, a velocidade é a mesma o clipe todo. */
  curva_velocidade?: PontoDeVelocidade[] | null;
  /** Entrada e saída animadas; sem ela, o clipe só aparece e some. */
  animacao?: Animacoes | null;
  /** Ajustes de cor e filtro pronto; sem ela, a imagem como veio. */
  cor?: Cor | null;
  /** Só na faixa principal: a transição para o clipe seguinte. */
  transicao?: Transicao | null;
};

export type Faixa = {
  id: string;
  tipo: TipoFaixa;
  oculta: boolean;
  muda: boolean;
  travada: boolean;
  clipes: Clipe[];
};

/** Um clipe do modelo do espaço que quem usa troca: a mídia dele ou o texto dele. */
export type VagaDoModelo = { clipe_id: string; tipo: "midia" | "texto"; rotulo: string };

export type Projeto = {
  id: string;
  nome: string;
  proporcao: Proporcao;
  taxa: Taxa;
  /** `transparente` só no projeto de imagem: sem fundo, o PNG e o WebP saem com transparência. */
  fundo: { cor: string; transparente?: boolean };
  faixas: Faixa[];
  /** "imagem" no editor de imagem (lib/projeto/imagem.ts); sem ele, vídeo. */
  tipo?: "video" | "imagem";
  /** O tamanho em pixels do projeto de imagem. */
  tamanho?: { largura: number; altura: number } | null;
  versao: number;
  duracao: Tick;
  /** Criado de um modelo do espaço: as vagas que a ferramenta Modelos oferece para preencher. */
  modelo_origem?: { id: string; nome: string; vagas: VagaDoModelo[] } | null;
  criado_em: string;
  atualizado_em: string;
};

/** O que a edição precisa saber de uma mídia. */
/**
 * transparente: a mídia traz a própria transparência (animação em HTML, PNG com fundo transparente), então
 * entra numa faixa por cima. imagem: imagem parada, sem fim (duracao infinita), sem som e sem tempo próprio.
 */
export type InfoMidia = { duracao: Tick; video: boolean; audio: boolean; transparente?: boolean; imagem?: boolean };

export function fimDoClipe(clipe: Clipe): Tick {
  return clipe.inicio + clipe.duracao;
}

export function duracaoDoProjeto(projeto: Pick<Projeto, "faixas">): Tick {
  let fim = 0;
  for (const faixa of projeto.faixas) for (const clipe of faixa.clipes) fim = Math.max(fim, fimDoClipe(clipe));
  return fim;
}

/** Quanto do volume do clipe vale no instante `t`, pelos fades (de 0 a 1), como os dois afade do render. */
export function fatorDosFades(clipe: Clipe, t: Tick): number {
  let fator = 1;
  if (clipe.fade_entrada > 0) fator *= ganhoDoFade(clipe.curva_fade, (t - clipe.inicio) / clipe.fade_entrada);
  if (clipe.fade_saida > 0) fator *= ganhoDoFade(clipe.curva_fade, (fimDoClipe(clipe) - t) / clipe.fade_saida);
  return fator;
}

/** Instante da mídia que aparece no instante `t` da linha do tempo (com a curva de velocidade, se houver). */
export function tempoNaMidia(clipe: Clipe, t: Tick): Tick {
  if (clipe.curva_velocidade) return tempoNaMidiaComCurva({ ...clipe, curva_velocidade: clipe.curva_velocidade }, t);
  return clipe.entrada + Math.round((t - clipe.inicio) * clipe.velocidade);
}

export function clipeEm(faixa: Faixa, t: Tick): Clipe | undefined {
  return faixa.clipes.find((clipe) => clipe.inicio <= t && t < fimDoClipe(clipe));
}

export function acharClipe(projeto: Projeto, clipeId: string): { faixa: Faixa; clipe: Clipe } | null {
  for (const faixa of projeto.faixas) {
    const clipe = faixa.clipes.find((item) => item.id === clipeId);
    if (clipe) return { faixa, clipe };
  }
  return null;
}

export function faixaPrincipal(projeto: Projeto): Faixa {
  return projeto.faixas.find((faixa) => faixa.tipo === "principal") ?? projeto.faixas[0];
}

/**
 * Completa o que falta num projeto salvo antes da transformação e do recorte existirem. A API já
 * devolve tudo completo; isto cobre o rascunho guardado no navegador por uma versão antiga do editor.
 */
export function completarProjeto(projeto: Projeto): Projeto {
  return {
    ...projeto,
    faixas: projeto.faixas.map((faixa) => ({
      ...faixa,
      clipes: faixa.clipes.map((clipe) => ({
        ...clipe,
        ...(clipe.texto ? { texto: { ...TEXTO_PADRAO, ...clipe.texto } } : {}),
        fade_entrada: clipe.fade_entrada ?? 0,
        fade_saida: clipe.fade_saida ?? 0,
        transformacao: { ...TRANSFORMACAO_PADRAO, ...clipe.transformacao },
        recorte: { ...RECORTE_PADRAO, ...clipe.recorte },
      })),
    })),
  };
}

/** Faixas que mostram imagem, da que fica por cima para a de baixo. */
export function faixasDeVideo(projeto: Projeto): Faixa[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "audio");
}

/** A versão estável de que o clipe precisa, como `chave_da_estabilizacao` em core/modelos/midia.py. */
export function chaveDaEstabilizacao(limpa: boolean): string {
  return limpa ? "estavel_limpo" : "estavel";
}
