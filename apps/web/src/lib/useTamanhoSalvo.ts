"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Um tamanho em pixels (largura de painel, altura da linha do tempo) que a pessoa ajusta
 * arrastando e que fica lembrado neste navegador.
 */
export function useTamanhoSalvo(chave: string, padrao: number, minimo: number, maximo: number) {
  const [tamanho, setTamanho] = useState(padrao);

  useEffect(() => {
    try {
      const salvo = Number(localStorage.getItem(`takeone-${chave}`));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe depois de montar
      if (salvo >= minimo && salvo <= maximo) setTamanho(salvo);
    } catch {
      // Sem armazenamento (aba anônima): fica o padrão
    }
  }, [chave, minimo, maximo]);

  const ajustar = useCallback(
    (novo: number) => {
      const limitado = Math.round(Math.min(maximo, Math.max(minimo, novo)));
      setTamanho(limitado);
      try {
        localStorage.setItem(`takeone-${chave}`, String(limitado));
      } catch {
        // Sem armazenamento: vale só até fechar a página
      }
    },
    [chave, minimo, maximo],
  );

  return [tamanho, ajustar] as const;
}
