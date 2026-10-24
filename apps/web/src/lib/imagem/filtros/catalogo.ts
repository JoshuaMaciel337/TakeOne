// O catálogo dos filtros do editor de imagem (ADR 0003, onda 13.11): cada filtro com o grupo do menu Filtro, as opções
// (que a janela genérica desenha, com os padrões de lá) e a conta. As medidas das opções ficam em pixels do documento;
// a conta recebe a escala da imagem (a prévia com zoom) e multiplica. `margem` diz quanto o resultado pode passar da
// camada (em pixels do documento), para a área desenhada crescer antes do filtro.
import type { ContextoDoFiltro, ImagemDoFiltro } from "./comum.ts";
import { hexParaRgb } from "./comum.ts";
import { caixa, desfoques, forma, gaussiano, movimento, preservandoBordas, radial } from "./desfoque.ts";
import { cisalhamento, coordenadasPolares, deslocamentoPorMapa, esfera, onda, ondulacao, pincar, redemoinho, type Sobra, ziguezague } from "./distorcao.ts";
import { coresNtsc, desentrelacar, difusao, encontrarBordas, entalhe, extrusao, ladrilhos, pinturaAOleo, solarizar, tracarContorno, vento } from "./estilizacao.ts";
import { cristalizar, fragmentar, kuwahara, meiaTinta, meioTomEmCores, mosaico, pontilhismo } from "./pixelizacao.ts";
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
  // ——— Distorção ———
  {
    id: "deslocamento_mapa",
    nome: "Deslocamento por mapa",
    grupo: "distorcao",
    opcoes: [numero("horizontal", "Escala horizontal", -999, 999, 10, "%"), numero("vertical", "Escala vertical", -999, 999, 10, "%"), escolha("mapa", "Mapa", [["propria", "A luz da própria camada"], ["nuvens", "Nuvens"]]), numero("tamanho", "Tamanho das nuvens", 4, 500, 50, "px"), escolha("sobra", "Área indefinida", [["volta", "Dar a volta"], ["repetir", "Repetir os pixels da borda"]])],
    margem: (v) => (Math.max(Math.abs(n(v, "horizontal")), Math.abs(n(v, "vertical"))) / 100) * 128,
    aplicar: (imagem, v, ctx) => deslocamentoPorMapa(imagem, n(v, "horizontal"), n(v, "vertical"), s(v, "mapa"), n(v, "tamanho"), s(v, "sobra") as Sobra, ctx),
  },
  { id: "pincar", nome: "Pinçar", grupo: "distorcao", opcoes: [numero("quantidade", "Quantidade", -100, 100, 50, "%")], aplicar: (imagem, v) => pincar(imagem, n(v, "quantidade")) },
  {
    id: "coordenadas_polares",
    nome: "Coordenadas polares",
    grupo: "distorcao",
    opcoes: [escolha("sentido", "Sentido", [["para_polar", "Retangular para polar"], ["para_retangular", "Polar para retangular"]])],
    aplicar: (imagem, v) => coordenadasPolares(imagem, s(v, "sentido")),
  },
  {
    id: "ondulacao",
    nome: "Ondulação",
    grupo: "distorcao",
    opcoes: [numero("quantidade", "Quantidade", -999, 999, 100, "%"), escolha("tamanho", "Tamanho", [["medio", "Médio"], ["pequeno", "Pequeno"], ["grande", "Grande"]])],
    margem: (v) => (Math.abs(n(v, "quantidade")) / 100) * 2,
    aplicar: (imagem, v, ctx) => ondulacao(imagem, n(v, "quantidade"), s(v, "tamanho"), ctx),
  },
  {
    id: "cisalhamento",
    nome: "Cisalhamento",
    grupo: "distorcao",
    opcoes: [numero("quantidade", "Quantidade", -100, 100, 30, "%"), escolha("forma", "Curva", [["arco", "Arco"], ["onda", "Onda"], ["s", "S"]]), escolha("sobra", "Área indefinida", [["volta", "Dar a volta"], ["repetir", "Repetir os pixels da borda"]])],
    aplicar: (imagem, v) => cisalhamento(imagem, n(v, "quantidade"), s(v, "forma"), s(v, "sobra") as Sobra),
  },
  {
    id: "esfera",
    nome: "Esfera",
    grupo: "distorcao",
    opcoes: [numero("quantidade", "Quantidade", -100, 100, 100, "%"), escolha("modo", "Modo", [["normal", "Normal"], ["horizontal", "Só na horizontal"], ["vertical", "Só na vertical"]])],
    aplicar: (imagem, v) => esfera(imagem, n(v, "quantidade"), s(v, "modo")),
  },
  { id: "redemoinho", nome: "Redemoinho", grupo: "distorcao", opcoes: [numero("angulo", "Ângulo", -999, 999, 50, "°")], aplicar: (imagem, v) => redemoinho(imagem, n(v, "angulo")) },
  {
    id: "onda",
    nome: "Onda",
    grupo: "distorcao",
    opcoes: [
      numero("geradores", "Geradores", 1, 20, 5),
      numero("comprimento_min", "Comprimento mínimo", 1, 998, 10, "px"),
      numero("comprimento_max", "Comprimento máximo", 2, 999, 120, "px"),
      numero("amplitude_min", "Amplitude mínima", 1, 998, 5, "px"),
      numero("amplitude_max", "Amplitude máxima", 1, 999, 35, "px"),
      numero("escala_h", "Escala horizontal", 1, 100, 100, "%"),
      numero("escala_v", "Escala vertical", 1, 100, 100, "%"),
      escolha("tipo", "Tipo", [["seno", "Seno"], ["triangulo", "Triângulo"], ["quadrado", "Quadrado"]]),
      numero("semente", "Aleatorizar", 0, 9999, 1),
      escolha("sobra", "Área indefinida", [["volta", "Dar a volta"], ["repetir", "Repetir os pixels da borda"]]),
    ],
    margem: (v) => n(v, "amplitude_max"),
    aplicar: (imagem, v, ctx) =>
      onda(
        imagem,
        {
          geradores: n(v, "geradores"),
          comprimentoMin: Math.min(n(v, "comprimento_min"), n(v, "comprimento_max")),
          comprimentoMax: Math.max(n(v, "comprimento_min"), n(v, "comprimento_max")),
          amplitudeMin: Math.min(n(v, "amplitude_min"), n(v, "amplitude_max")),
          amplitudeMax: Math.max(n(v, "amplitude_min"), n(v, "amplitude_max")),
          escalaH: n(v, "escala_h"),
          escalaV: n(v, "escala_v"),
          tipo: s(v, "tipo"),
          semente: n(v, "semente"),
          sobra: s(v, "sobra") as Sobra,
        },
        ctx,
      ),
  },
  {
    id: "ziguezague",
    nome: "Ziguezague",
    grupo: "distorcao",
    opcoes: [numero("quantidade", "Quantidade", -100, 100, 10), numero("cristas", "Cristas", 1, 20, 5), escolha("estilo", "Estilo", [["lagoa", "Ondulações de lagoa"], ["fora", "Para fora do centro"], ["volta", "Em volta do centro"]])],
    aplicar: (imagem, v) => ziguezague(imagem, n(v, "quantidade"), n(v, "cristas"), s(v, "estilo")),
  },
  // ——— Pixelização ———
  {
    id: "meio_tom_em_cores",
    nome: "Meio-tom em cores",
    grupo: "pixelizacao",
    opcoes: [numero("raio", "Raio máximo", 4, 127, 8, "px"), numero("canal1", "Ângulo do ciano", -360, 360, 108, "°"), numero("canal2", "Ângulo do magenta", -360, 360, 162, "°"), numero("canal3", "Ângulo do amarelo", -360, 360, 90, "°")],
    aplicar: (imagem, v, ctx) => meioTomEmCores(imagem, n(v, "raio"), [n(v, "canal1"), n(v, "canal2"), n(v, "canal3")], ctx),
  },
  { id: "cristalizar", nome: "Cristalizar", grupo: "pixelizacao", opcoes: [numero("tamanho", "Tamanho da célula", 3, 300, 10)], aplicar: (imagem, v, ctx) => cristalizar(imagem, n(v, "tamanho"), ctx) },
  { id: "facetar", nome: "Facetar", grupo: "pixelizacao", opcoes: [], semJanela: true, aplicar: (imagem, _v, ctx) => kuwahara(imagem, 2 * ctx.escala) },
  { id: "fragmentar", nome: "Fragmentar", grupo: "pixelizacao", opcoes: [], semJanela: true, margem: () => 4, aplicar: (imagem, _v, ctx) => fragmentar(imagem, ctx) },
  {
    id: "meia_tinta",
    nome: "Meia-tinta",
    grupo: "pixelizacao",
    opcoes: [
      escolha("tipo", "Tipo", [
        ["pontos_finos", "Pontos finos"],
        ["pontos_medios", "Pontos médios"],
        ["pontos_granulados", "Pontos granulados"],
        ["pontos_grossos", "Pontos grossos"],
        ["linhas_curtas", "Linhas curtas"],
        ["linhas_medias", "Linhas médias"],
        ["linhas_longas", "Linhas longas"],
        ["tracos_curtos", "Traços curtos"],
        ["tracos_medios", "Traços médios"],
        ["tracos_longos", "Traços longos"],
      ]),
    ],
    aplicar: (imagem, v, ctx) => meiaTinta(imagem, s(v, "tipo"), ctx),
  },
  { id: "mosaico", nome: "Mosaico", grupo: "pixelizacao", opcoes: [numero("tamanho", "Tamanho da célula", 2, 200, 8, "px")], aplicar: (imagem, v, ctx) => mosaico(imagem, n(v, "tamanho"), ctx) },
  {
    id: "pontilhismo",
    nome: "Pontilhismo",
    grupo: "pixelizacao",
    opcoes: [numero("tamanho", "Tamanho da célula", 3, 300, 6), { id: "fundo", nome: "Cor do fundo", tipo: "cor", padrao: "#ffffff" }],
    aplicar: (imagem, v, ctx) => pontilhismo(imagem, n(v, "tamanho"), { ...ctx, fundo: hexParaRgb(s(v, "fundo")) }),
  },
  // ——— Estilização ———
  {
    id: "difusao",
    nome: "Difusão",
    grupo: "estilizacao",
    opcoes: [escolha("modo", "Modo", [["normal", "Normal"], ["escurecer", "Só escurecer"], ["clarear", "Só clarear"], ["anisotropico", "Anisotrópico"]])],
    aplicar: (imagem, v, ctx) => difusao(imagem, s(v, "modo"), ctx),
  },
  {
    id: "entalhe",
    nome: "Entalhe",
    grupo: "estilizacao",
    opcoes: [numero("angulo", "Ângulo", -360, 360, 135, "°"), numero("altura", "Altura", 1, 100, 3, "px"), numero("quantidade", "Quantidade", 1, 500, 100, "%")],
    aplicar: (imagem, v, ctx) => entalhe(imagem, n(v, "angulo"), n(v, "altura") * ctx.escala, n(v, "quantidade")),
  },
  {
    id: "extrusao",
    nome: "Extrusão",
    grupo: "estilizacao",
    opcoes: [escolha("tipo", "Tipo", [["blocos", "Blocos"], ["piramides", "Pirâmides"]]), numero("tamanho", "Tamanho", 2, 255, 30, "px"), numero("profundidade", "Profundidade", 1, 45, 20, "%")],
    aplicar: (imagem, v, ctx) => extrusao(imagem, s(v, "tipo"), n(v, "tamanho"), n(v, "profundidade"), ctx),
  },
  { id: "encontrar_bordas", nome: "Encontrar bordas", grupo: "estilizacao", opcoes: [], semJanela: true, aplicar: (imagem) => encontrarBordas(imagem) },
  {
    id: "pintura_a_oleo",
    nome: "Pintura a óleo",
    grupo: "estilizacao",
    opcoes: [numero("estilizacao", "Estilização", 0.1, 10, 2.5, "", 0.1), numero("limpeza", "Limpeza", 0, 10, 8, "", 0.1), numero("escala", "Escala", 0.1, 10, 0.6, "", 0.1), numero("cerdas", "Detalhe das cerdas", 0, 10, 5, "", 0.1), numero("angulo", "Ângulo da luz", -180, 180, -60, "°"), numero("brilho", "Brilho", 0, 10, 1, "", 0.1)],
    aplicar: (imagem, v, ctx) => pinturaAOleo(imagem, n(v, "estilizacao"), n(v, "limpeza"), n(v, "escala"), n(v, "cerdas"), n(v, "angulo"), n(v, "brilho"), ctx),
  },
  { id: "solarizar", nome: "Solarizar", grupo: "estilizacao", opcoes: [], semJanela: true, aplicar: (imagem) => solarizar(imagem) },
  {
    id: "ladrilhos",
    nome: "Ladrilhos",
    grupo: "estilizacao",
    opcoes: [numero("numero", "Número de ladrilhos", 1, 99, 10), numero("deslocamento", "Deslocamento máximo", 1, 99, 10, "%"), escolha("vao", "Preencher o vão com", [["cor", "Uma cor"], ["invertida", "A imagem invertida"], ["imagem", "A imagem como está"]]), { id: "cor", nome: "Cor do vão", tipo: "cor", padrao: "#ffffff" }],
    aplicar: (imagem, v, ctx) => ladrilhos(imagem, n(v, "numero"), n(v, "deslocamento"), s(v, "vao") === "cor" ? "fundo" : s(v, "vao"), { ...ctx, fundo: hexParaRgb(s(v, "cor")) }),
  },
  {
    id: "tracar_contorno",
    nome: "Traçar contorno",
    grupo: "estilizacao",
    opcoes: [numero("nivel", "Nível", 0, 255, 128), escolha("borda", "Borda", [["inferior", "Inferior"], ["superior", "Superior"]])],
    aplicar: (imagem, v) => tracarContorno(imagem, n(v, "nivel"), s(v, "borda")),
  },
  {
    id: "vento",
    nome: "Vento",
    grupo: "estilizacao",
    opcoes: [escolha("metodo", "Método", [["vento", "Vento"], ["ventania", "Ventania"], ["rajada", "Rajada"]]), escolha("direcao", "Direção", [["direita", "Da direita"], ["esquerda", "Da esquerda"]])],
    margem: () => 50,
    aplicar: (imagem, v, ctx) => vento(imagem, s(v, "metodo"), s(v, "direcao") === "direita" ? "esquerda" : "direita", ctx),
  },
  // ——— Vídeo ———
  {
    id: "desentrelacar",
    nome: "Desentrelaçar",
    grupo: "video",
    opcoes: [escolha("eliminar", "Eliminar", [["impares", "As linhas ímpares"], ["pares", "As linhas pares"]]), escolha("criar", "Criar campos novos por", [["duplicacao", "Duplicação"], ["interpolacao", "Interpolação"]])],
    aplicar: (imagem, v) => desentrelacar(imagem, s(v, "eliminar"), s(v, "criar")),
  },
  { id: "cores_ntsc", nome: "Cores NTSC", grupo: "video", opcoes: [], semJanela: true, aplicar: (imagem) => coresNtsc(imagem) },
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
