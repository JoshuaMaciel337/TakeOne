// As predefinições de pincel (painel Pincéis), feitas aqui com as pontas de lib/pintura/pontas.ts, nas pastas dos
// editores de imagem: gerais, materiais secos, materiais molhados e efeitos especiais. Escolher uma troca as opções
// do pincel, menos as seções travadas no painel Configurações do pincel (e a textura, com "Proteger textura").
import { type OpcoesDoPincel, PINCEL_PADRAO, type SecaoDoPincel, SECOES_DO_PINCEL, type Variacao } from "./traco.ts";

export type PastaDePinceis = "gerais" | "secos" | "molhados" | "efeitos" | "meus" | "importados";
export const PASTAS_DE_PINCEIS: { id: PastaDePinceis; nome: string }[] = [
  { id: "gerais", nome: "Gerais" },
  { id: "secos", nome: "Materiais secos" },
  { id: "molhados", nome: "Materiais molhados" },
  { id: "efeitos", nome: "Efeitos especiais" },
  // Os do espaço (lib/pinceis.ts): salvos pela pessoa e importados de um .abr
  { id: "meus", nome: "Meus pincéis" },
  { id: "importados", nome: "Importados" },
];

/** As opções que a predefinição muda (as seções vêm inteiras, sobre as do padrão). */
type Mudanca = Partial<Omit<OpcoesDoPincel, SecaoDoPincel>> & { [S in SecaoDoPincel]?: Partial<OpcoesDoPincel[S]> };
export type Predefinicao = { id: string; nome: string; pasta: PastaDePinceis; opcoes: Mudanca };

const pela = (tremor: number, controle: Variacao["controle"] = "nenhum", minimo = 0): Variacao => ({ tremor, controle, minimo });

