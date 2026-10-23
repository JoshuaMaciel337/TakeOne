// Som dos clipes: formato dos fades. Espelha core/utils/som.py, com as curvas do `afade` do FFmpeg
// (a mesma fórmula do af_afade.c), conferidas pelos casos de tests/casos/fades.json.

export type CurvaDoFade = "linear" | "suave" | "s" | "exponencial";

/** Tom da voz: até uma oitava para cada lado. */
export const TOM_LIMITE = 12;

/** O nome do arquivo da voz no tom (o mesmo de core/modelos/midia.py): tom_p3, tom_m2_limpa. */
export function chaveDoTom(semitons: number, limpa: boolean): string {
  return `tom_${semitons < 0 ? "m" : "p"}${Math.abs(semitons)}${limpa ? "_limpa" : ""}`;
}

export const CURVAS_DO_FADE: { id: CurvaDoFade; nome: string }[] = [
  { id: "linear", nome: "Linear" },
  { id: "suave", nome: "Suave" },
  { id: "s", nome: "Em S" },
  { id: "exponencial", nome: "Exponencial" },
];

/** O ganho (0 a 1) quando o fade já andou `p` (0 a 1) do caminho, como o afade calcula. */
export function ganhoDoFade(curva: CurvaDoFade | undefined, p: number): number {
  p = Math.min(1, Math.max(0, p));
  if (curva === "suave") return Math.sin((p * Math.PI) / 2);
  if (curva === "s") return (1 - Math.cos(p * Math.PI)) / 2;
  // -100 dB no começo, como o afade
  if (curva === "exponencial") return Math.exp(-11.512925464970227 * (1 - p));
  return p;
}

// Igualar o volume: cada mídia medida na ingestão (LUFS integrado), como em core/utils/som.py
export const LUFS_IGUALAR = -14;
const GANHO_IGUALAR_MAXIMO_DB = 20;

/** Os dB que levam a mídia a -14 LUFS; 0 se ela não foi medida ou é silêncio. */
export function ganhoParaIgualar(lufs: number | null | undefined): number {
  if (lufs === null || lufs === undefined || lufs <= -70) return 0;
  return Math.min(Math.max(LUFS_IGUALAR - lufs, -GANHO_IGUALAR_MAXIMO_DB), GANHO_IGUALAR_MAXIMO_DB);
}

// -----------------------------------------------
// Efeitos de voz: equalizador de três faixas, eco e reverb. Os números são os de core/utils/som.py:
// o render usa os filtros do FFmpeg com as mesmas fórmulas dos nós do Web Audio da prévia.
// -----------------------------------------------
/** grave, medio e agudo em dB; eco é o volume da primeira repetição; reverb, o volume da cauda. */
/** ronco: 1 liga o passa-altas que tira o ronco (vento, ar-condicionado, o microfone na mesa). */
export type EfeitosVoz = { grave: number; medio: number; agudo: number; eco: number; reverb: number; ronco?: number };

export const SEM_EFEITOS_VOZ: EfeitosVoz = { grave: 0, medio: 0, agudo: 0, eco: 0, reverb: 0, ronco: 0 };
/** Tirar o ronco: passa-altas de Butterworth (Q 0,7071) em 80 Hz, o highpass do FFmpeg e o BiquadFilterNode. */
export const RONCO_HZ = 80;
/** O Q do passa-altas no BiquadFilterNode é em dB: 0,7071 é -3,0103 dB. */
export const RONCO_Q_DB = 20 * Math.log10(Math.SQRT1_2);
export const EQ_LIMITE_DB = 12;
export const ECO_MAXIMO = 0.8;
/** Faixa → (tipo do BiquadFilterNode, frequência); o meio com Q 1, as prateleiras com inclinação 1. */
export const FAIXAS_DO_EQ = { grave: ["lowshelf", 120], medio: ["peaking", 1000], agudo: ["highshelf", 6000] } as const;
export const ECO_ATRASO_S = 0.18;
export const ECO_REPETICOES = 3;

/** Efeitos prontos. Os nomes e os valores são do TakeOne. */
export const EFEITOS_PRONTOS: { id: string; nome: string; efeitos: EfeitosVoz }[] = [
  { id: "nenhum", nome: "Nenhum", efeitos: SEM_EFEITOS_VOZ },
  { id: "clara", nome: "Voz mais clara", efeitos: { ...SEM_EFEITOS_VOZ, grave: -3, medio: 2, agudo: 5 } },
  { id: "radio", nome: "Rádio", efeitos: { ...SEM_EFEITOS_VOZ, grave: -10, medio: 7, agudo: -6 } },
  { id: "telefone", nome: "Telefone", efeitos: { ...SEM_EFEITOS_VOZ, grave: -12, medio: 9, agudo: -12 } },
  { id: "sala", nome: "Sala grande", efeitos: { ...SEM_EFEITOS_VOZ, reverb: 0.35 } },
  { id: "caverna", nome: "Caverna", efeitos: { ...SEM_EFEITOS_VOZ, grave: 2, eco: 0.45, reverb: 0.5 } },
];

export function efeitosAtivos(efeitos: EfeitosVoz | null | undefined): efeitos is EfeitosVoz {
  return !!efeitos && Object.values(efeitos).some((valor) => Math.abs(valor) > 1e-9);
}

/** Os valores dentro dos limites que a API aceita. */
export function limitarEfeitos(efeitos: EfeitosVoz): EfeitosVoz {
  const limitar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor || 0));
  return {
    grave: limitar(efeitos.grave, -EQ_LIMITE_DB, EQ_LIMITE_DB),
    medio: limitar(efeitos.medio, -EQ_LIMITE_DB, EQ_LIMITE_DB),
    agudo: limitar(efeitos.agudo, -EQ_LIMITE_DB, EQ_LIMITE_DB),
    eco: limitar(efeitos.eco, 0, ECO_MAXIMO),
    reverb: limitar(efeitos.reverb, 0, 1),
    ronco: (efeitos.ronco ?? 0) > 0.5 ? 1 : 0,
  };
}
