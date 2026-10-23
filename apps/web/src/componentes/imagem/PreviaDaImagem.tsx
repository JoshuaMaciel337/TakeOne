"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ManipuladorNaPrevia } from "@/componentes/editor/ManipuladorNaPrevia";
import { arquivoDaMidia } from "@/lib/api";
import { arquivoDaMascaraDaImagem } from "@/lib/exportacao/imagem";
import { useBitmaps } from "@/lib/previa/bitmaps";
import { camadaDoCompositor, camadasDaImagem, textosParaImagens } from "@/lib/previa/camadas";
import { Compositor, FUNDO } from "@/lib/previa/compositor";
import { useImagensDeTexto } from "@/lib/previa/imagensDeTexto";
import { contemPonto, type Guias, type Tamanho } from "@/lib/projeto/geometria";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Projeto, Transformacao } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

/** Densidade máxima de pixels do canvas, como na prévia do vídeo. */
const DENSIDADE_MAXIMA = 2;
/** O xadrez que aparece atrás da imagem sem fundo. */
const XADREZ = "repeating-conic-gradient(#d6d8de 0% 25%, #ffffff 0% 50%) 50% / 20px 20px";

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  selecao: string[];
  aoSelecionar: (ids: string[]) => void;
  aoPrever: (clipeId: string, mudanca: Partial<Transformacao> | null) => void;
  aoTransformar: (clipeId: string, mudanca: Partial<Transformacao>) => void;
};

/** O maior quadro na proporção da imagem que cabe na área livre. */
function useQuadro(largura: number, altura: number) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState<Tamanho>({ largura: 0, altura: 0 });
  useEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      const caberLargura = Math.min(width, (height * largura) / altura);
      setTamanho({
        largura: Math.floor(caberLargura),
        altura: Math.floor((caberLargura * altura) / largura),
      });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [largura, altura]);
  return { areaRef, tamanho };
}

/**
 * A prévia do editor de imagem: o compositor da prévia do vídeo, num quadro só, com as alças para mover, girar
 * e redimensionar. A conta é a da exportação (lib/exportacao/imagem.ts); a prévia só lê as cópias leves.
 */
