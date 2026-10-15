// Operações de edição da linha do tempo. Cada uma recebe o projeto e devolve um projeto novo, sem
// mexer no original (é o que permite desfazer guardando as versões), ou lança ErroEdicao com a
// mensagem para a pessoa, sem mudar nada.
//
// As primitivas (dividir no instante, abrir e fechar espaço, nunca deixar dois clipes da mesma
// faixa um por cima do outro) seguem o crate `edit` do FilmCraft (https://github.com/storytold/filmcraft,
// crates/edit/src/lib.rs, commit 5231852), licença MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team
// and the FilmCraft contributors; textos em licencas/filmcraft. Modificado pelo TakeOne (2026): escrito
// em TypeScript e com as regras do CapCut no lugar das do Premiere. A faixa principal é magnética (os
// clipes ficam sempre encostados, a partir do zero); nas outras, um clipe que cairia por cima de outro
// ganha uma faixa nova.
import { ajustarAoQuadro, duracaoDoQuadro, quadroMaisProximo, TICK_MAXIMO, type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Animacoes, limitarAnimacoes, SEM_ANIMACAO } from "./animacao.ts";
import { type AjustesCor, type Cor, COR_PADRAO, CURVA_NEUTRA, curvasNeutras, FILTROS, LIMITES_COR, PONTOS_MAXIMOS_DA_CURVA, type PontoDaCurva } from "./cor.ts";
import {
  type Curva,
  deslocarKeyframes,
  type Keyframe,
  type Keyframes,
  KEYFRAMES_POR_PROPRIEDADE,
  keyframeEm,
  type PropriedadeAnimavel,
  PROPRIEDADES_ANIMAVEIS,
  transformacaoNoTempo,
} from "./keyframes.ts";
import { type Legenda, POSICAO_LEGENDA } from "./legendas.ts";
import type { Reenquadramento } from "./reenquadrar.ts";
import { duracaoMaximaDaTransicao, type Transicao } from "./transicao.ts";
import {
  acharClipe,
  type Clipe,
  type Faixa,
  faixaDeTexto,
  fimDoClipe,
  type InfoMidia,
  MESCLAGENS,
  type Mesclagem,
  type Projeto,
  RECORTE_PADRAO,
  type Recorte,
  type TipoFaixa,
  type Transformacao,
  TRANSFORMACAO_PADRAO,
} from "./modelo.ts";
import type { Abaixamento } from "./abaixar.ts";
import { type CurvaDoFade, type EfeitosVoz, efeitosAtivos, limitarEfeitos } from "./som.ts";
import { ajustarTexto, type Texto } from "./texto.ts";

export class ErroEdicao extends Error {}

export type Contexto = {
  novoId: () => string;
  /** null quando a mídia não está na biblioteca (excluída ou ainda sendo preparada). */
  midia: (midiaId: string) => InfoMidia | null;
};

type TipoLivre = Exclude<TipoFaixa, "principal">;

// -----------------------------------------------
// Auxiliares
// -----------------------------------------------
function compactar(faixa: Faixa): Faixa {
  let t = 0;
  return {
    ...faixa,
    clipes: faixa.clipes.map((clipe) => {
      const encostado = { ...clipe, inicio: t };
      t += clipe.duracao;
      return encostado;
    }),
  };
}

function ordenar(clipes: Clipe[]): Clipe[] {
  return [...clipes].sort((a, b) => a.inicio - b.inicio);
}

function cabe(faixa: Faixa, inicio: Tick, duracao: Tick): boolean {
  const fim = inicio + duracao;
  return faixa.clipes.every((clipe) => fim <= clipe.inicio || inicio >= fimDoClipe(clipe));
}

function trocarFaixa(projeto: Projeto, faixa: Faixa): Projeto {
  return { ...projeto, faixas: projeto.faixas.map((item) => (item.id === faixa.id ? faixa : item)) };
}

function exigirDestravada(faixa: Faixa) {
  if (faixa.travada) throw new ErroEdicao("A faixa está travada. Destrave o cadeado para editar.");
}

function acharOuErro(projeto: Projeto, clipeId: string): { faixa: Faixa; clipe: Clipe; indice: number } {
  for (const faixa of projeto.faixas) {
    const indice = faixa.clipes.findIndex((clipe) => clipe.id === clipeId);
    if (indice >= 0) return { faixa, clipe: faixa.clipes[indice], indice };
  }
  throw new ErroEdicao("Este clipe não existe mais.");
}

/** Faixa de áudio só recebe mídia sem imagem; as de vídeo, só mídia com imagem. */
function combina(tipo: TipoFaixa, info: InfoMidia): boolean {
  if (faixaDeTexto(tipo)) return false;
  return tipo === "audio" ? !info.video && info.audio : info.video;
}

function mensagemDeTipo(info: InfoMidia): string {
  return info.video ? "Vídeos ficam nas faixas de vídeo." : "Áudios ficam nas faixas de áudio.";
}

function infoDoClipe(ctx: Contexto, clipe: Clipe, faixa: Faixa): InfoMidia {
  // Texto não tem mídia: dura o quanto a pessoa quiser
  if (clipe.texto || !clipe.midia_id) return { duracao: Number.POSITIVE_INFINITY, video: false, audio: false };
  return ctx.midia(clipe.midia_id) ?? { duracao: Number.POSITIVE_INFINITY, video: faixa.tipo !== "audio", audio: faixa.tipo === "audio" };
}

/** A faixa livre onde o clipe pode ficar: texto na de texto, imagem na de vídeo, som na de áudio. */
function tipoLivreDoClipe(clipe: Clipe, info: InfoMidia, origem: TipoFaixa): TipoLivre {
  // Texto e legenda continuam no tipo de faixa de onde vieram
  if (clipe.texto) return origem === "legenda" ? "legenda" : "texto";
  return info.video ? "video" : "audio";
}

function aceitaNaFaixa(tipo: TipoFaixa, clipe: Clipe, info: InfoMidia): boolean {
  if (clipe.texto) return faixaDeTexto(tipo);
  return combina(tipo, info);
}

