// Modelos de imagem: designs prontos (post, story, capa, banner) desenhados do zero, em camadas que o editor de
// imagem já conhece: fotos (vagas que a pessoa preenche), formas e textos. As cores "@1", "@2"... são as do kit de
// marca, com a paleta do modelo quando o kit não tem.
//
// Fotos e formas ficam numa caixa em frações do quadro (o centro e o tamanho); `camadasDoModelo` acha o recorte e
// a escala que fazem a mídia cobrir a caixa. A vaga sem foto vira um retângulo cinza do tamanho dela, que a pessoa
// troca depois ("Trocar a imagem"). A mesma conta faz a miniatura da biblioteca e o projeto de verdade.
import type { PedidoDeForma } from "../elementos.ts";
import type { Tamanho } from "./geometria.ts";
import type { TamanhoDaImagem } from "./imagem.ts";
import { type Cantos, RECORTE_PADRAO, type Recorte, type Transformacao, TRANSFORMACAO_PADRAO } from "./modelo.ts";
import { resolverCor } from "./modelos.ts";
import { ESTILOS_DE_TEXTO, TEXTO_PADRAO, type Texto } from "./texto.ts";

/** Uma caixa no quadro: o centro e o tamanho, em frações da largura e da altura. */
export type CaixaNoQuadro = { cx: number; cy: number; largura: number; altura: number };

export type CamadaDoModeloDeImagem =
  | { tipo: "foto"; vaga: string; rotulo: string; caixa: CaixaNoQuadro; cantos?: Cantos; rotacao?: number; filtro?: string }
  | { tipo: "forma"; forma: PedidoDeForma; caixa: CaixaNoQuadro; rotacao?: number; opacidade?: number }
  | { tipo: "texto"; campo: string; rotulo: string; padrao: string; estilo: string; ajustes?: Partial<Texto>; x: number; y: number; rotacao?: number };

export type ModeloDeImagem = {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  destaque?: boolean;
  tamanho: TamanhoDaImagem;
  /** A cor do fundo ("@n" ou "#rrggbb"). */
  fundo: string;
  paleta: string[];
  /** De baixo para cima. */
  camadas: CamadaDoModeloDeImagem[];
};

/** A cor do lugar da foto ainda não escolhida. */
export const COR_DA_VAGA = "#d9dce3";

const QUADRADO = { largura: 1080, altura: 1080 };
const RETRATO = { largura: 1080, altura: 1350 };
const STORY = { largura: 1080, altura: 1920 };
const CAPA = { largura: 1280, altura: 720 };
const BANNER = { largura: 1500, altura: 500 };

const forma = (tipo: PedidoDeForma["tipo"], cor: string | null, extra: Partial<PedidoDeForma> = {}): PedidoDeForma => ({
  tipo,
  cor,
  contorno_cor: "#000000",
  contorno: 0,
  proporcao: null,
  ...extra,
});
const tela = (largura = 1, altura = 1): CaixaNoQuadro => ({ cx: 0.5, cy: 0.5, largura, altura });