export function PreviaDaImagem({ projeto, midias, selecao, aoSelecionar, aoPrever, aoTransformar }: Props) {
  const imagem = tamanhoDaImagem(projeto);
  const { areaRef, tamanho } = useQuadro(imagem.largura, imagem.altura);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositor = useRef<Compositor | null>(null);
  const [guias, setGuias] = useState<Guias | null>(null);
  const [semWebgl, setSemWebgl] = useState(false);

  const imagensDeTexto = useImagensDeTexto(textosParaImagens(projeto));
  const camadas = camadasDaImagem(projeto, midias, tamanho, imagensDeTexto);
  const fonteDa = (midiaId: string) => arquivoDaMidia(midiaId, "proxy.webp");
  const enderecos = camadas.flatMap((camada) => {
    if (camada.imagem || !camada.clipe.midia_id || camada.clipe.ajuste) return [];
    const mascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midias.get(camada.clipe.midia_id)) : null;
    return mascara ? [fonteDa(camada.clipe.midia_id), mascara] : [fonteDa(camada.clipe.midia_id)];
  });
  const bitmaps = useBitmaps(enderecos);
  const selecionada = selecao.length === 1 ? camadas.find((camada) => camada.clipe.id === selecao[0]) : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      compositor.current = new Compositor(canvas, { comAlfa: true });
    } catch {
      // Sem WebGL2: a mensagem aparece no lugar do desenho (o estado muda depois do efeito, numa promessa)
      void Promise.resolve().then(() => setSemWebgl(true));
    }
    return () => {
      compositor.current?.destruir();
      compositor.current = null;
    };
  }, []);

  // Desenha a cada mudança (a imagem é parada: não há laço de quadros)
  useLayoutEffect(() => {
    const atual = compositor.current;
    if (!atual || tamanho.largura <= 0) return;
    const prontas = camadas.flatMap((camada) => {
      if (camada.imagem) return [camadaDoCompositor(camada, camada.imagem, null)];
      if (camada.clipe.ajuste) return [camadaDoCompositor(camada, FUNDO, null)];
      const fonte = bitmaps.get(fonteDa(camada.clipe.midia_id!));
      if (!fonte) return [];
      const enderecoDaMascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midias.get(camada.clipe.midia_id!)) : null;
      const mascara = enderecoDaMascara ? bitmaps.get(enderecoDaMascara) : null;
      if (enderecoDaMascara && !mascara) return [];
      return [camadaDoCompositor(camada, fonte, mascara ?? null)];
    });
    const densidade = Math.min(window.devicePixelRatio || 1, DENSIDADE_MAXIMA);
    const resolucao = {
      largura: Math.round(tamanho.largura * densidade),
      altura: Math.round(tamanho.altura * densidade),
    };
    atual.desenhar(prontas, projeto.fundo.transparente ? null : projeto.fundo.cor, tamanho, resolucao);
  });

  function selecionarNoPonto(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const ponto = {
      x: evento.clientX - retangulo.left,
      y: evento.clientY - retangulo.top,
    };
    const acima = [...camadas].reverse().find((camada) => camada.caixa.opacidade > 0 && contemPonto(camada.caixa, ponto));
    aoSelecionar(acima ? [acima.clipe.id] : []);
  }

  return (
    <section aria-label="Prévia da imagem" className="flex min-h-0 min-w-0 flex-1 flex-col bg-fundo max-md:order-first max-md:h-[52vh] max-md:flex-none">
      <div ref={areaRef} className="relative min-h-0 flex-1 p-6">
        <div className="absolute inset-6 flex items-center justify-center">
          <div
            className="relative select-none shadow-lg shadow-black/40"
            style={{
              width: tamanho.largura,
              height: tamanho.altura,
              background: projeto.fundo.transparente ? XADREZ : projeto.fundo.cor,
            }}
            onPointerDown={selecionarNoPonto}
          >
            <canvas ref={canvasRef} className="absolute inset-0 size-full" />
            {semWebgl ? (
              <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-black/70">
                Este navegador não tem WebGL2, que o editor usa para desenhar. Use o Chrome ou o Edge atualizados.
              </p>
            ) : null}
            {guias ? (
              <>
                {guias.verticais.map((x) => (
                  <div key={`v${x}`} className="pointer-events-none absolute inset-y-0 w-px bg-aviso" style={{ left: x }} aria-hidden />
                ))}
                {guias.horizontais.map((y) => (
                  <div key={`h${y}`} className="pointer-events-none absolute inset-x-0 h-px bg-aviso" style={{ top: y }} aria-hidden />
                ))}
              </>
            ) : null}
            {selecionada ? (
              <ManipuladorNaPrevia
                key={selecionada.clipe.id}
                caixa={selecionada.caixaBase}
                quadro={tamanho}
                transformacao={selecionada.clipe.transformacao}
                travado={selecionada.faixa.travada}
                aoMudar={(mudanca, novasGuias) => {
                  aoPrever(selecionada.clipe.id, mudanca);
                  setGuias(novasGuias.verticais.length || novasGuias.horizontais.length ? novasGuias : null);
                }}
                aoSoltar={(mudanca) => {
                  setGuias(null);
                  aoPrever(selecionada.clipe.id, null);
                  if (mudanca) aoTransformar(selecionada.clipe.id, mudanca);
                }}
              />
            ) : null}
            {camadas.length === 0 ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-[10%] text-center text-xs text-black/50 mix-blend-difference">
                Ponha uma imagem, um texto ou uma forma pelo painel da esquerda.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <p className="shrink-0 border-t border-borda px-3 py-2 text-center text-xs text-suave tabular-nums">
        {imagem.largura} × {imagem.altura} px
      </p>
    </section>
  );
}