/** Tira as faixas livres que ficaram vazias e confere o tamanho máximo. */
/** Os fades nunca passam do clipe: depois de aparar ou dividir, encolhem junto. */
function limitarFades(clipe: Clipe): Clipe {
  const entrada = Math.min(clipe.fade_entrada, clipe.duracao);
  const saida = Math.min(clipe.fade_saida, clipe.duracao - entrada);
  let resultado = entrada === clipe.fade_entrada && saida === clipe.fade_saida ? clipe : { ...clipe, fade_entrada: entrada, fade_saida: saida };
  // As animações também encolhem junto com o clipe
  const animacao = clipe.animacao;
  if (animacao && animacao.entrada.duracao + animacao.saida.duracao > clipe.duracao) {
    resultado = { ...resultado, animacao: limitarAnimacoes(animacao, clipe.duracao) };
  }
  return resultado;
}

/**
 * Transições só entre vizinhos da principal e cabendo nos dois: depois de mover, apagar ou aparar,
 * a do último clipe some e as longas demais encolhem.
 */
function arrumarTransicoes(faixa: Faixa): Faixa {
  if (!faixa.clipes.some((clipe) => clipe.transicao)) return faixa;
  if (faixa.tipo !== "principal") return { ...faixa, clipes: faixa.clipes.map((clipe) => (clipe.transicao ? { ...clipe, transicao: null } : clipe)) };
  const clipes = faixa.clipes.map((clipe, i) => {
    if (!clipe.transicao) return clipe;
    const proximo = faixa.clipes[i + 1];
    if (!proximo) return { ...clipe, transicao: null };
    const maximo = duracaoMaximaDaTransicao(clipe, proximo);
    return clipe.transicao.duracao > maximo ? { ...clipe, transicao: { ...clipe.transicao, duracao: maximo } } : clipe;
  });
  return clipes.every((clipe, i) => clipe === faixa.clipes[i]) ? faixa : { ...faixa, clipes };
}

function finalizar(projeto: Projeto): Projeto {
  const faixas = projeto.faixas
    .filter((faixa) => faixa.tipo === "principal" || faixa.clipes.length > 0)
    .map((faixa) => (faixa.clipes.every((clipe) => limitarFades(clipe) === clipe) ? faixa : { ...faixa, clipes: faixa.clipes.map(limitarFades) }))
    .map(arrumarTransicoes);
  let duracao = 0;
  for (const faixa of faixas) for (const clipe of faixa.clipes) duracao = Math.max(duracao, fimDoClipe(clipe));
  if (duracao > TICK_MAXIMO) throw new ErroEdicao("O projeto pode ter no máximo 6 horas.");
  return { ...projeto, faixas, duracao };
}

/** Lugar do clipe na faixa principal: antes do primeiro clipe cujo meio fica depois de `t`. */
function indiceNaPrincipal(faixa: Faixa, t: Tick | undefined): number {
  if (t === undefined) return faixa.clipes.length;
  const indice = faixa.clipes.findIndex((clipe) => clipe.inicio + clipe.duracao / 2 > t);
  return indice < 0 ? faixa.clipes.length : indice;
}

function inserirNaPrincipal(projeto: Projeto, clipe: Clipe, t: Tick | undefined): Projeto {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal) throw new ErroEdicao("O projeto está sem a faixa principal.");
  exigirDestravada(principal);
  const clipes = [...principal.clipes];
  clipes.splice(indiceNaPrincipal(principal, t), 0, clipe);
  return trocarFaixa(projeto, compactar({ ...principal, clipes }));
}

function criarFaixa(projeto: Projeto, ctx: Contexto, tipo: TipoLivre, perto?: string): { projeto: Projeto; faixa: Faixa } {
  const faixa: Faixa = { id: ctx.novoId(), tipo, oculta: false, muda: false, travada: false, clipes: [] };
  const faixas = [...projeto.faixas];
  const referencia = faixas.findIndex((item) => item.id === perto && item.tipo === tipo);
  if (tipo === "legenda") {
    // Legendas por cima de tudo
    faixas.splice(referencia >= 0 ? referencia : 0, 0, faixa);
  } else if (tipo === "texto") {
    // Textos por cima dos vídeos, abaixo das legendas
    const legendas = faixas.filter((item) => item.tipo === "legenda").length;
    faixas.splice(referencia >= 0 ? referencia : legendas, 0, faixa);
  } else if (tipo === "video") {
    // Logo acima da faixa de referência, ou logo acima da principal
    const principal = faixas.findIndex((item) => item.tipo === "principal");
    faixas.splice(referencia >= 0 ? referencia : Math.max(principal, 0), 0, faixa);
  } else {
    faixas.splice(referencia >= 0 ? referencia + 1 : faixas.length, 0, faixa);
  }
  return { projeto: { ...projeto, faixas }, faixa };
}

/**
 * Coloca um clipe numa faixa livre: na preferida se couber; senão numa faixa nova logo ao lado dela.
 * Sem preferida, usa a primeira faixa do tipo onde couber, e só então cria uma.
 */
function colocarLivre(projeto: Projeto, ctx: Contexto, tipo: TipoLivre, clipe: Clipe, preferida?: string, forcarNova = false): Projeto {
  let destino: Faixa | undefined;
  if (!forcarNova) {
    const candidatas = preferida
      ? projeto.faixas.filter((faixa) => faixa.id === preferida)
      : projeto.faixas.filter((faixa) => faixa.tipo === tipo);
    destino = candidatas.find((faixa) => !faixa.travada && cabe(faixa, clipe.inicio, clipe.duracao));
  }
  if (!destino) {
    const criada = criarFaixa(projeto, ctx, tipo, preferida);
    projeto = criada.projeto;
    destino = criada.faixa;
  }
  return trocarFaixa(projeto, { ...destino, clipes: ordenar([...destino.clipes, clipe]) });
}

// -----------------------------------------------
// Operações
// -----------------------------------------------
export type DestinoClipe = {
  /** Instante onde o clipe deve começar (na principal, onde ele entra entre os outros). */
  inicio?: Tick;
  faixaId?: string;
  /** Cria uma faixa nova em vez de usar uma que já existe. */
  novaFaixa?: boolean;
};