export const MODELOS_DE_IMAGEM: ModeloDeImagem[] = [
  {
    id: "img-oferta",
    nome: "Oferta da semana",
    descricao: "Foto do produto, selo de desconto e a chamada.",
    categoria: "Vendas",
    destaque: true,
    tamanho: QUADRADO,
    fundo: "@2",
    paleta: ["#ff5a36", "#151517", "#ffd23f"],
    camadas: [
      { tipo: "foto", vaga: "produto", rotulo: "Foto do produto", caixa: { cx: 0.5, cy: 0.4, largura: 0.86, altura: 0.6 }, cantos: { raio: 0.06, borda: 0, cor: "#ffffff" } },
      { tipo: "forma", forma: forma("estrela", "@3"), caixa: { cx: 0.83, cy: 0.15, largura: 0.27, altura: 0.27 }, rotacao: 12 },
      { tipo: "texto", campo: "selo", rotulo: "Selo", padrao: "-30%", estilo: "titulo", ajustes: { tamanho: 0.055, cor: "@2", sombra: 0 }, x: 0.33, y: -0.345, rotacao: 12 },
      { tipo: "texto", campo: "titulo", rotulo: "Título", padrao: "Super oferta", estilo: "titulo", ajustes: { tamanho: 0.085 }, x: 0, y: 0.29 },
      { tipo: "texto", campo: "detalhe", rotulo: "Detalhe", padrao: "Só nesta semana", estilo: "simples", ajustes: { tamanho: 0.045, cor: "@3", sombra: 0 }, x: 0, y: 0.385 },
    ],
  },
  {
    id: "img-frase",
    nome: "Frase do dia",
    descricao: "Uma frase grande, com aspas e o autor.",
    categoria: "Inspiração",
    destaque: true,
    tamanho: QUADRADO,
    fundo: "#f4efe6",
    paleta: ["#e2574c", "#1d1d1f"],
    camadas: [
      { tipo: "texto", campo: "aspas", rotulo: "Aspas", padrao: "“", estilo: "titulo", ajustes: { tamanho: 0.3, cor: "@1", sombra: 0 }, x: -0.3, y: -0.27 },
      {
        tipo: "texto",
        campo: "frase",
        rotulo: "Frase",
        padrao: "A constância\nvence o talento.",
        estilo: "titulo",
        ajustes: { tamanho: 0.08, cor: "@2", sombra: 0, caixa_alta: false },
        x: 0,
        y: -0.02,
      },
      { tipo: "forma", forma: forma("linha", "@1", { proporcao: 12 }), caixa: { cx: 0.5, cy: 0.64, largura: 0.18, altura: 0.015 } },
      { tipo: "texto", campo: "autor", rotulo: "Autor", padrao: "Seu nome", estilo: "simples", ajustes: { tamanho: 0.042, cor: "@1", sombra: 0, negrito: true }, x: 0, y: 0.21 },
    ],
  },
  {
    id: "img-produto",
    nome: "Produto em destaque",
    descricao: "Foto grande, faixa com o nome e o preço.",
    categoria: "Vendas",
    tamanho: RETRATO,
    fundo: "#ffffff",
    paleta: ["#1f4cff", "#ffffff", "#ffd23f"],
    camadas: [
      { tipo: "foto", vaga: "produto", rotulo: "Foto do produto", caixa: { cx: 0.5, cy: 0.37, largura: 1, altura: 0.74 } },
      { tipo: "forma", forma: forma("retangulo", "@1"), caixa: { cx: 0.5, cy: 0.87, largura: 1, altura: 0.26 } },
      { tipo: "texto", campo: "nome", rotulo: "Nome do produto", padrao: "Tênis Leve 2", estilo: "titulo", ajustes: { tamanho: 0.08, cor: "@2", sombra: 0 }, x: 0, y: 0.33 },
      {
        tipo: "texto",
        campo: "preco",
        rotulo: "Preço",
        padrao: "R$ 199,90",
        estilo: "destaque",
        ajustes: { tamanho: 0.06, cor: "#151517", fundo_cor: "@3", fundo_opacidade: 1 },
        x: 0,
        y: 0.425,
      },
    ],
  },
  {
    id: "img-evento",
    nome: "Aviso de evento",
    descricao: "Foto de fundo escurecida, nome, data e o botão.",
    categoria: "Eventos",
    destaque: true,
    tamanho: STORY,
    fundo: "#000000",
    paleta: ["#ff3d77", "#ffffff"],
    camadas: [
      { tipo: "foto", vaga: "fundo", rotulo: "Foto de fundo", caixa: tela(), filtro: "cinema" },
      { tipo: "forma", forma: forma("retangulo", "#000000"), caixa: tela(), opacidade: 0.45 },
      { tipo: "texto", campo: "chamada", rotulo: "Chamada", padrao: "Não perca", estilo: "simples", ajustes: { tamanho: 0.05, cor: "@1", caixa_alta: true, negrito: true }, x: 0, y: -0.2 },
      { tipo: "texto", campo: "nome", rotulo: "Nome do evento", padrao: "Workshop\nde vídeo", estilo: "titulo", ajustes: { tamanho: 0.11 }, x: 0, y: -0.09 },
      { tipo: "texto", campo: "data", rotulo: "Data e hora", padrao: "12 de novembro · 19h", estilo: "simples", ajustes: { tamanho: 0.05, negrito: true }, x: 0, y: 0.06 },
      { tipo: "forma", forma: forma("arredondado", "@1", { proporcao: 3.6 }), caixa: { cx: 0.5, cy: 0.78, largura: 0.62, altura: 0.0974 } },
      { tipo: "texto", campo: "botao", rotulo: "Botão", padrao: "Inscreva-se", estilo: "simples", ajustes: { tamanho: 0.055, negrito: true, sombra: 0 }, x: 0, y: 0.28 },
    ],
  },
  {
    id: "img-novidade",
    nome: "Novidade no story",
    descricao: "Foto redonda no meio, título e um texto curto.",
    categoria: "Redes sociais",
    tamanho: STORY,
    fundo: "@1",
    paleta: ["#6c4cff", "#ffffff", "#ffd23f"],
    camadas: [
      { tipo: "forma", forma: forma("elipse", "@3"), caixa: { cx: 0.5, cy: 0.4, largura: 0.82, altura: 0.82 * (1080 / 1920) } },
      { tipo: "foto", vaga: "foto", rotulo: "Foto", caixa: { cx: 0.5, cy: 0.4, largura: 0.74, altura: 0.74 * (1080 / 1920) }, cantos: { raio: 0.5, borda: 0, cor: "#ffffff" } },
      { tipo: "texto", campo: "titulo", rotulo: "Título", padrao: "Chegou!", estilo: "titulo", ajustes: { tamanho: 0.13, cor: "@2" }, x: 0, y: 0.2 },
      { tipo: "texto", campo: "texto", rotulo: "Texto", padrao: "A nova coleção\njá está na loja", estilo: "simples", ajustes: { tamanho: 0.055, cor: "@2", negrito: true }, x: 0, y: 0.3 },
    ],
  },
  {
    id: "img-pergunta",
    nome: "Caixa de pergunta",
    descricao: "Um balão com a pergunta e a seta para responder.",
    categoria: "Redes sociais",
    tamanho: STORY,
    fundo: "@1",
    paleta: ["#ff8a3d", "#1d1d1f", "#ffffff"],
    camadas: [
      { tipo: "forma", forma: forma("balao", "@3", { proporcao: 1.3 }), caixa: { cx: 0.5, cy: 0.4, largura: 0.86, altura: 0.86 * (1080 / 1920) / 1.3 } },
      { tipo: "texto", campo: "pergunta", rotulo: "Pergunta", padrao: "Qual vídeo\nvocês querem\nna semana\nque vem?", estilo: "titulo", ajustes: { tamanho: 0.075, cor: "@2", sombra: 0 }, x: 0, y: -0.12 },
      { tipo: "forma", forma: forma("seta", "@2", { proporcao: 2.2 }), caixa: { cx: 0.5, cy: 0.76, largura: 0.3, altura: 0.3 * (1080 / 1920) / 2.2 }, rotacao: 90 },
      { tipo: "texto", campo: "rodape", rotulo: "Rodapé", padrao: "Responde aqui embaixo", estilo: "simples", ajustes: { tamanho: 0.05, cor: "@2", negrito: true, sombra: 0 }, x: 0, y: 0.36 },
    ],
  },
  {
    id: "img-capa",
    nome: "Capa de vídeo",
    descricao: "Foto cheia, título grande com contorno e uma seta.",
    categoria: "Vídeo",
    destaque: true,
    tamanho: CAPA,
    fundo: "#000000",
    paleta: ["#ffd23f", "#ff3d3d"],
    camadas: [
      { tipo: "foto", vaga: "fundo", rotulo: "Foto", caixa: tela() },
      { tipo: "forma", forma: forma("retangulo", "#000000"), caixa: { cx: 0.25, cy: 0.5, largura: 0.5, altura: 1 }, opacidade: 0.55 },
      { tipo: "texto", campo: "titulo", rotulo: "Título", padrao: "Fiz isso\nem 7 dias", estilo: "contorno", ajustes: { tamanho: 0.16, cor: "@1", contorno_cor: "#000000" }, x: -0.24, y: -0.05 },
      { tipo: "forma", forma: forma("seta", "@2", { proporcao: 2.2, contorno: 0.04, contorno_cor: "#ffffff" }), caixa: { cx: 0.62, cy: 0.72, largura: 0.2, altura: (0.2 * (1280 / 720)) / 2.2 }, rotacao: -20 },
    ],
  },
  {
    id: "img-banner",
    nome: "Banner da loja",
    descricao: "Banner largo com a foto à direita e o texto à esquerda.",
    categoria: "Vendas",
    tamanho: BANNER,
    fundo: "@1",
    paleta: ["#0f3d3e", "#ffffff", "#f2c14e"],
    camadas: [
      { tipo: "foto", vaga: "foto", rotulo: "Foto", caixa: { cx: 0.79, cy: 0.5, largura: 0.42, altura: 1 } },
      { tipo: "forma", forma: forma("triangulo", "@1"), caixa: { cx: 0.6, cy: 0.5, largura: 0.12, altura: 0.36 * 3 }, rotacao: 90 },
      { tipo: "texto", campo: "titulo", rotulo: "Título", padrao: "Coleção\nde verão", estilo: "titulo", ajustes: { tamanho: 0.15, cor: "@2", sombra: 0, alinhamento: "esquerda" }, x: -0.22, y: -0.1 },
      { tipo: "texto", campo: "texto", rotulo: "Texto", padrao: "Frete grátis na primeira compra", estilo: "simples", ajustes: { tamanho: 0.075, cor: "@3", negrito: true, sombra: 0, alinhamento: "esquerda" }, x: -0.2, y: 0.27 },
    ],
  },
  {
    id: "img-depoimento",
    nome: "Depoimento de cliente",
    descricao: "Foto redonda, cinco estrelas, o que a pessoa disse e o nome.",
    categoria: "Negócios",
    tamanho: QUADRADO,
    fundo: "#ffffff",
    paleta: ["#ffb400", "#1d1d1f", "#6b6f78"],
    camadas: [
      { tipo: "foto", vaga: "cliente", rotulo: "Foto do cliente", caixa: { cx: 0.5, cy: 0.2, largura: 0.24, altura: 0.24 }, cantos: { raio: 0.5, borda: 0.04, cor: "@1" } },
      ...[0.34, 0.42, 0.5, 0.58, 0.66].map((cx) => ({ tipo: "forma" as const, forma: forma("estrela", "@1"), caixa: { cx, cy: 0.39, largura: 0.07, altura: 0.07 } })),
      {
        tipo: "texto",
        campo: "depoimento",
        rotulo: "Depoimento",
        padrao: "“O atendimento foi\nrápido e o resultado\nficou perfeito.”",
        estilo: "simples",
        ajustes: { tamanho: 0.055, cor: "@2", sombra: 0, negrito: true },
        x: 0,
        y: 0.12,
      },
      { tipo: "texto", campo: "nome", rotulo: "Nome", padrao: "Mariana, cliente", estilo: "simples", ajustes: { tamanho: 0.04, cor: "@3", sombra: 0 }, x: 0, y: 0.33 },
    ],
  },
  {
    id: "img-dicas",
    nome: "Capa de dicas",
    descricao: "A primeira imagem de um carrossel de dicas.",
    categoria: "Educação",
    tamanho: RETRATO,
    fundo: "@1",
    paleta: ["#14213d", "#fca311", "#ffffff"],
    camadas: [
      { tipo: "texto", campo: "numero", rotulo: "Número", padrao: "3", estilo: "titulo", ajustes: { tamanho: 0.3, cor: "@2", sombra: 0 }, x: -0.25, y: -0.24 },
      { tipo: "texto", campo: "titulo", rotulo: "Título", padrao: "Dicas para\nvender mais\npelo celular", estilo: "titulo", ajustes: { tamanho: 0.085, cor: "@3", sombra: 0, alinhamento: "esquerda" }, x: -0.07, y: 0.12 },
      { tipo: "forma", forma: forma("seta", "@2", { proporcao: 2.2 }), caixa: { cx: 0.8, cy: 0.88, largura: 0.18, altura: (0.18 * (1080 / 1350)) / 2.2 } },
      { tipo: "texto", campo: "rodape", rotulo: "Rodapé", padrao: "Arraste para o lado", estilo: "simples", ajustes: { tamanho: 0.04, cor: "@3", sombra: 0 }, x: -0.12, y: 0.38 },
    ],
  },
  {
    id: "img-aniversario",
    nome: "Feliz aniversário",
    descricao: "Foto inclinada com borda branca, corações e o nome.",
    categoria: "Datas",
    tamanho: RETRATO,
    fundo: "@1",
    paleta: ["#ffd6e0", "#e63973", "#ffffff"],
    camadas: [
      { tipo: "foto", vaga: "foto", rotulo: "Foto", caixa: { cx: 0.5, cy: 0.4, largura: 0.7, altura: 0.56 }, cantos: { raio: 0.03, borda: 0.04, cor: "@3" }, rotacao: -4 },
      { tipo: "forma", forma: forma("coracao", "@2"), caixa: { cx: 0.16, cy: 0.12, largura: 0.12, altura: 0.12 * 0.8 }, rotacao: -15 },
      { tipo: "forma", forma: forma("coracao", "@2"), caixa: { cx: 0.86, cy: 0.66, largura: 0.09, altura: 0.09 * 0.8 }, rotacao: 12 },
      { tipo: "texto", campo: "titulo", rotulo: "Título", padrao: "Feliz aniversário,", estilo: "manuscrito", ajustes: { tamanho: 0.085, cor: "@2", sombra: 0 }, x: 0, y: 0.25 },
      { tipo: "texto", campo: "nome", rotulo: "Nome", padrao: "Ana!", estilo: "titulo", ajustes: { tamanho: 0.12, cor: "@2", sombra: 0 }, x: 0, y: 0.36 },
    ],
  },
  {
    id: "img-vaga",
    nome: "Estamos contratando",
    descricao: "Anúncio de vaga com o cargo e como se candidatar.",
    categoria: "Negócios",
    tamanho: QUADRADO,
    fundo: "@1",
    paleta: ["#0b6e4f", "#ffffff", "#c6f68d"],
    camadas: [
      { tipo: "forma", forma: forma("arredondado", null, { contorno: 0.012, contorno_cor: "#ffffff", proporcao: 0.9 }), caixa: { cx: 0.5, cy: 0.5, largura: 0.84, altura: 0.84 / 0.9 * 1 } },
      { tipo: "texto", campo: "chamada", rotulo: "Chamada", padrao: "Estamos\ncontratando", estilo: "titulo", ajustes: { tamanho: 0.08, cor: "@3", sombra: 0 }, x: 0, y: -0.2 },
      { tipo: "texto", campo: "cargo", rotulo: "Cargo", padrao: "Editor de vídeo", estilo: "destaque", ajustes: { tamanho: 0.065, cor: "@1", fundo_cor: "@2", fundo_opacidade: 1 }, x: 0, y: 0.03 },
      { tipo: "texto", campo: "como", rotulo: "Como se candidatar", padrao: "Mande seu portfólio\npor mensagem", estilo: "simples", ajustes: { tamanho: 0.045, cor: "@2", sombra: 0 }, x: 0, y: 0.22 },
    ],
  },
  {
    id: "img-antes-depois",
    nome: "Antes e depois",
    descricao: "Duas fotos, uma em cima da outra, com as etiquetas.",
    categoria: "Negócios",
    tamanho: RETRATO,
    fundo: "#ffffff",
    paleta: ["#151517", "#ffffff"],
    camadas: [
      { tipo: "foto", vaga: "antes", rotulo: "Foto de antes", caixa: { cx: 0.5, cy: 0.25, largura: 1, altura: 0.495 } },
      { tipo: "foto", vaga: "depois", rotulo: "Foto de depois", caixa: { cx: 0.5, cy: 0.75, largura: 1, altura: 0.495 } },
      { tipo: "texto", campo: "antes", rotulo: "Etiqueta de cima", padrao: "Antes", estilo: "destaque", ajustes: { tamanho: 0.05, cor: "@2", fundo_cor: "@1", fundo_opacidade: 1, caixa_alta: true }, x: -0.36, y: -0.05 },
      { tipo: "texto", campo: "depois", rotulo: "Etiqueta de baixo", padrao: "Depois", estilo: "destaque", ajustes: { tamanho: 0.05, cor: "@2", fundo_cor: "@1", fundo_opacidade: 1, caixa_alta: true }, x: -0.35, y: 0.45 },
    ],
  },
  {
    id: "img-aviso",
    nome: "Aviso importante",
    descricao: "Fundo escuro, faixa de cor e um aviso curto.",
    categoria: "Negócios",
    tamanho: STORY,
    fundo: "@2",
    paleta: ["#ffcc00", "#151517", "#ffffff"],
    camadas: [
      { tipo: "forma", forma: forma("retangulo", "@1"), caixa: { cx: 0.5, cy: 0.33, largura: 1, altura: 0.012 } },
      { tipo: "texto", campo: "titulo", rotulo: "Título", padrao: "Aviso", estilo: "titulo", ajustes: { tamanho: 0.14, cor: "@1", sombra: 0 }, x: 0, y: -0.24 },
      {
        tipo: "texto",
        campo: "texto",
        rotulo: "Aviso",
        padrao: "Nesta sexta a loja\nabre só às 14h.\nObrigado pela\ncompreensão!",
        estilo: "simples",
        ajustes: { tamanho: 0.06, cor: "@3", sombra: 0, negrito: true },
        x: 0,
        y: 0,
      },
      { tipo: "forma", forma: forma("retangulo", "@1"), caixa: { cx: 0.5, cy: 0.67, largura: 1, altura: 0.012 } },
    ],
  },
];

