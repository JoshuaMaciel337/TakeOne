// O estilo de camada do editor de imagem (ADR 0003, onda 13.9): os dez efeitos dos editores de imagem, na ordem do
// painel, com os padrões de lá. As medidas (tamanho, distância) são em pixels do documento; os ângulos em graus, 0 para
// a direita e 90 para cima (de onde vem a luz). O que cada efeito desenha está em efeitos.ts.
import type { Mesclagem } from "../projeto/modelo.ts";
import type { TintaDaForma } from "../vetor/modelo.ts";

export type TipoDoEfeito =
  | "chanfro"
  | "tracado"
  | "sombra_interna"
  | "brilho_interno"
  | "cetim"
  | "sobreposicao_cor"
  | "sobreposicao_degrade"
  | "sobreposicao_padrao"
  | "brilho_externo"
  | "sombra";

export type PontoDoContorno = { x: number; y: number; canto?: boolean };
export type ContornoDoEfeito = { nome?: string; pontos: PontoDoContorno[] };

export type Efeito = {
  tipo: TipoDoEfeito;
  id: string;
  ligado: boolean;
  modo: Exclude<Mesclagem, "passagem">;
  opacidade: number;
  cor?: string;
  tinta?: TintaDaForma;
  angulo?: number;
  luz_global?: boolean;
  distancia?: number;
  espalhar?: number;
  tamanho?: number;
  ruido?: number;
  contorno?: ContornoDoEfeito;
  suavizar?: boolean;
  vazar?: boolean;
  tecnica?: "suave" | "preciso" | "cinzel_duro" | "cinzel_suave";
  origem?: "centro" | "borda";
  intervalo?: number;
  variacao?: number;
  posicao?: "fora" | "dentro" | "centro";
  estilo?: "externo" | "interno" | "entalhe" | "almofada" | "tracado";
  profundidade?: number;
  direcao?: "cima" | "baixo";
  suavidade?: number;
  altitude?: number;
  contorno_brilho?: ContornoDoEfeito;
  modo_realce?: Exclude<Mesclagem, "passagem">;
  cor_realce?: string;
  opacidade_realce?: number;
  modo_sombra?: Exclude<Mesclagem, "passagem">;
  cor_sombra?: string;
  opacidade_sombra?: number;
  contorno_chanfro?: ContornoDoEfeito;
  intervalo_chanfro?: number;
  textura?: { padrao: string; escala: number; profundidade: number; inverter: boolean };
  inverter?: boolean;
  escala?: number;
  alinhar?: boolean;
  deslocamento?: { x: number; y: number };
};

export type MesclarSe = { canal: "cinza" | "vermelho" | "verde" | "azul"; esta: [number, number, number, number]; abaixo: [number, number, number, number] };

export type EstiloDeCamada = {
  efeitos: Efeito[];
  /** Os efeitos aparecem (o olho de "Efeitos" no painel Camadas). */
  ligado?: boolean;
  /** Camada › Estilo de camada › Dimensionar efeitos. */
  escala?: number;
  internos_como_grupo?: boolean;
  recortadas_como_grupo?: boolean;
  mascara_esconde_efeitos?: boolean;
  vazamento?: "nenhum" | "raso" | "profundo";
  canais?: { vermelho: boolean; verde: boolean; azul: boolean };
  mesclar_se?: MesclarSe;
};

export type LuzGlobal = { angulo: number; altitude: number };
export const LUZ_GLOBAL_PADRAO: LuzGlobal = { angulo: 120, altitude: 30 };

export const LINEAR: ContornoDoEfeito = { nome: "Linear", pontos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };

/** Os contornos prontos (o que a borda do efeito faz, da parte de fora para a de dentro). */
export const CONTORNOS_PRONTOS: ContornoDoEfeito[] = [
  LINEAR,
  { nome: "Cone", pontos: [{ x: 0, y: 0 }, { x: 0.5, y: 1, canto: true }, { x: 1, y: 0 }] },
  { nome: "Cone invertido", pontos: [{ x: 0, y: 1 }, { x: 0.5, y: 0, canto: true }, { x: 1, y: 1 }] },
  { nome: "Gaussiana", pontos: [{ x: 0, y: 0 }, { x: 0.25, y: 0.08 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.92 }, { x: 1, y: 1 }] },
  { nome: "Meio arredondado", pontos: [{ x: 0, y: 0 }, { x: 0.3, y: 0.55 }, { x: 0.6, y: 0.86 }, { x: 1, y: 1 }] },
  { nome: "Anel", pontos: [{ x: 0, y: 0 }, { x: 0.25, y: 0.9 }, { x: 0.5, y: 0.2 }, { x: 0.75, y: 0.9 }, { x: 1, y: 0 }] },
  { nome: "Anel duplo", pontos: [{ x: 0, y: 0 }, { x: 0.17, y: 1 }, { x: 0.33, y: 0 }, { x: 0.5, y: 1 }, { x: 0.67, y: 0 }, { x: 0.83, y: 1 }, { x: 1, y: 0 }] },
  { nome: "Rolante", pontos: [{ x: 0, y: 0 }, { x: 0.2, y: 0.6 }, { x: 0.45, y: 0.35 }, { x: 0.7, y: 0.85 }, { x: 1, y: 1 }] },
  { nome: "Em degraus", pontos: [{ x: 0, y: 0 }, { x: 0.33, y: 0, canto: true }, { x: 0.34, y: 0.5, canto: true }, { x: 0.66, y: 0.5, canto: true }, { x: 0.67, y: 1, canto: true }, { x: 1, y: 1 }] },
];