export function adicionarClipe(projeto: Projeto, ctx: Contexto, midiaId: string, destino: DestinoClipe = {}): { projeto: Projeto; clipeId: string } {
  const info = ctx.midia(midiaId);
  if (!info) throw new ErroEdicao("Esta mídia ainda não está pronta.");
  const duracao = ajustarAoQuadro(projeto.taxa, info.duracao);
  if (duracao < duracaoDoQuadro(projeto.taxa)) throw new ErroEdicao("A mídia é curta demais para a linha do tempo.");

  const clipe: Clipe = {
    id: ctx.novoId(),
    midia_id: midiaId,
    inicio: 0,
    duracao,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: TRANSFORMACAO_PADRAO,
    recorte: RECORTE_PADRAO,
  };
  const faixa = destino.faixaId ? projeto.faixas.find((item) => item.id === destino.faixaId) : undefined;
  if (faixa && !combina(faixa.tipo, info)) throw new ErroEdicao(faixaDeTexto(faixa.tipo) ? "A faixa de texto só recebe textos." : mensagemDeTipo(info));

  let resultado: Projeto;
  if (faixa?.tipo === "principal" || (!faixa && !destino.novaFaixa && info.video)) {
    resultado = inserirNaPrincipal(projeto, clipe, destino.inicio);
  } else {
    clipe.inicio = Math.max(0, quadroMaisProximo(projeto.taxa, destino.inicio ?? 0));
    resultado = colocarLivre(projeto, ctx, info.video ? "video" : "audio", clipe, faixa?.id, destino.novaFaixa);
  }
  return { projeto: finalizar(resultado), clipeId: clipe.id };
}

export function moverClipe(projeto: Projeto, ctx: Contexto, clipeId: string, destino: DestinoClipe & { inicio: Tick }): Projeto {
  const { faixa: origem, clipe } = acharOuErro(projeto, clipeId);
  exigirDestravada(origem);
  const info = infoDoClipe(ctx, clipe, origem);

  const restantes = origem.clipes.filter((item) => item.id !== clipeId);
  const semOClipe = { ...origem, clipes: restantes };
  let resultado = trocarFaixa(projeto, origem.tipo === "principal" ? compactar(semOClipe) : semOClipe);

  const faixa = destino.faixaId ? resultado.faixas.find((item) => item.id === destino.faixaId) : undefined;
  if (faixa && !aceitaNaFaixa(faixa.tipo, clipe, info)) {
    throw new ErroEdicao(clipe.texto ? "Textos ficam na faixa de texto." : faixaDeTexto(faixa.tipo) ? "A faixa de texto só recebe textos." : mensagemDeTipo(info));
  }
  if (faixa) exigirDestravada(faixa);

  if (faixa?.tipo === "principal") {
    resultado = inserirNaPrincipal(resultado, clipe, destino.inicio);
  } else {
    const movido = { ...clipe, inicio: Math.max(0, quadroMaisProximo(projeto.taxa, destino.inicio)) };
    // Solto por cima de outro clipe, ganha uma faixa nova ao lado, como no CapCut
    const ocupado = faixa ? !cabe(faixa, movido.inicio, movido.duracao) : false;
    resultado = colocarLivre(resultado, ctx, tipoLivreDoClipe(clipe, info, origem.tipo), movido, faixa?.id, destino.novaFaixa || ocupado);
  }
  return finalizar(resultado);
}

/** Puxa a borda do começo ou do fim do clipe até `tempo`, sem passar do que a mídia tem nem do vizinho. */
export function apararClipe(projeto: Projeto, ctx: Contexto, clipeId: string, borda: "inicio" | "fim", tempo: Tick): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  const quadro = duracaoDoQuadro(projeto.taxa);
  const info = infoDoClipe(ctx, clipe, faixa);
  const alvo = quadroMaisProximo(projeto.taxa, tempo);
  const livre = faixa.tipo !== "principal";
  let novo: Clipe;

  if (borda === "fim") {
    // Sem mídia limitando (texto, ou mídia que sumiu da biblioteca), o limite é o tamanho máximo do projeto
    let maximo = Number.isFinite(info.duracao)
      ? ajustarAoQuadro(projeto.taxa, (info.duracao - clipe.entrada) / clipe.velocidade)
      : TICK_MAXIMO - clipe.inicio;
    const proximo = livre ? faixa.clipes.find((item) => item.inicio >= fimDoClipe(clipe) && item.id !== clipe.id) : undefined;
    if (proximo) maximo = Math.min(maximo, proximo.inicio - clipe.inicio);
    const duracao = Math.min(Math.max(alvo - clipe.inicio, quadro), maximo);
    novo = { ...clipe, duracao };
  } else {
    // delta > 0 encurta pelo começo; delta < 0 mostra o que vinha antes na mídia (o texto não tem limite)
    let minimo = clipe.texto ? Number.NEGATIVE_INFINITY : -ajustarAoQuadro(projeto.taxa, clipe.entrada / clipe.velocidade);
    if (livre) {
      const anterior = [...faixa.clipes].reverse().find((item) => fimDoClipe(item) <= clipe.inicio && item.id !== clipe.id);
      minimo = Math.max(minimo, (anterior ? fimDoClipe(anterior) : 0) - clipe.inicio);
    }
    const maximo = clipe.duracao - quadro;
    const delta = Math.min(Math.max(alvo - clipe.inicio, minimo), maximo);
    novo = {
      ...clipe,
      inicio: clipe.inicio + delta,
      duracao: clipe.duracao - delta,
      entrada: Math.max(0, clipe.entrada + Math.round(delta * clipe.velocidade)),
      // Os keyframes e as palavras da legenda ficam no mesmo instante da linha do tempo
      keyframes: deslocarKeyframes(clipe.keyframes, delta),
      texto: deslocarTempos(clipe.texto, delta),
      abaixamento: deslocarAbaixamento(clipe.abaixamento, delta),
    };
  }

  const clipes = [...faixa.clipes];
  clipes[indice] = novo;
  const alterada = { ...faixa, clipes };
  return finalizar(trocarFaixa(projeto, livre ? alterada : compactar(alterada)));
}

/**
 * Divide no instante `tempo` os clipes escolhidos que passam por ele.
 * Sem nenhum escolhido, divide o clipe da faixa principal que está sob o cursor.
 */
