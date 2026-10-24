"use client";

// O painel Linha do tempo do editor de imagem (ADR 0003, onda 13.15): a animação em quadros. Cada quadro aparece com a
// miniatura e o tempo dele; escolher um mostra as camadas como estão nele, e o que muda nas camadas vale para ele.
// Embaixo: a repetição, o primeiro, o anterior, tocar ou parar, o próximo, interpolar, duplicar e excluir o quadro, e no
// menu exportar o GIF e o vídeo, abrir no editor de vídeo e excluir a animação.
import { ChevronLeft, ChevronRight, Copy, Film, MoreHorizontal, Play, SkipBack, Square, Trash2, Waypoints } from "lucide-react";
import { useEffect, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { exportarImagem } from "@/lib/exportacao/imagem";
import { type AnimacaoDaImagem, ATRASOS, compDoQuadro, duracaoDaAnimacao, REPETICOES } from "@/lib/imagem/animacao";
import { aplicarComp } from "@/lib/imagem/comps";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { Moldura } from "./JanelasDePixels";

const LADO_DA_MINIATURA = 96;
const CAMPO = "rounded border border-borda bg-painel-2 px-1 py-0.5 text-[11px] text-texto";
const textoDoAtraso = (s: number) => (s === 0 ? "0 s" : `${s.toLocaleString("pt-BR")} s`);

/** As miniaturas dos quadros, pelas cópias leves das fotos, refeitas um pouco depois de o documento mudar. */
function useMiniaturas(projeto: Projeto, midias: ReadonlyMap<string, Midia>, animacao: AnimacaoDaImagem | null) {
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!animacao?.quadros.length) return;
    let cancelado = false;
    const criadas: string[] = [];
    const espera = window.setTimeout(async () => {
      const { largura, altura } = tamanhoDaImagem(projeto);
      const escala = Math.min(1, LADO_DA_MINIATURA / Math.max(largura, altura));
      const novas: Record<string, string> = {};
      for (const quadro of animacao.quadros) {
        if (cancelado) return;
        try {
          const blob = await exportarImagem(aplicarComp(projeto, compDoQuadro(quadro)), midias, { formato: "png", escala, fonteDa: (midia) => carregarBitmap(arquivoDaMidia(midia.id, "proxy.webp")) });
          const url = URL.createObjectURL(blob);
          criadas.push(url);
          novas[quadro.id] = url;
        } catch {
          // Sem a miniatura: o quadro aparece com o número
        }
      }
      if (!cancelado)
        setMiniaturas((antigas) => {
          for (const url of Object.values(antigas)) URL.revokeObjectURL(url);
          return novas;
        });
    }, 500);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, [projeto, midias, animacao]);
  return miniaturas;
}

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  animacao: AnimacaoDaImagem | null;
  atual: string | null;
  tocando: boolean;
  aoCriar: () => void;
  aoEscolher: (id: string) => void;
  aoDuplicar: () => void;
  aoExcluir: (id: string) => void;
  aoMover: (id: string, passo: -1 | 1) => void;
  aoAtraso: (id: string, atraso: number) => void;
  aoRepetir: (vezes: number) => void;
  aoTocar: () => void;
  aoParar: () => void;
  aoInterpolar: (quantos: number) => void;
  aoExportar: (como: "gif" | "video" | "editor") => void;
  aoExcluirAnimacao: () => void;
};

