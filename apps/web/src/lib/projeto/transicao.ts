// Transições entre clipes vizinhos da faixa principal. A transição fica no clipe que sai e cobre o
// corte pela metade: `duracao / 2` antes e `duracao / 2` depois. Nessa janela os dois clipes
// aparecem: o que sai continua (com o que a mídia tem depois do fim dele) e o que entra começa antes
// (com o que a mídia tem antes do começo dele). Sem sobra na mídia, fica o último ou o primeiro quadro.
//
// A conta é a mesma em core/utils/transicao.py, conferida por tests/casos/transicao.json. Como nas
// animações, a opacidade muda em linha reta (o render usa o fade com alfa) e o movimento segue a
// curva que desacelera no fim.
import type { Tick } from "../tempo.ts";
import { suavizar } from "./animacao.ts";
import type { Clipe, Transformacao } from "./modelo.ts";

export type TipoTransicao =
  | "fusao"
  | "escurecer"
  | "deslizar"
  | "empurrar"
  | "zoom"
  | "cortina_direita"
  | "cortina_esquerda"
  | "cortina_baixo"
  | "cortina_cima"
  | "desfoque"
  | "relogio"
  | "iris"
  | "losango"
  | "persianas"
  | "diagonal"
  | "blocos"
  | "zoom_desfoque"
  | "flash"
  | "clarao";
/** `misturar_som`: os dois sons se cruzam na janela (janelasDoSom); sem ela, cada clipe soa só entre o começo e o fim dele. */
export type Transicao = { tipo: TipoTransicao; duracao: Tick; misturar_som?: boolean };

export const TIPOS_TRANSICAO: { id: TipoTransicao; nome: string; descricao: string }[] = [
  { id: "fusao", nome: "Fusão", descricao: "Um clipe se mistura no outro" },
  { id: "escurecer", nome: "Escurecer", descricao: "Apaga para a cor de fundo e acende no próximo" },
  { id: "deslizar", nome: "Deslizar", descricao: "O próximo entra pela direita, por cima" },
  { id: "empurrar", nome: "Empurrar", descricao: "O próximo entra empurrando o atual para a esquerda" },
  { id: "zoom", nome: "Zoom", descricao: "O próximo cresce e aparece" },
  { id: "cortina_direita", nome: "Cortina para a direita", descricao: "O próximo é revelado da esquerda para a direita" },
  { id: "cortina_esquerda", nome: "Cortina para a esquerda", descricao: "O próximo é revelado da direita para a esquerda" },
  { id: "cortina_baixo", nome: "Cortina para baixo", descricao: "O próximo é revelado de cima para baixo" },
  { id: "cortina_cima", nome: "Cortina para cima", descricao: "O próximo é revelado de baixo para cima" },
  { id: "desfoque", nome: "Desfoque", descricao: "Os dois desfocam no corte e o próximo aparece nítido" },
  { id: "relogio", nome: "Relógio", descricao: "O próximo aparece girando como um ponteiro" },
  { id: "iris", nome: "Íris", descricao: "Um círculo abre do meio e mostra o próximo" },
  { id: "losango", nome: "Losango", descricao: "Um losango abre do meio e mostra o próximo" },
  { id: "persianas", nome: "Persianas", descricao: "O próximo aparece em faixas, como uma persiana" },
  { id: "diagonal", nome: "Diagonal", descricao: "O próximo é revelado do canto de cima para o de baixo" },
  { id: "blocos", nome: "Blocos", descricao: "O próximo aparece em blocos, numa ordem sorteada" },
  { id: "zoom_desfoque", nome: "Zoom com desfoque", descricao: "Os dois disparam num zoom borrado no corte, e o próximo aparece nele" },
  { id: "flash", nome: "Flash", descricao: "Um clarão branco no corte, como a luz de uma câmera" },
  { id: "clarao", nome: "Clarão", descricao: "Uma luz quente entra pelo canto e esconde o corte" },
];