export function dividirClipes(projeto: Projeto, ctx: Contexto, tempo: Tick, clipeIds: string[]): { projeto: Projeto; novos: string[] } {
  const t = quadroMaisProximo(projeto.taxa, tempo);
  const quadro = duracaoDoQuadro(projeto.taxa);
  const escolhidos = new Set(clipeIds);
  const novos: string[] = [];

  const faixas = projeto.faixas.map((faixa) => {
    const clipes: Clipe[] = [];
    for (const clipe of faixa.clipes) {
      const alvo = escolhidos.size ? escolhidos.has(clipe.id) : faixa.tipo === "principal";
      const fim = fimDoClipe(clipe);
      if (!alvo || t < clipe.inicio + quadro || t > fim - quadro) {
        clipes.push(clipe);
        continue;
      }
      exigirDestravada(faixa);
      const direita: Clipe = {
        ...clipe,
        id: ctx.novoId(),
        inicio: t,
        duracao: fim - t,
        entrada: clipe.entrada + Math.round((t - clipe.inicio) * clipe.velocidade),
        // O fade e a animação de entrada ficam com a metade da esquerda; os de saída, com a da direita
        fade_entrada: 0,
        keyframes: deslocarKeyframes(clipe.keyframes, t - clipe.inicio),
        texto: deslocarTempos(clipe.texto, t - clipe.inicio),
        abaixamento: deslocarAbaixamento(clipe.abaixamento, t - clipe.inicio),
        animacao: clipe.animacao ? { ...clipe.animacao, entrada: SEM_ANIMACAO.entrada } : clipe.animacao,
      };
      const esquerda = { ...clipe, duracao: t - clipe.inicio, fade_saida: 0, animacao: clipe.animacao ? { ...clipe.animacao, saida: SEM_ANIMACAO.saida } : clipe.animacao };
      clipes.push(esquerda, direita);
      novos.push(direita.id);
    }
    return { ...faixa, clipes };
  });

  if (!novos.length) throw new ErroEdicao("Coloque o cursor sobre o clipe que quer dividir.");
  return { projeto: finalizar({ ...projeto, faixas }), novos };
}

/**
 * Apaga os clipes. Na faixa principal o espaço sempre fecha; nas outras, só com `fecharEspaco`
 * (os clipes seguintes da mesma faixa andam para a esquerda).
 */
export function apagarClipes(projeto: Projeto, clipeIds: string[], fecharEspaco = false): Projeto {
  const apagar = new Set(clipeIds);
  if (!apagar.size) throw new ErroEdicao("Escolha um clipe para apagar.");

  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => apagar.has(clipe.id))) return faixa;
    exigirDestravada(faixa);
    if (faixa.tipo === "principal") return compactar({ ...faixa, clipes: faixa.clipes.filter((clipe) => !apagar.has(clipe.id)) });
    let recuo = 0;
    const clipes: Clipe[] = [];
    for (const clipe of ordenar(faixa.clipes)) {
      if (apagar.has(clipe.id)) {
        if (fecharEspaco) recuo += clipe.duracao;
        continue;
      }
      clipes.push(recuo ? { ...clipe, inicio: clipe.inicio - recuo } : clipe);
    }
    return { ...faixa, clipes };
  });
  return finalizar({ ...projeto, faixas });
}

export type Intervalo = { inicio: Tick; fim: Tick };

/**
 * Os intervalos no quadro, em ordem e sem sobreposição; os menores que um quadro somem. As duas pontas
 * vão para o começo do quadro: os cortes da fala começam e terminam no começo de uma palavra (ou numa
 * pausa), e arredondar para a frente deixaria um pedaço da palavra cortada ou comeria o da seguinte.
 */
function juntarIntervalos(projeto: Projeto, intervalos: Intervalo[]): Intervalo[] {
  const quadro = duracaoDoQuadro(projeto.taxa);
  const alinhados = intervalos
    .map((item) => ({ inicio: Math.max(0, ajustarAoQuadro(projeto.taxa, item.inicio)), fim: ajustarAoQuadro(projeto.taxa, item.fim) }))
    .filter((item) => item.fim - item.inicio >= quadro)
    .sort((a, b) => a.inicio - b.inicio);
  const juntos: Intervalo[] = [];
  for (const item of alinhados) {
    const ultimo = juntos.at(-1);
    if (ultimo && item.inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, item.fim);
    else juntos.push({ ...item });
  }
  return juntos;
}

/**
 * Tira os intervalos da linha do tempo inteira e fecha o espaço, em todas as faixas, para a fala,
 * as legendas, as sobreposições e a música continuarem juntas. Um clipe que atravessa um intervalo
 * vira pedaços: o primeiro guarda o id, o fade e a animação de entrada; o último, os de saída e a
 * transição. É a base da limpeza de fala e da edição pelo texto.
 */
