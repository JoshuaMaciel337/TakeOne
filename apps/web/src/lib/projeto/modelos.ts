// Modelos de projeto: projetos prontos, desenhados do zero, em que a pessoa troca as mídias e os textos.
//
// Um modelo tem cenas (os clipes da faixa principal, cada um com a mídia que a pessoa escolhe), textos e
// formas presos a uma cena (o tempo conta do começo dela, então tudo continua no lugar mesmo quando o vídeo
// escolhido é mais curto que a cena), filtros, transições e animações. As cores "@1", "@2"... são as do kit
// de marca, com a paleta do modelo quando o kit não tem. `planoDoModelo` resolve tudo em ticks; o comando
// `modelo.aplicar` (aplicarModelo em edicao.ts) põe no fim da faixa principal, num passo do desfazer.
import type { PedidoDeForma } from "../elementos.ts";
import { TICKS_POR_SEGUNDO, type Tick } from "../tempo.ts";
import type { Animacoes, TipoAnimacao, TipoLoop } from "./animacao.ts";
import type { Tamanho } from "./geometria.ts";
import type { Proporcao, Transformacao } from "./modelo.ts";
import { ESTILOS_DE_TEXTO, TEXTO_PADRAO, type Texto } from "./texto.ts";
import type { TipoTransicao, Transicao } from "./transicao.ts";

export type AnimacaoDoModelo = { entrada?: TipoAnimacao; saida?: TipoAnimacao; loop?: TipoLoop };

export type CenaDoModelo = {
  id: string;
  rotulo: string;
  duracaoS: number;
  /** Que mídia a cena pede. Imagens ganham um zoom lento, para não ficarem paradas. */
  aceita: "video" | "imagem" | "qualquer";
  filtro?: string;
  /** A transição para a cena seguinte. */
  transicao?: { tipo: TipoTransicao; duracaoS: number };
};

type Posicao = { x: number; y: number; escala?: number; rotacao?: number; opacidade?: number };

export type TextoDoModelo = {
  campo: string;
  rotulo: string;
  padrao: string;
  cena: string;
  deS: number;
  /** Até quando, desde o começo da cena; sem ele, até o fim dela. */
  ateS?: number;
  estilo: string;
  /** O que muda no estilo; as cores podem ser "@1", "@2"... */
  ajustes?: Partial<Texto>;
  posicao: Posicao;
  animacao?: AnimacaoDoModelo;
};

export type FormaDoModelo = {
  cena: string;
  deS: number;
  ateS?: number;
  /** O pedido da forma; as cores podem ser "@1", "@2"... */
  forma: PedidoDeForma;
  posicao: Posicao;
  animacao?: AnimacaoDoModelo;
};

export type ModeloDeProjeto = {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  proporcao: Proporcao;
  /** As cores no lugar das da marca, na ordem de "@1", "@2"... */
  paleta: string[];
  cenas: CenaDoModelo[];
  textos: TextoDoModelo[];
  formas: FormaDoModelo[];
};

/** O plano pronto para o comando: mídias escolhidas, textos preenchidos, cores e tempos resolvidos. */
export type PlanoDoModelo = {
  /** `escala`: a que faz a mídia cobrir o quadro do projeto (os modelos são desenhados com a imagem cheia). */
  cenas: { midiaId: string; duracao: Tick; filtro: string | null; transicao: Transicao | null; zoomLento: boolean; escala: number }[];
  textos: { cena: number; de: Tick; ate: Tick | null; texto: Texto; transformacao: Transformacao; animacao: Animacoes | null }[];
  formas: { cena: number; de: Tick; ate: Tick | null; midiaId: string; transformacao: Transformacao; animacao: Animacoes | null }[];
};

const ANIMACAO_S = 0.5;
const LOOP_S = 1;
const s = (segundos: number): Tick => Math.round(segundos * TICKS_POR_SEGUNDO);

/** A cor do modelo: "@n" é a n-ésima do kit de marca, ou a da paleta do modelo. */
export function resolverCor(cor: string, cores: string[], paleta: string[]): string {
  const marca = /^@(\d)$/.exec(cor);
  if (!marca) return cor;
  const indice = Number(marca[1]) - 1;
  return cores[indice] ?? paleta[indice] ?? paleta[0] ?? "#ffffff";
}

