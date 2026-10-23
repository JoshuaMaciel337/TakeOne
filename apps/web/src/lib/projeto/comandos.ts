// Toda mudança na linha do tempo é um comando: { comando, parametros }. A interface, os atalhos e,
// mais tarde, um agente pelo MCP passam pelo mesmo caminho. A ideia vem do sistema de comandos do
// FilmCraft (crates/engine); a implementação é do TakeOne.
//
// O histórico guarda o projeto de antes de cada comando. Como as operações nunca alteram o projeto
// recebido, desfazer é só voltar para a versão anterior.
import type { Tick } from "../tempo.ts";
import {
  adicionarAjuste,
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
  deslizarConteudo,
  dividirClipes,
  estiloDasLegendas,
  palavrasChaveDasLegendas,
  juntarLegendas,
  colarClipes,
  colarAjustes,
  type ClipeCopiado,
  type GrupoDeAjustes,
  substituirNasLegendas,
  cortarNoRitmo,
  montarNaLinha,
  colocarLogo,
  trocarMidiaDosClipes,
  aplicarModelo,
  aplicarMarcaAosTextos,
  type TrechoNaLinha,
  pulsarNoRitmo,
  importarLegendas,
  type MudancaDeAudio,
  mudarExpressao,
  mudarKeyframe,
  reenquadrarClipe,
  seguirObjetoClipe,
  zoomNosTrechos,
  abaixarClipe,
  mesclarClipes,
  virarClipes,
  arredondarClipes,
  mascararClipes,
  preencherVaga,
  aplicarEfeito,
  chromaClipes,
  chaveLumaClipes,
  removerFundo,
  estabilizarClipes,
  limparImagem,
  mudarVelocidade,
  curvarVelocidade,
  duplicarClipes,
  moverClipe,
  moverCorte,
  mudarFundo,
  mudarTexto,
  recortarClipes,
  restaurarClipes,
  transformarClipes,
} from "./edicao.ts";
import type { Animacoes } from "./animacao.ts";
import {
  adicionarCamadaDeAjuste,
  adicionarCamadaDeMidia,
  adicionarCamadaDeTexto,
  apagarCamada,
  aplicarModeloDeImagem,
  camadaComOutraMidia,
  desfocarFundo,
  duplicarCamada,
  moverCamada,
  mudarFundoDaImagem,
  mudarTamanhoDaImagem,
  recortarImagem,
  type RetanguloDaImagem,
  type TamanhoDaImagem,
  trocarImagemDaCamada,
} from "./imagem.ts";
import type { Cor } from "./cor.ts";
import type { ChaveDeKeyframe, Expressao, PropriedadeAnimavel } from "./keyframes.ts";
import type { Reenquadramento } from "./reenquadrar.ts";
import type { PlanoDoModelo } from "./modelos.ts";
import type { CamadaPronta } from "./modelosDeImagem.ts";
import type { Tamanho } from "./geometria.ts";
import type { CaminhoDoSeguidor } from "./seguirObjeto.ts";
import type { Abaixamento } from "./abaixar.ts";
import type { Efeito } from "./efeitos.ts";
import type { Cantos, ChaveLuma, Chroma, MascaraDeForma, Mesclagem } from "./modelo.ts";
import type { PontoDeVelocidade } from "./velocidade.ts";
import type { Legenda } from "./legendas.ts";
import type { Clipe, Projeto, Proporcao, Recorte, Transformacao, Virar } from "./modelo.ts";
import type { FonteTexto, Texto } from "./texto.ts";
import type { Transicao } from "./transicao.ts";

