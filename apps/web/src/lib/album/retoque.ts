// O retoque de retrato das fotos do álbum (onda 16.8): os controles de 0 a 100, as pessoas e o pincel de incluir e
// excluir. O worker faz a conta (core/utils/retoque.py) quando desenha a foto editada.

export type ControleDoRetoque = "pele" | "manchas" | "sardas" | "rugas" | "olheiras" | "olhos" | "dentes" | "brilho" | "uniformizar" | "contornar" | "pescoco" | "roupa";

export type TracoDoRetoque = { modo: "incluir" | "excluir"; raio: number; pontos: [number, number][] };

export type Retoque = Partial<Record<ControleDoRetoque, number>> & {
  /** Só nos rostos destas pessoas (vazio: todos). */
  pessoas?: number[];
  pincel?: TracoDoRetoque[];
};

export const CONTROLES_DO_RETOQUE: { id: ControleDoRetoque; nome: string; grupo: "Pele" | "Rosto" | "Corpo" }[] = [
  { id: "pele", nome: "Suavizar a pele", grupo: "Pele" },
  { id: "manchas", nome: "Manchas e espinhas", grupo: "Pele" },
  { id: "sardas", nome: "Sardas", grupo: "Pele" },
  { id: "rugas", nome: "Rugas", grupo: "Pele" },
  { id: "brilho", nome: "Brilho da pele", grupo: "Pele" },
  { id: "uniformizar", nome: "Uniformizar o tom", grupo: "Pele" },
  { id: "olheiras", nome: "Olheiras", grupo: "Rosto" },
  { id: "olhos", nome: "Olhos", grupo: "Rosto" },
  { id: "dentes", nome: "Dentes", grupo: "Rosto" },
  { id: "contornar", nome: "Contornar", grupo: "Rosto" },
  { id: "pescoco", nome: "Pescoço e braços", grupo: "Corpo" },
  { id: "roupa", nome: "Roupa amassada", grupo: "Corpo" },
];

/** Predefinições desenhadas aqui. */
export const PREDEFINICOES_DE_RETOQUE: { id: string; nome: string; valores: Partial<Record<ControleDoRetoque, number>> }[] = [
  { id: "leve", nome: "Leve", valores: { pele: 25, manchas: 50, olheiras: 25, brilho: 30 } },
  { id: "natural", nome: "Natural", valores: { pele: 40, manchas: 70, sardas: 0, rugas: 25, olheiras: 40, olhos: 25, dentes: 30, brilho: 45, uniformizar: 25 } },
  { id: "forte", nome: "Forte", valores: { pele: 70, manchas: 90, sardas: 40, rugas: 55, olheiras: 65, olhos: 45, dentes: 55, brilho: 65, uniformizar: 50, contornar: 20, pescoco: 40 } },
  { id: "noiva", nome: "Noiva", valores: { pele: 60, manchas: 90, rugas: 35, olheiras: 60, olhos: 40, dentes: 50, brilho: 70, uniformizar: 45, contornar: 15, pescoco: 45, roupa: 30 } },
  { id: "masculino", nome: "Masculino", valores: { pele: 20, manchas: 70, olheiras: 35, brilho: 60, uniformizar: 20 } },
  { id: "corporativo", nome: "Retrato corporativo", valores: { pele: 35, manchas: 80, olheiras: 45, olhos: 30, dentes: 35, brilho: 60, roupa: 50 } },
];

/** O retoque com os valores trocados (as pessoas e o pincel ficam). */
export function comValores(retoque: Retoque | null | undefined, valores: Partial<Record<ControleDoRetoque, number>>): Retoque {
  return { ...(retoque ?? {}), ...valores };
}

/** Uma predefinição: os valores dela no lugar de todos (os que ela não tem voltam a zero). */
export function comPredefinicao(retoque: Retoque | null | undefined, id: string): Retoque {
  const predefinicao = PREDEFINICOES_DE_RETOQUE.find((p) => p.id === id);
  const zeros = Object.fromEntries(CONTROLES_DO_RETOQUE.map((c) => [c.id, 0])) as Record<ControleDoRetoque, number>;
  return { ...(retoque ?? {}), ...zeros, ...(predefinicao?.valores ?? {}) };
}

/** O retoque não muda nada (sem valor e sem pincel de incluir). */
export function retoqueVazio(retoque: Retoque | null | undefined): boolean {
  if (!retoque) return true;
  return CONTROLES_DO_RETOQUE.every((c) => !retoque[c.id]) && !(retoque.pincel ?? []).some((t) => t.modo === "incluir");
}

/** A predefinição que bate com os valores (para o seletor), ou "". */
export function predefinicaoDe(retoque: Retoque | null | undefined): string {
  return PREDEFINICOES_DE_RETOQUE.find((p) => CONTROLES_DO_RETOQUE.every((c) => (p.valores[c.id] ?? 0) === (retoque?.[c.id] ?? 0)))?.id ?? "";
}
