// O catálogo dos filtros do editor de imagem (ADR 0003, onda 13.11): cada filtro com o grupo do menu Filtro, as opções
// (que a janela genérica desenha, com os padrões de lá) e a conta. As medidas das opções ficam em pixels do documento;
// a conta recebe a escala da imagem (a prévia com zoom) e multiplica. `margem` diz quanto o resultado pode passar da
// camada (em pixels do documento), para a área desenhada crescer antes do filtro.
import type { ContextoDoFiltro, ImagemDoFiltro } from "./comum.ts";
import { hexParaRgb } from "./comum.ts";
import { caixa, desfoques, forma, gaussiano, movimento, preservandoBordas, radial } from "./desfoque.ts";
import {
  adicionarRuido,
  altaFrequencia,
  corParaAlfa,
  deslocar,
  hsbHsl,
  mascaraDeNitidez,
  maximoMinimo,
  mediana,
  nitidez,
  nitidezInteligente,
  nitidezNasBordas,
  personalizado,
  poeiraERiscos,
  reduzirRuido,
  removerManchas,
  borrar,
} from "./nitidezRuido.ts";

export type ValorDaOpcao = number | boolean | string;
export type Valores = Record<string, ValorDaOpcao>;
export type Opcao =
  | { id: string; nome: string; tipo: "numero"; minimo: number; maximo: number; passo?: number; padrao: number; sufixo?: string }
  | { id: string; nome: string; tipo: "escolha"; opcoes: { id: string; nome: string }[]; padrao: string }
  | { id: string; nome: string; tipo: "marcar"; padrao: boolean }
  | { id: string; nome: string; tipo: "cor"; padrao: string }
  | { id: string; nome: string; tipo: "matriz"; padrao: string };

export type GrupoDoFiltro = "desfoque" | "distorcao" | "ruido" | "pixelizacao" | "renderizacao" | "nitidez" | "estilizacao" | "video" | "outros";
export const GRUPOS_DE_FILTROS: { id: GrupoDoFiltro; nome: string }[] = [
  { id: "desfoque", nome: "Desfoque" },
  { id: "distorcao", nome: "Distorção" },
  { id: "ruido", nome: "Ruído" },
  { id: "pixelizacao", nome: "Pixelização" },
  { id: "renderizacao", nome: "Renderização" },
  { id: "nitidez", nome: "Nitidez" },
  { id: "estilizacao", nome: "Estilização" },
  { id: "video", nome: "Vídeo" },
  { id: "outros", nome: "Outros" },
];

export type DefinicaoDoFiltro = {
  id: string;
  nome: string;
  grupo: GrupoDoFiltro;
  opcoes: Opcao[];
  /** Sem opções: aplica direto, sem janela (como o Desfoque e o Tornar nítido de lá). */
  semJanela?: boolean;
  margem?: (v: Valores) => number;
  aplicar: (imagem: ImagemDoFiltro, v: Valores, ctx: ContextoDoFiltro) => ImagemDoFiltro;
};

const numero = (id: string, nome: string, minimo: number, maximo: number, padrao: number, sufixo = "", passo?: number): Opcao => ({ id, nome, tipo: "numero", minimo, maximo, padrao, sufixo, passo });
const escolha = (id: string, nome: string, opcoes: [string, string][], padrao?: string): Opcao => ({ id, nome, tipo: "escolha", opcoes: opcoes.map(([valor, rotulo]) => ({ id: valor, nome: rotulo })), padrao: padrao ?? opcoes[0][0] });
const marcar = (id: string, nome: string, padrao = false): Opcao => ({ id, nome, tipo: "marcar", padrao });
const n = (v: Valores, id: string) => Number(v[id]);
const s = (v: Valores, id: string) => String(v[id]);
/** Um ponto do documento (em %) na imagem do filtro. */
const noFiltro = (v: Valores, ctx: ContextoDoFiltro, x: string, y: string) => ({
  x: ((n(v, x) / 100) * ctx.documento.largura - ctx.origem.x) * ctx.escala,
  y: ((n(v, y) / 100) * ctx.documento.altura - ctx.origem.y) * ctx.escala,
});

const PADRAO_DA_MATRIZ = "0,0,0,0,0,0,0,-1,0,0,0,-1,5,-1,0,0,0,-1,0,0,0,0,0,0,0";