export function removerIntervalos(projeto: Projeto, ctx: Contexto, intervalos: Intervalo[]): Projeto {
  const cortes = juntarIntervalos(projeto, intervalos);
  if (!cortes.length) throw new ErroEdicao("Não há trechos para remover.");
  const quadro = duracaoDoQuadro(projeto.taxa);
  /** Quanto foi removido antes do instante `t`. */
  const removidoAntes = (t: Tick) => cortes.reduce((soma, corte) => soma + Math.max(0, Math.min(t, corte.fim) - corte.inicio), 0);

  const faixas = projeto.faixas.map((faixa) => {
    const atingida = faixa.clipes.some((clipe) => cortes.some((corte) => corte.inicio < fimDoClipe(clipe)));
    if (!atingida) return faixa;
    exigirDestravada(faixa);
    const clipes: Clipe[] = [];
    for (const clipe of ordenar(faixa.clipes)) {
      const fim = fimDoClipe(clipe);
      // Os pedaços do clipe que ficam fora dos intervalos
      const pedacos: Intervalo[] = [];
      let t = clipe.inicio;
      for (const corte of cortes) {
        if (corte.fim <= t || corte.inicio >= fim) continue;
        if (corte.inicio > t) pedacos.push({ inicio: t, fim: corte.inicio });
        t = Math.max(t, corte.fim);
      }
      if (t < fim) pedacos.push({ inicio: t, fim });
      const validos = pedacos.filter((p) => p.fim - p.inicio >= quadro);
      validos.forEach((pedaco, i) => {
        const primeiro = i === 0;
        const ultimo = i === validos.length - 1;
        const inteiro = pedaco.inicio === clipe.inicio && pedaco.fim === fim;
        clipes.push(
          inteiro
            ? { ...clipe, inicio: clipe.inicio - removidoAntes(clipe.inicio) }
            : {
                ...clipe,
                id: primeiro ? clipe.id : ctx.novoId(),
                inicio: pedaco.inicio - removidoAntes(pedaco.inicio),
                duracao: pedaco.fim - pedaco.inicio,
                entrada: clipe.entrada + Math.round((pedaco.inicio - clipe.inicio) * clipe.velocidade),
                fade_entrada: primeiro ? clipe.fade_entrada : 0,
                fade_saida: ultimo ? clipe.fade_saida : 0,
                keyframes: deslocarKeyframes(clipe.keyframes, pedaco.inicio - clipe.inicio),
                texto: deslocarTempos(clipe.texto, pedaco.inicio - clipe.inicio),
                abaixamento: deslocarAbaixamento(clipe.abaixamento, pedaco.inicio - clipe.inicio),
                transicao: ultimo ? clipe.transicao : null,
                animacao: clipe.animacao
                  ? { ...clipe.animacao, entrada: primeiro ? clipe.animacao.entrada : SEM_ANIMACAO.entrada, saida: ultimo ? clipe.animacao.saida : SEM_ANIMACAO.saida }
                  : clipe.animacao,
              },
        );
      });
    }
    const alterada = { ...faixa, clipes };
    return faixa.tipo === "principal" ? compactar(alterada) : alterada;
  });
  return finalizar({ ...projeto, faixas });
}

/** Cada clipe ganha uma cópia logo depois dele. Devolve os ids das cópias. */
export function duplicarClipes(projeto: Projeto, ctx: Contexto, clipeIds: string[]): { projeto: Projeto; novos: string[] } {
  if (!clipeIds.length) throw new ErroEdicao("Escolha um clipe para duplicar.");
  const novos: string[] = [];
  let resultado = projeto;
  for (const clipeId of clipeIds) {
    const { faixa, clipe, indice } = acharOuErro(resultado, clipeId);
    exigirDestravada(faixa);
    const copia: Clipe = { ...clipe, id: ctx.novoId() };
    if (faixa.tipo === "principal") {
      const clipes = [...faixa.clipes];
      clipes.splice(indice + 1, 0, copia);
      resultado = trocarFaixa(resultado, compactar({ ...faixa, clipes }));
    } else {
      copia.inicio = fimDoClipe(clipe);
      resultado = colocarLivre(resultado, ctx, faixa.tipo, copia, faixa.id);
    }
    novos.push(copia.id);
  }
  return { projeto: finalizar(resultado), novos };
}

export function alternarFaixa(projeto: Projeto, faixaId: string, propriedade: "oculta" | "muda" | "travada"): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa) throw new ErroEdicao("Esta faixa não existe mais.");
  return trocarFaixa(projeto, { ...faixa, [propriedade]: !faixa[propriedade] });
}

// Limites da transformação e do recorte. Os mesmos de apps/api/esquemas.py.
export const LIMITES_TRANSFORMACAO = {
  x: { minimo: -10, maximo: 10 },
  y: { minimo: -10, maximo: 10 },
  escala: { minimo: 0.01, maximo: 20 },
  opacidade: { minimo: 0, maximo: 1 },
} as const;
/** O recorte nunca fica menor que isto da mídia, em cada direção. */
export const RECORTE_MINIMO = 0.02;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Giro equivalente entre -180 (exclusive) e 180 graus. */
export function normalizarRotacao(graus: number): number {
  const resto = ((graus % 360) + 360) % 360;
  return resto > 180 ? resto - 360 : resto;
}

function limitarTransformacao(t: Transformacao): Transformacao {
  const { x, y, escala, opacidade } = LIMITES_TRANSFORMACAO;
  return {
    x: limitar(t.x, x.minimo, x.maximo),
    y: limitar(t.y, y.minimo, y.maximo),
    escala: limitar(t.escala, escala.minimo, escala.maximo),
    rotacao: normalizarRotacao(t.rotacao),
    opacidade: limitar(t.opacidade, opacidade.minimo, opacidade.maximo),
  };
}

function limitarRecorte(r: Recorte): Recorte {
  const x = limitar(r.x, 0, 1 - RECORTE_MINIMO);
  const y = limitar(r.y, 0, 1 - RECORTE_MINIMO);
  return { x, y, largura: limitar(r.largura, RECORTE_MINIMO, 1 - x), altura: limitar(r.altura, RECORTE_MINIMO, 1 - y) };
}

function mudarClipes(projeto: Projeto, clipeIds: string[], mudar: (clipe: Clipe, faixa: Faixa) => Clipe): Projeto {
  const alvos = new Set(clipeIds);
  if (!alvos.size) throw new ErroEdicao("Escolha um clipe.");
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => alvos.has(clipe.id))) return faixa;
    achou = true;
    exigirDestravada(faixa);
    if (faixa.tipo === "audio") throw new ErroEdicao("Clipes de áudio não aparecem na imagem.");
    return { ...faixa, clipes: faixa.clipes.map((clipe) => (alvos.has(clipe.id) ? mudar(clipe, faixa) : clipe)) };
  });
  if (!achou) throw new ErroEdicao("Este clipe não existe mais.");
  return { ...projeto, faixas };
}

/**
 * Muda as propriedades informadas da transformação dos clipes; as outras ficam como estão. Com o
 * instante `tempo`, a propriedade que tem keyframes ganha (ou muda) o ponto daquele instante, como nos
 * editores conhecidos; as que não têm mudam o valor fixo.
 */
