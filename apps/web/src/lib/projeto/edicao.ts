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
import { ajustarAoQuadro, duracaoDoQuadro, quadroMaisProximo, TICK_MAXIMO, type Tick } from "../tempo.ts";
import {
  type Clipe,
  type Faixa,
  fimDoClipe,
  type InfoMidia,
  type Projeto,
  RECORTE_PADRAO,
  type Recorte,
  type TipoFaixa,
  type Transformacao,
  TRANSFORMACAO_PADRAO,
} from "./modelo.ts";

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
  return tipo === "audio" ? !info.video && info.audio : info.video;
}

function mensagemDeTipo(info: InfoMidia): string {
  return info.video ? "Vídeos ficam nas faixas de vídeo." : "Áudios ficam nas faixas de áudio.";
}

function infoDoClipe(ctx: Contexto, clipe: Clipe, faixa: Faixa): InfoMidia {
  return ctx.midia(clipe.midia_id) ?? { duracao: Number.POSITIVE_INFINITY, video: faixa.tipo !== "audio", audio: faixa.tipo === "audio" };
}

/** Tira as faixas livres que ficaram vazias e confere o tamanho máximo. */
function finalizar(projeto: Projeto): Projeto {
  const faixas = projeto.faixas.filter((faixa) => faixa.tipo === "principal" || faixa.clipes.length > 0);
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
  if (tipo === "video") {
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
    transformacao: TRANSFORMACAO_PADRAO,
    recorte: RECORTE_PADRAO,
  };
  const faixa = destino.faixaId ? projeto.faixas.find((item) => item.id === destino.faixaId) : undefined;
  if (faixa && !combina(faixa.tipo, info)) throw new ErroEdicao(mensagemDeTipo(info));

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
  if (faixa && !combina(faixa.tipo, info)) throw new ErroEdicao(mensagemDeTipo(info));
  if (faixa) exigirDestravada(faixa);

  if (faixa?.tipo === "principal") {
    resultado = inserirNaPrincipal(resultado, clipe, destino.inicio);
  } else {
    const movido = { ...clipe, inicio: Math.max(0, quadroMaisProximo(projeto.taxa, destino.inicio)) };
    // Solto por cima de outro clipe, ganha uma faixa nova ao lado, como no CapCut
    const ocupado = faixa ? !cabe(faixa, movido.inicio, movido.duracao) : false;
    resultado = colocarLivre(resultado, ctx, info.video ? "video" : "audio", movido, faixa?.id, destino.novaFaixa || ocupado);
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
    let maximo = ajustarAoQuadro(projeto.taxa, (info.duracao - clipe.entrada) / clipe.velocidade);
    const proximo = livre ? faixa.clipes.find((item) => item.inicio >= fimDoClipe(clipe) && item.id !== clipe.id) : undefined;
    if (proximo) maximo = Math.min(maximo, proximo.inicio - clipe.inicio);
    const duracao = Math.min(Math.max(alvo - clipe.inicio, quadro), maximo);
    novo = { ...clipe, duracao };
  } else {
    // delta > 0 encurta pelo começo; delta < 0 mostra o que vinha antes na mídia
    let minimo = -ajustarAoQuadro(projeto.taxa, clipe.entrada / clipe.velocidade);
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
      };
      clipes.push({ ...clipe, duracao: t - clipe.inicio }, direita);
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

/** Muda as propriedades informadas da transformação dos clipes; as outras ficam como estão. */
export function transformarClipes(projeto: Projeto, clipeIds: string[], mudanca: Partial<Transformacao>): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({
    ...clipe,
    transformacao: limitarTransformacao({ ...clipe.transformacao, ...mudanca }),
  }));
}

/** Volta posição, escala, giro, opacidade e recorte ao padrão. */
export function restaurarClipes(projeto: Projeto, clipeIds: string[]): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, transformacao: TRANSFORMACAO_PADRAO, recorte: RECORTE_PADRAO }));
}

export function recortarClipes(projeto: Projeto, clipeIds: string[], recorte: Recorte): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, recorte: limitarRecorte(recorte) }));
}

export function mudarFundo(projeto: Projeto, cor: string): Projeto {
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw new ErroEdicao("Cor inválida.");
  return { ...projeto, fundo: { ...projeto.fundo, cor: cor.toLowerCase() } };
}