/** Os nomes do painel, na ordem dele (de cima para baixo). */
export const NOMES_DOS_EFEITOS: { tipo: TipoDoEfeito; nome: string; empilha: boolean }[] = [
  { tipo: "chanfro", nome: "Chanfro e entalhe", empilha: false },
  { tipo: "tracado", nome: "Traçado", empilha: true },
  { tipo: "sombra_interna", nome: "Sombra interna", empilha: true },
  { tipo: "brilho_interno", nome: "Brilho interno", empilha: false },
  { tipo: "cetim", nome: "Cetim", empilha: false },
  { tipo: "sobreposicao_cor", nome: "Sobreposição de cor", empilha: true },
  { tipo: "sobreposicao_degrade", nome: "Sobreposição de degradê", empilha: true },
  { tipo: "sobreposicao_padrao", nome: "Sobreposição de padrão", empilha: false },
  { tipo: "brilho_externo", nome: "Brilho externo", empilha: false },
  { tipo: "sombra", nome: "Sombra projetada", empilha: true },
];

export const nomeDoEfeito = (tipo: TipoDoEfeito) => NOMES_DOS_EFEITOS.find((item) => item.tipo === tipo)?.nome ?? tipo;

const DEGRADE_PRETO_BRANCO = {
  nome: "Preto, branco",
  tipo: "solido" as const,
  cores: [{ posicao: 0, cor: "#000000", meio: 0.5 }, { posicao: 1, cor: "#ffffff", meio: 0.5 }],
  opacidades: [{ posicao: 0, opacidade: 1, meio: 0.5 }, { posicao: 1, opacidade: 1, meio: 0.5 }],
  suavidade: 1,
  aspereza: 0.5,
  semente: 1,
};

/** Um efeito novo com os padrões dos editores de imagem. */
export function efeitoPadrao(tipo: TipoDoEfeito, id: string): Efeito {
  const base = { tipo, id, ligado: true };
  switch (tipo) {
    case "sombra":
      return { ...base, modo: "multiplicar", opacidade: 0.75, cor: "#000000", angulo: 120, luz_global: true, distancia: 5, espalhar: 0, tamanho: 5, ruido: 0, contorno: LINEAR, vazar: true };
    case "sombra_interna":
      return { ...base, modo: "multiplicar", opacidade: 0.75, cor: "#000000", angulo: 120, luz_global: true, distancia: 5, espalhar: 0, tamanho: 5, ruido: 0, contorno: LINEAR };
    case "brilho_externo":
      return { ...base, modo: "tela", opacidade: 0.75, cor: "#ffffbe", tecnica: "suave", espalhar: 0, tamanho: 5, ruido: 0, contorno: LINEAR, intervalo: 0.5, variacao: 0 };
    case "brilho_interno":
      return { ...base, modo: "tela", opacidade: 0.75, cor: "#ffffbe", tecnica: "suave", origem: "borda", espalhar: 0, tamanho: 5, ruido: 0, contorno: LINEAR, intervalo: 0.5, variacao: 0 };
    case "chanfro":
      return {
        ...base,
        modo: "normal",
        opacidade: 1,
        estilo: "interno",
        tecnica: "suave",
        profundidade: 1,
        direcao: "cima",
        tamanho: 5,
        suavidade: 0,
        angulo: 120,
        altitude: 30,
        luz_global: true,
        contorno_brilho: LINEAR,
        modo_realce: "tela",
        cor_realce: "#ffffff",
        opacidade_realce: 0.75,
        modo_sombra: "multiplicar",
        cor_sombra: "#000000",
        opacidade_sombra: 0.75,
      };
    case "cetim":
      return { ...base, modo: "multiplicar", opacidade: 0.5, cor: "#000000", angulo: 19, distancia: 11, tamanho: 14, contorno: CONTORNOS_PRONTOS[3], inverter: true };
    case "sobreposicao_cor":
      return { ...base, modo: "normal", opacidade: 1, cor: "#ff0000" };
    case "sobreposicao_degrade":
      return { ...base, modo: "normal", opacidade: 1, tinta: { tipo: "degrade", degrade: DEGRADE_PRETO_BRANCO, forma: "linear", angulo: 90, escala: 1, inverter: false }, alinhar: true };
    case "sobreposicao_padrao":
      return { ...base, modo: "normal", opacidade: 1, tinta: { tipo: "padrao", padrao: "xadrez", escala: 1 }, alinhar: true };
    case "tracado":
      return { ...base, modo: "normal", opacidade: 1, tamanho: 3, posicao: "fora", tinta: { tipo: "cor", cor: "#000000" } };
  }
}

/** Os efeitos que valem (ligados, num estilo ligado). */
export const efeitosLigados = (estilo: EstiloDeCamada | null | undefined): Efeito[] => (estilo && estilo.ligado !== false ? estilo.efeitos.filter((efeito) => efeito.ligado) : []);
