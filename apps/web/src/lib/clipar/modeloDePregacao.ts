// O modelo de edição de pregação (o Clipar, ADR 0004, 14.12g e 14.6), a partir do "antes e depois" que o dono mandou:
// a cor fria de cinema, a voz de rádio só na primeira frase (com um corte logo depois dela), um Flash ou um Clarão nos
// cortes (com o clique de câmera ou o whoosh), os gráficos de pregação quando a fala toca no assunto, imagens de apoio
// da Pixabay, e a cartela final em duas partes com o impacto. A legenda animada editorial vem do fluxo da legenda.
//
// Aqui fica a parte pura: `planoDaPregacao` aplica no projeto o que não precisa de mídia nova (a cor, a divisão da
// primeira frase com a voz de rádio e as transições) e devolve o que precisa (os sons, os gráficos, as imagens e a
// cartela, cada um com o instante); `comandosDasMidias` monta os comandos que põem essas mídias quando ficam prontas.
import { TICKS_POR_SEGUNDO, type Tick } from "../tempo.ts";
import { type Comando, executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import type { PalavraDaLinha } from "../projeto/fala.ts";
import { fimDoClipe, type Projeto } from "../projeto/modelo.ts";
import { EFEITOS_PRONTOS } from "../projeto/som.ts";
import { type GraficoDaFala, graficoDaPalavra, graficosDaFala } from "./graficosDaFala.ts";

const S = TICKS_POR_SEGUNDO;
/** A primeira frase, com a voz de rádio, só vale entre estes tamanhos (mais curta é um "olá"; mais longa, metade do corte). */
const PRIMEIRA_FRASE = { minimo: 1.2, maximo: 7 };
/** Entre uma transição de luz e a seguinte, e o máximo delas. */
const ENTRE_TRANSICOES = 4;
const MAXIMO_DE_TRANSICOES = 6;
const DURACAO_DO_FLASH = 0.4;
const DURACAO_DO_CLARAO = 0.6;
export const DURACAO_DA_CARTELA = 3.5;
/** A queda da segunda parte da cartela (core/animacoes/cartela_impacto.html, QUEDA). */
const QUEDA_DA_CARTELA = 1.0;
const DURACAO_DA_IMAGEM = 2.4;
const MAXIMO_DE_IMAGENS = 2;

/** A cor fria de cinema: o filtro Cinema, um pouco mais frio, com vinheta. */
export const COR_DA_PREGACAO = { filtro: "cinema", intensidade: 0.9, temperatura: -0.12, vinheta: 0.25 };

/** As buscas das imagens de apoio, pela palavra dita (sem acento). */
export const BUSCAS_DE_APOIO: [RegExp, string][] = [
  [/^(biblia|escritura|versiculo|evangelho|palavra)s?$/, "lendo a bíblia"],
  [/^(oracao|orar|ore|orando|oramos|joelhos)$/, "pessoa orando"],
  [/^(devocional|devocionar|meditar|meditacao)$/, "escrevendo diário bíblia"],
  [/^(familia|filhos|casamento|lar)$/, "família feliz"],
  [/^(igreja|culto|louvor|adoracao|adorar)$/, "adoração igreja"],
  [/^(ceu|deus|senhor|luz)$/, "céu luz nuvens"],
  [/^(cruz|calvario)$/, "cruz pôr do sol"],
  [/^(caminho|jornada|passos)$/, "caminho estrada pessoa"],
];

export type SomDaPregacao = { efeito: string; inicio: Tick };
export type ImagemDeApoio = { busca: string; inicio: Tick; duracao: Tick };
export type CartelaDaPregacao = { linha_1: string; linha_2: string; inicio: Tick; duracao: Tick };
export type PlanoDaPregacao = {
  projeto: Projeto;
  sons: SomDaPregacao[];
  graficos: GraficoDaFala[];
  imagens: ImagemDeApoio[];
  cartela: CartelaDaPregacao | null;
  /** O que foi feito, para o aviso. */
  feitos: string[];
};

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function aplicar(projeto: Projeto, ctx: Contexto, comando: Comando): Projeto {
  try {
    return executarComando(projeto, comando, ctx).projeto;
  } catch {
    // O que não cabe (um clipe curto demais para a transição) fica de fora, e o resto segue
    return projeto;
  }
}

/** O fim da primeira frase, se ela tem um tamanho que valha a voz de rádio (1,2 a 7 s). */
export function fimDaPrimeiraFrase(palavras: PalavraDaLinha[]): Tick | null {
  if (!palavras.length) return null;
  const inicio = palavras[0].inicio;
  for (let i = 0; i < palavras.length; i++) {
    const palavra = palavras[i];
    const proxima = palavras[i + 1];
    const fecha = /[.!?…]["»”)]?$/.test(palavra.texto) || (proxima && proxima.inicio - palavra.fim >= 0.45 * S);
    if (!fecha) continue;
    const dura = (palavra.fim - inicio) / S;
    if (dura < PRIMEIRA_FRASE.minimo) continue;
    if (dura > PRIMEIRA_FRASE.maximo || !proxima) return null;
    // O corte cai no meio da pausa, antes da palavra seguinte
    return Math.round((palavra.fim + proxima.inicio) / 2);
  }
  return null;
}

/** As duas partes da cartela, pelo título: a última palavra grande, o resto em cima. */
export function cartelaDoTitulo(titulo: string): { linha_1: string; linha_2: string } | null {
  const palavras = titulo
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.toLocaleUpperCase("pt-BR"));
  if (palavras.length < 2) return null;
  const linha_2 = palavras[palavras.length - 1].slice(0, 14);
  let resto = palavras.slice(0, -1);
  while (resto.join(" ").length > 22 && resto.length > 1) resto = resto.slice(1);
  return { linha_1: resto.join(" ").slice(0, 22), linha_2 };
}

/**
 * O que ligar no plano. O modelo de pregação liga tudo (PARTES_DA_PREGACAO); o "Peça uma edição" liga só o que foi
 * pedido. `voz.trechos` são os trechos da linha com o efeito (sem eles, a primeira frase); `graficos.assunto` deixa
 * só o gráfico daquele assunto; `imagens.busca` é uma imagem com aquela busca; `cartela.texto` vale no lugar do título.
 */
export type PartesDaEdicao = {
  cor?: string | null;
  voz?: { efeito: string; trechos?: { inicio: Tick; fim: Tick }[] } | null;
  transicoes?: "luz" | "flash" | "clarao" | "fusao" | "nenhuma" | null;
  sons?: boolean;
  graficos?: { assunto?: string } | null;
  imagens?: { busca?: string } | null;
  cartela?: { texto?: string } | null;
};

export const PARTES_DA_PREGACAO: PartesDaEdicao = { cor: "cinema", voz: { efeito: "radio" }, transicoes: "luz", sons: true, graficos: {}, imagens: {}, cartela: {} };

const NOMES_DAS_CORES: Record<string, string> = {
  cinema: "a cor de cinema",
  frio: "a cor fria",
  quente: "a cor quente",
  pb: "o preto e branco",
  vivido: "a cor viva",
  drama: "a cor dramática",
  antigo: "a cor antiga",
  natural: "a cor natural",
};
const NOMES_DAS_VOZES: Record<string, string> = { radio: "de rádio", telefone: "de telefone", sala: "de sala grande", caverna: "de caverna", clara: "mais clara", nenhum: "sem efeito" };

export function planoDaPregacao(projetoInicial: Projeto, ctx: Contexto, palavras: PalavraDaLinha[], titulo: string, partes: PartesDaEdicao = PARTES_DA_PREGACAO): PlanoDaPregacao {
  let projeto = projetoInicial;
  const feitos: string[] = [];
  const sons: SomDaPregacao[] = [];
  const principalDe = () => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
  const principalIds = () => principalDe().map((clipe) => clipe.id);
  const fimDoProjeto = Math.max(0, ...projeto.faixas.flatMap((faixa) => faixa.clipes.map(fimDoClipe)));

  // A cor em toda a principal: a fria de cinema, um filtro pronto ou a natural (sem filtro)
  if (partes.cor && principalIds().length) {
    const cor = partes.cor === "cinema" ? COR_DA_PREGACAO : partes.cor === "natural" ? { filtro: null, temperatura: 0, vinheta: 0 } : { filtro: partes.cor, intensidade: 1 };
    projeto = aplicar(projeto, ctx, { comando: "clipe.cor", parametros: { clipeIds: principalIds(), cor } });
    feitos.push(NOMES_DAS_CORES[partes.cor] ?? "a cor");
  }

  // O efeito de voz nos trechos (a primeira frase, sem trechos), cada trecho separado do resto por cortes
  if (partes.voz) {
    const primeira = fimDaPrimeiraFrase(palavras);
    const trechos = partes.voz.trechos?.length ? partes.voz.trechos : primeira !== null ? [{ inicio: 0, fim: primeira }] : [];
    const efeitos = partes.voz.efeito === "nenhum" ? null : (EFEITOS_PRONTOS.find((efeito) => efeito.id === partes.voz!.efeito)?.efeitos ?? null);
    let mudou = 0;
    for (const trecho of trechos) {
      for (const tempo of [trecho.inicio, trecho.fim]) {
        if (tempo > 0) projeto = aplicar(projeto, ctx, { comando: "linha.dividir", parametros: { tempo, clipeIds: principalIds() } });
      }
      const dentro = principalDe()
        .filter((clipe) => clipe.inicio >= trecho.inicio - 1 && fimDoClipe(clipe) <= trecho.fim + 1)
        .map((clipe) => clipe.id);
      if (!dentro.length) continue;
      projeto = aplicar(projeto, ctx, { comando: "clipe.audio", parametros: { clipeIds: dentro, efeitos_voz: efeitos } });
      mudou++;
    }
    const onde = !partes.voz.trechos?.length ? "na primeira frase" : mudou === 1 ? "numa frase" : `em ${mudou} frases`;
    if (mudou) feitos.push(`a voz ${NOMES_DAS_VOZES[partes.voz.efeito] ?? "com efeito"} ${onde}`);
  }

  // A cartela no fim, pelo texto pedido ou pelo título
  const textoDaCartela = partes.cartela ? cartelaDoTitulo(partes.cartela.texto || titulo) : null;
  const cartela =
    textoDaCartela && fimDoProjeto > (DURACAO_DA_CARTELA + 2) * S ? { ...textoDaCartela, inicio: fimDoProjeto - DURACAO_DA_CARTELA * S, duracao: DURACAO_DA_CARTELA * S } : null;
  if (cartela && partes.sons) sons.push({ efeito: "impacto", inicio: cartela.inicio + QUEDA_DA_CARTELA * S });
  const limite = cartela ? cartela.inicio : fimDoProjeto;

  // As transições nos cortes da principal, longe uma da outra. Na luz, como no corte de referência: o clarão com o
  // whoosh, depois o flash com o clique, e assim por diante
  const ordenados = [...principalDe()].sort((a, b) => a.inicio - b.inicio).slice(0, -1);
  if (partes.transicoes === "nenhuma") {
    const comTransicao = ordenados.filter((clipe) => clipe.transicao);
    for (const clipe of comTransicao) projeto = aplicar(projeto, ctx, { comando: "clipe.transicao", parametros: { clipeId: clipe.id, transicao: null } });
    if (comTransicao.length) feitos.push("as transições tiradas");
  } else if (partes.transicoes) {
    let ultimo = Number.NEGATIVE_INFINITY;
    let quantas = 0;
    for (const clipe of ordenados) {
      const corte = fimDoClipe(clipe);
      if (quantas >= MAXIMO_DE_TRANSICOES || corte - ultimo < ENTRE_TRANSICOES * S || corte < 1 * S || corte > limite - 1 * S) continue;
      const tipo = partes.transicoes === "luz" ? (quantas % 2 === 1 ? "flash" : "clarao") : partes.transicoes;
      const duracao = (tipo === "flash" ? DURACAO_DO_FLASH : tipo === "clarao" ? DURACAO_DO_CLARAO : 0.5) * S;
      const depois = aplicar(projeto, ctx, { comando: "clipe.transicao", parametros: { clipeId: clipe.id, transicao: { tipo, duracao } } });
      if (depois === projeto) continue;
      projeto = depois;
      ultimo = corte;
      quantas++;
    }
    if (quantas) feitos.push(`${quantas} ${quantas === 1 ? "transição" : "transições"}`);
  }
  // Os sons das transições que o vídeo tem agora: o clique no flash, o whoosh nas outras
  if (partes.sons) {
    for (const clipe of principalDe()) {
      if (!clipe.transicao) continue;
      const corte = fimDoClipe(clipe);
      sons.push(clipe.transicao.tipo === "flash" ? { efeito: "camera", inicio: Math.max(0, corte - 0.05 * S) } : { efeito: "whoosh", inicio: Math.max(0, corte - 0.52 * S) });
    }
  }

  // Os gráficos pela fala (ou só o do assunto pedido), antes da cartela, cada um com um swish na entrada
  let graficos: GraficoDaFala[] = [];
  if (partes.graficos) {
    const alvo = partes.graficos.assunto ? graficoDaPalavra(partes.graficos.assunto) : null;
    const falas = alvo ? palavras.filter((palavra) => graficoDaPalavra(palavra.texto) === alvo) : palavras;
    graficos = graficosDaFala(falas, { maximo: alvo ? 1 : 3 }).filter((grafico) => grafico.inicio + grafico.duracao <= limite);
    if (partes.sons) for (const grafico of graficos) sons.push({ efeito: "swish", inicio: grafico.inicio });
  }

  // As imagens de apoio: as palavras que pedem uma imagem (ou a busca pedida, no primeiro lugar livre depois de 2 s),
  // longe dos gráficos e uma da outra
  const imagens: ImagemDeApoio[] = [];
  if (partes.imagens) {
    const pedida = partes.imagens.busca;
    for (const palavra of palavras) {
      if (imagens.length >= (pedida ? 1 : MAXIMO_DE_IMAGENS)) break;
      const busca = pedida || BUSCAS_DE_APOIO.find(([padrao]) => padrao.test(semAcento(palavra.texto)))?.[1];
      if (!busca || imagens.some((imagem) => imagem.busca === busca)) continue;
      const inicio = palavra.inicio;
      if (pedida && inicio < 2 * S) continue;
      const fim = inicio + DURACAO_DA_IMAGEM * S;
      const longe = (de: Tick, ate: Tick) => fim + 2 * S <= de || inicio >= ate + 2 * S;
      if (fim > limite || !graficos.every((g) => longe(g.inicio, g.inicio + g.duracao))) continue;
      if (!imagens.every((imagem) => longe(imagem.inicio, imagem.inicio + imagem.duracao + 4 * S))) continue;
      imagens.push({ busca, inicio, duracao: DURACAO_DA_IMAGEM * S });
    }
  }
  return { projeto, sons: sons.sort((a, b) => a.inicio - b.inicio), graficos, imagens, cartela, feitos };
}

/** Uma mídia pedida para o plano, já pronta, com o que fazer com ela. */
export type MidiaDoPlano =
  | { tipo: "som"; midiaId: string; inicio: Tick }
  | { tipo: "grafico"; midiaId: string; inicio: Tick }
  | { tipo: "cartela"; midiaId: string; inicio: Tick }
  | { tipo: "imagem"; midiaId: string; inicio: Tick; duracao: Tick; largura: number; altura: number };

/** A escala que faz a imagem de apoio cobrir o quadro (a escala 1 é a imagem cabendo nele). */
export function escalaQueCobre(largura: number, altura: number, proporcao: string): number {
  const [l, a] = proporcao.split(":").map(Number);
  const quadro = l / a;
  const midia = largura / altura;
  return Math.max(quadro / midia, midia / quadro);
}

/** Põe as mídias prontas no projeto: os sons nas faixas de áudio, os gráficos, as imagens (mudas, cobrindo o quadro) e a cartela por cima. */
export function comMidiasDoPlano(projetoInicial: Projeto, ctx: Contexto, midias: MidiaDoPlano[]): Projeto {
  let projeto = projetoInicial;
  // A cartela por último, para ficar na faixa de cima
  const ordem = [...midias].sort((a, b) => Number(a.tipo === "cartela") - Number(b.tipo === "cartela"));
  for (const midia of ordem) {
    try {
      const novaFaixa = midia.tipo !== "som";
      const resultado = executarComando(projeto, { comando: "clipe.adicionar", parametros: { midiaId: midia.midiaId, inicio: midia.inicio, novaFaixa } }, ctx);
      projeto = resultado.projeto;
      const clipeId = resultado.selecao?.[0];
      if (midia.tipo === "imagem" && clipeId) {
        projeto = aplicar(projeto, ctx, { comando: "clipe.aparar", parametros: { clipeId, borda: "fim", tempo: midia.inicio + midia.duracao } });
        projeto = aplicar(projeto, ctx, { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: { escala: escalaQueCobre(midia.largura, midia.altura, projeto.proporcao) } } });
        projeto = aplicar(projeto, ctx, { comando: "clipe.audio", parametros: { clipeIds: [clipeId], volume: 0 } });
      }
    } catch {
      // Uma mídia que não entrou não derruba as outras
    }
  }
  return projeto;
}