export function PainelLinhaDoTempo(props: Props) {
  const { projeto, midias, animacao, atual, tocando } = props;
  const miniaturas = useMiniaturas(projeto, midias, animacao);
  const [menu, setMenu] = useState(false);
  const [interpolando, setInterpolando] = useState(false);
  const [quantos, setQuantos] = useState(3);
  if (!animacao?.quadros.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-suave">
        <Film className="size-6" aria-hidden />
        <p>Anime as camadas em quadros: cada quadro guarda o olho, a posição e a aparência delas.</p>
        <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={props.aoCriar}>
          Criar a animação em quadros
        </button>
      </div>
    );
  }
  const indice = Math.max(0, animacao.quadros.findIndex((quadro) => quadro.id === atual));
  const ir = (i: number) => props.aoEscolher(animacao.quadros[(i + animacao.quadros.length) % animacao.quadros.length].id);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ol aria-label="Quadros" className="flex min-h-0 flex-1 items-start gap-1.5 overflow-x-auto p-2">
        {animacao.quadros.map((quadro, i) => (
          <li key={quadro.id} className={`flex w-[104px] shrink-0 flex-col items-center gap-1 rounded border p-1 ${quadro.id === atual ? "border-destaque bg-destaque/15" : "border-borda"}`}>
            <button type="button" className="grid h-[72px] w-full place-items-center bg-painel-2" onClick={() => props.aoEscolher(quadro.id)} aria-label={`Quadro ${i + 1}`} data-quadro={i + 1}>
              {miniaturas[quadro.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={miniaturas[quadro.id]} alt="" className="max-h-[72px] max-w-full object-contain" />
              ) : (
                <span className="text-lg text-suave">{i + 1}</span>
              )}
            </button>
            <div className="flex w-full items-center gap-1 text-[10px]">
              <span className="text-suave">{i + 1}</span>
              <select aria-label={`Tempo do quadro ${i + 1}`} className={`${CAMPO} min-w-0 flex-1`} value={ATRASOS.includes(quadro.atraso) ? quadro.atraso : "outro"} onChange={(e) => e.currentTarget.value !== "outro" && props.aoAtraso(quadro.id, Number(e.currentTarget.value))}>
                {ATRASOS.map((s) => (
                  <option key={s} value={s}>
                    {textoDoAtraso(s)}
                  </option>
                ))}
                {!ATRASOS.includes(quadro.atraso) ? <option value="outro">{textoDoAtraso(quadro.atraso)}</option> : null}
              </select>
            </div>
          </li>
        ))}
      </ol>
      <div className="relative flex shrink-0 flex-wrap items-center gap-0.5 border-t border-borda px-1.5 py-1 text-[11px]">
        <select aria-label="Repetir a animação" className={CAMPO} value={REPETICOES.some((r) => r.vezes === animacao.repetir) ? animacao.repetir : "outro"} onChange={(e) => e.currentTarget.value !== "outro" && props.aoRepetir(Number(e.currentTarget.value))}>
          {REPETICOES.map((r) => (
            <option key={r.vezes} value={r.vezes}>
              {r.nome}
            </option>
          ))}
          {!REPETICOES.some((r) => r.vezes === animacao.repetir) ? <option value="outro">{animacao.repetir} vezes</option> : null}
        </select>
        <button type="button" className="botao-icone size-6" onClick={() => ir(0)} aria-label="Primeiro quadro" title="Primeiro quadro">
          <SkipBack className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" onClick={() => ir(indice - 1)} aria-label="Quadro anterior" title="Quadro anterior">
          <ChevronLeft className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" onClick={tocando ? props.aoParar : props.aoTocar} aria-label={tocando ? "Parar a animação" : "Tocar a animação"} title={tocando ? "Parar" : "Tocar"}>
          {tocando ? <Square className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
        </button>
        <button type="button" className="botao-icone size-6" onClick={() => ir(indice + 1)} aria-label="Próximo quadro" title="Próximo quadro">
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
        <span className="ml-1 whitespace-nowrap tabular-nums text-suave" title="Uma volta">
          {duracaoDaAnimacao(animacao).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s
        </span>
        <span className="ml-auto" />
        <button type="button" className="botao-icone size-6" disabled={indice >= animacao.quadros.length - 1} onClick={() => setInterpolando(true)} aria-label="Interpolar" title="Criar os quadros do meio entre este e o próximo">
          <Waypoints className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={indice <= 0} onClick={() => atual && props.aoMover(atual, -1)} aria-label="Mover o quadro para a esquerda" title="Mover para a esquerda">
          ‹
        </button>
        <button type="button" className="botao-icone size-6" disabled={indice >= animacao.quadros.length - 1} onClick={() => atual && props.aoMover(atual, 1)} aria-label="Mover o quadro para a direita" title="Mover para a direita">
          ›
        </button>
        <button type="button" className="botao-icone size-6" onClick={props.aoDuplicar} aria-label="Duplicar o quadro" title="Duplicar o quadro escolhido">
          <Copy className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={animacao.quadros.length < 2} onClick={() => atual && props.aoExcluir(atual)} aria-label="Excluir o quadro" title="Excluir o quadro escolhido">
          <Trash2 className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" onClick={() => setMenu((m) => !m)} aria-label="Menu da linha do tempo" aria-haspopup="menu" aria-expanded={menu}>
          <MoreHorizontal className="size-3.5" aria-hidden />
        </button>
        {menu ? (
          <div role="menu" className="absolute bottom-8 right-1 z-30 w-56 rounded-md border border-borda bg-painel-2 py-1 shadow-xl">
            {(
              [
                ["Exportar o GIF animado", () => props.aoExportar("gif")],
                ["Exportar o vídeo (MP4)", () => props.aoExportar("video")],
                ["Abrir no editor de vídeo", () => props.aoExportar("editor")],
                ["Excluir a animação", props.aoExcluirAnimacao],
              ] as const
            ).map(([rotulo, acao]) => (
              <button
                key={rotulo}
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1 text-left text-xs hover:bg-painel-3"
                onClick={() => {
                  setMenu(false);
                  acao();
                }}
              >
                {rotulo}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {interpolando ? (
        <Moldura
          titulo="Interpolar"
          aoFechar={() => setInterpolando(false)}
          aoConfirmar={() => {
            setInterpolando(false);
            props.aoInterpolar(quantos);
          }}
        >
          <p className="text-suave">Os quadros do meio entre o quadro {indice + 1} e o {indice + 2}: a posição, a escala, o giro e a opacidade andam aos poucos.</p>
          <label className="flex items-center gap-2">
            Quadros a acrescentar:
            <input type="number" aria-label="Quadros a acrescentar" className={`${CAMPO} w-16`} min={1} max={50} value={quantos} autoFocus onChange={(e) => setQuantos(Math.min(50, Math.max(1, Math.round(Number(e.currentTarget.value) || 1))))} />
          </label>
        </Moldura>
      ) : null}
    </div>
  );
}