function animacoes(animacao: AnimacaoDoModelo | undefined): Animacoes | null {
  if (!animacao) return null;
  return {
    entrada: { tipo: animacao.entrada ?? "nenhuma", duracao: animacao.entrada ? s(ANIMACAO_S) : 0 },
    saida: { tipo: animacao.saida ?? "nenhuma", duracao: animacao.saida ? s(ANIMACAO_S) : 0 },
    loop: animacao.loop ? { tipo: animacao.loop, periodo: s(LOOP_S), intensidade: 0.5 } : null,
  };
}

function transformacao(posicao: Posicao): Transformacao {
  return { x: posicao.x, y: posicao.y, escala: posicao.escala ?? 1, rotacao: posicao.rotacao ?? 0, opacidade: posicao.opacidade ?? 1 };
}

/** As formas do modelo com as cores resolvidas (cada uma vira uma imagem antes do comando). */
export function formasDoModelo(modelo: ModeloDeProjeto, cores: string[]): PedidoDeForma[] {
  return modelo.formas.map(({ forma }) => ({
    ...forma,
    cor: forma.cor ? resolverCor(forma.cor, cores, modelo.paleta) : null,
    contorno_cor: resolverCor(forma.contorno_cor, cores, modelo.paleta),
  }));
}

/** A escala que faz a mídia cobrir o quadro (1 é caber inteira, com faixas). */
export function escalaQueCobre(midia: Tamanho, quadro: Tamanho): number {
  const caber = Math.min(quadro.largura / midia.largura, quadro.altura / midia.altura);
  const cobrir = Math.max(quadro.largura / midia.largura, quadro.altura / midia.altura);
  return cobrir / caber;
}

/**
 * O plano do modelo com as escolhas da pessoa: `midias` por id de cena, `textos` por campo (vazio volta ao
 * padrão), `formas` as mídias das formas na ordem de formasDoModelo. `tamanhos` dá a largura e a altura de
 * cada mídia escolhida (e diz quais são imagens); `quadro`, a proporção do projeto.
 */
export function planoDoModelo(
  modelo: ModeloDeProjeto,
  midias: Record<string, string>,
  textos: Record<string, string>,
  formas: string[],
  tamanhos: Record<string, Tamanho & { imagem: boolean }>,
  quadro: Tamanho,
  cores: string[],
): PlanoDoModelo {
  const indice = new Map(modelo.cenas.map((cena, i) => [cena.id, i]));
  const cenas = modelo.cenas.map((cena, i) => {
    const midiaId = midias[cena.id];
    if (!midiaId) throw new Error(`Escolha a mídia de "${cena.rotulo}".`);
    const ultima = i === modelo.cenas.length - 1;
    return {
      midiaId,
      duracao: s(cena.duracaoS),
      filtro: cena.filtro ?? null,
      transicao: cena.transicao && !ultima ? { tipo: cena.transicao.tipo, duracao: s(cena.transicao.duracaoS) } : null,
      zoomLento: Boolean(tamanhos[midiaId]?.imagem),
      escala: tamanhos[midiaId] ? escalaQueCobre(tamanhos[midiaId], quadro) : 1,
    };
  });
  const cor = (valor: string | undefined) => (valor ? resolverCor(valor, cores, modelo.paleta) : valor);
  return {
    cenas,
    textos: modelo.textos.map((item) => {
      const estilo = ESTILOS_DE_TEXTO.find((e) => e.id === item.estilo)?.texto ?? TEXTO_PADRAO;
      const ajustes = item.ajustes ?? {};
      const texto: Texto = {
        ...estilo,
        ...ajustes,
        conteudo: (textos[item.campo] ?? "").trim() || item.padrao,
        cor: cor(ajustes.cor) ?? estilo.cor,
        contorno_cor: cor(ajustes.contorno_cor) ?? estilo.contorno_cor,
        fundo_cor: cor(ajustes.fundo_cor) ?? estilo.fundo_cor,
        brilho_cor: cor(ajustes.brilho_cor) ?? estilo.brilho_cor,
      };
      return { cena: indice.get(item.cena)!, de: s(item.deS), ate: item.ateS === undefined ? null : s(item.ateS), texto, transformacao: transformacao(item.posicao), animacao: animacoes(item.animacao) };
    }),
    formas: modelo.formas.map((item, i) => ({
      cena: indice.get(item.cena)!,
      de: s(item.deS),
      ate: item.ateS === undefined ? null : s(item.ateS),
      midiaId: formas[i],
      transformacao: transformacao(item.posicao),
      animacao: animacoes(item.animacao),
    })),
  };
}

