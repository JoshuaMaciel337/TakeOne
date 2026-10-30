"use client";

// A entrada do Clipar (ADR 0004, 14.1): colar o link e conferir o vídeo antes de importar, ou enviar o arquivo. Com
// "Fazer tudo sozinho" (14.9), o vídeo entra numa esteira: o servidor procura os cortes e exporta os melhores sem a
// página aberta, com as opções padrão deste navegador.
import { AlertCircle, Link2, Loader2, Radio, UploadCloud, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { ErroApi } from "@/lib/api";
import { criarEsteira } from "@/lib/automacoes";
import { opcoesPadraoGuardadas } from "@/lib/clipagens";
import { ACEITAR_ARQUIVOS, useEnvios } from "@/lib/envios";
import { formatarTempo } from "@/lib/formatar";
import { type DadosDoLink, importarLink, lerDadosDoLink } from "@/lib/importacao";
import type { Midia } from "@/lib/tipos";

type Props = {
  /** A mídia nova (processando) entrou na biblioteca. */
  aoImportar: (midia: Midia) => void;
};

/** O "Fazer tudo sozinho": quantos cortes exportar e, se pedido, o horário em que a busca começa. */
function Sozinho({ ligado, quantos, horario, aoMudar }: { ligado: boolean; quantos: number; horario: string; aoMudar: (m: { ligado?: boolean; quantos?: number; horario?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-borda bg-painel-2 px-3 py-2 text-sm">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" className="accent-[var(--to-destaque)]" checked={ligado} onChange={(evento) => aoMudar({ ligado: evento.target.checked })} />
        <Wand2 className="size-4 text-destaque" aria-hidden /> Fazer tudo sozinho
      </label>
      {ligado ? (
        <>
          <label className="flex items-center gap-1.5 text-suave">
            exportar os
            <select aria-label="Quantos cortes exportar" className="campo px-1.5 py-1" value={quantos} onChange={(evento) => aoMudar({ quantos: Number(evento.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            melhores
          </label>
          <label className="flex items-center gap-1.5 text-suave" title="O download começa já; a busca dos cortes, que usa a placa de vídeo, espera o horário">
            procurar os cortes
            <input aria-label="Horário da busca" type="time" className="campo px-1.5 py-1" value={horario} onChange={(evento) => aoMudar({ horario: evento.target.value })} />
            {horario ? (
              <button type="button" className="text-xs underline" onClick={() => aoMudar({ horario: "" })}>
                já
              </button>
            ) : (
              <span className="text-xs">(vazio: já)</span>
            )}
          </label>
          <span className="w-full text-xs text-suave">
            Com as opções padrão do Clipar. O servidor procura os cortes, monta e exporta; você pode fechar a página e acompanhar em{" "}
            <Link href="/app/clipar/automacoes" className="text-destaque hover:underline">
              Automações
            </Link>
            .
          </span>
        </>
      ) : null}
    </div>
  );
}

export function EntradaDoClipar({ aoImportar }: Props) {
  const { iniciar } = useEnvios();
  const [sozinho, setSozinho] = useState({ ligado: false, quantos: 3, horario: "" });
  const [aviso, setAviso] = useState("");
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

  /** A esteira do vídeo (pelo link ou pelo vídeo enviado), com as opções padrão deste navegador. */
  function pedirEsteira(video: { url: string; titulo: string } | { midia_id: string }) {
    return criarEsteira({ ...video, opcoes: opcoesPadraoGuardadas(), quantos: sozinho.quantos, horario: sozinho.horario || null });
  }

  async function importar() {
    if (!dados || importando) return;
    setImportando(true);
    setErro("");
    setAviso("");
    try {
      if (sozinho.ligado) {
        await pedirEsteira({ url: dados.url, titulo: dados.titulo });
        setAviso(`“${dados.titulo}” está na esteira: o servidor baixa, procura os cortes e exporta os ${sozinho.quantos} melhores.`);
      } else {
        aoImportar(await importarLink(dados.url, dados.titulo));
      }
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

      <Sozinho {...sozinho} aoMudar={(mudanca) => setSozinho((atual) => ({ ...atual, ...mudanca }))} />

      {aviso ? (
        <p className="flex items-start gap-2 text-sm text-sucesso" role="status">
          <Wand2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {aviso}{" "}
            <Link href="/app/clipar/automacoes" className="font-medium text-destaque hover:underline">
              Acompanhar
            </Link>
          </span>
        </p>
      ) : null}

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
                {sozinho.ligado ? "Importar e clipar" : "Importar"}
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
            if (lista?.length) {
              // Com "Fazer tudo sozinho", cada vídeo enviado entra numa esteira assim que a API cria a mídia
              const comEsteira = sozinho.ligado;
              iniciar(
                Array.from(lista),
                comEsteira
                  ? (midiaId) => {
                      setAviso("");
                      pedirEsteira({ midia_id: midiaId })
                        .then(() => setAviso("O vídeo enviado está na esteira: quando ele chegar, o servidor procura os cortes e exporta os melhores."))
                        .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não consegui pôr o vídeo na esteira."));
                    }
                  : undefined,
              );
            }
            evento.target.value = "";
          }}
        />
      </div>
      <p className="text-xs text-suave">Clipe só vídeos seus ou que você tem autorização para usar.</p>
    </section>
  );
}
