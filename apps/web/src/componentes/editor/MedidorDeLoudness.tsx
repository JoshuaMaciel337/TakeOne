"use client";

import { useEffect, useState } from "react";

import { medidorDaPrevia } from "@/lib/previa/audio";
import type { Medida } from "@/lib/previa/medidor";

const numero = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** A barra vai de -40 a 0 LUFS. */
const PISO = -40;

/**
 * O loudness do som da prévia enquanto toca (lib/previa/medidor.ts): a barra é o momentâneo, o número é o curto
 * (3 s) e a dica mostra o integrado desde o play, o pico e quanto a exportação vai subir ou descer para -14 LUFS.
 */
export function MedidorDeLoudness({ tocando }: { tocando: boolean }) {
  const [medida, setMedida] = useState<Medida | null>(null);
  useEffect(() => {
    const medidor = medidorDaPrevia();
    medidor?.medindo(tocando);
    if (!tocando || !medidor) return;
    const relogio = window.setInterval(() => setMedida(medidor.ler()), 200);
    return () => window.clearInterval(relogio);
  }, [tocando]);

  const momentaneo = medida?.momentaneo ?? null;
  const largura = momentaneo === null ? 0 : Math.max(0, Math.min(1, (momentaneo - PISO) / -PISO));
  const estourando = (medida?.picoDb ?? -Infinity) > -1;
  const dica = medida
    ? [
        `Momentâneo: ${momentaneo === null ? "silêncio" : `${numero(momentaneo)} LUFS`}`,
        `Curto (3 s): ${medida.curto === null ? "silêncio" : `${numero(medida.curto)} LUFS`}`,
        `Integrado desde o play: ${medida.integrado === null ? "silêncio" : `${numero(medida.integrado)} LUFS`}`,
        `Pico: ${Number.isFinite(medida.picoDb) ? `${numero(medida.picoDb)} dBFS` : "silêncio"}`,
        medida.integrado === null
          ? "Na exportação, o vídeo vai a -14 LUFS."
          : `Na exportação, o vídeo vai a -14 LUFS: ${medida.ganhoNaExportacao >= 0 ? "sobe" : "desce"} ${numero(Math.abs(medida.ganhoNaExportacao))} dB.`,
      ].join("\n")
    : "Loudness do som: aparece enquanto toca. Na exportação, o vídeo vai a -14 LUFS.";
  return (
    <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-suave" title={dica} role="meter" aria-label="Loudness do som" aria-valuemin={PISO} aria-valuemax={0} aria-valuenow={momentaneo ?? PISO} aria-valuetext={dica}>
      <div className="relative h-1.5 w-14 overflow-hidden rounded-full bg-painel-2">
        <div className={`h-full ${estourando ? "bg-red-500" : "bg-destaque"}`} style={{ width: `${largura * 100}%` }} />
        {/* O alvo da exportação */}
        <div className="absolute inset-y-0 w-px bg-texto/70" style={{ left: `${((-14 - PISO) / -PISO) * 100}%` }} aria-hidden />
      </div>
      <span className="w-14">{medida?.curto != null ? `${numero(medida.curto)} LUFS` : "— LUFS"}</span>
    </div>
  );
}