export function transformarClipes(projeto: Projeto, clipeIds: string[], mudanca: Partial<Transformacao>, tempo?: Tick): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const atual = tempo === undefined ? clipe.transformacao : transformacaoNoTempo(clipe, tempo);
    const nova = limitarTransformacao({ ...atual, ...mudanca });
    const transformacao = { ...clipe.transformacao };
    let keyframes = clipe.keyframes;
    for (const propriedade of Object.keys(mudanca) as (keyof Transformacao)[]) {
      const pontos = clipe.keyframes?.[propriedade];
      if (tempo !== undefined && pontos?.length) {
        const t = quadroDoClipe(projeto, clipe, tempo);
        keyframes = { ...keyframes, [propriedade]: comPonto(pontos, { t, valor: nova[propriedade], curva: curvaEm(pontos, t) }, projeto) };
      } else {
        transformacao[propriedade] = nova[propriedade];
      }
    }
    return { ...clipe, transformacao, keyframes };
  });
}

/** O instante do clipe (desde o começo dele) no quadro mais próximo de `tempo`, dentro do clipe. */
function quadroDoClipe(projeto: Projeto, clipe: Clipe, tempo: Tick): Tick {
  return Math.min(Math.max(quadroMaisProximo(projeto.taxa, tempo) - clipe.inicio, 0), clipe.duracao);
}

/** A curva que um ponto novo herda: a do ponto anterior, para não mudar o jeito do movimento. */
function curvaEm(pontos: Keyframe[], t: Tick): Curva {
  return [...pontos].reverse().find((ponto) => ponto.t <= t)?.curva ?? "linear";
}

/** Os pontos com `novo` no lugar do que estava no mesmo instante (ou somado, em ordem). */
function comPonto(pontos: Keyframe[], novo: Keyframe, projeto: Projeto): Keyframe[] {
  const meioQuadro = duracaoDoQuadro(projeto.taxa) / 2;
  const outros = pontos.filter((ponto) => Math.abs(ponto.t - novo.t) > meioQuadro);
  if (outros.length >= KEYFRAMES_POR_PROPRIEDADE) throw new ErroEdicao(`Cada propriedade pode ter no máximo ${KEYFRAMES_POR_PROPRIEDADE} keyframes.`);
  return [...outros, novo].sort((a, b) => a.t - b.t);
}

export type AcaoDeKeyframe = "alternar" | Curva;

/**
 * "alternar": põe um keyframe da propriedade no instante, com o valor que ela tem ali, ou tira o que
 * já estava. Tirar o último deixa o clipe parado no valor dele. "linear" ou "suave": muda a curva do
 * ponto do instante até o seguinte.
 */
export function mudarKeyframe(projeto: Projeto, clipeId: string, propriedade: PropriedadeAnimavel, tempo: Tick, acao: AcaoDeKeyframe): Projeto {
  return mudarClipes(projeto, [clipeId], (clipe) => {
    if (tempo < clipe.inicio || tempo > clipe.inicio + clipe.duracao) throw new ErroEdicao("Leve o cursor para dentro do clipe.");
    const t = quadroDoClipe(projeto, clipe, tempo);
    const pontos = clipe.keyframes?.[propriedade] ?? [];
    const meioQuadro = duracaoDoQuadro(projeto.taxa) / 2;
    const existente = keyframeEm(pontos, t, meioQuadro);
    if (acao !== "alternar") {
      if (!existente) throw new ErroEdicao("Não há keyframe neste instante.");
      return { ...clipe, keyframes: { ...clipe.keyframes, [propriedade]: pontos.map((p) => (p === existente ? { ...p, curva: acao } : p)) } };
    }
    if (existente) {
      const restantes = pontos.filter((p) => p !== existente);
      const keyframes: Keyframes = { ...clipe.keyframes, [propriedade]: restantes };
      if (restantes.length) return { ...clipe, keyframes };
      delete keyframes[propriedade];
      const vazios = PROPRIEDADES_ANIMAVEIS.every((p) => !keyframes[p]?.length);
      return { ...clipe, keyframes: vazios ? null : keyframes, transformacao: { ...clipe.transformacao, [propriedade]: existente.valor } };
    }
    const valor = transformacaoNoTempo(clipe, tempo)[propriedade];
    return { ...clipe, keyframes: { ...clipe.keyframes, [propriedade]: comPonto(pontos, { t, valor, curva: curvaEm(pontos, t) }, projeto) } };
  });
}

/** Volta posição, escala, giro, opacidade e recorte ao padrão, sem keyframes. */
export function restaurarClipes(projeto: Projeto, clipeIds: string[]): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, transformacao: TRANSFORMACAO_PADRAO, recorte: RECORTE_PADRAO, keyframes: null }));
}

export function recortarClipes(projeto: Projeto, clipeIds: string[], recorte: Recorte): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, recorte: limitarRecorte(recorte) }));
}

export const VOLUME_MAXIMO = 4;

export type MudancaDeAudio = {
  volume?: number;
  fade_entrada?: Tick;
  fade_saida?: Tick;
  curva_fade?: CurvaDoFade;
  voz_limpa?: boolean;
  igualar_volume?: boolean;
  /** null tira os efeitos. */
  efeitos_voz?: EfeitosVoz | null;
};

/** Volume, fades e voz limpa. Vale para os clipes com som: os de áudio e os vídeos que têm áudio. */
export function ajustarAudio(projeto: Projeto, clipeIds: string[], mudanca: MudancaDeAudio): Projeto {
  const alvos = new Set(clipeIds);
  if (!alvos.size) throw new ErroEdicao("Escolha um clipe.");
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => alvos.has(clipe.id))) return faixa;
    achou = true;
    exigirDestravada(faixa);
    const clipes = faixa.clipes.map((clipe) => {
      if (!alvos.has(clipe.id)) return clipe;
      const volume = mudanca.volume === undefined ? clipe.volume : limitar(mudanca.volume, 0, VOLUME_MAXIMO);
      const fadeEntrada = Math.round(limitar(mudanca.fade_entrada ?? clipe.fade_entrada, 0, clipe.duracao));
      const fadeSaida = Math.round(limitar(mudanca.fade_saida ?? clipe.fade_saida, 0, clipe.duracao - fadeEntrada));
      const vozLimpa = mudanca.voz_limpa ?? clipe.voz_limpa ?? false;
      const curva = mudanca.curva_fade ?? clipe.curva_fade ?? "linear";
      const igualar = mudanca.igualar_volume ?? clipe.igualar_volume ?? false;
      const efeitos = mudanca.efeitos_voz === undefined ? clipe.efeitos_voz : mudanca.efeitos_voz && efeitosAtivos(mudanca.efeitos_voz) ? limitarEfeitos(mudanca.efeitos_voz) : null;
      return {
        ...clipe,
        volume,
        fade_entrada: fadeEntrada,
        fade_saida: fadeSaida,
        curva_fade: curva,
        voz_limpa: vozLimpa,
        igualar_volume: igualar,
        efeitos_voz: efeitos ?? null,
      };
    });
    return { ...faixa, clipes };
  });
  if (!achou) throw new ErroEdicao("Este clipe não existe mais.");
  return { ...projeto, faixas };
}