export function modeloDeImagem(id: string): ModeloDeImagem | undefined {
  return MODELOS_DE_IMAGEM.find((modelo) => modelo.id === id);
}

/** As vagas de foto do modelo, na ordem das camadas. */
export function vagasDoModelo(modelo: ModeloDeImagem): { vaga: string; rotulo: string }[] {
  return modelo.camadas.flatMap((camada) => (camada.tipo === "foto" ? [{ vaga: camada.vaga, rotulo: camada.rotulo }] : []));
}

/** Os campos de texto do modelo. */
export function camposDoModelo(modelo: ModeloDeImagem): { campo: string; rotulo: string; padrao: string }[] {
  return modelo.camadas.flatMap((camada) => (camada.tipo === "texto" ? [{ campo: camada.campo, rotulo: camada.rotulo, padrao: camada.padrao }] : []));
}

/** A proporção (largura sobre altura) da caixa, em pixels do quadro. */
function proporcaoDaCaixa(caixa: CaixaNoQuadro, quadro: Tamanho): number {
  return (caixa.largura * quadro.largura) / (caixa.altura * quadro.altura);
}

/** A proporção que a API desenha (de 0,05 a 20), com três casas; uma faixa mais fina é cortada pela caixa. */
function limitarProporcao(proporcao: number): number {
  return Math.min(20, Math.max(0.05, Math.round(proporcao * 1000) / 1000));
}

