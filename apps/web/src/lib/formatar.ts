// Formatação de números e tempos para as telas, sempre em pt-BR.

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatarTempo(segundos: number | null | undefined): string {
  if (segundos == null || !Number.isFinite(segundos)) return "--:--";
  const total = Math.max(0, Math.floor(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = String(total % 60).padStart(2, "0");
  return horas > 0 ? `${horas}:${String(minutos).padStart(2, "0")}:${resto}` : `${minutos}:${resto}`;
}

/** 1536 → "1,5 KB", 2_700_000_000 → "2,5 GB". */
export function formatarBytes(bytes: number): string {
  const unidades = ["bytes", "KB", "MB", "GB", "TB"];
  let valor = bytes;
  let indice = 0;
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024;
    indice += 1;
  }
  const casas = indice === 0 || valor >= 100 ? 0 : 1;
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })} ${unidades[indice]}`;
}

/** Data de alteração: "agora há pouco", "há 5 min", "há 3 h" ou "12 de mar." */
export function formatarQuando(iso: string, agora = Date.now()): string {
  const momento = new Date(iso).getTime();
  const minutos = Math.floor((agora - momento) / 60_000);
  if (minutos < 1) return "agora há pouco";
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 24 * 60) return `há ${Math.floor(minutos / 60)} h`;
  return new Date(momento).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

export function porcentagem(parte: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((parte / total) * 100)) : 0;
}
