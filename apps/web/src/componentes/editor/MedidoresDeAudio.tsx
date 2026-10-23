"use client";

import { useEffect, useState } from "react";

import { medidorDaPrevia } from "@/lib/previa/audio";
import type { Medida } from "@/lib/previa/medidor";

/** A escala vai de -54 dB a 0, com uma marca a cada 6 dB, como nos medidores dos editores profissionais. */
const PISO = -54;
const MARCAS = [0, -6, -12, -18, -24, -30, -36, -42, -48, -54];
const numero = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function altura(db: number | null): number {
  if (db === null || !Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - PISO) / -PISO));
}

/**
 * Medidores de áudio: o pico do som da prévia em dBFS (a barra, verde, amarela perto de -6 e vermelha acima de -1) e o
 * loudness momentâneo (a linha), na mesma medida do medidor da barra da prévia (lib/previa/medidor.ts). Fica ao lado
 * da linha do tempo.
 */
export function MedidoresDeAudio({ tocando, className = "" }: { tocando: boolean; className?: string }) {
  const [medida, setMedida] = useState<Medida | null>(null);
  useEffect(() => {
    const medidor = medidorDaPrevia();
    medidor?.medindo(tocando);
    if (!tocando || !medidor) return;
    const relogio = window.setInterval(() => setMedida(medidor.ler()), 100);
    return () => window.clearInterval(relogio);
  }, [tocando]);

  const pico = tocando ? (medida?.picoDb ?? null) : null;
  const momentaneo = tocando ? (medida?.momentaneo ?? null) : null;
  const cor = pico !== null && pico > -1 ? "bg-red-500" : pico !== null && pico > -6 ? "bg-yellow-400" : "bg-green-500";
  const dica = medida
    ? `Pico: ${pico !== null && Number.isFinite(pico) ? `${numero(pico)} dBFS` : "silêncio"}\nMomentâneo: ${momentaneo === null ? "silêncio" : `${numero(momentaneo)} LUFS`}\nIntegrado desde o play: ${medida.integrado === null ? "silêncio" : `${numero(medida.integrado)} LUFS`}\nNa exportação, o vídeo vai a -14 LUFS.`
    : "Medidores de áudio: aparecem enquanto toca. Na exportação, o vídeo vai a -14 LUFS.";
  return (
    <section aria-label="Medidores de áudio" title={dica} className={`flex shrink-0 flex-col border-l border-borda bg-painel py-2 text-[9px] text-suave ${className}`}>
      <div className="relative mx-auto flex min-h-0 flex-1 gap-1">
        {/* Dois canais com a mesma medida: o medidor mede a mistura */}
        {[0, 1].map((canal) => (
          <div key={canal} className="relative w-2 overflow-hidden rounded-sm bg-painel-3">
            <div className={`absolute inset-x-0 bottom-0 ${cor}`} style={{ height: `${altura(pico) * 100}%` }} />
            {momentaneo !== null ? <div className="absolute inset-x-0 h-px bg-texto" style={{ bottom: `${altura(momentaneo) * 100}%` }} aria-hidden /> : null}
          </div>
        ))}
        <div className="relative w-4">
          {MARCAS.map((marca) => (
            <span key={marca} className="absolute right-0 translate-y-1/2 tabular-nums leading-none" style={{ bottom: `${altura(marca) * 100}%` }}>
              {marca}
            </span>
          ))}
        </div>
      </div>
      <span className="mt-1 text-center">dB</span>
    </section>
  );
}
