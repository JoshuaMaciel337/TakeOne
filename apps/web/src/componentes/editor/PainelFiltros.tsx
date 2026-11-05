"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import { AJUSTES_NEUTROS, aplicarCor, FILTROS } from "@/lib/projeto/cor";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import type { Tick } from "@/lib/tempo";

import { GradeDeMateriais } from "./GradeDeMateriais";

/** Cores de amostra para quando não há quadro: pele, céu, folha, sombra e claro. */
const AMOSTRAS: [number, number, number][] = [
  [0.85, 0.62, 0.5],
  [0.35, 0.6, 0.9],
  [0.3, 0.6, 0.25],
  [0.15, 0.12, 0.2],
  [0.95, 0.9, 0.75],
];
const LARGURA = 96;
const ALTURA = 54;

/** O quadro de cada mídia em 96 × 54 (a capa, cobrindo), lido uma vez por mídia. */
const quadros = new Map<string, Promise<ImageData | null>>();
function quadroDaMidia(midiaId: string): Promise<ImageData | null> {
  let pedido = quadros.get(midiaId);
  if (!pedido) {
    pedido = fetch(`/api/midias/${midiaId}/arquivos/capa.jpg`)
      .then((resposta) => (resposta.ok ? resposta.blob() : Promise.reject(new Error(String(resposta.status)))))
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        const tela = new OffscreenCanvas(LARGURA, ALTURA);
        const contexto = tela.getContext("2d")!;
        const escala = Math.max(LARGURA / bitmap.width, ALTURA / bitmap.height);
        contexto.drawImage(bitmap, (LARGURA - bitmap.width * escala) / 2, (ALTURA - bitmap.height * escala) / 2, bitmap.width * escala, bitmap.height * escala);
        bitmap.close();
        return contexto.getImageData(0, 0, LARGURA, ALTURA);
      })
      .catch(() => null);
    quadros.set(midiaId, pedido);
  }
  return pedido;
}

/** O quadro do clipe escolhido com o filtro, pela mesma conta da prévia e do render (sem a vinheta, que é do lugar). */
function Miniatura({ quadro, filtro }: { quadro: ImageData | null; filtro: string | null }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const ajustes = { ...AJUSTES_NEUTROS, ...(FILTROS.find((f) => f.id === filtro)?.ajustes ?? {}) };
  useEffect(() => {
    if (!quadro || !tela.current) return;
    const saida = new ImageData(LARGURA, ALTURA);
    const d = quadro.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = filtro ? aplicarCor([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], ajustes) : [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
      saida.data[i] = r * 255;
      saida.data[i + 1] = g * 255;
      saida.data[i + 2] = b * 255;
      saida.data[i + 3] = 255;
    }
    tela.current.getContext("2d")?.putImageData(saida, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- os ajustes saem do filtro
  }, [quadro, filtro]);
  if (!quadro) {
    return (
      <span className="flex aspect-video w-full overflow-hidden rounded" aria-hidden>
        {AMOSTRAS.map((amostra, i) => {
          const [r, g, b] = filtro ? aplicarCor(amostra, ajustes) : amostra;
          return <span key={i} className="flex-1" style={{ background: `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})` }} />;
        })}
      </span>
    );
  }
  return <canvas ref={tela} width={LARGURA} height={ALTURA} className="aspect-video w-full rounded" aria-hidden />;
}

type Props = {
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoExecutar: (comando: Comando) => void;
  /** A prévia do filtro sob o mouse no clipe escolhido (null só tira a prévia). */
  aoMostrar?: (comando: Comando | null) => void;
  /** O cursor: a camada de ajuste nova começa nele. Sem ele (editor de imagem), o botão não aparece. */
  tempo?: Tick;
};

/** Ferramenta Filtros: aplica um filtro pronto ao clipe selecionado (ou arrastado até um clipe). A intensidade fica na aba Cor. */
export function PainelFiltros({ selecionado, aoExecutar, aoMostrar, tempo }: Props) {
  const podeAplicar = selecionado !== null && selecionado.faixa.tipo !== "audio";
  const atual = podeAplicar ? (selecionado.clipe.cor?.filtro ?? null) : null;
  const midiaId = podeAplicar ? selecionado.clipe.midia_id : null;
  const [quadro, setQuadro] = useState<{ midiaId: string; dados: ImageData | null } | null>(null);
  useEffect(() => {
    if (!midiaId) return;
    let valendo = true;
    quadroDaMidia(midiaId).then((dados) => {
      if (valendo) setQuadro({ midiaId, dados });
    });
    return () => {
      valendo = false;
    };
  }, [midiaId]);
  const dados = quadro && quadro.midiaId === midiaId ? quadro.dados : null;
  const aplicar = (filtro: string | null) => {
    if (podeAplicar) aoExecutar({ comando: "clipe.cor", parametros: { clipeIds: [selecionado.clipe.id], cor: { filtro } } });
  };

  return (
    <div className="flex flex-col gap-3">
      {tempo !== undefined ? (
        <button
          type="button"
          className="botao-secundario w-full px-3 py-1.5 text-xs"
          onClick={() => aoExecutar({ comando: "clipe.adicionarAjuste", parametros: { inicio: tempo } })}
          title="Uma camada sem mídia: o filtro e a cor dela valem para tudo o que está embaixo, enquanto ela dura"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Pôr uma camada de ajuste no cursor
        </button>
      ) : null}
      <p className="text-xs text-suave">
        {podeAplicar
          ? "Escolha um filtro para o clipe selecionado, ou arraste um até um clipe da linha do tempo. A intensidade fica na aba Cor."
          : "Selecione um clipe de imagem, ou arraste um filtro até um clipe da linha do tempo."}
      </p>
      <GradeDeMateriais
        tipo="filtro"
        itens={FILTROS.map((filtro) => ({ id: filtro.id, nome: filtro.nome }))}
        atual={atual}
        nenhum={{ nome: "Original" }}
        miniatura={(id) => <Miniatura quadro={dados} filtro={id} />}
        aoEscolher={aplicar}
        aoPassar={podeAplicar && aoMostrar ? (id) => aoMostrar(id === null ? null : { comando: "clipe.cor", parametros: { clipeIds: [selecionado.clipe.id], cor: { filtro: id } } }) : undefined}
      />
    </div>
  );
}