/** Duração de um texto novo, como no CapCut. */
export const DURACAO_TEXTO_S = 3;

/** Texto novo no instante `inicio`, numa faixa de texto onde caiba (ou numa nova, por cima de tudo). */
export function adicionarTexto(projeto: Projeto, ctx: Contexto, inicio: Tick, texto: Texto): { projeto: Projeto; clipeId: string } {
  const clipe: Clipe = {
    id: ctx.novoId(),
    midia_id: null,
    texto: ajustarTexto(texto, {}),
    inicio: Math.max(0, quadroMaisProximo(projeto.taxa, inicio)),
    duracao: ajustarAoQuadro(projeto.taxa, DURACAO_TEXTO_S * TICKS_POR_SEGUNDO),
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: TRANSFORMACAO_PADRAO,
    recorte: RECORTE_PADRAO,
  };
  return { projeto: finalizar(colocarLivre(projeto, ctx, "texto", clipe)), clipeId: clipe.id };
}

/** Duração de uma legenda nova, e a menor que uma legenda importada pode ter. */
export const DURACAO_LEGENDA_S = 2;

function clipeDeTexto(ctx: Contexto, inicio: Tick, duracao: Tick, texto: Texto, y = 0): Clipe {
  return {
    id: ctx.novoId(),
    midia_id: null,
    texto: ajustarTexto(texto, {}),
    inicio,
    duracao,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: { ...TRANSFORMACAO_PADRAO, y },
    recorte: RECORTE_PADRAO,
  };
}

/** Legenda nova no instante `inicio`, perto da borda de baixo, numa faixa de legenda onde caiba. */
export function adicionarLegenda(projeto: Projeto, ctx: Contexto, inicio: Tick, estilo: Texto): { projeto: Projeto; clipeId: string } {
  const duracao = ajustarAoQuadro(projeto.taxa, DURACAO_LEGENDA_S * TICKS_POR_SEGUNDO);
  const clipe = clipeDeTexto(ctx, Math.max(0, quadroMaisProximo(projeto.taxa, inicio)), duracao, { ...estilo, conteudo: estilo.conteudo || "Legenda" }, POSICAO_LEGENDA);
  return { projeto: finalizar(colocarLivre(projeto, ctx, "legenda", clipe)), clipeId: clipe.id };
}

/**
 * Legendas de um arquivo SRT ou VTT numa faixa nova, com o estilo dado. Os tempos encostam nos
 * quadros do projeto; a que ficaria com menos de um quadro é deixada de fora.
 */
export function importarLegendas(projeto: Projeto, ctx: Contexto, legendas: Legenda[], estilo: Texto): { projeto: Projeto; clipeIds: string[] } {
  const quadro = duracaoDoQuadro(projeto.taxa);
  const clipes: Clipe[] = [];
  let fimAnterior = 0;
  for (const legenda of legendas) {
    const inicio = Math.max(quadroMaisProximo(projeto.taxa, legenda.inicio), fimAnterior);
    const fim = quadroMaisProximo(projeto.taxa, legenda.fim);
    if (fim - inicio < quadro) continue;
    // Os tempos das palavras passam a contar do começo do clipe
    const tempos = legenda.tempos?.map((t) => t - inicio) ?? null;
    clipes.push(clipeDeTexto(ctx, inicio, fim - inicio, { ...estilo, conteudo: legenda.conteudo, tempos }, POSICAO_LEGENDA));
    fimAnterior = fim;
  }
  if (!clipes.length) throw new ErroEdicao("O arquivo não tem legendas que deem para usar.");
  const criada = criarFaixa(projeto, ctx, "legenda");
  const resultado = trocarFaixa(criada.projeto, { ...criada.faixa, clipes });
  return { projeto: finalizar(resultado), clipeIds: clipes.map((clipe) => clipe.id) };
}

/** As palavras da legenda continuam no mesmo instante quando o começo do clipe anda `delta`. */
function deslocarTempos(texto: Texto | null | undefined, delta: Tick): Texto | null | undefined {
  if (!texto?.tempos || delta === 0) return texto;
  return { ...texto, tempos: texto.tempos.map((t) => t - delta) };
}

/** A curva do abaixar na fala continua no mesmo instante da linha do tempo. */
function deslocarAbaixamento(abaixamento: Abaixamento | null | undefined, delta: Tick): Abaixamento | null | undefined {
  if (!abaixamento || delta === 0) return abaixamento;
  return { ...abaixamento, pontos: abaixamento.pontos.map((ponto) => ({ ...ponto, t: ponto.t - delta })) };
}

/** Grava (ou tira, com null) a curva do abaixar na fala de um clipe com som. */
export function abaixarClipe(projeto: Projeto, clipeId: string, abaixamento: Abaixamento | null): Projeto {
  const achado = acharClipe(projeto, clipeId);
  if (!achado) throw new ErroEdicao("Este clipe não existe mais.");
  exigirDestravada(achado.faixa);
  if (!achado.clipe.midia_id) throw new ErroEdicao("Este clipe não tem som.");
  const clipes = achado.faixa.clipes.map((clipe) => (clipe.id === clipeId ? { ...clipe, abaixamento } : clipe));
  return trocarFaixa(projeto, { ...achado.faixa, clipes });
}

