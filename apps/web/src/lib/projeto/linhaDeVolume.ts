// A linha de volume dos clipes na linha do tempo (ADR 0007, 17.2): a altura dela, de 0 (embaixo) a 1 (em cima), é o
// volume em decibéis entre -40 e +12 dB (o volume vai até 4, +12 dB). Embaixo de tudo é o mudo.

export const DB_MINIMO = -40;
export const DB_MAXIMO = 12;
export const VOLUME_MAXIMO = 4;

/** A altura (0 a 1) da linha para um volume (fator, 1 = como gravado). */
export function alturaDoVolume(volume: number): number {
  if (volume <= 0) return 0;
  const db = 20 * Math.log10(volume);
  return (Math.min(DB_MAXIMO, Math.max(DB_MINIMO, db)) - DB_MINIMO) / (DB_MAXIMO - DB_MINIMO);
}

/** O volume de uma altura da linha, com duas casas (o encaixe em 0 dB fica a 2% da altura). */
export function volumeDaAltura(altura: number): number {
  if (altura <= 0.01) return 0;
  const zero = alturaDoVolume(1);
  if (Math.abs(altura - zero) < 0.02) return 1;
  const volume = 10 ** ((DB_MINIMO + Math.min(1, altura) * (DB_MAXIMO - DB_MINIMO)) / 20);
  return Math.min(VOLUME_MAXIMO, Math.round(volume * 100) / 100);
}

/** "−6,0 dB", "0 dB", "mudo". */
export function textoDoVolume(volume: number): string {
  if (volume <= 0) return "mudo";
  const db = 20 * Math.log10(volume);
  if (Math.abs(db) < 0.05) return "0 dB";
  return `${db > 0 ? "+" : "−"}${Math.abs(db).toFixed(1).replace(".", ",")} dB`;
}

/** O fade arrastado pela alça: preso entre zero e o que sobra do clipe depois do outro fade, em quadros inteiros. */
export function fadeArrastado(atual: number, delta: number, duracao: number, outro: number, quadro: number): number {
  const novo = Math.min(Math.max(0, atual + delta), Math.max(0, duracao - outro));
  return Math.min(Math.round(novo / quadro) * quadro, Math.max(0, duracao - outro));
}