export const PREDEFINICOES: Predefinicao[] = [
  { id: "redondo-duro", nome: "Redondo duro", pasta: "gerais", opcoes: { tamanho: 30, dureza: 1 } },
  { id: "redondo-macio", nome: "Redondo macio", pasta: "gerais", opcoes: { tamanho: 60, dureza: 0 } },
  { id: "redondo-pressao", nome: "Redondo duro com pressão", pasta: "gerais", opcoes: { tamanho: 25, dureza: 1, pressaoNoTamanho: true, pressaoNaOpacidade: true } },
  { id: "aerografo", nome: "Aerógrafo macio", pasta: "gerais", opcoes: { tamanho: 90, dureza: 0, fluxo: 0.1, aerografo: true } },
  { id: "caneta", nome: "Caneta fina", pasta: "gerais", opcoes: { tamanho: 6, dureza: 1, suavizacao: 0.4, espacamento: 0.1 } },
  {
    id: "marcador",
    nome: "Marcador",
    pasta: "gerais",
    opcoes: { tamanho: 28, dureza: 0.9, angulo: 35, arredondamento: 0.35, opacidade: 0.6, pressaoNoTamanho: false },
  },
  { id: "lapis-2b", nome: "Lápis 2B", pasta: "secos", opcoes: { tamanho: 8, ponta: "grafite", espacamento: 0.08, angulo: 30, textura: { ligado: true, id: "papel", escala: 0.6, profundidade: 0.5 } } },
  {
    id: "carvao",
    nome: "Carvão",
    pasta: "secos",
    opcoes: { tamanho: 40, ponta: "carvao", espacamento: 0.12, dinamicaDeForma: { ligado: true, angulo: pela(0.2), tamanho: pela(0.15, "pressao", 0.3) }, textura: { ligado: true, id: "papel", escala: 1, profundidade: 0.7 } },
  },
  { id: "giz", nome: "Giz", pasta: "secos", opcoes: { tamanho: 35, ponta: "giz", espacamento: 0.15, dinamicaDeForma: { ligado: true, angulo: pela(1) }, textura: { ligado: true, id: "areia", escala: 1, profundidade: 0.6 } } },
  {
    id: "pastel",
    nome: "Pastel seco",
    pasta: "secos",
    opcoes: { tamanho: 45, ponta: "pastel", espacamento: 0.1, dinamicaDeForma: { ligado: true, angulo: pela(0.5) }, textura: { ligado: true, id: "tela", escala: 1.4, profundidade: 0.45 }, transferencia: { ligado: true, fluxo: pela(0.3) } },
  },
  {
    id: "aquarela",
    nome: "Aquarela",
    pasta: "molhados",
    opcoes: { tamanho: 70, ponta: "aquarela", fluxo: 0.35, opacidade: 0.8, bordasMolhadas: true, espacamento: 0.12, dinamicaDeForma: { ligado: true, angulo: pela(1), tamanho: pela(0.1) }, textura: { ligado: true, id: "papel", escala: 1.6, profundidade: 0.3 } },
  },
  {
    id: "oleo",
    nome: "Tinta a óleo",
    pasta: "molhados",
    opcoes: { tamanho: 40, ponta: "cerdas", espacamento: 0.05, dinamicaDeForma: { ligado: true, angulo: pela(0, "direcao") }, dinamicaDeCor: { ligado: true, brilho: 0.05, porPonta: false } },
  },
  { id: "nanquim", nome: "Nanquim", pasta: "molhados", opcoes: { tamanho: 18, ponta: "nanquim", espacamento: 0.08, dinamicaDeForma: { ligado: true, tamanho: pela(0, "pressao", 0.2), angulo: pela(0.4) } } },
  {
    id: "pincel-seco",
    nome: "Pincel seco",
    pasta: "molhados",
    opcoes: { tamanho: 55, ponta: "cerdas", espacamento: 0.06, dinamicaDeForma: { ligado: true, angulo: pela(0, "direcao") }, textura: { ligado: true, id: "tela", escala: 1, profundidade: 0.8 }, transferencia: { ligado: true, fluxo: pela(0, "desvanecer", 0.1) } },
  },
  {
    id: "spray",
    nome: "Spray",
    pasta: "efeitos",
    opcoes: { tamanho: 60, ponta: "spray", espacamento: 0.3, aerografo: true, fluxo: 0.6, dispersao: { ligado: true, quanto: 0.15, ambosEixos: true, contagem: 1 }, dinamicaDeForma: { ligado: true, angulo: pela(1) } },
  },
  {
    id: "estrelas",
    nome: "Estrelas",
    pasta: "efeitos",
    opcoes: {
      tamanho: 30,
      ponta: "estrela",
      espacamento: 1.2,
      dinamicaDeForma: { ligado: true, tamanho: pela(0.7), angulo: pela(1) },
      dispersao: { ligado: true, quanto: 1.5, ambosEixos: true, contagem: 2 },
      dinamicaDeCor: { ligado: true, primeiroFundo: pela(1), brilho: 0.1, porPonta: true },
    },
  },
  {
    id: "folhas",
    nome: "Folhas",
    pasta: "efeitos",
    opcoes: {
      tamanho: 45,
      ponta: "folha",
      espacamento: 0.9,
      dinamicaDeForma: { ligado: true, tamanho: pela(0.5), angulo: pela(0.3, "direcao"), arredondamento: pela(0.5, "nenhum", 0.3), virarX: true },
      dispersao: { ligado: true, quanto: 1.2, contagem: 2 },
      dinamicaDeCor: { ligado: true, primeiroFundo: pela(1), matiz: 0.06, saturacao: 0.1, brilho: 0.15, porPonta: true },
    },
  },
  {
    id: "grama",
    nome: "Grama",
    pasta: "efeitos",
    opcoes: { tamanho: 50, ponta: "grama", espacamento: 0.3, dinamicaDeForma: { ligado: true, tamanho: pela(0.4), angulo: pela(0.12) }, dispersao: { ligado: true, quanto: 0.4, contagem: 1 }, dinamicaDeCor: { ligado: true, primeiroFundo: pela(1), brilho: 0.1, porPonta: true } },
  },
  {
    id: "respingos",
    nome: "Respingos",
    pasta: "efeitos",
    opcoes: { tamanho: 40, ponta: "respingo", espacamento: 1.4, dinamicaDeForma: { ligado: true, tamanho: pela(0.8), angulo: pela(1) }, dispersao: { ligado: true, quanto: 1, ambosEixos: true, contagem: 1 } },
  },
  {
    id: "nuvens",
    nome: "Nuvens",
    pasta: "efeitos",
    opcoes: { tamanho: 120, ponta: "nuvem", espacamento: 0.4, fluxo: 0.4, dinamicaDeForma: { ligado: true, tamanho: pela(0.5), angulo: pela(1) }, dispersao: { ligado: true, quanto: 0.4, ambosEixos: true, contagem: 1 } },
  },
  { id: "esponja", nome: "Esponja", pasta: "efeitos", opcoes: { tamanho: 60, ponta: "esponja", espacamento: 0.35, dinamicaDeForma: { ligado: true, angulo: pela(1), tamanho: pela(0.2) }, dispersao: { ligado: true, quanto: 0.2, ambosEixos: true, contagem: 1 } } },
];

/**
 * As opções com a predefinição: o resto volta ao padrão, menos o modo, a opacidade e o que não é do pincel (a
 * borracha, o lápis), as seções travadas e a textura com "Proteger textura".
 */
export function comPredefinicao(atual: OpcoesDoPincel, predefinicao: Predefinicao, travadas: ReadonlySet<SecaoDoPincel> = new Set()): OpcoesDoPincel {
  const novo: OpcoesDoPincel = {
    ...PINCEL_PADRAO,
    modo: atual.modo,
    opacidade: atual.opacidade,
    borracha: atual.borracha,
    apagarAutomaticamente: atual.apagarAutomaticamente,
    pressaoNaOpacidade: atual.pressaoNaOpacidade,
    ...predefinicao.opcoes,
  } as OpcoesDoPincel;
  for (const secao of SECOES_DO_PINCEL) {
    if (travadas.has(secao)) (novo as Record<SecaoDoPincel, unknown>)[secao] = atual[secao];
    else if (predefinicao.opcoes[secao]) (novo as Record<SecaoDoPincel, unknown>)[secao] = { ...PINCEL_PADRAO[secao], ...predefinicao.opcoes[secao] };
  }
  if (atual.protegerTextura && !travadas.has("textura")) novo.textura = atual.textura;
  novo.protegerTextura = atual.protegerTextura;
  return novo;
}