/**
 * As formas que o modelo pede, cada uma com uma chave: as do desenho e o lugar das fotos que não foram escolhidas.
 * As que esticam (retângulo, elipse, seta...) pedem a proporção da caixa.
 */
export function pedidosDoModelo(modelo: ModeloDeImagem, cores: string[], fotos: ReadonlySet<string>): { chave: string; forma: PedidoDeForma }[] {
  const cor = (valor: string) => resolverCor(valor, cores, modelo.paleta);
  return modelo.camadas.flatMap((camada, i) => {
    if (camada.tipo === "forma") {
      const pedido = camada.forma;
      const estica = !["triangulo", "estrela", "coracao"].includes(pedido.tipo);
      return [
        {
          chave: `forma-${i}`,
          forma: {
            ...pedido,
            cor: pedido.cor ? cor(pedido.cor) : null,
            contorno_cor: cor(pedido.contorno_cor),
            proporcao: estica ? limitarProporcao(pedido.proporcao ?? proporcaoDaCaixa(camada.caixa, modelo.tamanho)) : null,
          },
        },
      ];
    }
    if (camada.tipo === "foto" && !fotos.has(camada.vaga)) {
      const proporcao = limitarProporcao(proporcaoDaCaixa(camada.caixa, modelo.tamanho));
      return [{ chave: `vaga-${camada.vaga}`, forma: { tipo: "retangulo", cor: COR_DA_VAGA, contorno_cor: "#000000", contorno: 0, proporcao } }];
    }
    return [];
  });
}

