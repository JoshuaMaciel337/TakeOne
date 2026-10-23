"use client";

// As camadas de pixels sendo pintadas (ADR 0003, decisão 2): um motor (lib/pintura/motor.ts) por clipe, com o canvas
// da versão que o clipe mostra. Ao soltar o traço, a camada sobe como versão nova e o comando camada.pixels troca o
// número no clipe, um passo do desfazer; enquanto sobe, a prévia mostra o canvas daqui. Desfazer e exportar esperam
// os envios terminarem, para não pularem um traço.
import { useCallback, useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { Pintura } from "@/lib/pintura/motor";
import { arquivoDaVersao, enviarVersao } from "@/lib/pixels";
import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe } from "@/lib/projeto/modelo";

type Entrada = {
  midiaId: string;
  pintura: Pintura;
  /** A versão do servidor que está no canvas (ou que o canvas acabou de virar). */
  versao: number;
  /** Há traços que ainda não subiram. */
  sujo: boolean;
  enviando: Promise<void> | null;
  /** Um traço novo chegou durante o envio: sobe de novo no fim. */
  deNovo: boolean;
};

export type Pinturas = ReturnType<typeof usePinturas>;

export function usePinturas({ executar, aoAvisar }: { executar: (comando: Comando) => unknown; aoAvisar: (mensagem: string) => void }) {
  const entradas = useRef(new Map<string, Entrada>());
  // Cada quadro do traço muda a tela; a prévia desenha de novo quando este número muda
  const [quadro, setQuadro] = useState(0);
  const [enviando, setEnviando] = useState(0);
  const executarRef = useRef(executar);
  const avisarRef = useRef(aoAvisar);
  useEffect(() => {
    executarRef.current = executar;
    avisarRef.current = aoAvisar;
  });

  /** O canvas do clipe, se ele está com a versão que o clipe mostra (ou com traços ainda subindo). */
  const fonte = useCallback((clipe: Clipe): HTMLCanvasElement | null => {
    const entrada = entradas.current.get(clipe.id);
    if (!entrada || !clipe.pixels || entrada.midiaId !== clipe.midia_id) return null;
    return entrada.sujo || entrada.pintura.pintando || entrada.versao === clipe.pixels.versao ? entrada.pintura.fonte : null;
  }, []);

  /** O motor do clipe com a versão dele carregada (a de outra versão, depois do desfazer, é carregada de novo). */
  const preparar = useCallback(async (clipe: Clipe, tamanho: { largura: number; altura: number }): Promise<Pintura> => {
    const versao = clipe.pixels?.versao ?? 0;
    let entrada = entradas.current.get(clipe.id);
    if (entrada && (entrada.midiaId !== clipe.midia_id || entrada.pintura.largura !== tamanho.largura || entrada.pintura.altura !== tamanho.altura)) entrada = undefined;
    if (entrada && (entrada.versao === versao || entrada.sujo)) return entrada.pintura;
    const pintura = entrada?.pintura ?? new Pintura(tamanho.largura, tamanho.altura);
    pintura.carregar(versao > 0 ? await carregarBitmap(arquivoDaMidia(clipe.midia_id!, arquivoDaVersao(versao))) : null);
    entradas.current.set(clipe.id, { midiaId: clipe.midia_id!, pintura, versao, sujo: false, enviando: null, deNovo: false });
    return pintura;
  }, []);

  const avisarQuadro = useCallback(() => setQuadro((atual) => atual + 1), []);

  /** O traço acabou: a camada sobe como versão nova (um envio por vez; os traços do meio vão no próximo). */
  const soltar = useCallback((clipeId: string) => {
    const entrada = entradas.current.get(clipeId);
    if (!entrada) return;
    entrada.sujo = true;
    if (entrada.enviando) {
      entrada.deNovo = true;
      return;
    }
    setEnviando((atual) => atual + 1);
    entrada.enviando = (async () => {
      do {
        entrada.deNovo = false;
        try {
          const versao = await enviarVersao(entrada.midiaId, await entrada.pintura.png());
          entrada.versao = versao;
          if (!entrada.deNovo) entrada.sujo = false;
          executarRef.current({ comando: "camada.pixels", parametros: { clipeId, versao } });
        } catch (erro) {
          avisarRef.current(erro instanceof Error ? erro.message : "Não foi possível guardar a pintura.");
          return;
        }
      } while (entrada.deNovo);
    })().finally(() => {
      entrada.enviando = null;
      setEnviando((atual) => atual - 1);
    });
  }, []);

  /** Espera os envios em andamento (o desfazer e a exportação vêm depois deles). */
  const esperar = useCallback(async () => {
    for (;;) {
      const pendentes = [...entradas.current.values()].flatMap((entrada) => (entrada.enviando ? [entrada.enviando] : []));
      if (!pendentes.length) return;
      await Promise.all(pendentes);
    }
  }, []);

  return { fonte, preparar, avisarQuadro, soltar, esperar, quadro, enviando: enviando > 0 };
}
