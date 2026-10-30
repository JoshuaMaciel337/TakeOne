"use client";

// O Clipar (ADR 0004): do link, ou do arquivo, de um vídeo longo aos cortes prontos. A entrada, os vídeos chegando
// (cada um pronto leva às opções) e as clipagens já pedidas.
import { AlertCircle, ChevronRight, Link2, Loader2, Scissors, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EntradaDoClipar } from "@/componentes/clipar/EntradaDoClipar";
import { SecaoDoHub, TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { arquivoDaMidia } from "@/lib/api";
import { type Clipagem, listarClipagens } from "@/lib/clipagens";
import { useEventosJobs } from "@/lib/eventos";
import { formatarTempo } from "@/lib/formatar";
import type { Midia } from "@/lib/tipos";
import { useMidias } from "@/lib/useMidias";

/** Os vídeos que dá para clipar: os que vieram de um link e os enviados com pelo menos 1 minuto. */
function videosParaClipar(midias: Midia[]): Midia[] {
  return midias.filter((midia) => {
    if (midia.elemento || midia.camada_pixels || midia.imagem || midia.status === "enviando") return false;
    if (midia.importacao) return true;
    return Boolean(midia.video) && (midia.duracao ?? 0) >= 60;
  });
}

function situacao(midia: Midia): string {
  if (midia.status === "erro") return midia.erro || "Não deu para preparar este vídeo.";
  if (midia.status === "pronta") return "Pronto para clipar";
  const processamento = midia.processamento;
  if (!processamento || processamento.status === "pendente") return "Na fila";
  return `${processamento.mensagem || "Preparando"} · ${processamento.progresso}%`;
}

function LinhaDoVideo({ midia }: { midia: Midia }) {
  const capa = midia.arquivos.includes("capa.jpg") ? arquivoDaMidia(midia.id, "capa.jpg") : midia.importacao?.miniatura;
  const duracao = midia.duracao ?? midia.importacao?.duracao ?? null;
  const origem = midia.importacao ? new URL(midia.importacao.url).hostname.replace(/^www\./, "") : "Arquivo enviado";
  return (
    <li className="flex items-center gap-3 rounded-lg border border-borda bg-painel p-2">
      <span className="relative flex aspect-video w-32 shrink-0 items-center justify-center overflow-hidden rounded-md bg-painel-3">
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element -- a capa da API ou a miniatura do site do vídeo
          <img src={capa} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          <Loader2 className="size-5 animate-spin text-suave" aria-hidden />
        )}
        {duracao ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">{formatarTempo(duracao)}</span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={midia.nome}>
          {midia.nome}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-suave">
          {midia.importacao ? <Link2 className="size-3 shrink-0" aria-hidden /> : null}
          {origem}
          {midia.importacao?.canal ? ` · ${midia.importacao.canal}` : ""}
        </p>
        <p className={`mt-0.5 flex items-center gap-1 truncate text-xs ${midia.status === "erro" ? "text-erro" : midia.status === "pronta" ? "text-sucesso" : "text-suave"}`}>
          {midia.status === "erro" ? <AlertCircle className="size-3 shrink-0" aria-hidden /> : null}
          {situacao(midia)}
        </p>
      </div>
      {midia.status === "pronta" ? (
        <Link href={`/app/clipar/novo/${midia.id}`} className="botao-principal shrink-0">
          <Scissors className="size-4" aria-hidden /> Gerar cortes
        </Link>
      ) : null}
    </li>
  );
}

function situacaoDaClipagem(clipagem: Clipagem): string {
  if (clipagem.status === "pronta") return `${clipagem.total_de_cortes} cortes`;
  if (clipagem.status === "erro") return clipagem.erro || "Não deu para achar os cortes";
  return clipagem.andamento ? `${clipagem.andamento.mensagem} · ${clipagem.andamento.progresso}%` : "Na fila";
}

export default function PaginaClipar() {
  const { midias, recarregar } = useMidias();
  const videos = videosParaClipar(midias ?? []);
  const [clipagens, setClipagens] = useState<Clipagem[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    listarClipagens()
      .then(setClipagens)
      .catch(() => setClipagens([]));
  }, [versao]);
  useEventosJobs((job) => {
    if (job.tipo === "clipagem" || job.tipo === "transcricao") setVersao((n) => n + 1);
  });
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Clipar"
        descricao="Cole o link de um vídeo longo, ou envie o arquivo. O TakeOne transcreve, acha os melhores momentos e monta os cortes, tudo na sua máquina."
      >
        <Link href="/app/clipar/automacoes" className="botao-secundario">
          <Wand2 className="size-4" aria-hidden /> Automações
        </Link>
      </TituloDaPagina>
      <EntradaDoClipar aoImportar={() => void recarregar()} />
      <ListaEnvios />
      {clipagens.length ? (
        <SecaoDoHub titulo="Suas clipagens">
          <ul className="flex flex-col gap-2">
            {clipagens.map((clipagem) => (
              <li key={clipagem.id}>
                <Link href={`/app/clipar/${clipagem.id}`} className="flex items-center gap-3 rounded-lg border border-borda bg-painel p-3 hover:border-suave/60">
                  <Scissors className="size-4 shrink-0 text-destaque" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{clipagem.nome}</span>
                    <span className={`block truncate text-xs ${clipagem.status === "erro" ? "text-erro" : "text-suave"}`}>{situacaoDaClipagem(clipagem)}</span>
                  </span>
                  <ChevronRight className="size-4 text-suave" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </SecaoDoHub>
      ) : null}
      <SecaoDoHub titulo="Seus vídeos">
        {midias === null ? (
          <p className="text-sm text-suave">Carregando…</p>
        ) : videos.length ? (
          <ul className="flex flex-col gap-2">
            {videos.map((midia) => (
              <LinhaDoVideo key={midia.id} midia={midia} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-suave">Os vídeos que você importar ou enviar aparecem aqui.</p>
        )}
      </SecaoDoHub>
    </main>
  );
}