/** Aplica o estilo (tudo menos o conteúdo) a todas as legendas da faixa. */
export function estiloDasLegendas(projeto: Projeto, faixaId: string, estilo: Partial<Texto>): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa || faixa.tipo !== "legenda") throw new ErroEdicao("Esta faixa de legendas não existe mais.");
  exigirDestravada(faixa);
  // O destaque é do estilo (sem ele no estilo, sai); o conteúdo e os tempos das palavras ficam
  const semConteudo = { ...estilo, destaque: estilo.destaque ?? null };
  delete semConteudo.conteudo;
  delete semConteudo.tempos;
  const clipes = faixa.clipes.map((clipe) => (clipe.texto ? { ...clipe, texto: ajustarTexto(clipe.texto, semConteudo) } : clipe));
  return trocarFaixa(projeto, { ...faixa, clipes });
}

export function mudarTexto(projeto: Projeto, clipeIds: string[], mudanca: Partial<Texto>): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    if (!clipe.texto) throw new ErroEdicao("Este clipe não é um texto.");
    return { ...clipe, texto: ajustarTexto(clipe.texto, mudanca) };
  });
}

/** Muda a animação de entrada, a de saída ou as duas. As durações ficam dentro do clipe. */
export function animarClipes(projeto: Projeto, clipeIds: string[], mudanca: Partial<Animacoes>): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({
    ...clipe,
    animacao: limitarAnimacoes({ ...SEM_ANIMACAO, ...clipe.animacao, ...mudanca }, clipe.duracao),
  }));
}

/** Duração de uma transição nova. */
export const DURACAO_TRANSICAO_S = 0.5;

/**
 * A transição do clipe da principal para o seguinte. `null` tira a transição. A duração fica dentro
 * do menor dos dois clipes.
 */
export function definirTransicao(projeto: Projeto, clipeId: string, transicao: Transicao | null): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  const proximo = faixa.clipes[indice + 1];
  if (faixa.tipo !== "principal" || (!proximo && transicao)) throw new ErroEdicao("A transição fica entre dois clipes vizinhos da faixa principal.");
  const nova = transicao && proximo ? { ...transicao, duracao: Math.max(1, Math.min(Math.round(transicao.duracao), duracaoMaximaDaTransicao(clipe, proximo))) } : null;
  return trocarFaixa(projeto, { ...faixa, clipes: faixa.clipes.map((item) => (item.id === clipeId ? { ...item, transicao: nova } : item)) });
}

/** Intensidade máxima de um filtro pronto (200%). */
export const INTENSIDADE_MAXIMA = 2;

/** Ajustes de cor e filtro dos clipes; cada valor fica dentro do limite dele. */
export function mudarCor(projeto: Projeto, clipeIds: string[], mudanca: Partial<Cor>): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const cor: Cor = { ...COR_PADRAO, ...clipe.cor, ...mudanca };
    for (const chave of Object.keys(LIMITES_COR) as (keyof AjustesCor)[]) {
      cor[chave] = limitar(cor[chave], LIMITES_COR[chave].minimo, LIMITES_COR[chave].maximo);
    }
    if (cor.filtro !== null && !FILTROS.some((filtro) => filtro.id === cor.filtro)) throw new ErroEdicao("Este filtro não existe.");
    cor.intensidade = limitar(cor.intensidade, 0, INTENSIDADE_MAXIMA);
    // Curva neutra não fica guardada; os pontos ficam de 0 a 1, em ordem
    if (curvasNeutras(cor.curvas)) cor.curvas = null;
    else {
      const ajustar = (pontos: PontoDaCurva[] | undefined) =>
        (pontos ?? CURVA_NEUTRA).slice(0, PONTOS_MAXIMOS_DA_CURVA).map(([x, y]) => [limitar(x, 0, 1), limitar(y, 0, 1)] as PontoDaCurva).sort((a, b) => a[0] - b[0]);
      cor.curvas = { rgb: ajustar(cor.curvas!.rgb), r: ajustar(cor.curvas!.r), g: ajustar(cor.curvas!.g), b: ajustar(cor.curvas!.b) };
    }
    return { ...clipe, cor };
  });
}

/** O modo de mesclagem dos clipes (de imagem: os de áudio não aparecem). */
export function mesclarClipes(projeto: Projeto, clipeIds: string[], mesclagem: Mesclagem): Projeto {
  if (!MESCLAGENS.some((item) => item.id === mesclagem)) throw new ErroEdicao("Este modo de mesclagem não existe.");
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, mesclagem }));
}

export function mudarFundo(projeto: Projeto, cor: string): Projeto {
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw new ErroEdicao("Cor inválida.");
  return { ...projeto, fundo: { ...projeto.fundo, cor: cor.toLowerCase() } };
}

/**
 * Aplica o reenquadramento pelo rosto (lib/projeto/reenquadrar.ts): a escala que cobre o quadro, a
 * posição e o caminho da câmera nos keyframes de x e y. O giro volta a zero (a conta supõe a imagem
 * reta); os keyframes de escala e giro saem, os de opacidade ficam.
 */
export function reenquadrarClipe(projeto: Projeto, clipeId: string, r: Reenquadramento): Projeto {
  const quadro = duracaoDoQuadro(projeto.taxa);
  return mudarClipes(projeto, [clipeId], (clipe) => {
    if (clipe.texto) throw new ErroEdicao("Textos não têm rosto para seguir.");
    // Os pontos no quadro e dentro do clipe, sem dois no mesmo quadro
    const noQuadro = (pontos: Keyframe[] | undefined) => {
      if (!pontos) return undefined;
      const alinhados: Keyframe[] = [];
      for (const ponto of pontos) {
        const t = Math.min(Math.max(quadroMaisProximo(projeto.taxa, ponto.t), 0), clipe.duracao);
        if (alinhados.length && t - alinhados[alinhados.length - 1].t < quadro) continue;
        alinhados.push({ ...ponto, t });
      }
      return alinhados.length > 1 ? alinhados : undefined;
    };
    const keyframes: Keyframes = { opacidade: clipe.keyframes?.opacidade, x: noQuadro(r.keyframes.x), y: noQuadro(r.keyframes.y) };
    const vazios = PROPRIEDADES_ANIMAVEIS.every((p) => !keyframes[p]?.length);
    return {
      ...clipe,
      transformacao: limitarTransformacao({ ...clipe.transformacao, escala: r.escala, x: r.x, y: r.y, rotacao: 0 }),
      keyframes: vazios ? null : keyframes,
    };
  });
}
