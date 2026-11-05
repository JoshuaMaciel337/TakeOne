"use client";

import { useSyncExternalStore } from "react";

/**
 * O celular: em pé com menos de 768 px de largura, ou deitado com até 540 px de altura. É a mesma consulta das
 * variantes `celular:`, `empe:` e `deitado:` do globals.css (mudou uma, mude a outra).
 */
export const CONSULTA_DO_CELULAR = "(max-width: 767.98px) and (orientation: portrait), (orientation: landscape) and (max-height: 540px)";

/** Se a tela é a de um celular (os editores trocam as colunas de painéis por folhas). No servidor, não. */
export function useCelular(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia(CONSULTA_DO_CELULAR);
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    () => window.matchMedia(CONSULTA_DO_CELULAR).matches,
    () => false,
  );
}
