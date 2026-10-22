// Base de tempo exata do editor.
//
// Portado do crate `time` do FilmCraft (https://github.com/storytold/filmcraft, crates/time/src/lib.rs,
// commit 5231852), licença MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team and the FilmCraft
// contributors. Textos em licencas/filmcraft. Modificado pelo TakeOne (2026): traduzido de Rust para
// TypeScript, só com a parte que o editor usa, e com as contas de quadro em BigInt.
//
// Todo tempo é um número inteiro de ticks, a 254.016.000.000 por segundo. Essa base divide sem resto a
// duração de um quadro em todas as taxas comuns (23,976 a 120) e de uma amostra em todas as taxas de
// áudio comuns, então cortes, quadros e áudio nunca acumulam erro.
//
// Um tick cabe num `number` sem perder precisão até Number.MAX_SAFE_INTEGER, cerca de 9 h 50 min.
// Somar e subtrair posições é exato; as multiplicações por taxa passam disso e são feitas em BigInt.

export type Tick = number;

export const TICKS_POR_SEGUNDO = 254_016_000_000;
/** Maior posição aceita na linha do tempo: 6 horas, longe do limite do `number`. */
export const TICK_MAXIMO = 6 * 3600 * TICKS_POR_SEGUNDO;

/** Taxa de quadros como fração exata: `num / den` quadros por segundo. */
export type Taxa = { num: number; den: number };

export const TAXA_PADRAO: Taxa = { num: 30, den: 1 };

export const TAXAS_COMUNS: readonly Taxa[] = [
  { num: 24000, den: 1001 },
  { num: 24, den: 1 },
  { num: 25, den: 1 },
  { num: 30000, den: 1001 },
  { num: 30, den: 1 },
  { num: 48, den: 1 },
  { num: 50, den: 1 },
  { num: 60000, den: 1001 },
  { num: 60, den: 1 },
  { num: 120000, den: 1001 },
  { num: 120, den: 1 },
];

const T = BigInt(TICKS_POR_SEGUNDO);

/** Divisão inteira arredondada para baixo, também com negativos (o `/` do BigInt corta em direção ao zero). */
function dividirParaBaixo(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== BigInt(0)) && ((a < BigInt(0)) !== (b < BigInt(0))) ? q - BigInt(1) : q;
}

export function segundosParaTicks(segundos: number): Tick {
  return Number.isFinite(segundos) ? Math.round(segundos * TICKS_POR_SEGUNDO) : 0;
}

export function ticksParaSegundos(t: Tick): number {
  return t / TICKS_POR_SEGUNDO;
}

/** A taxa, se for positiva; senão a padrão. Projeto ou arquivo danificado pode trazer zero ou negativo. */
export function taxaValida(taxa: Taxa): Taxa {
  return Number.isInteger(taxa.num) && Number.isInteger(taxa.den) && taxa.num > 0 && taxa.den > 0 ? taxa : TAXA_PADRAO;
}

/** A taxa comum mais próxima de um fps decimal (como o que o ffprobe devolve). */
export function taxaDeFps(fps: number): Taxa {
  if (!Number.isFinite(fps) || fps <= 0) return TAXA_PADRAO;
  const comum = TAXAS_COMUNS.find((taxa) => Math.abs(taxa.num / taxa.den - fps) < 0.005);
  if (comum) return comum;
  let num = Math.round(fps * 1000);
  let den = 1000;
  for (let a = num, b = den; ; ) {
    if (b === 0) {
      num /= a;
      den /= a;
      break;
    }
    [a, b] = [b, a % b];
  }
  return { num, den };
}

/** Duração exata de um quadro. */
export function duracaoDoQuadro(taxa: Taxa): Tick {
  const { num, den } = taxaValida(taxa);
  return Number((T * BigInt(den)) / BigInt(num));
}

/**
 * Índice do quadro que contém `t` (arredondado para baixo). `t` pode vir fracionário (divisão pela
 * velocidade, pixels da linha do tempo com zoom): as bordas dos quadros são ticks inteiros, então tirar a
 * fração antes dá o mesmo quadro. Sem isso, o BigInt de um número fracionário lançava RangeError.
 */
export function quadroEm(taxa: Taxa, t: Tick): number {
  const { num, den } = taxaValida(taxa);
  return Number(dividirParaBaixo(BigInt(Math.floor(t)) * BigInt(num), T * BigInt(den)));
}

/** Tick em que começa o quadro `quadro`. */
export function tickDoQuadro(taxa: Taxa, quadro: number): Tick {
  const { num, den } = taxaValida(taxa);
  return Number(dividirParaBaixo(BigInt(quadro) * T * BigInt(den), BigInt(num)));
}

/** Leva `t` para o começo do quadro em que ele está. */
export function ajustarAoQuadro(taxa: Taxa, t: Tick): Tick {
  return tickDoQuadro(taxa, quadroEm(taxa, t));
}

/** Leva `t` para a borda de quadro mais próxima. */
export function quadroMaisProximo(taxa: Taxa, t: Tick): Tick {
  const antes = ajustarAoQuadro(taxa, t);
  const depois = tickDoQuadro(taxa, quadroEm(taxa, t) + 1);
  return t - antes <= depois - t ? antes : depois;
}

/** Quadros contados por segundo de timecode: 30 para 29,97, 24 para 23,976. */
export function baseDoTimecode(taxa: Taxa): number {
  const { num, den } = taxaValida(taxa);
  return Math.max(1, Math.ceil(num / den));
}

/** "MM:SS:QQ", ou "H:MM:SS:QQ" a partir de uma hora. Timecode sem drop-frame. */
export function formatarTimecode(t: Tick, taxa: Taxa): string {
  const base = baseDoTimecode(taxa);
  const quadro = quadroEm(taxa, Math.max(0, t));
  const q = quadro % base;
  const totalSegundos = Math.floor(quadro / base);
  const s = totalSegundos % 60;
  const m = Math.floor(totalSegundos / 60) % 60;
  const h = Math.floor(totalSegundos / 3600);
  const dois = (n: number) => String(n).padStart(2, "0");
  const corpo = `${dois(m)}:${dois(s)}:${dois(q)}`;
  return h > 0 ? `${h}:${corpo}` : corpo;
}