const BRANCO = "#ffffff";
const ESCURO = "#141821";

export const MODELOS_DE_PROJETO: ModeloDeProjeto[] = [
  {
    id: "tres-dicas",
    nome: "Três dicas",
    descricao: "Um título, uma dica por cena e a chamada para seguir no fim.",
    categoria: "Redes sociais",
    proporcao: "9:16",
    paleta: ["#ff624a", BRANCO],
    cenas: [
      { id: "abertura", rotulo: "Abertura", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "zoom", duracaoS: 0.4 } },
      { id: "dica1", rotulo: "Primeira dica", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "zoom", duracaoS: 0.4 } },
      { id: "dica2", rotulo: "Segunda dica", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "zoom", duracaoS: 0.4 } },
      { id: "dica3", rotulo: "Terceira dica", duracaoS: 3, aceita: "qualquer" },
    ],
    textos: [
      { campo: "titulo", rotulo: "Título", padrao: "3 dicas rápidas", cena: "abertura", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.22 }, animacao: { entrada: "subir" } },
      { campo: "dica1", rotulo: "Dica 1", padrao: "Comece pelo mais simples", cena: "dica1", deS: 0.3, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "palavras" } },
      { campo: "dica2", rotulo: "Dica 2", padrao: "Faça todo dia um pouco", cena: "dica2", deS: 0.3, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "palavras" } },
      { campo: "dica3", rotulo: "Dica 3", padrao: "Mostre o resultado", cena: "dica3", deS: 0.3, ateS: 1.8, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "palavras", saida: "aparecer" } },
      ...[1, 2, 3].map((n) => ({
        campo: `numero${n}`,
        rotulo: `Número da dica ${n}`,
        padrao: String(n),
        cena: `dica${n}`,
        deS: 0.2,
        ...(n === 3 ? { ateS: 1.8 } : {}),
        estilo: "simples",
        ajustes: { negrito: true, tamanho: 0.06, sombra: 0, fonte: "display" as const },
        posicao: { x: 0, y: 0.17 },
        animacao: { entrada: "zoom" as const, ...(n === 3 ? { saida: "aparecer" as const } : {}) },
      })),
      { campo: "chamada", rotulo: "Chamada final", padrao: "Siga para mais", cena: "dica3", deS: 1.9, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: 0.3 }, animacao: { entrada: "zoom", loop: "pulsar" } },
    ],
    formas: [
      { cena: "dica1", deS: 0.1, forma: { tipo: "elipse", cor: "@1", contorno_cor: BRANCO, contorno: 0.06, proporcao: 1 }, posicao: { x: 0, y: 0.17, escala: 0.14 }, animacao: { entrada: "zoom" } },
      { cena: "dica2", deS: 0.1, forma: { tipo: "elipse", cor: "@1", contorno_cor: BRANCO, contorno: 0.06, proporcao: 1 }, posicao: { x: 0, y: 0.17, escala: 0.14 }, animacao: { entrada: "zoom" } },
      { cena: "dica3", deS: 0.1, ateS: 1.8, forma: { tipo: "elipse", cor: "@1", contorno_cor: BRANCO, contorno: 0.06, proporcao: 1 }, posicao: { x: 0, y: 0.17, escala: 0.14 }, animacao: { entrada: "zoom", saida: "aparecer" } },
    ],
  },
  {
    id: "produto",
    nome: "Anúncio de produto",
    descricao: "O produto com o nome, o preço numa estrela e o botão de comprar.",
    categoria: "Vendas",
    proporcao: "1:1",
    paleta: ["#ff624a", BRANCO],
    cenas: [
      { id: "produto", rotulo: "O produto", duracaoS: 3, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "deslizar", duracaoS: 0.4 } },
      { id: "detalhe", rotulo: "Um detalhe", duracaoS: 3, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "deslizar", duracaoS: 0.4 } },
      { id: "final", rotulo: "Fechamento", duracaoS: 3, aceita: "qualquer", filtro: "vivido" },
    ],
    textos: [
      { campo: "nome", rotulo: "Nome do produto", padrao: "Tênis Leve", cena: "produto", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.36 }, animacao: { entrada: "zoom" } },
      { campo: "preco", rotulo: "Preço", padrao: "R$ 99", cena: "detalhe", deS: 0.4, estilo: "contorno", ajustes: { tamanho: 0.07, contorno_cor: ESCURO }, posicao: { x: 0.27, y: 0.27, rotacao: -8 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "chamada", rotulo: "Botão", padrao: "Compre agora", cena: "final", deS: 0.4, estilo: "simples", ajustes: { negrito: true, tamanho: 0.06, sombra: 0 }, posicao: { x: 0, y: 0.32 }, animacao: { entrada: "subir", loop: "pulsar" } },
    ],
    formas: [
      { cena: "detalhe", deS: 0.3, forma: { tipo: "estrela", cor: "@1", contorno_cor: BRANCO, contorno: 0.05, proporcao: null }, posicao: { x: 0.27, y: 0.27, escala: 0.36, rotacao: -8 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { cena: "final", deS: 0.3, forma: { tipo: "arredondado", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 3.6 }, posicao: { x: 0, y: 0.32, escala: 0.62 }, animacao: { entrada: "subir", loop: "pulsar" } },
    ],
  },
  {
    id: "abertura",
    nome: "Abertura de vídeo",
    descricao: "Título letra a letra com uma linha na cor da marca, e a entrada no vídeo.",
    categoria: "Abertura",
    proporcao: "16:9",
    paleta: ["#ff624a"],
    cenas: [
      { id: "abertura", rotulo: "Fundo da abertura", duracaoS: 4, aceita: "qualquer", filtro: "cinema", transicao: { tipo: "fusao", duracaoS: 0.6 } },
      { id: "video", rotulo: "Começo do vídeo", duracaoS: 4, aceita: "video" },
    ],
    textos: [
      { campo: "titulo", rotulo: "Título", padrao: "Bem-vindo ao canal", cena: "abertura", deS: 0.3, ateS: 3.6, estilo: "titulo", posicao: { x: 0, y: -0.04 }, animacao: { entrada: "letras", saida: "aparecer" } },
      { campo: "subtitulo", rotulo: "Subtítulo", padrao: "Episódio 1", cena: "abertura", deS: 1.2, ateS: 3.6, estilo: "simples", posicao: { x: 0, y: 0.13 }, animacao: { entrada: "aparecer", saida: "aparecer" } },
    ],
    formas: [{ cena: "abertura", deS: 0.6, ateS: 3.6, forma: { tipo: "linha", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 12 }, posicao: { x: 0, y: 0.06, escala: 0.4 }, animacao: { entrada: "deslizar", saida: "aparecer" } }],
  },
  {
    id: "depoimento",
    nome: "Depoimento",
    descricao: "Uma pessoa falando, com aspas e a tarja com o nome e o que ela faz.",
    categoria: "Pessoas",
    proporcao: "9:16",
    paleta: ["#ff624a", BRANCO],
    cenas: [{ id: "fala", rotulo: "A pessoa falando", duracaoS: 10, aceita: "video", filtro: "quente" }],
    textos: [
      { campo: "aspas", rotulo: "Aspas", padrao: "“", cena: "fala", deS: 0.2, ateS: 2.5, estilo: "manuscrito", ajustes: { tamanho: 0.25, cor: "@1" }, posicao: { x: -0.3, y: -0.3 }, animacao: { entrada: "zoom", saida: "aparecer" } },
      { campo: "nome", rotulo: "Nome", padrao: "Ana Souza", cena: "fala", deS: 0.6, ateS: 5, estilo: "simples", ajustes: { negrito: true, tamanho: 0.05, sombra: 0, alinhamento: "esquerda" }, posicao: { x: -0.12, y: 0.285 }, animacao: { entrada: "deslizar", saida: "aparecer" } },
      { campo: "funcao", rotulo: "O que a pessoa faz", padrao: "Cliente desde 2020", cena: "fala", deS: 0.8, ateS: 5, estilo: "simples", ajustes: { tamanho: 0.035, sombra: 0, alinhamento: "esquerda" }, posicao: { x: -0.12, y: 0.325 }, animacao: { entrada: "deslizar", saida: "aparecer" } },
    ],
    formas: [{ cena: "fala", deS: 0.4, ateS: 5, forma: { tipo: "arredondado", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 3.2 }, posicao: { x: -0.1, y: 0.305, escala: 0.62 }, animacao: { entrada: "deslizar", saida: "aparecer" } }],
  },
  {
    id: "evento",
    nome: "Aviso de evento",
    descricao: "Nome, data e local sobre uma imagem do evento, e o convite no fim.",
    categoria: "Eventos",
    proporcao: "9:16",
    paleta: ["#ff624a", BRANCO],
    cenas: [
      { id: "fundo", rotulo: "Imagem do evento", duracaoS: 6, aceita: "qualquer", filtro: "drama", transicao: { tipo: "escurecer", duracaoS: 0.6 } },
      { id: "convite", rotulo: "Convite", duracaoS: 3, aceita: "qualquer", filtro: "drama" },
    ],
    textos: [
      { campo: "nome", rotulo: "Nome do evento", padrao: "Noite de lançamento", cena: "fundo", deS: 0.3, estilo: "titulo", posicao: { x: 0, y: -0.18 }, animacao: { entrada: "subir" } },
      { campo: "data", rotulo: "Data", padrao: "Sábado, 20h", cena: "fundo", deS: 1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: 0.02 }, animacao: { entrada: "zoom" } },
      { campo: "local", rotulo: "Local", padrao: "Centro de Convenções", cena: "fundo", deS: 1.6, estilo: "simples", posicao: { x: 0, y: 0.13 }, animacao: { entrada: "aparecer" } },
      { campo: "convite", rotulo: "Convite", padrao: "Garanta sua vaga", cena: "convite", deS: 0.3, estilo: "titulo", ajustes: { tamanho: 0.07 }, posicao: { x: 0, y: 0 }, animacao: { entrada: "palavras", loop: "pulsar" } },
    ],
    formas: [{ cena: "fundo", deS: 0.7, forma: { tipo: "linha", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 12 }, posicao: { x: 0, y: -0.09, escala: 0.55 }, animacao: { entrada: "deslizar" } }],
  },
  {
    id: "antes-depois",
    nome: "Antes e depois",
    descricao: "Duas cenas com as etiquetas ANTES e DEPOIS e uma cortina entre elas.",
    categoria: "Comparação",
    proporcao: "16:9",
    paleta: [ESCURO, "#ff624a"],
    cenas: [
      { id: "antes", rotulo: "Antes", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "cortina_direita", duracaoS: 0.8 } },
      { id: "depois", rotulo: "Depois", duracaoS: 3, aceita: "qualquer", filtro: "vivido" },
    ],
    textos: [
      { campo: "antes", rotulo: "Etiqueta de antes", padrao: "ANTES", cena: "antes", deS: 0.2, ateS: 2.5, estilo: "simples", ajustes: { negrito: true, tamanho: 0.06, sombra: 0 }, posicao: { x: -0.36, y: -0.36 }, animacao: { entrada: "deslizar", saida: "aparecer" } },
      { campo: "depois", rotulo: "Etiqueta de depois", padrao: "DEPOIS", cena: "depois", deS: 0.4, estilo: "simples", ajustes: { negrito: true, tamanho: 0.06, sombra: 0 }, posicao: { x: -0.36, y: -0.36 }, animacao: { entrada: "deslizar" } },
    ],
    formas: [
      { cena: "antes", deS: 0.1, ateS: 2.5, forma: { tipo: "arredondado", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 2.6 }, posicao: { x: -0.36, y: -0.36, escala: 0.21, opacidade: 0.9 }, animacao: { entrada: "deslizar", saida: "aparecer" } },
      { cena: "depois", deS: 0.3, forma: { tipo: "arredondado", cor: "@2", contorno_cor: BRANCO, contorno: 0, proporcao: 2.6 }, posicao: { x: -0.36, y: -0.36, escala: 0.21 }, animacao: { entrada: "deslizar" } },
    ],
  },
  {
    id: "promocao",
    nome: "Promoção relâmpago",
    descricao: "Três cortes rápidos com OFERTA, o desconto numa estrela e o prazo.",
    categoria: "Vendas",
    proporcao: "9:16",
    paleta: ["#ff624a", "#ffd23f"],
    cenas: [
      { id: "um", rotulo: "Primeira imagem", duracaoS: 2, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "zoom", duracaoS: 0.3 } },
      { id: "dois", rotulo: "Segunda imagem", duracaoS: 2, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "zoom", duracaoS: 0.3 } },
      { id: "tres", rotulo: "Terceira imagem", duracaoS: 2.5, aceita: "qualquer", filtro: "vivido" },
    ],
    textos: [
      { campo: "oferta", rotulo: "Chamada", padrao: "OFERTA", cena: "um", deS: 0.1, estilo: "contorno", ajustes: { tamanho: 0.12, cor: "@2", contorno_cor: ESCURO }, posicao: { x: 0, y: -0.25 }, animacao: { entrada: "zoom", loop: "tremer" } },
      { campo: "desconto", rotulo: "Desconto", padrao: "-50%", cena: "dois", deS: 0.2, estilo: "contorno", ajustes: { tamanho: 0.1, contorno_cor: ESCURO }, posicao: { x: 0, y: 0 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "prazo", rotulo: "Prazo", padrao: "Só hoje", cena: "tres", deS: 0.2, estilo: "destaque", ajustes: { fundo_cor: "@1", tamanho: 0.08 }, posicao: { x: 0, y: 0.25 }, animacao: { entrada: "subir", loop: "pulsar" } },
    ],
    formas: [{ cena: "dois", deS: 0.1, forma: { tipo: "estrela", cor: "@1", contorno_cor: "@2", contorno: 0.06, proporcao: null }, posicao: { x: 0, y: 0, escala: 0.62, rotacao: 10 }, animacao: { entrada: "zoom", loop: "pulsar" } }],
  },
  {
    id: "passo-a-passo",
    nome: "Passo a passo",
    descricao: "Quatro passos numerados, um por cena, com o texto embaixo.",
    categoria: "Tutoriais",
    proporcao: "9:16",
    paleta: ["#ff624a", BRANCO],
    cenas: [1, 2, 3, 4].map((n) => ({
      id: `passo${n}`,
      rotulo: `Passo ${n}`,
      duracaoS: 3,
      aceita: "qualquer" as const,
      ...(n < 4 ? { transicao: { tipo: "empurrar" as const, duracaoS: 0.4 } } : {}),
    })),
    textos: [
      ...[1, 2, 3, 4].map((n) => ({
        campo: `numero${n}`,
        rotulo: `Número do passo ${n}`,
        padrao: String(n),
        cena: `passo${n}`,
        deS: 0.15,
        estilo: "simples",
        ajustes: { negrito: true, tamanho: 0.07, sombra: 0, fonte: "display" as const },
        posicao: { x: -0.34, y: -0.36 },
        animacao: { entrada: "zoom" as const },
      })),
      ...[
        [1, "Separe o material"],
        [2, "Monte a base"],
        [3, "Ajuste os detalhes"],
        [4, "Pronto!"],
      ].map(([n, padrao]) => ({
        campo: `passo${n}`,
        rotulo: `Texto do passo ${n}`,
        padrao: String(padrao),
        cena: `passo${n}`,
        deS: 0.3,
        estilo: "caixa",
        posicao: { x: 0, y: 0.33 },
        animacao: { entrada: "palavras" as const },
      })),
    ],
    formas: [1, 2, 3, 4].map((n) => ({
      cena: `passo${n}`,
      deS: 0.1,
      forma: { tipo: "elipse" as const, cor: "@1", contorno_cor: "@2", contorno: 0.06, proporcao: 1 },
      posicao: { x: -0.34, y: -0.36, escala: 0.15 },
      animacao: { entrada: "zoom" as const },
    })),
  },
  {
    id: "viagem",
    nome: "Diário de viagem",
    descricao: "Cinco cenas com cor de cinema, fusão entre elas e o título do lugar.",
    categoria: "Viagem",
    proporcao: "16:9",
    paleta: [BRANCO],
    cenas: [1, 2, 3, 4, 5].map((n) => ({
      id: `cena${n}`,
      rotulo: `Cena ${n}`,
      duracaoS: 2.5,
      aceita: "qualquer" as const,
      filtro: "cinema",
      ...(n < 5 ? { transicao: { tipo: "fusao" as const, duracaoS: 0.5 } } : {}),
    })),
    textos: [
      { campo: "lugar", rotulo: "Lugar", padrao: "Lisboa", cena: "cena1", deS: 0.3, estilo: "manuscrito", ajustes: { tamanho: 0.16 }, posicao: { x: 0, y: 0 }, animacao: { entrada: "letras", saida: "aparecer" }, ateS: 2.3 },
      { campo: "data", rotulo: "Quando", padrao: "Verão de 2026", cena: "cena1", deS: 0.9, ateS: 2.3, estilo: "simples", ajustes: { caixa_alta: true }, posicao: { x: 0, y: 0.14 }, animacao: { entrada: "aparecer", saida: "aparecer" } },
      { campo: "fim", rotulo: "Despedida", padrao: "Até a próxima", cena: "cena5", deS: 0.4, estilo: "manuscrito", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "palavras" } },
    ],
    formas: [],
  },
];