/**
 * Zoom com desfoque: perto do corte, a imagem vai para a média de AMOSTRAS_DO_BORRAO cópias ampliadas em volta
 * do meio, de 1 a 1 + ZOOM_DO_DESFOQUE (a mesma lista de cópias no shader e no render). O peso dessa média sobe
 * em linha reta até o corte e desce depois, e o próximo aparece entre 40% e 60% da janela, já borrado.
 */
export const ZOOM_DO_DESFOQUE = 0.35;
export const TROCA_DO_ZOOM_DESFOQUE = { de: 0.4, ate: 0.6 };

/**
 * Transições de máscara: o próximo aparece por uma forma que cresce, com a borda suave. Cada tipo é um campo
 * de 0 a 1 sobre o clipe (em pixels, para o círculo ser redondo), e o que fica abaixo do limiar aparece. A mesma
 * conta em core/utils/transicao.py, que vira um geq do alfa no render (casos em tests/casos/transicao.json).
 */
export const MASCARAS_DE_TRANSICAO = ["relogio", "iris", "losango", "persianas", "diagonal", "blocos"] as const;
export type MascaraDeTransicao = (typeof MASCARAS_DE_TRANSICAO)[number];
/** A largura da borda suave, em frações do campo. */
export const SUAVIDADE_DA_TRANSICAO = 0.04;
export const FAIXAS_DAS_PERSIANAS = 8;
/** Blocos: 12 colunas, e as linhas que deixam os blocos quase quadrados no clipe. */
export const COLUNAS_DOS_BLOCOS = 12;

/**
 * O valor sorteado do bloco n, de 0 a 1: (n² × 631 + n × 313 + 17) mod 1009. É conta de inteiros pequenos, exata em
 * double (o geq do render), em uint (o shader) e aqui; e não forma o desenho em grade de um sorteio linear.
 */
export function valorDoBloco(n: number): number {
  return ((n * n * 631 + n * 313 + 17) % 1009) / 1009;
}

export function linhasDosBlocos(largura: number, altura: number): number {
  return Math.max(1, Math.floor((COLUNAS_DOS_BLOCOS * altura) / largura + 0.5));
}

/** O campo do tipo no ponto (x, y) do clipe (frações de 0 a 1, pelo centro do pixel), num clipe largura × altura. */
export function campoDaTransicao(tipo: MascaraDeTransicao, x: number, y: number, largura: number, altura: number): number {
  const dx = (x - 0.5) * largura;
  const dy = (y - 0.5) * altura;
  if (tipo === "relogio") {
    const volta = Math.atan2(dx, -dy) / (2 * Math.PI) + 1;
    return volta - Math.floor(volta);
  }
  if (tipo === "iris") return Math.hypot(dx, dy) / (0.5 * Math.hypot(largura, altura));
  if (tipo === "losango") return (Math.abs(dx) + Math.abs(dy)) / (0.5 * (largura + altura));
  if (tipo === "persianas") {
    const faixa = y * FAIXAS_DAS_PERSIANAS;
    return faixa - Math.floor(faixa);
  }
  if (tipo === "blocos") {
    const linhas = linhasDosBlocos(largura, altura);
    const coluna = Math.min(Math.floor(x * COLUNAS_DOS_BLOCOS), COLUNAS_DOS_BLOCOS - 1);
    const linha = Math.min(Math.floor(y * linhas), linhas - 1);
    return valorDoBloco(linha * COLUNAS_DOS_BLOCOS + coluna);
  }
  return (x * largura + y * altura) / (largura + altura);
}

/** O limiar do campo em `e` (o andamento já suavizado): em 0 nada aparece, em 1 tudo, com a borda suave inteira. */
export function limiarDaTransicao(e: number): number {
  return -SUAVIDADE_DA_TRANSICAO / 2 + e * (1 + SUAVIDADE_DA_TRANSICAO);
}

/** Quanto do ponto aparece (0 a 1) com o limiar dado. */
export function revelarNoCampo(campo: number, limiar: number): number {
  return Math.min(1, Math.max(0, (limiar - campo) / SUAVIDADE_DA_TRANSICAO + 0.5));
}