/**
 * O recorte e a transformação que fazem uma mídia de `midia` pixels cobrir a caixa (cortando o que sobra, no
 * meio) ou caber nela inteira. A conta é a inversa de caixaDoClipe.
 */
export function encaixarNaCaixa(midia: Tamanho, caixa: CaixaNoQuadro, quadro: Tamanho, modo: "cobrir" | "caber"): { transformacao: Transformacao; recorte: Recorte } {
  const larguraDaCaixa = caixa.largura * quadro.largura;
  const alturaDaCaixa = caixa.altura * quadro.altura;
  const alvo = larguraDaCaixa / alturaDaCaixa;
  const propria = midia.largura / midia.altura;
  let recorte: Recorte = { ...RECORTE_PADRAO };
  if (modo === "cobrir" && Math.abs(propria - alvo) > 1e-6) {
    recorte = propria > alvo ? { x: (1 - alvo / propria) / 2, y: 0, largura: alvo / propria, altura: 1 } : { x: 0, y: (1 - propria / alvo) / 2, largura: 1, altura: propria / alvo };
  }
  const largura = midia.largura * recorte.largura;
  const altura = midia.altura * recorte.altura;
  const encaixe = Math.min(quadro.largura / largura, quadro.altura / altura);
  // Cobrindo, a mídia recortada tem a proporção da caixa; cabendo, o lado que encosta manda
  const escala = Math.min(larguraDaCaixa / (largura * encaixe), alturaDaCaixa / (altura * encaixe));
  return { transformacao: { ...TRANSFORMACAO_PADRAO, x: caixa.cx - 0.5, y: caixa.cy - 0.5, escala }, recorte };
}

