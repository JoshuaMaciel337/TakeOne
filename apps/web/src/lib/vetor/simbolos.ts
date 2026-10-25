// Os símbolos do editor vetorial (ADR 0003, onda 13.16): a forma de referência fica no documento, e cada instância é
// uma forma ligada a ela (com a tinta própria; a posição, o tamanho, o giro, a opacidade e o estilo são da camada).
// Redefinir o símbolo muda todas as instâncias. Os pincéis de símbolo borrifam instâncias e as movem, juntam,
// redimensionam, giram, tingem, deixam transparentes e estilizam debaixo do pincel. As contas são puras.
import { misturarCores } from "./mesclar.ts";
import type { CamadaVetorial, TintaDaForma } from "./modelo.ts";

type Ponto = { x: number; y: number };

export type Simbolo = { id: string; nome: string; vetor: CamadaVetorial };
export type TintaDaInstancia = { cor: string; quantidade: number };
export type InstanciaDeSimbolo = { id: string; tinta?: TintaDaInstancia | null };

export type FerramentaDeSimbolo = "borrifar" | "mover" | "juntar" | "redimensionar" | "girar" | "tingir" | "transparencia" | "estilo";

export type OpcoesDosSimbolos = {
  /** O raio do pincel, em pixels. */
  raio: number;
  /** De 1 a 100: o quanto cada passo mexe. */
  intensidade: number;
  /** De 1 a 100: quão juntas o Borrifar solta as instâncias. */
  densidade: number;
  /** O tamanho das instâncias borrifadas, em % do símbolo. */
  tamanho: number;
  /** O estilo pronto que o pincel de estilo põe. */
  estilo: string;
};

export const SIMBOLOS_PADRAO: OpcoesDosSimbolos = { raio: 60, intensidade: 50, densidade: 50, tamanho: 100, estilo: "sombra-suave" };

/** A tinta misturada à cor da instância na quantidade dela (as cores dos degradês e da malha também). */
export function tingirTinta(tinta: TintaDaForma, cor: string, quantidade: number): TintaDaForma {
  if (quantidade <= 0) return tinta;
  const mix = (c: string) => (c.startsWith("#") && c.length === 7 ? misturarCores(c, cor, quantidade) : c);
  if (tinta.tipo === "cor") return { ...tinta, cor: mix(tinta.cor) };
  if (tinta.tipo === "degrade") return { ...tinta, degrade: { ...tinta.degrade, cores: tinta.degrade.cores.map((parada) => ({ ...parada, cor: mix(parada.cor) })) } };
  if (tinta.tipo === "malha") return { ...tinta, pontos: tinta.pontos.map((p) => ({ ...p, cor: mix(p.cor) })) };
  return tinta;
}

/** A forma de uma instância: a do símbolo com a tinta dela. */
export function vetorDaInstancia(simbolo: Simbolo, tinta?: TintaDaInstancia | null): CamadaVetorial {
  if (!tinta || tinta.quantidade <= 0) return simbolo.vetor;
  return {
    ...simbolo.vetor,
    preenchimento: tingirTinta(simbolo.vetor.preenchimento, tinta.cor, tinta.quantidade),
    traco: simbolo.vetor.traco ? { ...simbolo.vetor.traco, tinta: tingirTinta(simbolo.vetor.traco.tinta, tinta.cor, tinta.quantidade) } : null,
  };
}

/** Uma instância como o pincel a vê: o meio na imagem, a escala, o giro, a opacidade, a tinta e o estilo. */
export type InstanciaNoPincel = { clipeId: string; x: number; y: number; escala: number; rotacao: number; opacidade: number; tinta: TintaDaInstancia | null; estilo: string | null };

/** Um passo do pincel em `p` (vindo de `anterior`): as instâncias debaixo dele mudam, mais no meio do pincel. */
export function passoDoPincelDeSimbolo(
  ferramenta: Exclude<FerramentaDeSimbolo, "borrifar">,
  instancias: InstanciaNoPincel[],
  p: Ponto,
  anterior: Ponto,
  opcoes: OpcoesDosSimbolos,
  alt: boolean,
  cor: string,
): InstanciaNoPincel[] {
  const k = Math.max(1, Math.min(100, opcoes.intensidade)) / 100;
  const raio = Math.max(1, opcoes.raio);
  const direcao = Math.hypot(p.x - anterior.x, p.y - anterior.y) > 0.5 ? (Math.atan2(p.y - anterior.y, p.x - anterior.x) * 180) / Math.PI : null;
  return instancias.map((inst) => {
    const d = Math.hypot(inst.x - p.x, inst.y - p.y);
    if (d >= raio) return inst;
    const t = 1 - d / raio;
    const w = t * t * (3 - 2 * t);
    switch (ferramenta) {
      case "mover":
        return { ...inst, x: inst.x + (p.x - anterior.x) * w, y: inst.y + (p.y - anterior.y) * w };
      case "juntar": {
        const f = 0.08 * k * w * (alt ? -1 : 1);
        return { ...inst, x: inst.x + (p.x - inst.x) * f, y: inst.y + (p.y - inst.y) * f };
      }
      case "redimensionar": {
        const f = 1 + 0.05 * k * w;
        return { ...inst, escala: Math.max(0.01, alt ? inst.escala / f : inst.escala * f) };
      }
      case "girar": {
        if (direcao === null) return inst;
        // Na direção do arrasto, pelo caminho mais curto
        const falta = ((((direcao - inst.rotacao) % 360) + 540) % 360) - 180;
        return { ...inst, rotacao: inst.rotacao + falta * Math.min(1, 0.25 * k * w) };
      }
      case "tingir": {
        const antes = inst.tinta && inst.tinta.cor.toLowerCase() === cor.toLowerCase() ? inst.tinta.quantidade : 0;
        const quantidade = Math.max(0, Math.min(1, antes + (alt ? -1 : 1) * 0.08 * k * w));
        return { ...inst, tinta: quantidade > 0 ? { cor, quantidade } : null };
      }
      case "transparencia": {
        const f = 0.08 * k * w;
        return { ...inst, opacidade: alt ? Math.min(1, inst.opacidade + f) : Math.max(0, inst.opacidade * (1 - f)) };
      }
      case "estilo":
        return w > 0.3 ? { ...inst, estilo: alt ? null : opcoes.estilo } : inst;
    }
  });
}

/** Um sorteio repetível de 0 a 1 pelo número. */
function sorteio(n: number): number {
  let h = Math.imul(n | 0, 2654435761) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** O lugar da n-ésima instância borrifada em volta de `p`: dentro do raio, com o tamanho variando 20% para cada lado. */
export function lugarDoBorrifo(p: Ponto, opcoes: OpcoesDosSimbolos, n: number): { x: number; y: number; escala: number } {
  const angulo = sorteio(n * 3 + 1) * 2 * Math.PI;
  const distancia = Math.sqrt(sorteio(n * 3 + 2)) * opcoes.raio;
  return { x: p.x + Math.cos(angulo) * distancia, y: p.y + Math.sin(angulo) * distancia, escala: (opcoes.tamanho / 100) * (0.8 + 0.4 * sorteio(n * 3 + 3)) };
}

/** A distância entre duas instâncias borrifadas (a densidade alta deixa juntas). */
export const espacoDoBorrifo = (opcoes: OpcoesDosSimbolos) => Math.max(2, opcoes.raio * (1.1 - Math.max(1, Math.min(100, opcoes.densidade)) / 100));
