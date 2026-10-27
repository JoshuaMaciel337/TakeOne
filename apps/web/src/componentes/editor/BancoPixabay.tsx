"use client";

import { ChevronDown, ImageIcon, LoaderCircle, Plus, Search, Video } from "lucide-react";
import { useEffect, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import type { Midia } from "@/lib/tipos";

/** Um resultado da busca (core/utils/pixabay.py, resumir). */
type ItemDaPixabay = {
  id: number;
  tipo: "imagem" | "video";
  previa: string | null;
  video_previa: string | null;
  usuario: string;
  pagina: string;
  tags: string;
  largura: number | null;
  altura: number | null;
  duracao: number | null;
};
type Resposta = { itens: ItemDaPixabay[]; total: number; fonte: { nome: string; url: string } };

type Props = {
  /** O item baixado entra no cursor quando a mídia ficar pronta. */
  aoPedir: (midia: Midia) => void;
};

/**
 * O banco da Pixabay no painel Mídia (o Clipar, 14.12f): busca de fotos e vídeos, com a fonte e o autor de cada um;
 * o "+" baixa o item para a biblioteca do espaço (as prévias da busca vêm da Pixabay só enquanto a busca está na tela)
 * e ele entra no cursor quando fica pronto.
 */
export function BancoPixabay({ aoPedir }: Props) {
  const [aberto, setAberto] = useState(false);
  const [ligada, setLigada] = useState<boolean | null>(null);
  const [tipo, setTipo] = useState<"imagem" | "video">("video");
  const [busca, setBusca] = useState("");
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [pedindo, setPedindo] = useState<number | null>(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!aberto || ligada !== null) return;
    chamarApi<{ ligada: boolean }>("/pixabay/estado")
      .then((estado) => setLigada(estado.ligada))
      .catch(() => setLigada(false));
  }, [aberto, ligada]);

  function buscar(evento?: React.FormEvent, outroTipo = tipo) {
    evento?.preventDefault();
    if (!busca.trim()) return;
    setBuscando(true);
    setAviso("");
    chamarApi<Resposta>(`/pixabay/buscar?${new URLSearchParams({ tipo: outroTipo, q: busca.trim() })}`)
      .then(setResposta)
      .catch((erro: unknown) => setAviso(erro instanceof ErroApi ? erro.message : "A busca não respondeu agora."))
      .finally(() => setBuscando(false));
  }

  function trocarTipo(novo: "imagem" | "video") {
    setTipo(novo);
    setResposta(null);
    if (busca.trim()) buscar(undefined, novo);
  }

  function importar(item: ItemDaPixabay) {
    setPedindo(item.id);
    chamarApi<Midia>("/pixabay/importar", { metodo: "POST", corpo: { tipo: item.tipo, id: item.id } })
      .then((midia) => {
        aoPedir(midia);
        setAviso(midia.status === "pronta" ? "No cursor." : "Baixando para a biblioteca: entra no cursor quando ficar pronto.");
      })
      .catch((erro: unknown) => setAviso(erro instanceof ErroApi ? erro.message : "Não foi possível baixar agora."))
      .finally(() => setPedindo(null));
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda bg-painel-2 p-3" aria-label="Banco de imagens e vídeos">
      <button type="button" className="flex items-center justify-between gap-2 text-left text-xs font-semibold" aria-expanded={aberto} onClick={() => setAberto((valor) => !valor)}>
        Banco de imagens e vídeos
        <ChevronDown className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aberto && ligada === false ? <p className="text-[11px] text-suave">O banco não está ligado neste servidor: falta a chave da Pixabay no .env.</p> : null}
      {aberto && ligada ? (
        <>
          <div className="grid grid-cols-2 gap-1" role="tablist">
            {(["video", "imagem"] as const).map((opcao) => (
              <button key={opcao} type="button" role="tab" aria-selected={tipo === opcao} className={`rounded-md px-2 py-1 text-xs ${tipo === opcao ? "bg-destaque text-white" : "border border-borda text-suave"}`} onClick={() => trocarTipo(opcao)}>
                {opcao === "video" ? <Video className="mr-1 inline size-3.5" aria-hidden /> : <ImageIcon className="mr-1 inline size-3.5" aria-hidden />}
                {opcao === "video" ? "Vídeos" : "Fotos"}
              </button>
            ))}
          </div>
          <form onSubmit={buscar} className="flex gap-1">
            <input
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              maxLength={100}
              aria-label="Buscar na Pixabay"
              placeholder="Ex.: lendo a bíblia, céu, oração"
              className="min-w-0 flex-1 rounded-md border border-borda bg-painel px-2 py-1.5 text-xs outline-none focus:border-destaque"
            />
            <button type="submit" className="botao-icone size-8 shrink-0" aria-label="Buscar" disabled={buscando || !busca.trim()}>
              {buscando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            </button>
          </form>
          {resposta ? (
            resposta.itens.length ? (
              <div className="grid grid-cols-2 gap-2">
                {resposta.itens.map((item) => (
                  <figure key={item.id} className="group relative overflow-hidden rounded-md bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a prévia da busca vem da Pixabay, só enquanto aparece */}
                    <img src={item.previa ?? ""} alt={item.tags} loading="lazy" className="aspect-video w-full object-cover" />
                    {item.duracao ? <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{item.duracao} s</span> : null}
                    <button type="button" className="botao-icone absolute right-1 top-1 size-7 bg-black/60 text-white" aria-label={`Baixar e pôr no cursor: ${item.tags}`} disabled={pedindo === item.id} onClick={() => importar(item)}>
                      {pedindo === item.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                    </button>
                    <figcaption className="truncate px-1 py-0.5 text-[10px] text-white/80">
                      <a href={item.pagina} target="_blank" rel="noreferrer" className="hover:underline">
                        {item.usuario || "Pixabay"}
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-suave">Nada achado. Tente outras palavras.</p>
            )
          ) : null}
          {aviso ? (
            <p className="text-[11px] text-suave" role="status">
              {aviso}
            </p>
          ) : null}
          <p className="text-[10px] text-suave">
            Imagens e vídeos da{" "}
            <a href="https://pixabay.com/" target="_blank" rel="noreferrer" className="underline">
              Pixabay
            </a>
            , de uso livre. O que você usa é baixado para a biblioteca do espaço.
          </p>
        </>
      ) : null}
    </section>
  );
}