export type Comando =
  | { comando: "clipe.adicionar"; parametros: { midiaId: string } & DestinoClipe }
  | { comando: "clipe.mover"; parametros: { clipeId: string; inicio: Tick } & DestinoClipe }
  | { comando: "clipe.aparar"; parametros: { clipeId: string; borda: "inicio" | "fim"; tempo: Tick } }
  | { comando: "clipe.deslizar"; parametros: { clipeId: string; deslocamento: Tick } }
  | { comando: "clipe.adicionarAjuste"; parametros: { inicio: Tick } }
  | { comando: "imagem.adicionarAjuste"; parametros: Record<string, never> }
  | { comando: "clipe.moverCorte"; parametros: { clipeId: string; tempo: Tick } }
  | { comando: "linha.dividir"; parametros: { tempo: Tick; clipeIds: string[] } }
  | { comando: "clipe.apagar"; parametros: { clipeIds: string[]; fecharEspaco?: boolean } }
  | { comando: "linha.removerIntervalos"; parametros: { intervalos: Intervalo[] } }
  | { comando: "linha.zoomNosTrechos"; parametros: { trechos: Intervalo[] } }
  | { comando: "clipe.duplicar"; parametros: { clipeIds: string[] } }
  | { comando: "faixa.alternar"; parametros: { faixaId: string; propriedade: "oculta" | "muda" | "travada" } }
  | { comando: "projeto.proporcao"; parametros: { proporcao: Proporcao } }
  | { comando: "projeto.fundo"; parametros: { cor: string } }
  | { comando: "clipe.transformar"; parametros: { clipeIds: string[]; transformacao: Partial<Transformacao>; tempo?: Tick } }
  | { comando: "clipe.keyframe"; parametros: { clipeId: string; propriedade: ChaveDeKeyframe; tempo: Tick; acao: AcaoDeKeyframe } }
  | { comando: "clipe.expressao"; parametros: { clipeId: string; propriedade: PropriedadeAnimavel; expressao: Expressao | null } }
  | { comando: "clipe.reenquadrar"; parametros: { clipeId: string; reenquadramento: Reenquadramento } }
  | { comando: "clipe.seguirObjeto"; parametros: { clipeId: string; caminho: CaminhoDoSeguidor } }
  | { comando: "clipe.abaixar"; parametros: { clipeId: string; abaixamento: Abaixamento | null } }
  | { comando: "clipe.mesclar"; parametros: { clipeIds: string[]; mesclagem: Mesclagem } }
  | { comando: "clipe.virar"; parametros: { clipeIds: string[]; sentido: keyof Virar } }
  | { comando: "clipe.cantos"; parametros: { clipeIds: string[]; cantos: Cantos | null } }
  | { comando: "clipe.mascara"; parametros: { clipeIds: string[]; mascara: MascaraDeForma | null } }
  | { comando: "clipe.preencher"; parametros: { clipeId: string; midiaId: string } }
  | { comando: "imagem.adicionarMidia"; parametros: { midiaId: string } }
  | { comando: "imagem.adicionarTexto"; parametros: { texto: Texto } }
  | { comando: "imagem.mover"; parametros: { faixaId: string; para: "cima" | "baixo" | "topo" | "fundo" } }
  | { comando: "imagem.apagar"; parametros: { faixaId: string } }
  | { comando: "imagem.duplicar"; parametros: { faixaId: string } }
  | { comando: "imagem.desfocarFundo"; parametros: { faixaId: string } }
  | { comando: "imagem.aplicarModelo"; parametros: { camadas: CamadaPronta[]; tamanho: TamanhoDaImagem; fundo: string } }
  | { comando: "imagem.trocarImagem"; parametros: { clipeId: string; midiaId: string; tamanhoAtual: Tamanho; tamanhoNovo: Tamanho } }
  | { comando: "imagem.fundo"; parametros: { cor?: string; transparente?: boolean } }
  | { comando: "imagem.tamanho"; parametros: TamanhoDaImagem }
  | { comando: "imagem.recortar"; parametros: { retangulo: RetanguloDaImagem; tamanhos: Record<string, Tamanho> } }
  | { comando: "imagem.camadaComOutraMidia"; parametros: { faixaId: string; midiaId: string } }
  | { comando: "clipe.efeito"; parametros: { clipeIds: string[]; efeito: Efeito | null } }
  | { comando: "clipe.chroma"; parametros: { clipeIds: string[]; chroma: Chroma | null } }
  | { comando: "clipe.chaveLuma"; parametros: { clipeIds: string[]; chave: ChaveLuma | null } }
  | { comando: "clipe.removerFundo"; parametros: { clipeIds: string[]; ligar: boolean } }
  | { comando: "clipe.estabilizar"; parametros: { clipeIds: string[]; ligar: boolean } }
  | { comando: "clipe.limparImagem"; parametros: { clipeIds: string[]; ligar: boolean } }
  | { comando: "clipe.velocidade"; parametros: { clipeId: string; velocidade: number } }
  | { comando: "clipe.curvaVelocidade"; parametros: { clipeId: string; pontos: PontoDeVelocidade[] | null } }
  | { comando: "clipe.recortar"; parametros: { clipeIds: string[]; recorte: Recorte } }
  | { comando: "clipe.restaurar"; parametros: { clipeIds: string[] } }
  | { comando: "clipe.audio"; parametros: { clipeIds: string[] } & MudancaDeAudio }
  | { comando: "texto.adicionar"; parametros: { inicio: Tick; texto: Texto } }
  | { comando: "texto.mudar"; parametros: { clipeIds: string[]; texto: Partial<Texto> } }
  | { comando: "legenda.adicionar"; parametros: { inicio: Tick; estilo: Texto } }
  | { comando: "legenda.importar"; parametros: { legendas: Legenda[]; estilo: Texto } }
  | { comando: "legenda.estilo"; parametros: { faixaId: string; estilo: Partial<Texto> } }
  | { comando: "legenda.palavrasChave"; parametros: { chaves: Record<string, number[]>; cor: string | null } }
  | { comando: "legenda.juntar"; parametros: { clipeIds: string[] } }
  | { comando: "clipe.colar"; parametros: { copiados: ClipeCopiado[]; inicio: Tick } }
  | { comando: "clipe.colarAjustes"; parametros: { origem: Clipe; clipeIds: string[]; grupos: GrupoDeAjustes[] } }
  | { comando: "legenda.substituir"; parametros: { faixaId: string; busca: string; troca: string } }
  | { comando: "linha.cortarNoRitmo"; parametros: { batidas: Tick[] } }
  | { comando: "modelo.aplicar"; parametros: { plano: PlanoDoModelo } }
  | { comando: "clipe.trocarMidia"; parametros: { clipeIds: string[]; midiaId: string } }
  | { comando: "marca.logo"; parametros: { midiaId: string; transformacao: Transformacao } }
  | { comando: "marca.textos"; parametros: { fonteTitulo: FonteTexto; fonteTexto: FonteTexto; cor: string | null } }
  | { comando: "linha.montar"; parametros: { trechos: TrechoNaLinha[]; musica: { midiaId: string; entrada: Tick } | null } }
  | { comando: "linha.pulsarNoRitmo"; parametros: { batidas: Tick[] } }
  | { comando: "clipe.animar"; parametros: { clipeIds: string[]; animacao: Partial<Animacoes> } }
  | { comando: "clipe.cor"; parametros: { clipeIds: string[]; cor: Partial<Cor> } }
  | { comando: "clipe.transicao"; parametros: { clipeId: string; transicao: Transicao | null } };