/** Uma camada pronta para o comando imagem.aplicarModelo (de baixo para cima). */
export type CamadaPronta =
  | { tipo: "midia"; midiaId: string; transformacao: Transformacao; recorte: Recorte; cantos: Cantos | null; filtro: string | null }
  | { tipo: "texto"; texto: Texto; transformacao: Transformacao };

/** A mídia de cada chave: as fotos pela vaga, as formas pela chave de `pedidosDoModelo`. */
export type MidiasDoModelo = Record<string, { id: string; largura: number; altura: number }>;

/**
 * As camadas do modelo para um quadro do tamanho do modelo. `textos` troca o padrão de cada campo; as fotos
 * escolhidas vêm em `midias` pela vaga, e o que falta (a forma ou o lugar da foto), pela chave do pedido.
 * Uma camada cuja mídia não veio fica de fora.
 */
export function camadasDoModelo(modelo: ModeloDeImagem, cores: string[], midias: MidiasDoModelo, textos: Record<string, string> = {}): CamadaPronta[] {
  const cor = (valor: string) => resolverCor(valor, cores, modelo.paleta);
  const quadro = modelo.tamanho;
  return modelo.camadas.flatMap<CamadaPronta>((camada, i) => {
    if (camada.tipo === "texto") {
      const estilo = ESTILOS_DE_TEXTO.find((item) => item.id === camada.estilo)?.texto ?? TEXTO_PADRAO;
      const ajustes = { ...camada.ajustes };
      for (const chave of ["cor", "contorno_cor", "fundo_cor", "brilho_cor"] as const) {
        const valor = ajustes[chave];
        if (typeof valor === "string") ajustes[chave] = cor(valor);
      }
      const conteudo = (textos[camada.campo] ?? "").trim() || camada.padrao;
      return [{ tipo: "texto", texto: { ...estilo, ...ajustes, conteudo }, transformacao: { ...TRANSFORMACAO_PADRAO, x: camada.x, y: camada.y, rotacao: camada.rotacao ?? 0 } }];
    }
    const midia = camada.tipo === "foto" ? (midias[camada.vaga] ?? midias[`vaga-${camada.vaga}`]) : midias[`forma-${i}`];
    if (!midia) return [];
    const ehFoto = camada.tipo === "foto";
    const estica = camada.tipo === "forma" && !["triangulo", "estrela", "coracao"].includes(camada.forma.tipo);
    const { transformacao, recorte } = encaixarNaCaixa(midia, camada.caixa, quadro, ehFoto || estica ? "cobrir" : "caber");
    return [
      {
        tipo: "midia",
        midiaId: midia.id,
        transformacao: { ...transformacao, rotacao: camada.rotacao ?? 0, opacidade: camada.tipo === "forma" ? (camada.opacidade ?? 1) : 1 },
        recorte,
        cantos: camada.tipo === "foto" && camada.cantos ? { ...camada.cantos, cor: cor(camada.cantos.cor) } : null,
        filtro: camada.tipo === "foto" ? (camada.filtro ?? null) : null,
      },
    ];
  });
}

/** O fundo do modelo, com as cores resolvidas. */
export function fundoDoModelo(modelo: ModeloDeImagem, cores: string[]): string {
  return resolverCor(modelo.fundo, cores, modelo.paleta);
}
