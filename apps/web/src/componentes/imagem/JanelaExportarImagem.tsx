"use client";

import { Download, Film, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { exportarImagem, FORMATOS_DA_IMAGEM, type FormatoDaImagem } from "@/lib/exportacao/imagem";
import { useEnvios } from "@/lib/envios";
import { formatarBytes } from "@/lib/formatar";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Clipe, Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

const ESCALAS = [0.5, 1, 2];
const EXTENSOES: Record<FormatoDaImagem, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

type Props = {
  projeto: Projeto;
  nome: string;
  midias: ReadonlyMap<string, Midia>;
  aoFechar: () => void;
  aoAvisar: (mensagem: string) => void;
  /** Antes de gerar: espera a pintura que ainda está subindo (o projeto da hora vem depois dela). */
  aoPrepararPintura?: () => Promise<Projeto>;
  fonteDosPixels?: (clipe: Clipe) => HTMLCanvasElement | null;
};

/** Nome de arquivo sem os caracteres que os sistemas recusam. */
function nomeDoArquivo(nome: string, formato: FormatoDaImagem): string {
  return `${nome.replace(/[\\/:*?"<>|]+/g, " ").trim() || "imagem"}.${EXTENSOES[formato]}`;
}

/** Exportar: o formato, o tamanho e a qualidade; baixar o arquivo ou mandar para a biblioteca, para usar nos vídeos. */
export function JanelaExportarImagem({ projeto, nome, midias, aoFechar, aoAvisar, aoPrepararPintura, fonteDosPixels }: Props) {
  const { iniciar } = useEnvios();
  const [formato, setFormato] = useState<FormatoDaImagem>("png");
  const [escala, setEscala] = useState(1);
  const [qualidade, setQualidade] = useState(0.92);
  const [gerando, setGerando] = useState<"baixar" | "biblioteca" | null>(null);
  const [erro, setErro] = useState("");
  const base = tamanhoDaImagem(projeto);
  const semFundoNoJpg = Boolean(projeto.fundo.transparente) && formato === "jpeg";

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  async function gerar(destino: "baixar" | "biblioteca") {
    setGerando(destino);
    setErro("");
    try {
      const atual = aoPrepararPintura ? await aoPrepararPintura() : projeto;
      const blob = await exportarImagem(atual, midias, {
        formato,
        qualidade,
        escala,
        fonteDosPixels,
      });
      const arquivo = nomeDoArquivo(nome, formato);
      if (destino === "baixar") {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = arquivo;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        aoAvisar(`Imagem baixada (${formatarBytes(blob.size)}).`);
      } else {
        iniciar([new File([blob], arquivo, { type: blob.type })]);
        aoAvisar("Enviando a imagem para a biblioteca: ela aparece em Mídias e no editor de vídeo.");
      }
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-exportar-imagem"
        className="w-full max-w-sm rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-exportar-imagem" className="font-display text-base font-semibold">
            Exportar a imagem
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4 text-sm">
          <label className="flex flex-col gap-1 text-xs text-suave">
            Formato
            <select
              value={formato}
              onChange={(evento) => setFormato(evento.currentTarget.value as FormatoDaImagem)}
              className="rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-sm text-texto outline-none focus:border-destaque"
            >
              {FORMATOS_DA_IMAGEM.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1 text-xs text-suave">
            <legend className="mb-1">Tamanho</legend>
            <div className="flex gap-1.5">
              {ESCALAS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={escala === item}
                  onClick={() => setEscala(item)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs tabular-nums ${escala === item ? "border-destaque bg-destaque/15 text-texto" : "border-borda text-suave"}`}
                >
                  {Math.round(base.largura * item)} × {Math.round(base.altura * item)}
                </button>
              ))}
            </div>
          </fieldset>
          {formato !== "png" ? (
            <label className="flex flex-col gap-1 text-xs text-suave">
              Qualidade · {Math.round(qualidade * 100)}%
              <input type="range" min={0.5} max={1} step={0.01} value={qualidade} onChange={(evento) => setQualidade(Number(evento.currentTarget.value))} />
            </label>
          ) : null}
          {semFundoNoJpg ? <p className="text-[11px] text-aviso">O JPG não guarda transparência: o fundo sai branco. Para manter, use PNG ou WebP.</p> : null}
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          <button type="button" className="botao-principal px-4 py-2" onClick={() => void gerar("baixar")} disabled={gerando !== null}>
            {gerando === "baixar" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            Baixar
          </button>
          <button type="button" className="botao-secundario px-4 py-2" onClick={() => void gerar("biblioteca")} disabled={gerando !== null}>
            {gerando === "biblioteca" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Film className="size-4" aria-hidden />}
            Usar nos vídeos (mandar para a biblioteca)
          </button>
        </div>
      </div>
    </div>
  );
}