export const FILTROS: DefinicaoDoFiltro[] = [
  // ——— Desfoque ———
  { id: "media", nome: "Média", grupo: "desfoque", opcoes: [], semJanela: true, aplicar: (imagem) => desfoques.media(imagem) },
  { id: "desfoque", nome: "Desfoque", grupo: "desfoque", opcoes: [], semJanela: true, margem: () => 3, aplicar: (imagem, v, ctx) => desfoques.desfoque(imagem, v, ctx) },
  { id: "mais_desfoque", nome: "Mais desfoque", grupo: "desfoque", opcoes: [], semJanela: true, margem: () => 5, aplicar: (imagem, v, ctx) => desfoques.mais_desfoque(imagem, v, ctx) },
  { id: "caixa", nome: "Desfoque de caixa", grupo: "desfoque", opcoes: [numero("raio", "Raio", 1, 2000, 10, "px")], margem: (v) => n(v, "raio"), aplicar: (imagem, v, ctx) => caixa(imagem, n(v, "raio") * ctx.escala) },
  { id: "gaussiano", nome: "Desfoque gaussiano", grupo: "desfoque", opcoes: [numero("raio", "Raio", 0.1, 1000, 3, "px", 0.1)], margem: (v) => 3 * n(v, "raio"), aplicar: (imagem, v, ctx) => gaussiano(imagem, n(v, "raio") * ctx.escala) },
  {
    id: "movimento",
    nome: "Desfoque de movimento",
    grupo: "desfoque",
    opcoes: [numero("angulo", "Ângulo", -90, 90, 0, "°"), numero("distancia", "Distância", 1, 2000, 10, "px")],
    margem: (v) => n(v, "distancia") / 2,
    aplicar: (imagem, v, ctx) => movimento(imagem, n(v, "angulo"), n(v, "distancia") * ctx.escala),
  },
  {
    id: "radial",
    nome: "Desfoque radial",
    grupo: "desfoque",
    opcoes: [numero("quantidade", "Quantidade", 1, 100, 10), escolha("metodo", "Método", [["giro", "Giro"], ["zoom", "Zoom"]]), numero("centro_x", "Centro (horizontal)", 0, 100, 50, "%"), numero("centro_y", "Centro (vertical)", 0, 100, 50, "%")],
    aplicar: (imagem, v, ctx) => radial(imagem, n(v, "quantidade"), s(v, "metodo"), noFiltro(v, ctx, "centro_x", "centro_y")),
  },
  {
    id: "forma",
    nome: "Desfoque de forma",
    grupo: "desfoque",
    opcoes: [numero("raio", "Raio", 1, 200, 20, "px"), escolha("forma", "Forma", [["circulo", "Círculo"], ["estrela", "Estrela"], ["coracao", "Coração"], ["hexagono", "Hexágono"], ["losango", "Losango"], ["quadrado", "Quadrado"]])],
    margem: (v) => n(v, "raio"),
    aplicar: (imagem, v, ctx) => forma(imagem, n(v, "raio") * ctx.escala, s(v, "forma")),
  },
  {
    id: "inteligente",
    nome: "Desfoque inteligente",
    grupo: "desfoque",
    opcoes: [numero("raio", "Raio", 0.1, 100, 3, "px", 0.1), numero("limiar", "Limiar", 0.1, 100, 25, "", 0.1), escolha("modo", "Modo", [["normal", "Normal"], ["bordas", "Só as bordas"], ["sobrepor", "Bordas sobrepostas"]])],
    aplicar: (imagem, v, ctx) => preservandoBordas(imagem, n(v, "raio") * ctx.escala, n(v, "limiar") / 255, "inteligente", s(v, "modo")),
  },
  {
    id: "superficie",
    nome: "Desfoque de superfície",
    grupo: "desfoque",
    opcoes: [numero("raio", "Raio", 2, 100, 5, "px"), numero("limiar", "Limiar", 2, 255, 15, "níveis")],
    aplicar: (imagem, v, ctx) => preservandoBordas(imagem, n(v, "raio") * ctx.escala, n(v, "limiar") / 255, "superficie"),
  },
  // ——— Nitidez ———
  { id: "tornar_nitido", nome: "Tornar nítido", grupo: "nitidez", opcoes: [], semJanela: true, aplicar: (imagem, _v, ctx) => nitidez(imagem, 0.6, Math.max(0.5, 0.6 * ctx.escala)) },
  { id: "mais_nitido", nome: "Mais nítido", grupo: "nitidez", opcoes: [], semJanela: true, aplicar: (imagem, _v, ctx) => nitidez(imagem, 1.4, Math.max(0.5, 0.6 * ctx.escala)) },
  { id: "nitidez_bordas", nome: "Nitidez nas bordas", grupo: "nitidez", opcoes: [], semJanela: true, aplicar: (imagem, _v, ctx) => nitidezNasBordas(imagem, ctx.escala) },
  {
    id: "mascara_de_nitidez",
    nome: "Máscara de nitidez",
    grupo: "nitidez",
    opcoes: [numero("quantidade", "Quantidade", 1, 500, 100, "%"), numero("raio", "Raio", 0.1, 1000, 1, "px", 0.1), numero("limiar", "Limiar", 0, 255, 0, "níveis")],
    aplicar: (imagem, v, ctx) => mascaraDeNitidez(imagem, n(v, "quantidade") / 100, borrar(imagem, Math.max(0.1, n(v, "raio") * ctx.escala)), n(v, "limiar")),
  },
  {
    id: "nitidez_inteligente",
    nome: "Nitidez inteligente",
    grupo: "nitidez",
    opcoes: [numero("quantidade", "Quantidade", 1, 500, 200, "%"), numero("raio", "Raio", 0.1, 64, 1, "px", 0.1), numero("ruido", "Reduzir o ruído", 0, 100, 10, "%"), escolha("remover", "Remover", [["lente", "Desfoque de lente"], ["gaussiano", "Desfoque gaussiano"], ["movimento", "Desfoque de movimento"]]), numero("angulo", "Ângulo", -180, 180, 0, "°")],
    aplicar: (imagem, v, ctx) => nitidezInteligente(imagem, n(v, "quantidade") / 100, n(v, "raio") * ctx.escala, n(v, "ruido"), s(v, "remover"), n(v, "angulo")),
  },
  // ——— Ruído ———
  {
    id: "adicionar_ruido",
    nome: "Adicionar ruído",
    grupo: "ruido",
    opcoes: [numero("quantidade", "Quantidade", 0.1, 400, 12.5, "%", 0.1), escolha("distribuicao", "Distribuição", [["gaussiana", "Gaussiana"], ["uniforme", "Uniforme"]]), marcar("monocromatico", "Monocromático")],
    aplicar: (imagem, v, ctx) => adicionarRuido(imagem, n(v, "quantidade"), s(v, "distribuicao"), Boolean(v.monocromatico), ctx),
  },
  { id: "remover_manchas", nome: "Remover manchas", grupo: "ruido", opcoes: [], semJanela: true, aplicar: (imagem, _v, ctx) => removerManchas(imagem, ctx.escala) },
  {
    id: "poeira_e_riscos",
    nome: "Poeira e riscos",
    grupo: "ruido",
    opcoes: [numero("raio", "Raio", 1, 50, 1, "px"), numero("limiar", "Limiar", 0, 255, 0, "níveis")],
    aplicar: (imagem, v, ctx) => poeiraERiscos(imagem, n(v, "raio") * ctx.escala, n(v, "limiar")),
  },
  { id: "mediana", nome: "Mediana", grupo: "ruido", opcoes: [numero("raio", "Raio", 1, 100, 1, "px")], aplicar: (imagem, v, ctx) => mediana(imagem, n(v, "raio") * ctx.escala) },
  {
    id: "reduzir_ruido",
    nome: "Reduzir ruído",
    grupo: "ruido",
    opcoes: [numero("forca", "Força", 0, 10, 6), numero("preservar", "Preservar os detalhes", 0, 100, 60, "%"), numero("cor", "Reduzir o ruído da cor", 0, 100, 45, "%"), numero("nitidez", "Tornar os detalhes nítidos", 0, 100, 25, "%")],
    aplicar: (imagem, v, ctx) => reduzirRuido(imagem, n(v, "forca"), n(v, "preservar"), n(v, "cor"), n(v, "nitidez"), ctx.escala),
  },
  // ——— Outros ———
  {
    id: "personalizado",
    nome: "Personalizado",
    grupo: "outros",
    opcoes: [{ id: "matriz", nome: "Matriz", tipo: "matriz", padrao: PADRAO_DA_MATRIZ }, numero("escala", "Escala", 1, 9999, 1), numero("deslocamento", "Deslocamento", -9999, 9999, 0)],
    aplicar: (imagem, v) =>
      personalizado(
        imagem,
        s(v, "matriz")
          .split(",")
          .map((x) => Number(x) || 0)
          .concat(Array(25).fill(0))
          .slice(0, 25),
        n(v, "escala"),
        n(v, "deslocamento"),
      ),
  },
  {
    id: "hsb_hsl",
    nome: "HSB/HSL",
    grupo: "outros",
    opcoes: [escolha("entrada", "Modo de entrada", [["rgb", "RGB"], ["hsb", "HSB"], ["hsl", "HSL"]]), escolha("saida", "Ordem das linhas", [["hsb", "HSB"], ["hsl", "HSL"], ["rgb", "RGB"]])],
    aplicar: (imagem, v) => hsbHsl(imagem, s(v, "entrada"), s(v, "saida")),
  },
  { id: "alta_frequencia", nome: "Alta frequência", grupo: "outros", opcoes: [numero("raio", "Raio", 0.1, 1000, 10, "px", 0.1)], margem: (v) => 3 * n(v, "raio"), aplicar: (imagem, v, ctx) => altaFrequencia(imagem, n(v, "raio") * ctx.escala) },
  {
    id: "maximo",
    nome: "Máximo",
    grupo: "outros",
    opcoes: [numero("raio", "Raio", 0.2, 500, 1, "px", 0.1), escolha("preservar", "Preservar", [["quadratura", "Quadratura"], ["redondeza", "Redondeza"]])],
    margem: (v) => n(v, "raio"),
    aplicar: (imagem, v, ctx) => maximoMinimo(imagem, n(v, "raio") * ctx.escala, true, s(v, "preservar") === "redondeza"),
  },
  {
    id: "minimo",
    nome: "Mínimo",
    grupo: "outros",
    opcoes: [numero("raio", "Raio", 0.2, 500, 1, "px", 0.1), escolha("preservar", "Preservar", [["quadratura", "Quadratura"], ["redondeza", "Redondeza"]])],
    aplicar: (imagem, v, ctx) => maximoMinimo(imagem, n(v, "raio") * ctx.escala, false, s(v, "preservar") === "redondeza"),
  },
  {
    id: "deslocamento",
    nome: "Deslocamento",
    grupo: "outros",
    opcoes: [numero("horizontal", "Horizontal", -30000, 30000, 0, "px"), numero("vertical", "Vertical", -30000, 30000, 0, "px"), escolha("sobra", "Área que sobra", [["transparente", "Transparente"], ["repetir", "Repetir os pixels da borda"], ["volta", "Dar a volta"]])],
    aplicar: (imagem, v, ctx) => deslocar(imagem, n(v, "horizontal") * ctx.escala, n(v, "vertical") * ctx.escala, s(v, "sobra")),
  },
  { id: "cor_para_alfa", nome: "Cor para alfa", grupo: "outros", opcoes: [{ id: "cor", nome: "Cor", tipo: "cor", padrao: "#ffffff" }], aplicar: (imagem, v) => corParaAlfa(imagem, hexParaRgb(s(v, "cor"))) },
];

export const FILTRO_POR_ID = new Map(FILTROS.map((filtro) => [filtro.id, filtro]));

/** As opções completas: as que vieram, e o padrão nas que faltam (um projeto antigo, uma opção nova). */
export function valoresDoFiltro(definicao: DefinicaoDoFiltro, v: Valores = {}): Valores {
  const saida: Valores = {};
  for (const opcao of definicao.opcoes) {
    const dado = v[opcao.id];
    if (opcao.tipo === "numero") saida[opcao.id] = typeof dado === "number" && Number.isFinite(dado) ? Math.min(opcao.maximo, Math.max(opcao.minimo, dado)) : opcao.padrao;
    else if (opcao.tipo === "marcar") saida[opcao.id] = typeof dado === "boolean" ? dado : opcao.padrao;
    else if (opcao.tipo === "escolha") saida[opcao.id] = typeof dado === "string" && opcao.opcoes.some((item) => item.id === dado) ? dado : opcao.padrao;
    else saida[opcao.id] = typeof dado === "string" ? dado : opcao.padrao;
  }
  return saida;
}
