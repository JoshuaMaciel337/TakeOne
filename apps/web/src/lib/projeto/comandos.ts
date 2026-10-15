// Toda mudança na linha do tempo é um comando: { comando, parametros }. A interface, os atalhos e,
// mais tarde, um agente pelo MCP passam pelo mesmo caminho. A ideia vem do sistema de comandos do
// FilmCraft (crates/engine); a implementação é do TakeOne.
//
// O histórico guarda o projeto de antes de cada comando. Como as operações nunca alteram o projeto
// recebido, desfazer é só voltar para a versão anterior.
import type { Tick } from "../tempo.ts";
import {
  adicionarClipe,
  adicionarLegenda,
  definirTransicao,
  animarClipes,
  adicionarTexto,
  ajustarAudio,
  mudarCor,
  alternarFaixa,
  apagarClipes,
  apararClipe,
  type AcaoDeKeyframe,
  type Contexto,
  type DestinoClipe,
  type Intervalo,
  removerIntervalos,
  dividirClipes,
  estiloDasLegendas,
  importarLegendas,
  type MudancaDeAudio,
  mudarKeyframe,
  reenquadrarClipe,
  abaixarClipe,
  duplicarClipes,
  moverClipe,
  mudarFundo,
  mudarTexto,
  recortarClipes,
  restaurarClipes,
  transformarClipes,
} from "./edicao.ts";
import type { Animacoes } from "./animacao.ts";
import type { Cor } from "./cor.ts";
import type { PropriedadeAnimavel } from "./keyframes.ts";
import type { Reenquadramento } from "./reenquadrar.ts";
import type { Abaixamento } from "./abaixar.ts";
import type { Legenda } from "./legendas.ts";
import type { Projeto, Proporcao, Recorte, Transformacao } from "./modelo.ts";
import type { Texto } from "./texto.ts";
import type { Transicao } from "./transicao.ts";

export type Comando =
  | { comando: "clipe.adicionar"; parametros: { midiaId: string } & DestinoClipe }
  | { comando: "clipe.mover"; parametros: { clipeId: string; inicio: Tick } & DestinoClipe }
  | { comando: "clipe.aparar"; parametros: { clipeId: string; borda: "inicio" | "fim"; tempo: Tick } }
  | { comando: "linha.dividir"; parametros: { tempo: Tick; clipeIds: string[] } }
  | { comando: "clipe.apagar"; parametros: { clipeIds: string[]; fecharEspaco?: boolean } }
  | { comando: "linha.removerIntervalos"; parametros: { intervalos: Intervalo[] } }
  | { comando: "clipe.duplicar"; parametros: { clipeIds: string[] } }
  | { comando: "faixa.alternar"; parametros: { faixaId: string; propriedade: "oculta" | "muda" | "travada" } }
  | { comando: "projeto.proporcao"; parametros: { proporcao: Proporcao } }
  | { comando: "projeto.fundo"; parametros: { cor: string } }
  | { comando: "clipe.transformar"; parametros: { clipeIds: string[]; transformacao: Partial<Transformacao>; tempo?: Tick } }
  | { comando: "clipe.keyframe"; parametros: { clipeId: string; propriedade: PropriedadeAnimavel; tempo: Tick; acao: AcaoDeKeyframe } }
  | { comando: "clipe.reenquadrar"; parametros: { clipeId: string; reenquadramento: Reenquadramento } }
  | { comando: "clipe.abaixar"; parametros: { clipeId: string; abaixamento: Abaixamento | null } }
  | { comando: "clipe.recortar"; parametros: { clipeIds: string[]; recorte: Recorte } }
  | { comando: "clipe.restaurar"; parametros: { clipeIds: string[] } }
  | { comando: "clipe.audio"; parametros: { clipeIds: string[] } & MudancaDeAudio }
  | { comando: "texto.adicionar"; parametros: { inicio: Tick; texto: Texto } }
  | { comando: "texto.mudar"; parametros: { clipeIds: string[]; texto: Partial<Texto> } }
  | { comando: "legenda.adicionar"; parametros: { inicio: Tick; estilo: Texto } }
  | { comando: "legenda.importar"; parametros: { legendas: Legenda[]; estilo: Texto } }
  | { comando: "legenda.estilo"; parametros: { faixaId: string; estilo: Partial<Texto> } }
  | { comando: "clipe.animar"; parametros: { clipeIds: string[]; animacao: Partial<Animacoes> } }
  | { comando: "clipe.cor"; parametros: { clipeIds: string[]; cor: Partial<Cor> } }
  | { comando: "clipe.transicao"; parametros: { clipeId: string; transicao: Transicao | null } };

export const NOMES_DOS_COMANDOS: Record<Comando["comando"], string> = {
  "clipe.adicionar": "adicionar clipe",
  "clipe.mover": "mover clipe",
  "clipe.aparar": "aparar clipe",
  "linha.dividir": "dividir",
  "clipe.apagar": "apagar",
  "linha.removerIntervalos": "remover trechos",
  "clipe.duplicar": "duplicar",
  "faixa.alternar": "mudar a faixa",
  "projeto.proporcao": "mudar a proporção",
  "projeto.fundo": "mudar o fundo",
  "clipe.transformar": "mudar posição e tamanho",
  "clipe.keyframe": "mudar keyframe",
  "clipe.reenquadrar": "seguir o rosto",
  "clipe.abaixar": "abaixar na fala",
  "clipe.recortar": "recortar",
  "clipe.restaurar": "restaurar posição e tamanho",
  "clipe.audio": "mudar o som",
  "texto.adicionar": "adicionar texto",
  "texto.mudar": "mudar o texto",
  "legenda.adicionar": "adicionar legenda",
  "legenda.importar": "importar legendas",
  "legenda.estilo": "mudar o estilo das legendas",
  "clipe.animar": "mudar a animação",
  "clipe.cor": "mudar a cor",
  "clipe.transicao": "mudar a transição",
};