/** A máscara do clipe que entra no instante `t` (o tipo e o limiar), ou null. */
export function mascaraNaTransicao(efeitos: EfeitoDeTransicao[], t: Tick): { tipo: MascaraDeTransicao; limiar: number } | null {
  for (const efeito of efeitos) {
    if (efeito.papel !== "entra" || !(MASCARAS_DE_TRANSICAO as readonly string[]).includes(efeito.tipo)) continue;
    const e = suavizar(Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao)));
    return { tipo: efeito.tipo as MascaraDeTransicao, limiar: limiarDaTransicao(e) };
  }
  return null;
}

/**
 * A parte do clipe que aparece, em frações dele (0 a 1, com y para baixo), antes de girar.
 * Fora dela o clipe fica transparente. Sem cortina, o clipe inteiro.
 */
export type Revelado = { x0: number; y0: number; x1: number; y1: number };
export const REVELADO_INTEIRO: Revelado = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** Zoom de onde o clipe que entra parte. */
export const ZOOM_TRANSICAO = 0.6;
/** Desfoque no meio da transição "desfoque": sigma em frações da altura do clipe. */
export const DESFOQUE_TRANSICAO = 0.03;

/** Uma transição vista de um dos dois clipes. */
export type EfeitoDeTransicao = { tipo: TipoTransicao; papel: "sai" | "entra"; inicio: Tick; duracao: Tick };

/** Quanto de cada clipe da principal aparece, contando as transições, e os efeitos sobre ele. */
export type JanelaDoClipe = { inicio: Tick; fim: Tick; efeitos: EfeitoDeTransicao[] };

/**
 * As janelas dos clipes da faixa principal (em ordem, encostados). `quadro` é a duração de um quadro do
 * projeto: a transição vira um número inteiro de quadros e a janela começa num quadro (a metade de baixo
 * antes do corte). Com 15 quadros (0,5 s a 30 fps), a janela começava no meio de um quadro, o fade do
 * render ia para a grade arredondando e o último quadro da fusão escurecia uns 17 níveis.
 */
export function janelasDaPrincipal(clipes: Clipe[], quadro: Tick): Map<string, JanelaDoClipe> {
  const janelas = new Map<string, JanelaDoClipe>();
  for (const clipe of clipes) janelas.set(clipe.id, { inicio: clipe.inicio, fim: clipe.inicio + clipe.duracao, efeitos: [] });
  clipes.forEach((clipe, i) => {
    const proximo = clipes[i + 1];
    const transicao = clipe.transicao;
    // As de luz cortam seco: a camada de ajuste por cima faz o efeito (transicaoDeLuz.ts)
    if (!proximo || !transicao || transicao.duracao <= 0 || transicao.tipo === "flash" || transicao.tipo === "clarao") return;
    const corte = clipe.inicio + clipe.duracao;
    const quadros = Math.max(1, Math.round(transicao.duracao / quadro));
    const duracao = quadros * quadro;
    const inicio = corte - Math.floor(quadros / 2) * quadro;
    const fim = inicio + duracao;
    const sai = janelas.get(clipe.id)!;
    const entra = janelas.get(proximo.id)!;
    sai.fim = fim;
    sai.efeitos.push({ tipo: transicao.tipo, papel: "sai", inicio, duracao });
    entra.inicio = inicio;
    entra.efeitos.push({ tipo: transicao.tipo, papel: "entra", inicio, duracao });
  });
  return janelas;
}

/**
 * As janelas do som dos clipes da principal: só as transições com `misturar_som` estendem o som, na mesma
 * janela da imagem (com a sobra da mídia). Os efeitos dizem onde o som sai e onde entra (fatorDaMistura).
 */
export function janelasDoSom(clipes: Clipe[], quadro: Tick): Map<string, JanelaDoClipe> {
  return janelasDaPrincipal(
    clipes.map((clipe) => (clipe.transicao?.misturar_som ? clipe : { ...clipe, transicao: null })),
    quadro,
  );
}

/**
 * O ganho do som na mistura das transições no instante `t`: na janela, o que sai desce pelo cosseno e o que
 * entra sobe pelo seno (potência constante: a soma dos quadrados é 1). Fora das janelas, 1. A mesma conta em
 * core/utils/transicao.py (fator_da_mistura) e numa expressão do volume do FFmpeg.
 */
