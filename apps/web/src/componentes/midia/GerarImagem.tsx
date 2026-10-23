"use client";

import { ChevronDown, ImagePlus } from "lucide-react";
import { useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import type { Midia } from "@/lib/tipos";

// Os mesmos formatos de core/modelos/geracao.py (FORMATOS_DA_IMAGEM, em 720p)
const FORMATOS = { "1:1": "1:1 quadrado", "4:5": "4:5 retrato", "9:16": "9:16 em pé", "16:9": "16:9 deitado" } as const;
type Formato = keyof typeof FORMATOS;

/** O formato mais perto da proporção dada (a do projeto ou a do quadro da imagem). */
export function formatoMaisPerto(largura: number, altura: number): Formato {
  const razoes: Record<Formato, number> = { "1:1": 1, "4:5": 0.8, "9:16": 9 / 16, "16:9": 16 / 9 };
  const distancia = (f: Formato) => Math.abs(Math.log(largura / altura / razoes[f]));
  return (Object.keys(razoes) as Formato[]).reduce((melhor, f) => (distancia(f) < distancia(melhor) ? f : melhor));
}

type Props = {
  /** O formato de começo (o mais perto do projeto). */
  formato: Formato;
  aoPedir: (midia: Midia) => void;
  /** Na página própria do hub o formulário já começa aberto; nos editores, fechado. */
  abertoDeInicio?: boolean;
};

/** Gerar uma imagem com IA (o Wan 2.2 com um quadro só) a partir de um texto. Ela entra na biblioteca quando fica pronta. */
export function GerarImagem({ formato: formatoInicial, aoPedir, abertoDeInicio = false }: Props) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [descricao, setDescricao] = useState("");
  const [formato, setFormato] = useState<Formato>(formatoInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  function pedir(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    chamarApi<Midia>("/midias/gerar-imagem", { metodo: "POST", corpo: { descricao, formato } })
      .then((midia) => {
        setDescricao("");
        aoPedir(midia);
      })
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível pedir a imagem agora."))
      .finally(() => setEnviando(false));
  }

  return (
    <section className="rounded-lg border border-borda bg-painel-2">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold"
      >
        <ImagePlus className="size-4 text-destaque" aria-hidden />
        <span className="flex-1">Gerar imagem com IA</span>
        <ChevronDown className={`size-4 text-suave transition ${aberto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aberto ? (
        <form onSubmit={pedir} className="flex flex-col gap-2 border-t border-borda p-3">
          <label className="text-xs text-suave" htmlFor="descricao-imagem">
            Descreva a imagem: o que aparece, o lugar, a luz e o estilo
          </label>
          <textarea
            id="descricao-imagem"
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            rows={3}
            maxLength={800}
            required
            minLength={3}
            placeholder="Uma xícara de café sobre uma mesa de madeira perto da janela, luz da manhã, fotografia"
            className="resize-y rounded-md border border-borda bg-painel px-2 py-1.5 text-xs outline-none focus:border-destaque"
          />
          <label className="flex flex-col gap-1 text-[11px] text-suave">
            Formato
            <select
              value={formato}
              onChange={(evento) => setFormato(evento.target.value as Formato)}
              className="rounded-md border border-borda bg-painel px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
            >
              {(Object.keys(FORMATOS) as Formato[]).map((id) => (
                <option key={id} value={id}>
                  {FORMATOS[id]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-suave">Leva uns 3 min na placa de vídeo, em 720p. A imagem aparece na biblioteca e você pode continuar editando.</p>
          {erro ? (
            <p className="text-[11px] text-erro" role="alert">
              {erro}
            </p>
          ) : null}
          <button type="submit" className="botao-principal px-3 py-1.5" disabled={enviando || descricao.trim().length < 3}>
            <ImagePlus className="size-4" aria-hidden />
            {enviando ? "Pedindo…" : "Gerar imagem"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
