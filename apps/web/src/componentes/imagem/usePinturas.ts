"use client";

// As camadas de pixels e as máscaras de camada sendo pintadas (ADR 0003, decisão 2): um motor (lib/pintura/motor.ts)
// por alvo (o clipe, ou "<clipe>#mascara"), com o canvas da versão que o clipe mostra. Ao soltar o traço, o canvas
// sobe como versão nova e um comando troca o número no clipe, um passo do desfazer; enquanto sobe, a prévia mostra o
// canvas daqui. Desfazer e exportar esperam os envios terminarem, para não pularem um traço.
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
  /** O comando que põe a versão nova no clipe. */
  aoSubir: (versao: number) => Comando;
};

/** O que é pintado: a mídia, a versão que o clipe mostra e o comando da versão nova. */
export type AlvoDoMotor = { chave: string; midiaId: string; versao: number; aoSubir: (versao: number) => Comando };

/** O alvo da camada de pixels do clipe. */
export function alvoDosPixels(clipe: Clipe): AlvoDoMotor | null {
  if (!clipe.pixels || !clipe.midia_id) return null;
  return { chave: clipe.id, midiaId: clipe.midia_id, versao: clipe.pixels.versao, aoSubir: (versao) => ({ comando: "camada.pixels", parametros: { clipeId: clipe.id, versao } }) };
}

/** O alvo da máscara de camada do clipe. */
export function alvoDaMascara(clipe: Clipe): AlvoDoMotor | null {
  const mascara = clipe.mascara_pixels;
  if (!mascara) return null;
  return { chave: `${clipe.id}#mascara`, midiaId: mascara.midia_id, versao: mascara.versao, aoSubir: (versao) => ({ comando: "mascara.mudar", parametros: { clipeId: clipe.id, mudanca: { versao } } }) };
}

/** A máscara dos filtros inteligentes, como a máscara da camada (o pincel pinta nela com ela em foco). */
export function alvoDaMascaraDosFiltros(clipe: Clipe): AlvoDoMotor | null {
  const mascara = clipe.filtros_inteligentes?.mascara;
  if (!mascara) return null;
  return { chave: `${clipe.id}#filtros`, midiaId: mascara.midia_id, versao: mascara.versao, aoSubir: (versao) => ({ comando: "imagem.mascaraDosFiltros", parametros: { clipeId: clipe.id, mudanca: { versao } } }) };
}

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

  /** O canvas do alvo, se ele está com a versão que o clipe mostra (ou com traços ainda subindo). */
  const fonteDoAlvo = useCallback((alvo: AlvoDoMotor | null): HTMLCanvasElement | null => {
    const entrada = alvo ? entradas.current.get(alvo.chave) : undefined;
    if (!alvo || !entrada || entrada.midiaId !== alvo.midiaId) return null;
    return entrada.sujo || entrada.pintura.pintando || entrada.versao === alvo.versao ? entrada.pintura.fonte : null;
  }, []);
  const fonte = useCallback((clipe: Clipe) => fonteDoAlvo(alvoDosPixels(clipe)), [fonteDoAlvo]);
  const fonteDaMascara = useCallback((clipe: Clipe) => fonteDoAlvo(alvoDaMascara(clipe)), [fonteDoAlvo]);
  const fonteDaMascaraDosFiltros = useCallback((clipe: Clipe) => fonteDoAlvo(alvoDaMascaraDosFiltros(clipe)), [fonteDoAlvo]);

  /** O motor do alvo com a versão dele carregada (a de outra versão, depois do desfazer, é carregada de novo). */
  const preparar = useCallback(async (alvo: AlvoDoMotor, tamanho: { largura: number; altura: number }): Promise<Pintura> => {
    let entrada = entradas.current.get(alvo.chave);
    if (entrada && (entrada.midiaId !== alvo.midiaId || entrada.pintura.largura !== tamanho.largura || entrada.pintura.altura !== tamanho.altura)) entrada = undefined;
    if (entrada && (entrada.versao === alvo.versao || entrada.sujo)) {
      entrada.aoSubir = alvo.aoSubir;
      return entrada.pintura;
    }
    const pintura = entrada?.pintura ?? new Pintura(tamanho.largura, tamanho.altura);
    pintura.carregar(alvo.versao > 0 ? await carregarBitmap(arquivoDaMidia(alvo.midiaId, arquivoDaVersao(alvo.versao))) : null);
    entradas.current.set(alvo.chave, { midiaId: alvo.midiaId, pintura, versao: alvo.versao, sujo: false, enviando: null, deNovo: false, aoSubir: alvo.aoSubir });
    return pintura;
  }, []);

  const avisarQuadro = useCallback(() => setQuadro((atual) => atual + 1), []);

  /** O traço acabou: o alvo sobe como versão nova (um envio por vez; os traços do meio vão no próximo). */
  const soltar = useCallback((chave: string) => {
    const entrada = entradas.current.get(chave);
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
          executarRef.current(entrada.aoSubir(versao));
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

  return { fonte, fonteDaMascara, fonteDaMascaraDosFiltros, fonteDe: fonteDoAlvo, preparar, avisarQuadro, soltar, esperar, quadro, enviando: enviando > 0 };
}