export function fatorDaMistura(efeitos: EfeitoDeTransicao[] | undefined, t: Tick): number {
  let fator = 1;
  for (const efeito of efeitos ?? []) {
    const p = Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao));
    fator *= efeito.papel === "entra" ? Math.sin((p * Math.PI) / 2) : Math.cos((p * Math.PI) / 2);
  }
  return fator;
}

/** A transformação com os efeitos das transições no instante `t`. */
export function transformacaoNaTransicao(base: Transformacao, efeitos: EfeitoDeTransicao[], t: Tick): Transformacao {
  let { x, escala, opacidade } = base;
  for (const efeito of efeitos) {
    const p = Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao));
    const e = suavizar(p);
    const entra = efeito.papel === "entra";
    if (efeito.tipo === "fusao") {
      if (entra) opacidade *= p;
    } else if (efeito.tipo === "escurecer") {
      // O que sai apaga na primeira metade; o que entra acende na segunda
      opacidade *= entra ? Math.min(1, Math.max(0, 2 * p - 1)) : Math.min(1, Math.max(0, 1 - 2 * p));
    } else if (efeito.tipo === "deslizar") {
      if (entra) x += 1 - e;
    } else if (efeito.tipo === "empurrar") {
      x += entra ? 1 - e : -e;
    } else if (efeito.tipo === "zoom" && entra) {
      escala *= ZOOM_TRANSICAO + (1 - ZOOM_TRANSICAO) * e;
      opacidade *= p;
    } else if (efeito.tipo === "desfoque" && entra) {
      opacidade *= p;
    } else if (efeito.tipo === "zoom_desfoque" && entra) {
      const { de, ate } = TROCA_DO_ZOOM_DESFOQUE;
      opacidade *= Math.min(1, Math.max(0, (p - de) / (ate - de)));
    }
  }
  return { ...base, x, escala, opacidade };
}

/** O desfoque no instante `t`: os dois clipes desfocam até o corte e voltam a ficar nítidos depois. */
export function desfoqueNaTransicao(efeitos: EfeitoDeTransicao[], t: Tick): number {
  let desfoque = 0;
  for (const efeito of efeitos) {
    if (efeito.tipo !== "desfoque") continue;
    const p = Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao));
    desfoque = Math.max(desfoque, DESFOQUE_TRANSICAO * (1 - Math.abs(2 * p - 1)));
  }
  return desfoque;
}

/** O peso das cópias ampliadas do zoom com desfoque no instante `t`: sobe até o corte e desce depois. */
export function zoomNaTransicao(efeitos: EfeitoDeTransicao[], t: Tick): number {
  let peso = 0;
  for (const efeito of efeitos) {
    if (efeito.tipo !== "zoom_desfoque") continue;
    const p = Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao));
    peso = Math.max(peso, 1 - Math.abs(2 * p - 1));
  }
  return peso;
}

/** A parte do clipe que aparece no instante `t`: as cortinas revelam quem entra, com a curva do movimento. */
export function reveladoNaTransicao(efeitos: EfeitoDeTransicao[], t: Tick): Revelado {
  const revelado = { ...REVELADO_INTEIRO };
  for (const efeito of efeitos) {
    if (efeito.papel !== "entra") continue;
    const e = suavizar(Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao)));
    if (efeito.tipo === "cortina_direita") revelado.x1 = Math.min(revelado.x1, e);
    else if (efeito.tipo === "cortina_esquerda") revelado.x0 = Math.max(revelado.x0, 1 - e);
    else if (efeito.tipo === "cortina_baixo") revelado.y1 = Math.min(revelado.y1, e);
    else if (efeito.tipo === "cortina_cima") revelado.y0 = Math.max(revelado.y0, 1 - e);
  }
  return revelado;
}

/** A maior duração que a transição pode ter entre os dois clipes. */
export function duracaoMaximaDaTransicao(sai: Clipe, entra: Clipe): Tick {
  return Math.min(sai.duracao, entra.duracao);
}
