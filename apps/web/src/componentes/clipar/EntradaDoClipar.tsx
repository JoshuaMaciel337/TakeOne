"use client";

// A entrada do Clipar (ADR 0004, 14.1): colar o link e conferir o vídeo antes de importar, ou enviar o arquivo.
import { AlertCircle, Link2, Loader2, Radio, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { ErroApi } from "@/lib/api";
import { ACEITAR_ARQUIVOS, useEnvios } from "@/lib/envios";
import { formatarTempo } from "@/lib/formatar";
import { type DadosDoLink, importarLink, lerDadosDoLink } from "@/lib/importacao";
import type { Midia } from "@/lib/tipos";

type Props = {
  /** A mídia nova (processando) entrou na biblioteca. */
  aoImportar: (midia: Midia) => void;
};

export function EntradaDoClipar({ aoImportar }: Props) {
  const { iniciar } = useEnvios();
  const arquivo = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [dados, setDados] = useState<DadosDoLink | null>(null);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");

  async function ler() {
    if (!url.trim() || lendo) return;
    setLendo(true);
    setErro("");
    setDados(null);
    try {
      setDados(await lerDadosDoLink(url.trim()));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui ler esse link.");
    } finally {
      setLendo(false);
    }
  }

  async function importar() {
    if (!dados || importando) return;
    setImportando(true);
    setErro("");
    try {
      const midia = await importarLink(dados.url, dados.titulo);
      aoImportar(midia);
      setDados(null);
      setUrl("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui começar a importação.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-borda bg-painel p-5">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(evento) => {
          evento.preventDefault();
          void ler();
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-borda bg-painel-2 px-3 focus-within:border-destaque">
          <Link2 className="size-4 shrink-0 text-suave" aria-hidden />
          <input
            aria-label="Link do vídeo"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
            placeholder="Cole o link do YouTube, Drive, Vimeo, Twitch, TikTok ou Instagram"
            value={url}
            onChange={(evento) => setUrl(evento.target.value)}
          />
        </label>
        <button type="submit" className="botao-principal justify-center" disabled={!url.trim() || lendo}>
          {lendo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {lendo ? "Lendo o link…" : "Ler o link"}
        </button>
      </form>

      {erro ? (
        <p className="flex items-start gap-2 text-sm text-erro" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {dados ? (
        <div className="flex flex-col gap-3 rounded-lg border border-borda bg-painel-2 p-3 sm:flex-row">
          {dados.miniatura ? (
            // eslint-disable-next-line @next/next/no-img-element -- a miniatura do próprio site do vídeo
            <img src={dados.miniatura} alt="" referrerPolicy="no-referrer" className="aspect-video w-full rounded-md object-cover sm:w-48" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-semibold leading-snug">{dados.titulo}</p>
            <p className="text-xs text-suave">
              {[dados.site, dados.canal, dados.duracao ? formatarTempo(dados.duracao) : null].filter(Boolean).join(" · ")}
            </p>
            {dados.ao_vivo ? (
              <p className="flex items-center gap-1.5 text-xs text-aviso">
                <Radio className="size-3.5" aria-hidden /> A live ainda está no ar: o TakeOne baixa quando ela terminar.
              </p>
            ) : null}
            {dados.problema ? <p className="text-xs text-erro">{dados.problema}</p> : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <button type="button" className="botao-principal" disabled={importando || Boolean(dados.problema)} onClick={() => void importar()}>
                {importando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Importar
              </button>
              <button type="button" className="botao-secundario" onClick={() => setDados(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-suave">ou</span>
        <button type="button" className="botao-secundario" onClick={() => arquivo.current?.click()}>
          <UploadCloud className="size-4" aria-hidden /> Enviar um arquivo
        </button>
        <input
          ref={arquivo}
          type="file"
          accept={ACEITAR_ARQUIVOS}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(evento) => {
            const lista = evento.target.files;
            if (lista?.length) iniciar(Array.from(lista));
            evento.target.value = "";
          }}
        />
      </div>
      <p className="text-xs text-suave">Clipe só vídeos seus ou que você tem autorização para usar.</p>
    </section>
  );
}
