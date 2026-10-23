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
  /** Aparece na aba Destaques da biblioteca e antes dos outros, sem uso nenhum, nos populares. */
  destaque?: boolean;
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
    destaque: true,
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
    destaque: true,
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
    destaque: true,
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
      { campo: "nome", rotulo: "Nome do evento", padrao: "Noite de\nlançamento", cena: "fundo", deS: 0.3, estilo: "titulo", posicao: { x: 0, y: -0.18 }, animacao: { entrada: "subir" } },
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
  {
    id: "top-5",
    nome: "Top 5",
    descricao: "A lista do quinto ao primeiro, com o número grande em cada cena.",
    categoria: "Redes sociais",
    proporcao: "9:16",
    paleta: ["#ffd23f", ESCURO],
    cenas: [
      { id: "abertura", rotulo: "Abertura", duracaoS: 2.5, aceita: "qualquer", transicao: { tipo: "zoom", duracaoS: 0.3 } },
      ...[5, 4, 3, 2, 1].map((n) => ({
        id: `item${n}`,
        rotulo: `Número ${n}`,
        duracaoS: 2.2,
        aceita: "qualquer" as const,
        ...(n > 1 ? { transicao: { tipo: "empurrar" as const, duracaoS: 0.3 } } : {}),
      })),
    ],
    textos: [
      { campo: "titulo", rotulo: "Título", padrao: "Top 5 do mês", cena: "abertura", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.2 }, animacao: { entrada: "subir" } },
      ...[5, 4, 3, 2, 1].map((n) => ({
        campo: `numero${n}`,
        rotulo: `Posição ${n}`,
        padrao: `#${n}`,
        cena: `item${n}`,
        deS: 0.1,
        estilo: "destaque",
        ajustes: { fundo_cor: "@1", cor: "@2", tamanho: 0.1 },
        posicao: { x: 0, y: 0.14 },
        animacao: { entrada: "zoom" as const },
      })),
      ...[
        [5, "O clássico"],
        [4, "O mais barato"],
        [3, "O favorito da casa"],
        [2, "O mais pedido"],
        [1, "O campeão"],
      ].map(([n, padrao]) => ({
        campo: `item${n}`,
        rotulo: `Item ${n}`,
        padrao: String(padrao),
        cena: `item${n}`,
        deS: 0.35,
        estilo: "caixa",
        posicao: { x: 0, y: 0.3 },
        animacao: { entrada: "palavras" as const },
      })),
    ],
    formas: [],
  },
  {
    id: "pergunta-resposta",
    nome: "Pergunta e resposta",
    descricao: "A pergunta num balão e a resposta na cena seguinte.",
    categoria: "Redes sociais",
    proporcao: "9:16",
    paleta: ["#7c5cff", BRANCO],
    cenas: [
      { id: "pergunta", rotulo: "Pergunta", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "desfoque", duracaoS: 0.4 } },
      { id: "resposta", rotulo: "Resposta", duracaoS: 4, aceita: "qualquer" },
    ],
    textos: [
      { campo: "rotulo_pergunta", rotulo: "Rótulo da pergunta", padrao: "Pergunta", cena: "pergunta", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.3 }, animacao: { entrada: "zoom" } },
      { campo: "pergunta", rotulo: "Pergunta", padrao: "Vale a pena\ncomeçar agora?", cena: "pergunta", deS: 0.4, estilo: "simples", ajustes: { cor: ESCURO, negrito: true, sombra: 0 }, posicao: { x: 0, y: -0.04 }, animacao: { entrada: "palavras" } },
      { campo: "rotulo_resposta", rotulo: "Rótulo da resposta", padrao: "Resposta", cena: "resposta", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.3 }, animacao: { entrada: "zoom" } },
      { campo: "resposta", rotulo: "Resposta", padrao: "Vale, e o melhor\ndia é hoje", cena: "resposta", deS: 0.4, estilo: "caixa", posicao: { x: 0, y: 0.28 }, animacao: { entrada: "palavras" } },
    ],
    formas: [{ cena: "pergunta", deS: 0.25, forma: { tipo: "balao", cor: BRANCO, contorno_cor: "@1", contorno: 0.04, proporcao: 1.6 }, posicao: { x: 0, y: -0.02, escala: 0.82 }, animacao: { entrada: "zoom" } }],
  },
  {
    id: "bastidores",
    nome: "Bastidores",
    descricao: "Três momentos com cor quente, fusão entre eles e uma legenda curta em cada um.",
    categoria: "Redes sociais",
    proporcao: "9:16",
    paleta: ["#ff3d77", BRANCO],
    cenas: [1, 2, 3].map((n) => ({
      id: `momento${n}`,
      rotulo: `Momento ${n}`,
      duracaoS: 2.5,
      aceita: "qualquer" as const,
      filtro: "quente",
      ...(n < 3 ? { transicao: { tipo: "fusao" as const, duracaoS: 0.4 } } : {}),
    })),
    textos: [
      { campo: "selo", rotulo: "Selo", padrao: "Bastidores", cena: "momento1", deS: 0.15, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.38 }, animacao: { entrada: "deslizar" } },
      ...[
        [1, "Começando cedo"],
        [2, "Ajustando tudo"],
        [3, "Quase pronto"],
      ].map(([n, padrao]) => ({
        campo: `legenda${n}`,
        rotulo: `Legenda ${n}`,
        padrao: String(padrao),
        cena: `momento${n}`,
        deS: 0.3,
        estilo: "caixa",
        posicao: { x: 0, y: 0.34 },
        animacao: { entrada: "subir" as const },
      })),
    ],
    formas: [],
  },
  {
    id: "receita",
    nome: "Receita rápida",
    descricao: "O prato, os ingredientes, o modo de preparo e o resultado.",
    categoria: "Culinária",
    proporcao: "9:16",
    paleta: ["#ff8a00", BRANCO],
    cenas: [
      { id: "prato", rotulo: "O prato", duracaoS: 3, aceita: "qualquer", filtro: "quente", transicao: { tipo: "zoom", duracaoS: 0.4 } },
      { id: "ingredientes", rotulo: "Ingredientes", duracaoS: 3.5, aceita: "qualquer", filtro: "quente", transicao: { tipo: "deslizar", duracaoS: 0.4 } },
      { id: "preparo", rotulo: "Preparo", duracaoS: 3.5, aceita: "qualquer", filtro: "quente", transicao: { tipo: "deslizar", duracaoS: 0.4 } },
      { id: "final", rotulo: "Pronto", duracaoS: 3, aceita: "qualquer", filtro: "quente" },
    ],
    textos: [
      { campo: "nome", rotulo: "Nome da receita", padrao: "Bolo de caneca", cena: "prato", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.28 }, animacao: { entrada: "subir" } },
      { campo: "tempo", rotulo: "Tempo de preparo", padrao: "Pronto em 5 min", cena: "prato", deS: 0.8, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.15 }, animacao: { entrada: "zoom" } },
      { campo: "titulo_ingredientes", rotulo: "Título dos ingredientes", padrao: "Ingredientes", cena: "ingredientes", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.33 }, animacao: { entrada: "deslizar" } },
      { campo: "ingredientes", rotulo: "Ingredientes", padrao: "1 ovo\n4 colheres de farinha\n3 colheres de açúcar", cena: "ingredientes", deS: 0.4, estilo: "caixa", posicao: { x: 0, y: 0.26 }, animacao: { entrada: "palavras" } },
      { campo: "titulo_preparo", rotulo: "Título do preparo", padrao: "Modo de preparo", cena: "preparo", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.33 }, animacao: { entrada: "deslizar" } },
      { campo: "preparo", rotulo: "Preparo", padrao: "Misture tudo e leve\nao micro-ondas por 3 min", cena: "preparo", deS: 0.4, estilo: "caixa", posicao: { x: 0, y: 0.28 }, animacao: { entrada: "palavras" } },
      { campo: "fim", rotulo: "Despedida", padrao: "Bom apetite!", cena: "final", deS: 0.3, estilo: "manuscrito", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "zoom" } },
    ],
    formas: [],
  },
  {
    id: "imovel",
    nome: "Imóvel à venda",
    descricao: "Fachada, cômodos com os detalhes, o preço e o contato no fim.",
    categoria: "Imóveis",
    proporcao: "16:9",
    paleta: ["#1f7a5a", BRANCO],
    cenas: [
      { id: "fachada", rotulo: "Fachada", duracaoS: 3, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "fusao", duracaoS: 0.5 } },
      { id: "sala", rotulo: "Sala", duracaoS: 3, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "fusao", duracaoS: 0.5 } },
      { id: "quarto", rotulo: "Quarto", duracaoS: 3, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "fusao", duracaoS: 0.5 } },
      { id: "contato", rotulo: "Contato", duracaoS: 3.5, aceita: "qualquer", filtro: "suave" },
    ],
    textos: [
      { campo: "bairro", rotulo: "Bairro", padrao: "Jardim das Flores", cena: "fachada", deS: 0.3, estilo: "titulo", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "subir" } },
      { campo: "preco", rotulo: "Preço", padrao: "R$ 450 mil", cena: "fachada", deS: 0.8, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0.33, y: -0.32 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "sala", rotulo: "Detalhe da sala", padrao: "3 quartos · 2 vagas", cena: "sala", deS: 0.3, estilo: "caixa", posicao: { x: -0.25, y: 0.34 }, animacao: { entrada: "deslizar" } },
      { campo: "quarto", rotulo: "Detalhe do quarto", padrao: "Suíte com varanda", cena: "quarto", deS: 0.3, estilo: "caixa", posicao: { x: -0.25, y: 0.34 }, animacao: { entrada: "deslizar" } },
      { campo: "chamada", rotulo: "Chamada", padrao: "Agende sua visita", cena: "contato", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.08 }, animacao: { entrada: "palavras" } },
      { campo: "telefone", rotulo: "Telefone", padrao: "(00) 90000-0000", cena: "contato", deS: 0.8, estilo: "simples", ajustes: { negrito: true }, posicao: { x: 0, y: 0.1 }, animacao: { entrada: "aparecer" } },
    ],
    formas: [{ cena: "contato", deS: 0.5, forma: { tipo: "linha", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 12 }, posicao: { x: 0, y: 0.02, escala: 0.3 }, animacao: { entrada: "deslizar" } }],
  },
  {
    id: "lancamento",
    nome: "Lançamento",
    descricao: "O suspense, a revelação do produto e a data para não perder.",
    categoria: "Vendas",
    proporcao: "9:16",
    paleta: ["#00c2ff", BRANCO],
    cenas: [
      { id: "teaser", rotulo: "Suspense", duracaoS: 3, aceita: "qualquer", filtro: "noite", transicao: { tipo: "escurecer", duracaoS: 0.5 } },
      { id: "revelacao", rotulo: "Revelação", duracaoS: 3.5, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "zoom", duracaoS: 0.4 } },
      { id: "data", rotulo: "Data", duracaoS: 3, aceita: "qualquer", filtro: "vivido" },
    ],
    textos: [
      { campo: "breve", rotulo: "Suspense", padrao: "Em breve", cena: "teaser", deS: 0.3, estilo: "titulo", posicao: { x: 0, y: 0 }, animacao: { entrada: "letras" } },
      { campo: "selo", rotulo: "Selo", padrao: "Novidade", cena: "revelacao", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.4 }, animacao: { entrada: "descer" } },
      { campo: "nome", rotulo: "Nome do lançamento", padrao: "Linha Verão", cena: "revelacao", deS: 0.3, estilo: "titulo", posicao: { x: 0, y: -0.27 }, animacao: { entrada: "zoom" } },
      { campo: "data", rotulo: "Data", padrao: "Dia 15, às 19h", cena: "data", deS: 0.2, estilo: "destaque", ajustes: { fundo_cor: "@1", tamanho: 0.08 }, posicao: { x: 0, y: 0.2 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "chamada", rotulo: "Chamada", padrao: "Ative o lembrete", cena: "data", deS: 0.7, estilo: "simples", posicao: { x: 0, y: 0.32 }, animacao: { entrada: "subir" } },
    ],
    formas: [],
  },
  {
    id: "cupom",
    nome: "Cupom de desconto",
    descricao: "O desconto grande e o código do cupom para copiar.",
    categoria: "Vendas",
    proporcao: "1:1",
    paleta: ["#ff3d77", BRANCO],
    cenas: [
      { id: "oferta", rotulo: "Oferta", duracaoS: 3.5, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "cortina_direita", duracaoS: 0.5 } },
      { id: "codigo", rotulo: "Cupom", duracaoS: 3.5, aceita: "qualquer", filtro: "vivido" },
    ],
    textos: [
      { campo: "desconto", rotulo: "Desconto", padrao: "30% OFF", cena: "oferta", deS: 0.2, estilo: "contorno", ajustes: { tamanho: 0.15, contorno_cor: "@1" }, posicao: { x: 0, y: -0.04 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "onde", rotulo: "Onde vale", padrao: "em toda a loja", cena: "oferta", deS: 0.7, estilo: "simples", ajustes: { caixa_alta: true }, posicao: { x: 0, y: 0.14 }, animacao: { entrada: "subir" } },
      { campo: "use", rotulo: "Antes do código", padrao: "Use o cupom", cena: "codigo", deS: 0.2, estilo: "simples", posicao: { x: 0, y: -0.15 }, animacao: { entrada: "aparecer" } },
      { campo: "codigo", rotulo: "Código", padrao: "VERAO30", cena: "codigo", deS: 0.4, estilo: "destaque", ajustes: { fundo_cor: "@1", tamanho: 0.1 }, posicao: { x: 0, y: 0.01 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "prazo", rotulo: "Prazo", padrao: "Até domingo", cena: "codigo", deS: 0.8, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "subir" } },
    ],
    formas: [{ cena: "oferta", deS: 0.1, forma: { tipo: "elipse", cor: null, contorno_cor: "@1", contorno: 0.04, proporcao: 1 }, posicao: { x: 0, y: -0.02, escala: 0.62 }, animacao: { entrada: "zoom", loop: "pulsar" } }],
  },
  {
    id: "vlog-dia",
    nome: "Um dia comigo",
    descricao: "Manhã, tarde e noite, com a hora no canto e o que estava acontecendo.",
    categoria: "Vlog",
    proporcao: "9:16",
    paleta: ["#ffd23f", ESCURO],
    cenas: [
      { id: "manha", rotulo: "Manhã", duracaoS: 3, aceita: "qualquer", filtro: "quente", transicao: { tipo: "deslizar", duracaoS: 0.3 } },
      { id: "tarde", rotulo: "Tarde", duracaoS: 3, aceita: "qualquer", filtro: "vivido", transicao: { tipo: "deslizar", duracaoS: 0.3 } },
      { id: "noite", rotulo: "Noite", duracaoS: 3, aceita: "qualquer", filtro: "noite" },
    ],
    textos: [
      { campo: "titulo", rotulo: "Título", padrao: "Um dia comigo", cena: "manha", deS: 0.2, ateS: 2.8, estilo: "manuscrito", posicao: { x: 0, y: -0.18 }, animacao: { entrada: "letras", saida: "aparecer" } },
      ...[
        ["manha", "8h", "Café e planejamento"],
        ["tarde", "13h", "Mão na massa"],
        ["noite", "21h", "Hora de descansar"],
      ].flatMap(([cena, hora, legenda]) => [
        { campo: `hora_${cena}`, rotulo: `Hora (${cena === "manha" ? "manhã" : cena})`, padrao: hora, cena, deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1", cor: "@2" }, posicao: { x: -0.32, y: -0.38 }, animacao: { entrada: "zoom" as const } },
        { campo: `legenda_${cena}`, rotulo: `Legenda (${cena === "manha" ? "manhã" : cena})`, padrao: legenda, cena, deS: 0.4, estilo: "caixa", posicao: { x: 0, y: 0.33 }, animacao: { entrada: "subir" as const } },
      ]),
    ],
    formas: [],
  },
  {
    id: "treino",
    nome: "Treino rápido",
    descricao: "O nome do treino, cada exercício e as repetições.",
    categoria: "Fitness",
    proporcao: "9:16",
    paleta: ["#39ff14", ESCURO],
    cenas: [
      { id: "abertura", rotulo: "Abertura", duracaoS: 3, aceita: "qualquer", filtro: "drama", transicao: { tipo: "zoom", duracaoS: 0.3 } },
      ...[1, 2, 3].map((n) => ({
        id: `exercicio${n}`,
        rotulo: `Exercício ${n}`,
        duracaoS: 3,
        aceita: "qualquer" as const,
        filtro: "drama",
        ...(n < 3 ? { transicao: { tipo: "zoom" as const, duracaoS: 0.3 } } : {}),
      })),
    ],
    textos: [
      { campo: "titulo", rotulo: "Título", padrao: "Treino de 10 min", cena: "abertura", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.28 }, animacao: { entrada: "palavras" } },
      ...[
        [1, "Agachamento", "15 repetições"],
        [2, "Flexão", "12 repetições"],
        [3, "Prancha", "30 segundos"],
      ].flatMap(([n, nome, reps]) => [
        { campo: `exercicio${n}`, rotulo: `Exercício ${n}`, padrao: String(nome), cena: `exercicio${n}`, deS: 0.15, estilo: "contorno", ajustes: { contorno_cor: ESCURO }, posicao: { x: 0, y: -0.32 }, animacao: { entrada: "deslizar" as const } },
        { campo: `repeticoes${n}`, rotulo: `Repetições ${n}`, padrao: String(reps), cena: `exercicio${n}`, deS: 0.5, estilo: "destaque", ajustes: { fundo_cor: "@1", cor: "@2" }, posicao: { x: 0, y: 0.3 }, animacao: { entrada: "zoom" as const, loop: "pulsar" as const } },
      ]),
    ],
    formas: [],
  },
  {
    id: "aula",
    nome: "Aula em partes",
    descricao: "O tema, duas partes com o título embaixo e o resumo no fim.",
    categoria: "Educação",
    proporcao: "16:9",
    paleta: ["#2b6cff", BRANCO],
    cenas: [
      { id: "tema", rotulo: "Tema", duracaoS: 3.5, aceita: "qualquer", filtro: "suave", transicao: { tipo: "fusao", duracaoS: 0.5 } },
      { id: "parte1", rotulo: "Parte 1", duracaoS: 4, aceita: "qualquer", transicao: { tipo: "empurrar", duracaoS: 0.4 } },
      { id: "parte2", rotulo: "Parte 2", duracaoS: 4, aceita: "qualquer", transicao: { tipo: "empurrar", duracaoS: 0.4 } },
      { id: "resumo", rotulo: "Resumo", duracaoS: 4, aceita: "qualquer", filtro: "suave" },
    ],
    textos: [
      { campo: "aula", rotulo: "Número da aula", padrao: "Aula 1", cena: "tema", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.2 }, animacao: { entrada: "descer" } },
      { campo: "tema", rotulo: "Tema", padrao: "Frações sem medo", cena: "tema", deS: 0.4, estilo: "titulo", posicao: { x: 0, y: 0 }, animacao: { entrada: "letras" } },
      { campo: "parte1", rotulo: "Parte 1", padrao: "Parte 1: o que é uma fração", cena: "parte1", deS: 0.3, estilo: "caixa", posicao: { x: 0, y: 0.36 }, animacao: { entrada: "subir" } },
      { campo: "parte2", rotulo: "Parte 2", padrao: "Parte 2: somar e subtrair", cena: "parte2", deS: 0.3, estilo: "caixa", posicao: { x: 0, y: 0.36 }, animacao: { entrada: "subir" } },
      { campo: "titulo_resumo", rotulo: "Título do resumo", padrao: "Resumindo", cena: "resumo", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.22 }, animacao: { entrada: "zoom" } },
      { campo: "resumo", rotulo: "Resumo", padrao: "Mesma base: soma direto\nBase diferente: iguale antes", cena: "resumo", deS: 0.6, estilo: "caixa", posicao: { x: 0, y: 0.08 }, animacao: { entrada: "palavras" } },
    ],
    formas: [{ cena: "tema", deS: 0.6, forma: { tipo: "linha", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 12 }, posicao: { x: 0, y: 0.1, escala: 0.32 }, animacao: { entrada: "deslizar" } }],
  },
  {
    id: "noticia",
    nome: "Notícia rápida",
    descricao: "A faixa de urgente, a manchete, o detalhe e a fonte.",
    categoria: "Notícias",
    proporcao: "9:16",
    paleta: ["#e11d48", BRANCO],
    cenas: [
      { id: "manchete", rotulo: "Manchete", duracaoS: 3.5, aceita: "qualquer", transicao: { tipo: "deslizar", duracaoS: 0.3 } },
      { id: "detalhe", rotulo: "Detalhe", duracaoS: 3.5, aceita: "qualquer", transicao: { tipo: "deslizar", duracaoS: 0.3 } },
      { id: "fim", rotulo: "Fechamento", duracaoS: 3, aceita: "qualquer" },
    ],
    textos: [
      { campo: "selo", rotulo: "Selo", padrao: "Urgente", cena: "manchete", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.38 }, animacao: { entrada: "deslizar", loop: "pulsar" } },
      { campo: "manchete", rotulo: "Manchete", padrao: "Chuva forte\nnesta tarde", cena: "manchete", deS: 0.3, estilo: "titulo", ajustes: { tamanho: 0.075 }, posicao: { x: 0, y: -0.2 }, animacao: { entrada: "palavras" } },
      { campo: "detalhe", rotulo: "Detalhe", padrao: "Previsão de 40 mm até as 18h", cena: "detalhe", deS: 0.3, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "subir" } },
      { campo: "fonte", rotulo: "Fonte", padrao: "Fonte: Defesa Civil", cena: "detalhe", deS: 0.9, estilo: "simples", ajustes: { tamanho: 0.04 }, posicao: { x: 0, y: 0.38 }, animacao: { entrada: "aparecer" } },
      { campo: "chamada", rotulo: "Chamada", padrao: "Siga para mais notícias", cena: "fim", deS: 0.3, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: 0.25 }, animacao: { entrada: "zoom", loop: "pulsar" } },
    ],
    formas: [],
  },
  {
    id: "aniversario",
    nome: "Convite de aniversário",
    descricao: "O convite com o nome, o dia, a hora e o lugar, com estrelas balançando.",
    categoria: "Eventos",
    proporcao: "4:5",
    paleta: ["#ff8fd1", BRANCO],
    cenas: [
      { id: "convite", rotulo: "Convite", duracaoS: 4, aceita: "qualquer", filtro: "suave", transicao: { tipo: "fusao", duracaoS: 0.5 } },
      { id: "detalhes", rotulo: "Detalhes", duracaoS: 4, aceita: "qualquer", filtro: "suave" },
    ],
    textos: [
      { campo: "convite", rotulo: "Convite", padrao: "Você está convidado", cena: "convite", deS: 0.2, estilo: "manuscrito", ajustes: { tamanho: 0.08 }, posicao: { x: 0, y: -0.28 }, animacao: { entrada: "letras" } },
      { campo: "nome", rotulo: "Quem faz aniversário", padrao: "Ana faz 30", cena: "convite", deS: 0.9, estilo: "titulo", posicao: { x: 0, y: 0 }, animacao: { entrada: "zoom" } },
      { campo: "quando", rotulo: "Quando", padrao: "Sábado, às 20h", cena: "detalhes", deS: 0.2, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.1 }, animacao: { entrada: "zoom" } },
      { campo: "onde", rotulo: "Onde", padrao: "Rua das Flores, 100", cena: "detalhes", deS: 0.6, estilo: "simples", posicao: { x: 0, y: 0.06 }, animacao: { entrada: "subir" } },
      { campo: "confirme", rotulo: "Chamada", padrao: "Confirme presença", cena: "detalhes", deS: 1, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "subir", loop: "pulsar" } },
    ],
    formas: [
      { cena: "convite", deS: 0.4, forma: { tipo: "estrela", cor: "@1", contorno_cor: BRANCO, contorno: 0.05, proporcao: null }, posicao: { x: 0.36, y: -0.4, escala: 0.14 }, animacao: { entrada: "zoom", loop: "balancar" } },
      { cena: "convite", deS: 0.6, forma: { tipo: "estrela", cor: "@1", contorno_cor: BRANCO, contorno: 0.05, proporcao: null }, posicao: { x: -0.36, y: 0.38, escala: 0.12 }, animacao: { entrada: "zoom", loop: "balancar" } },
    ],
  },
  {
    id: "casamento",
    nome: "Reserve a data",
    descricao: "O casal com os nomes à mão, o coração e a data com o lugar.",
    categoria: "Eventos",
    proporcao: "16:9",
    paleta: ["#d4af37", BRANCO],
    cenas: [
      { id: "casal", rotulo: "O casal", duracaoS: 4, aceita: "qualquer", filtro: "suave", transicao: { tipo: "fusao", duracaoS: 0.8 } },
      { id: "data", rotulo: "A data", duracaoS: 4, aceita: "qualquer", filtro: "suave" },
    ],
    textos: [
      { campo: "chamada", rotulo: "Chamada", padrao: "Reserve a data", cena: "casal", deS: 0.2, estilo: "simples", ajustes: { caixa_alta: true }, posicao: { x: 0, y: -0.25 }, animacao: { entrada: "aparecer" } },
      { campo: "nomes", rotulo: "Nomes", padrao: "Júlia & Pedro", cena: "casal", deS: 0.6, estilo: "manuscrito", ajustes: { tamanho: 0.15 }, posicao: { x: 0, y: 0 }, animacao: { entrada: "letras" } },
      { campo: "data", rotulo: "Data", padrao: "12.12.2026", cena: "data", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.06 }, animacao: { entrada: "zoom" } },
      { campo: "local", rotulo: "Lugar e hora", padrao: "Igreja da Matriz · 17h", cena: "data", deS: 0.7, estilo: "simples", posicao: { x: 0, y: 0.12 }, animacao: { entrada: "subir" } },
    ],
    formas: [{ cena: "casal", deS: 1.2, forma: { tipo: "coracao", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: null }, posicao: { x: 0, y: 0.25, escala: 0.1 }, animacao: { entrada: "zoom", loop: "pulsar" } }],
  },
  {
    id: "podcast",
    nome: "Corte de podcast",
    descricao: "O episódio, a tarja de quem fala e a frase mais forte em destaque.",
    categoria: "Podcast",
    proporcao: "16:9",
    paleta: ["#8b5cf6", BRANCO],
    cenas: [
      { id: "abertura", rotulo: "Abertura", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "fusao", duracaoS: 0.4 } },
      { id: "conversa", rotulo: "Conversa", duracaoS: 5, aceita: "video", transicao: { tipo: "fusao", duracaoS: 0.4 } },
      { id: "frase", rotulo: "A frase", duracaoS: 4, aceita: "qualquer", filtro: "drama" },
    ],
    textos: [
      { campo: "episodio", rotulo: "Episódio", padrao: "Episódio 12", cena: "abertura", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1" }, posicao: { x: 0, y: -0.22 }, animacao: { entrada: "descer" } },
      { campo: "titulo", rotulo: "Título", padrao: "Como começar do zero", cena: "abertura", deS: 0.4, estilo: "titulo", posicao: { x: 0, y: 0 }, animacao: { entrada: "palavras" } },
      { campo: "convidado", rotulo: "Nome de quem fala", padrao: "Carla Mendes", cena: "conversa", deS: 0.5, ateS: 4.5, estilo: "simples", ajustes: { negrito: true, sombra: 0 }, posicao: { x: -0.3, y: 0.3 }, animacao: { entrada: "deslizar", saida: "aparecer" } },
      { campo: "cargo", rotulo: "O que a pessoa faz", padrao: "Empreendedora", cena: "conversa", deS: 0.8, ateS: 4.5, estilo: "caixa", posicao: { x: -0.3, y: 0.39 }, animacao: { entrada: "deslizar", saida: "aparecer" } },
      { campo: "frase", rotulo: "Frase em destaque", padrao: "“Comece antes de\nestar pronto”", cena: "frase", deS: 0.3, estilo: "manuscrito", ajustes: { tamanho: 0.12 }, posicao: { x: 0, y: 0 }, animacao: { entrada: "palavras" } },
    ],
    formas: [{ cena: "conversa", deS: 0.4, ateS: 4.5, forma: { tipo: "arredondado", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 4.5 }, posicao: { x: -0.3, y: 0.3, escala: 0.38 }, animacao: { entrada: "deslizar", saida: "aparecer" } }],
  },
  {
    id: "resultado",
    nome: "Resultado do cliente",
    descricao: "Cinco estrelas, a frase do cliente e o número do resultado.",
    categoria: "Pessoas",
    proporcao: "4:5",
    paleta: ["#ffd23f", BRANCO],
    cenas: [
      { id: "cliente", rotulo: "Cliente", duracaoS: 4, aceita: "qualquer", transicao: { tipo: "fusao", duracaoS: 0.5 } },
      { id: "resultado", rotulo: "Resultado", duracaoS: 4, aceita: "qualquer", filtro: "vivido" },
    ],
    textos: [
      { campo: "frase", rotulo: "Frase do cliente", padrao: "“Superou o que\neu esperava”", cena: "cliente", deS: 0.6, estilo: "simples", ajustes: { negrito: true, tamanho: 0.065 }, posicao: { x: 0, y: 0.22 }, animacao: { entrada: "palavras" } },
      { campo: "nome", rotulo: "Quem disse", padrao: "Marina, cliente desde 2024", cena: "cliente", deS: 1.2, estilo: "caixa", posicao: { x: 0, y: 0.37 }, animacao: { entrada: "subir" } },
      { campo: "numero", rotulo: "Resultado", padrao: "+40% de vendas", cena: "resultado", deS: 0.3, estilo: "contorno", ajustes: { contorno_cor: ESCURO, tamanho: 0.075 }, posicao: { x: 0, y: -0.02 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "prazo", rotulo: "Em quanto tempo", padrao: "em 3 meses", cena: "resultado", deS: 0.8, estilo: "simples", posicao: { x: 0, y: 0.13 }, animacao: { entrada: "subir" } },
    ],
    formas: [-2, -1, 0, 1, 2].map((i) => ({
      cena: "cliente",
      deS: 0.15 + 0.1 * (i + 2),
      forma: { tipo: "estrela" as const, cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: null },
      posicao: { x: 0.12 * i, y: -0.34, escala: 0.1 },
      animacao: { entrada: "zoom" as const },
    })),
  },
  {
    id: "inauguracao",
    nome: "Inauguração",
    descricao: "O nome da loja, o dia da abertura, o endereço e o presente para quem vier.",
    categoria: "Negócios",
    proporcao: "9:16",
    paleta: ["#ff624a", BRANCO],
    cenas: [
      { id: "fachada", rotulo: "Fachada", duracaoS: 3.5, aceita: "qualquer", filtro: "quente", transicao: { tipo: "zoom", duracaoS: 0.4 } },
      { id: "detalhes", rotulo: "Detalhes", duracaoS: 3.5, aceita: "qualquer", filtro: "quente" },
    ],
    textos: [
      { campo: "chamada", rotulo: "Chamada", padrao: "Inauguração", cena: "fachada", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.3 }, animacao: { entrada: "letras" } },
      { campo: "loja", rotulo: "Nome da loja", padrao: "Café Aurora", cena: "fachada", deS: 1, estilo: "manuscrito", ajustes: { tamanho: 0.13 }, posicao: { x: 0, y: -0.14 }, animacao: { entrada: "zoom" } },
      { campo: "quando", rotulo: "Quando", padrao: "Sábado, às 9h", cena: "detalhes", deS: 0.2, estilo: "destaque", ajustes: { fundo_cor: "@1", tamanho: 0.08 }, posicao: { x: 0, y: -0.2 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "onde", rotulo: "Endereço", padrao: "Av. Central, 500", cena: "detalhes", deS: 0.6, estilo: "caixa", posicao: { x: 0, y: 0.22 }, animacao: { entrada: "subir" } },
      { campo: "presente", rotulo: "Presente", padrao: "O primeiro café\né por nossa conta", cena: "detalhes", deS: 1, estilo: "simples", posicao: { x: 0, y: 0.33 }, animacao: { entrada: "palavras" } },
    ],
    formas: [],
  },
  {
    id: "vaga",
    nome: "Vaga de emprego",
    descricao: "Estamos contratando: o cargo, o formato e onde se candidatar.",
    categoria: "Negócios",
    proporcao: "1:1",
    paleta: ["#0ea5e9", BRANCO],
    cenas: [
      { id: "time", rotulo: "A equipe", duracaoS: 3.5, aceita: "qualquer", transicao: { tipo: "deslizar", duracaoS: 0.4 } },
      { id: "vaga", rotulo: "A vaga", duracaoS: 4, aceita: "qualquer", filtro: "suave" },
    ],
    textos: [
      { campo: "chamada", rotulo: "Chamada", padrao: "Estamos\ncontratando", cena: "time", deS: 0.2, estilo: "titulo", ajustes: { tamanho: 0.08 }, posicao: { x: 0, y: -0.28 }, animacao: { entrada: "palavras" } },
      { campo: "cargo", rotulo: "Cargo", padrao: "Designer pleno", cena: "vaga", deS: 0.2, estilo: "destaque", ajustes: { fundo_cor: "@1", tamanho: 0.08 }, posicao: { x: 0, y: -0.06 }, animacao: { entrada: "zoom" } },
      { campo: "formato", rotulo: "Formato", padrao: "Remoto · CLT", cena: "vaga", deS: 0.6, estilo: "simples", posicao: { x: 0, y: 0.1 }, animacao: { entrada: "subir" } },
      { campo: "como", rotulo: "Como se candidatar", padrao: "Candidate-se pelo link", cena: "vaga", deS: 1, estilo: "caixa", posicao: { x: 0, y: 0.32 }, animacao: { entrada: "subir", loop: "pulsar" } },
    ],
    formas: [],
  },
  {
    id: "encerramento",
    nome: "Encerramento do vídeo",
    descricao: "O agradecimento, a chamada para se inscrever e o nome do canal.",
    categoria: "Encerramento",
    proporcao: "16:9",
    paleta: ["#ff624a", BRANCO],
    cenas: [{ id: "fundo", rotulo: "Fundo", duracaoS: 5, aceita: "qualquer", filtro: "cinema" }],
    textos: [
      { campo: "obrigado", rotulo: "Agradecimento", padrao: "Obrigado por assistir", cena: "fundo", deS: 0.2, estilo: "titulo", posicao: { x: 0, y: -0.2 }, animacao: { entrada: "letras" } },
      { campo: "inscreva", rotulo: "Chamada", padrao: "Inscreva-se", cena: "fundo", deS: 1.2, estilo: "destaque", ajustes: { fundo_cor: "@1", tamanho: 0.08 }, posicao: { x: 0, y: 0.05 }, animacao: { entrada: "zoom", loop: "pulsar" } },
      { campo: "canal", rotulo: "Nome do canal", padrao: "@seucanal", cena: "fundo", deS: 1.8, estilo: "simples", posicao: { x: 0, y: 0.2 }, animacao: { entrada: "aparecer" } },
    ],
    formas: [{ cena: "fundo", deS: 1.5, forma: { tipo: "seta", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 1.6 }, posicao: { x: -0.22, y: 0.05, escala: 0.1 }, animacao: { entrada: "deslizar", loop: "balancar" } }],
  },
  {
    id: "unboxing",
    nome: "O que veio na caixa",
    descricao: "A caixa fechada e cada item, numerado no canto.",
    categoria: "Vendas",
    proporcao: "9:16",
    paleta: ["#facc15", ESCURO],
    cenas: [
      { id: "caixa", rotulo: "A caixa", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "zoom", duracaoS: 0.3 } },
      ...[1, 2, 3].map((n) => ({
        id: `item${n}`,
        rotulo: `Item ${n}`,
        duracaoS: 2.5,
        aceita: "qualquer" as const,
        ...(n < 3 ? { transicao: { tipo: "empurrar" as const, duracaoS: 0.3 } } : {}),
      })),
    ],
    textos: [
      { campo: "titulo", rotulo: "Título", padrao: "O que veio\nna caixa?", cena: "caixa", deS: 0.2, estilo: "titulo", ajustes: { tamanho: 0.08 }, posicao: { x: 0, y: -0.26 }, animacao: { entrada: "palavras" } },
      ...[
        [1, "O produto"],
        [2, "O carregador"],
        [3, "O manual"],
      ].flatMap(([n, nome]) => [
        { campo: `contagem${n}`, rotulo: `Contagem ${n}`, padrao: `${n}/3`, cena: `item${n}`, deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1", cor: "@2" }, posicao: { x: 0.32, y: -0.38 }, animacao: { entrada: "zoom" as const } },
        { campo: `item${n}`, rotulo: `Item ${n}`, padrao: String(nome), cena: `item${n}`, deS: 0.3, estilo: "caixa", posicao: { x: 0, y: 0.33 }, animacao: { entrada: "subir" as const } },
      ]),
    ],
    formas: [],
  },
  {
    id: "dica-tech",
    nome: "Você sabia?",
    descricao: "O problema, a solução e o lembrete para salvar.",
    categoria: "Tecnologia",
    proporcao: "9:16",
    paleta: ["#22d3ee", ESCURO],
    cenas: [
      { id: "problema", rotulo: "Problema", duracaoS: 3, aceita: "qualquer", transicao: { tipo: "desfoque", duracaoS: 0.4 } },
      { id: "solucao", rotulo: "Solução", duracaoS: 3.5, aceita: "qualquer", transicao: { tipo: "desfoque", duracaoS: 0.4 } },
      { id: "fim", rotulo: "Fechamento", duracaoS: 3, aceita: "qualquer" },
    ],
    textos: [
      { campo: "selo", rotulo: "Selo", padrao: "Você sabia?", cena: "problema", deS: 0.1, estilo: "destaque", ajustes: { fundo_cor: "@1", cor: "@2" }, posicao: { x: 0, y: -0.35 }, animacao: { entrada: "zoom" } },
      { campo: "problema", rotulo: "Problema", padrao: "Seu celular esquenta?", cena: "problema", deS: 0.4, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "palavras" } },
      { campo: "solucao", rotulo: "Solução", padrao: "Feche os apps\nque você não usa", cena: "solucao", deS: 0.3, estilo: "caixa", posicao: { x: 0, y: 0.3 }, animacao: { entrada: "palavras" } },
      { campo: "chamada", rotulo: "Chamada", padrao: "Salve para lembrar", cena: "fim", deS: 0.3, estilo: "destaque", ajustes: { fundo_cor: "@1", cor: "@2" }, posicao: { x: 0, y: 0.28 }, animacao: { entrada: "zoom", loop: "pulsar" } },
    ],
    formas: [{ cena: "solucao", deS: 0.2, forma: { tipo: "seta", cor: "@1", contorno_cor: BRANCO, contorno: 0, proporcao: 1.6 }, posicao: { x: 0, y: 0.17, escala: 0.12, rotacao: 90 }, animacao: { entrada: "descer", loop: "flutuar" } }],
  },
  {
    id: "citacao",
    nome: "Frase do dia",
    descricao: "Uma frase à mão sobre a imagem, com o autor embaixo.",
    categoria: "Inspiração",
    proporcao: "1:1",
    paleta: [BRANCO, "#ff624a"],
    cenas: [{ id: "fundo", rotulo: "Fundo", duracaoS: 6, aceita: "qualquer", filtro: "drama" }],
    textos: [
      { campo: "frase", rotulo: "Frase", padrao: "A constância\nvence o talento", cena: "fundo", deS: 0.3, estilo: "manuscrito", ajustes: { tamanho: 0.11 }, posicao: { x: 0, y: -0.06 }, animacao: { entrada: "palavras" } },
      { campo: "autor", rotulo: "Autor", padrao: "— Autor desconhecido", cena: "fundo", deS: 2, estilo: "simples", posicao: { x: 0, y: 0.2 }, animacao: { entrada: "aparecer" } },
    ],
    formas: [{ cena: "fundo", deS: 1.6, forma: { tipo: "linha", cor: "@2", contorno_cor: BRANCO, contorno: 0, proporcao: 12 }, posicao: { x: 0, y: 0.12, escala: 0.28 }, animacao: { entrada: "deslizar" } }],
  },
];