export const NOMES_DOS_COMANDOS: Record<Comando["comando"], string> = {
  "clipe.adicionar": "adicionar clipe",
  "clipe.mover": "mover clipe",
  "clipe.aparar": "aparar clipe",
  "clipe.deslizar": "deslizar o conteúdo",
  "clipe.adicionarAjuste": "pôr a camada de ajuste",
  "imagem.adicionarAjuste": "pôr a camada de ajuste",
  "clipe.moverCorte": "mover o corte",
  "linha.dividir": "dividir",
  "clipe.apagar": "apagar",
  "linha.removerIntervalos": "remover trechos",
  "linha.zoomNosTrechos": "dar zoom nos destaques",
  "clipe.duplicar": "duplicar",
  "faixa.alternar": "mudar a faixa",
  "projeto.proporcao": "mudar a proporção",
  "projeto.fundo": "mudar o fundo",
  "clipe.transformar": "mudar posição e tamanho",
  "clipe.keyframe": "mudar keyframe",
  "clipe.expressao": "mudar a expressão",
  "clipe.reenquadrar": "seguir o rosto",
  "clipe.seguirObjeto": "seguir o objeto",
  "clipe.abaixar": "abaixar na fala",
  "clipe.mesclar": "mudar a mesclagem",
  "clipe.virar": "virar o clipe",
  "clipe.cantos": "mudar os cantos",
  "clipe.mascara": "mudar a máscara",
  "clipe.preencher": "trocar a mídia do modelo",
  "imagem.adicionarMidia": "pôr a imagem",
  "imagem.adicionarTexto": "pôr o texto",
  "imagem.mover": "mudar a ordem das camadas",
  "imagem.apagar": "apagar a camada",
  "imagem.duplicar": "duplicar a camada",
  "imagem.desfocarFundo": "desfocar o fundo",
  "imagem.aplicarModelo": "aplicar o modelo",
  "imagem.trocarImagem": "trocar a imagem",
  "imagem.fundo": "mudar o fundo",
  "imagem.tamanho": "mudar o tamanho",
  "imagem.recortar": "recortar a imagem",
  "imagem.camadaComOutraMidia": "pôr o objeto recortado",
  "clipe.efeito": "mudar o efeito",
  "clipe.chroma": "mudar a tela verde",
  "clipe.chaveLuma": "mudar a chave de luminância",
  "clipe.removerFundo": "recortar o fundo",
  "clipe.estabilizar": "estabilizar",
  "clipe.limparImagem": "tirar o ruído da imagem",
  "clipe.velocidade": "mudar a velocidade",
  "clipe.curvaVelocidade": "mudar a curva de velocidade",
  "clipe.recortar": "recortar",
  "clipe.restaurar": "restaurar posição e tamanho",
  "clipe.audio": "mudar o som",
  "texto.adicionar": "adicionar texto",
  "texto.mudar": "mudar o texto",
  "legenda.adicionar": "adicionar legenda",
  "legenda.importar": "importar legendas",
  "legenda.estilo": "mudar o estilo das legendas",
  "legenda.palavrasChave": "destacar palavras-chave",
  "legenda.juntar": "juntar legendas",
  "clipe.colar": "colar clipes",
  "clipe.colarAjustes": "colar ajustes",
  "legenda.substituir": "substituir nas legendas",
  "linha.cortarNoRitmo": "cortar no ritmo",
  "linha.montar": "montar com vários clipes",
  "marca.logo": "pôr o logo",
  "clipe.trocarMidia": "mudar a forma",
  "modelo.aplicar": "usar o modelo",
  "marca.textos": "aplicar a marca aos textos",
  "linha.pulsarNoRitmo": "pulsar no ritmo",
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
    case "clipe.adicionarAjuste": {
      const resultado = adicionarAjuste(projeto, ctx, parametros.inicio);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.adicionarAjuste": {
      const resultado = adicionarCamadaDeAjuste(projeto, ctx);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "clipe.deslizar":
      return { projeto: deslizarConteudo(projeto, ctx, parametros.clipeId, parametros.deslocamento) };
    case "clipe.moverCorte":
      return { projeto: moverCorte(projeto, ctx, parametros.clipeId, parametros.tempo) };
    case "linha.dividir": {
      const resultado = dividirClipes(projeto, ctx, parametros.tempo, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "linha.zoomNosTrechos":
      return { projeto: zoomNosTrechos(projeto, parametros.trechos) };
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
    case "clipe.curvaVelocidade":
      return { projeto: curvarVelocidade(projeto, parametros.clipeId, parametros.pontos) };
    case "clipe.velocidade":
      return { projeto: mudarVelocidade(projeto, parametros.clipeId, parametros.velocidade) };
    case "clipe.limparImagem":
      return { projeto: limparImagem(projeto, parametros.clipeIds, parametros.ligar) };
    case "clipe.removerFundo":
      return { projeto: removerFundo(projeto, parametros.clipeIds, parametros.ligar) };
    case "clipe.estabilizar":
      return { projeto: estabilizarClipes(projeto, ctx, parametros.clipeIds, parametros.ligar) };
    case "clipe.chroma":
      return { projeto: chromaClipes(projeto, parametros.clipeIds, parametros.chroma) };
    case "clipe.chaveLuma":
      return { projeto: chaveLumaClipes(projeto, parametros.clipeIds, parametros.chave) };
    case "clipe.efeito":
      return { projeto: aplicarEfeito(projeto, parametros.clipeIds, parametros.efeito) };
    case "clipe.mesclar":
      return { projeto: mesclarClipes(projeto, parametros.clipeIds, parametros.mesclagem) };
    case "clipe.virar":
      return { projeto: virarClipes(projeto, parametros.clipeIds, parametros.sentido) };
    case "clipe.cantos":
      return { projeto: arredondarClipes(projeto, parametros.clipeIds, parametros.cantos) };
    case "clipe.mascara":
      return { projeto: mascararClipes(projeto, parametros.clipeIds, parametros.mascara) };
    case "imagem.adicionarMidia": {
      const resultado = adicionarCamadaDeMidia(projeto, ctx, parametros.midiaId);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.adicionarTexto": {
      const resultado = adicionarCamadaDeTexto(projeto, ctx, parametros.texto);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.mover":
      return { projeto: moverCamada(projeto, parametros.faixaId, parametros.para) };
    case "imagem.apagar":
      return { projeto: apagarCamada(projeto, parametros.faixaId), selecao: [] };
    case "imagem.duplicar": {
      const resultado = duplicarCamada(projeto, ctx, parametros.faixaId);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.camadaComOutraMidia": {
      const resultado = camadaComOutraMidia(projeto, ctx, parametros.faixaId, parametros.midiaId);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.recortar":
      return { projeto: recortarImagem(projeto, parametros.retangulo, parametros.tamanhos) };
    case "imagem.aplicarModelo":
      return { projeto: aplicarModeloDeImagem(projeto, ctx, parametros), selecao: [] };
    case "imagem.trocarImagem":
      return { projeto: trocarImagemDaCamada(projeto, ctx, parametros.clipeId, parametros.midiaId, parametros.tamanhoAtual, parametros.tamanhoNovo), selecao: [parametros.clipeId] };
    case "imagem.desfocarFundo": {
      const resultado = desfocarFundo(projeto, ctx, parametros.faixaId);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.fundo":
      return { projeto: mudarFundoDaImagem(projeto, parametros) };
    case "imagem.tamanho":
      return { projeto: mudarTamanhoDaImagem(projeto, parametros) };
    case "clipe.preencher":
      return { projeto: preencherVaga(projeto, ctx, parametros.clipeId, parametros.midiaId), selecao: [parametros.clipeId] };
    case "clipe.abaixar":
      return { projeto: abaixarClipe(projeto, parametros.clipeId, parametros.abaixamento) };
    case "clipe.reenquadrar":
      return { projeto: reenquadrarClipe(projeto, parametros.clipeId, parametros.reenquadramento) };
    case "clipe.seguirObjeto":
      return { projeto: seguirObjetoClipe(projeto, parametros.clipeId, parametros.caminho) };
    case "clipe.keyframe":
      return { projeto: mudarKeyframe(projeto, parametros.clipeId, parametros.propriedade, parametros.tempo, parametros.acao) };
    case "clipe.expressao":
      return { projeto: mudarExpressao(projeto, parametros.clipeId, parametros.propriedade, parametros.expressao) };
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
    case "legenda.palavrasChave":
      return { projeto: palavrasChaveDasLegendas(projeto, parametros.chaves, parametros.cor) };
    case "clipe.colar": {
      const resultado = colarClipes(projeto, ctx, parametros.copiados, parametros.inicio);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "clipe.colarAjustes":
      return { projeto: colarAjustes(projeto, ctx, parametros.origem, parametros.clipeIds, parametros.grupos).projeto };
    case "legenda.juntar": {
      const resultado = juntarLegendas(projeto, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "legenda.substituir":
      return { projeto: substituirNasLegendas(projeto, parametros.faixaId, parametros.busca, parametros.troca).projeto };
    case "linha.cortarNoRitmo":
      return { projeto: cortarNoRitmo(projeto, ctx, parametros.batidas) };
    case "modelo.aplicar":
      return aplicarModelo(projeto, ctx, parametros.plano);
    case "clipe.trocarMidia":
      return { projeto: trocarMidiaDosClipes(projeto, ctx, parametros.clipeIds, parametros.midiaId) };
    case "marca.logo": {
      const resultado = colocarLogo(projeto, ctx, parametros.midiaId, parametros.transformacao);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "marca.textos":
      return { projeto: aplicarMarcaAosTextos(projeto, parametros.fonteTitulo, parametros.fonteTexto, parametros.cor) };
    case "linha.montar":
      return montarNaLinha(projeto, ctx, parametros.trechos, parametros.musica);
    case "linha.pulsarNoRitmo":
      return { projeto: pulsarNoRitmo(projeto, parametros.batidas) };
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

/** O que o editor devolve ao executar um comando: o projeto novo, ou null se o comando falhou (o aviso já apareceu). */
export type ResultadoDoComando = { projeto: Projeto; selecao?: string[] } | null;

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
