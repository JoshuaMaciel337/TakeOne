"use client";

import { Pause, Play, RotateCcw, X } from "lucide-react";

import { useEnvios } from "@/lib/envios";
import { formatarBytes, porcentagem } from "@/lib/formatar";

/** Envios em andamento nesta aba, com pausar, retomar e cancelar. */
export function ListaEnvios() {
  const { envios, pausar, retomar, cancelar, dispensar } = useEnvios();
  if (envios.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2" aria-label="Envios em andamento">
      {envios.map((envio) => {
        const pct = porcentagem(envio.enviado, envio.tamanho);
        return (
          <li key={envio.chave} className="rounded-lg border border-borda bg-painel-2 p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium" title={envio.nome}>
                {envio.nome}
              </p>
              {envio.estado === "enviando" ? (
                <button type="button" className="botao-icone size-7" onClick={() => pausar(envio.chave)} aria-label="Pausar">
                  <Pause className="size-3.5" aria-hidden />
                </button>
              ) : null}
              {envio.estado === "pausado" ? (
                <button type="button" className="botao-icone size-7" onClick={() => retomar(envio.chave)} aria-label="Continuar">
                  <Play className="size-3.5" aria-hidden />
                </button>
              ) : null}
              {envio.estado === "erro" && envio.midiaId ? (
                <button type="button" className="botao-icone size-7" onClick={() => retomar(envio.chave)} aria-label="Tentar de novo">
                  <RotateCcw className="size-3.5" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className="botao-icone size-7"
                onClick={() => (envio.estado === "erro" && !envio.midiaId ? dispensar(envio.chave) : cancelar(envio.chave))}
                aria-label="Cancelar envio"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            {envio.estado === "erro" ? (
              <p className="mt-1 text-xs text-erro">{envio.erro}</p>
            ) : (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-painel-3">
                  <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: "var(--to-gradiente)" }} />
                </div>
                <p className="mt-1 text-xs text-suave">
                  {envio.estado === "pausado" ? "Pausado" : envio.estado === "preparando" ? "Preparando" : `${pct}%`} ·{" "}
                  {formatarBytes(envio.enviado)} de {formatarBytes(envio.tamanho)}
                </p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