/** Aplica o comando. `selecao` vem quando o comando cria clipes que devem ficar selecionados. */
export function executarComando(projeto: Projeto, { comando, parametros }: Comando, ctx: Contexto): { projeto: Projeto; selecao?: string[] } {
  switch (comando) {
    case "clipe.adicionar": {
      const { midiaId, ...destino } = parametros;
      const resultado = adicionarClipe(projeto, ctx, midiaId, destino);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "clipe.mover": {
      const { clipeId, ...destino } = parametros;
      return { projeto: moverClipe(projeto, ctx, clipeId, destino) };
    }
    case "clipe.aparar":
      return { projeto: apararClipe(projeto, ctx, parametros.clipeId, parametros.borda, parametros.tempo) };
    case "linha.dividir": {
      const resultado = dividirClipes(projeto, ctx, parametros.tempo, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "linha.removerIntervalos":
      return { projeto: removerIntervalos(projeto, ctx, parametros.intervalos), selecao: [] };
    case "clipe.apagar":
      return { projeto: apagarClipes(projeto, parametros.clipeIds, parametros.fecharEspaco), selecao: [] };
    case "clipe.duplicar": {
      const resultado = duplicarClipes(projeto, ctx, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "faixa.alternar":
      return { projeto: alternarFaixa(projeto, parametros.faixaId, parametros.propriedade) };
    case "projeto.proporcao":
      return { projeto: { ...projeto, proporcao: parametros.proporcao } };
    case "projeto.fundo":
      return { projeto: mudarFundo(projeto, parametros.cor) };
    case "clipe.transformar":
      return { projeto: transformarClipes(projeto, parametros.clipeIds, parametros.transformacao, parametros.tempo) };
    case "clipe.abaixar":
      return { projeto: abaixarClipe(projeto, parametros.clipeId, parametros.abaixamento) };
    case "clipe.reenquadrar":
      return { projeto: reenquadrarClipe(projeto, parametros.clipeId, parametros.reenquadramento) };
    case "clipe.keyframe":
      return { projeto: mudarKeyframe(projeto, parametros.clipeId, parametros.propriedade, parametros.tempo, parametros.acao) };
    case "clipe.recortar":
      return { projeto: recortarClipes(projeto, parametros.clipeIds, parametros.recorte) };
    case "clipe.restaurar":
      return { projeto: restaurarClipes(projeto, parametros.clipeIds) };
    case "texto.adicionar": {
      const resultado = adicionarTexto(projeto, ctx, parametros.inicio, parametros.texto);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "legenda.adicionar": {
      const resultado = adicionarLegenda(projeto, ctx, parametros.inicio, parametros.estilo);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "legenda.importar": {
      const resultado = importarLegendas(projeto, ctx, parametros.legendas, parametros.estilo);
      return { projeto: resultado.projeto, selecao: [] };
    }
    case "legenda.estilo":
      return { projeto: estiloDasLegendas(projeto, parametros.faixaId, parametros.estilo) };
    case "clipe.transicao":
      return { projeto: definirTransicao(projeto, parametros.clipeId, parametros.transicao) };
    case "clipe.cor":
      return { projeto: mudarCor(projeto, parametros.clipeIds, parametros.cor) };
    case "clipe.animar":
      return { projeto: animarClipes(projeto, parametros.clipeIds, parametros.animacao) };
    case "texto.mudar":
      return { projeto: mudarTexto(projeto, parametros.clipeIds, parametros.texto) };
    case "clipe.audio": {
      const { clipeIds, ...mudanca } = parametros;
      return { projeto: ajustarAudio(projeto, clipeIds, mudanca) };
    }
  }
}

// -----------------------------------------------
// Histórico
// -----------------------------------------------
const LIMITE_HISTORICO = 200;

type Passo = { projeto: Projeto; nome: string };

export type Historico = { passado: Passo[]; presente: Projeto; futuro: Passo[] };

export function iniciarHistorico(projeto: Projeto): Historico {
  return { passado: [], presente: projeto, futuro: [] };
}

export function registrar(historico: Historico, projeto: Projeto, nome: string): Historico {
  if (projeto === historico.presente) return historico;
  const passado = [...historico.passado, { projeto: historico.presente, nome }].slice(-LIMITE_HISTORICO);
  return { passado, presente: projeto, futuro: [] };
}

export function desfazer(historico: Historico): Historico {
  const anterior = historico.passado.at(-1);
  if (!anterior) return historico;
  return {
    passado: historico.passado.slice(0, -1),
    presente: anterior.projeto,
    futuro: [{ projeto: historico.presente, nome: anterior.nome }, ...historico.futuro],
  };
}

export function refazer(historico: Historico): Historico {
  const proximo = historico.futuro[0];
  if (!proximo) return historico;
  return {
    passado: [...historico.passado, { projeto: historico.presente, nome: proximo.nome }],
    presente: proximo.projeto,
    futuro: historico.futuro.slice(1),
  };
}
