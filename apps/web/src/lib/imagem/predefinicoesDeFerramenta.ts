// As predefinições de ferramenta do editor de imagem (ADR 0003, onda 13.15): o que cada ferramenta guarda numa
// predefinição (as opções dela, que no editor ficam em estados separados: o pincel de cada ferramenta de pintura, o
// retoque, a seleção, a forma, o balde...). A predefinição é a ferramenta e um objeto com essas partes; aplicar devolve
// cada parte ao estado dela, e redefinir volta as partes ao padrão.

export type ParteDasOpcoes = "pincel" | "retoque" | "misturador" | "substituicao" | "borrachaDeFundo" | "carimbo" | "manchas" | "selecao" | "forma" | "caneta" | "balde" | "borrachaMagica" | "degrade" | "texto" | "corte" | "perspectiva" | "linhas" | "reflexo";

const PINTURA = ["pincel", "lapis", "borracha", "historico", "historicoArtistico", "carimbo", "carimboDePadrao", "recuperacao", "recuperacaoParaManchas", "desfoque", "nitidez", "borrar", "subexposicao", "superexposicao", "esponja", "misturador", "substituicaoDeCor", "borrachaDeFundo"];
const RETOQUE = ["desfoque", "nitidez", "borrar", "subexposicao", "superexposicao", "esponja"];
const SELECAO = ["letreiro", "letreiroEliptico", "linhaUnica", "colunaUnica", "laco", "lacoPoligonal", "lacoMagnetico", "varinha", "selecaoRapida", "objeto"];
const FORMAS = ["retangulo", "retanguloArredondado", "elipse", "triangulo", "poligono", "estrela", "linha", "formaPersonalizada"];
const LINHAS = ["segmento", "arco", "espiral", "gradeRetangular", "gradePolar"];
const CANETAS = ["caneta", "canetaLivre", "canetaDeCurvatura"];
const TEXTOS = ["texto", "textoVertical", "mascaraDeTexto", "mascaraDeTextoVertical"];

/** As partes das opções que a ferramenta usa (vazio: a ferramenta não tem opções para guardar). */
export function partesDaFerramenta(id: string): ParteDasOpcoes[] {
  const partes: ParteDasOpcoes[] = [];
  if (PINTURA.includes(id)) partes.push("pincel");
  if (RETOQUE.includes(id)) partes.push("retoque");
  if (id === "misturador") partes.push("misturador");
  if (id === "substituicaoDeCor") partes.push("substituicao");
  if (id === "borrachaDeFundo") partes.push("borrachaDeFundo");
  if (id === "carimbo" || id === "carimboDePadrao") partes.push("carimbo");
  if (["recuperacao", "recuperacaoParaManchas", "correcao", "moverSensivel"].includes(id)) partes.push("manchas");
  if (SELECAO.includes(id)) partes.push("selecao");
  if (FORMAS.includes(id)) partes.push("forma");
  // A caneta no modo Forma usa as tintas das formas
  if (CANETAS.includes(id)) partes.push("caneta", "forma");
  if (id === "balde") partes.push("balde");
  if (id === "borrachaMagica") partes.push("borrachaMagica");
  if (id === "degrade") partes.push("degrade");
  if (TEXTOS.includes(id)) partes.push("texto");
  if (id === "corte") partes.push("corte");
  if (id === "corteDePerspectiva") partes.push("perspectiva");
  // As ferramentas de linha: as medidas delas e a operação das formas
  if (LINHAS.includes(id)) partes.push("linhas", "forma");
  if (id === "reflexo") partes.push("reflexo");
  return partes;
}

export type PredefinicaoDeFerramenta = { ferramenta: string; opcoes: Partial<Record<ParteDasOpcoes, unknown>> };

/** Só as partes da ferramenta, copiadas (a predefinição não muda quando a ferramenta muda depois). */
export function opcoesParaGuardar(id: string, todas: Partial<Record<ParteDasOpcoes, unknown>>): PredefinicaoDeFerramenta["opcoes"] {
  return Object.fromEntries(partesDaFerramenta(id).flatMap((parte) => (todas[parte] === undefined ? [] : [[parte, JSON.parse(JSON.stringify(todas[parte]))]])));
}
