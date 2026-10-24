// O pedaço do fontkit (MIT) que o texto do editor de imagem usa (o pacote não traz os tipos).
declare module "fontkit" {
  export type Caixa = { minX: number; minY: number; maxX: number; maxY: number };
  export interface Caminho {
    toSVG(): string;
    bbox: Caixa;
  }
  export interface Glifo {
    id: number;
    name: string;
    codePoints: number[];
    path: Caminho;
    bbox: Caixa;
    advanceWidth: number;
  }
  export interface Posicao {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }
  export interface Corrida {
    glyphs: Glifo[];
    positions: Posicao[];
    advanceWidth: number;
  }
  export interface Fonte {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    lineGap: number;
    underlinePosition: number;
    underlineThickness: number;
    capHeight: number;
    xHeight: number;
    availableFeatures: string[];
    variationAxes: Record<string, { name: string; min: number; default: number; max: number }>;
    "OS/2"?: { yStrikeoutPosition: number; yStrikeoutSize: number };
    familyName: string;
    layout(texto: string, recursos?: string[] | Record<string, boolean>): Corrida;
    getVariation(eixos: Record<string, number>): Fonte;
    glyphForCodePoint(codigo: number): Glifo;
  }
  export function create(dados: Uint8Array, postscriptName?: string): Fonte;
}
