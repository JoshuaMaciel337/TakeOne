"use client";

import { Download, FileCode, FolderArchive, LoaderCircle, QrCode, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ErroApi } from "@/lib/api";
import { formatarBytes, formatarQuando, formatarTempo } from "@/lib/formatar";
import type { Projeto, Proporcao } from "@/lib/projeto/modelo";
import type { Exportacao, Midia } from "@/lib/tipos";
import { useExportacoes } from "@/lib/useExportacoes";

import { ExportarNoNavegador } from "./ExportarNoNavegador";
import { PainelQrCelular, useLinkCelular } from "./QrDoCelular";
import type { EstadoSalvamento } from "./useProjeto";

type Resolucao = Exportacao["resolucao"];

const RESOLUCOES: { id: Resolucao; nome: string; lado: number; dica: string }[] = [
  { id: "720p", nome: "720p", lado: 720, dica: "Mais leve, sai mais rápido" },
  { id: "1080p", nome: "1080p", lado: 1080, dica: "O padrão das redes sociais" },
  { id: "4k", nome: "4K", lado: 2160, dica: "Máxima qualidade, demora mais" },
];

/** Mesma conta de core/modelos/exportacao.py: a resolução é o lado menor, sempre par. */
function tamanhoDeSaida(proporcao: Proporcao, lado: number): string {
  const [l, a] = proporcao.split(":").map(Number);
  const par = (valor: number) => Math.max(2, Math.round(valor / 2) * 2);
  return l >= a ? `${par((lado * l) / a)} × ${lado}` : `${lado} × ${par((lado * a) / l)}`;
}

type Props = {
  projetoId: string;
  /** O projeto e as mídias, para a exportação no navegador (o mesmo desenho da prévia). */
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  proporcao: Proporcao;
  salvamento: EstadoSalvamento;
  aoFechar: () => void;
};

/** Escolher a resolução, acompanhar o render e baixar o vídeo (no computador ou no celular), ou levar a edição para outro editor. */
export function JanelaExportar({ projetoId, projeto, midias, proporcao, salvamento, aoFechar }: Props) {
  const { exportacoes, erro, exportar, excluir } = useExportacoes(projetoId, true);
  const [resolucao, setResolucao] = useState<Resolucao>("1080p");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const salvo = salvamento === "salvo";

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  function pedir() {
    setEnviando(true);
    setAviso("");
    exportar(resolucao)
      .catch((e) => setAviso(e instanceof ErroApi ? e.message : "Não foi possível pedir a exportação."))
      .finally(() => setEnviando(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-exportar"
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-exportar" className="font-display text-base font-semibold">
            Exportar vídeo
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 border-b border-borda p-4">
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-2 text-xs text-suave">Resolução</legend>
            {RESOLUCOES.map((opcao) => (
              <label
                key={opcao.id}
                title={opcao.dica}
                className={`cursor-pointer rounded-lg border px-2 py-2 text-center transition ${
                  resolucao === opcao.id ? "border-destaque bg-destaque/10" : "border-borda hover:bg-painel-2"
                }`}
              >
                <input type="radio" name="resolucao" value={opcao.id} checked={resolucao === opcao.id} onChange={() => setResolucao(opcao.id)} className="sr-only" />
                <span className="block text-sm font-semibold">{opcao.nome}</span>
                <span className="block text-[11px] tabular-nums text-suave">{tamanhoDeSaida(proporcao, opcao.lado)}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-suave">MP4 (H.264 e AAC), com o volume no padrão das redes sociais (-14 LUFS).</p>
          <button type="button" className="botao-principal w-full" disabled={!salvo || enviando} onClick={pedir}>
            {enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            {salvo ? "Exportar" : "Esperando salvar…"}
          </button>
          {aviso ? <p className="text-xs text-erro">{aviso}</p> : null}
        </div>

        <ExportarNoNavegador projeto={projeto} midias={midias} salvo={salvo} />

        <div className="space-y-2 border-b border-borda p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Levar para outro editor</h3>
          <p className="text-[11px] text-suave">
            Um XML que os editores profissionais abrem: os cortes, as faixas, o trecho de cada mídia, a velocidade, o volume e as transições (como fusões); os textos viram marcadores. Posição, cor, efeitos e animações ficam aqui.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { arquivo: "intercambio.xml", nome: "Só o XML", Icone: FileCode, dica: "Para quem tem as mídias originais no computador" },
              { arquivo: "intercambio.zip", nome: "XML com as mídias", Icone: FolderArchive, dica: "Um ZIP com a pasta midias/: no outro editor, aponte para ela" },
            ].map(({ arquivo, nome, Icone, dica }) => (
              <a
                key={arquivo}
                href={salvo ? `/api/projetos/${projetoId}/${arquivo}` : undefined}
                download
                title={dica}
                aria-disabled={!salvo}
                className={`botao-secundario px-3 py-1.5 text-xs ${salvo ? "" : "pointer-events-none opacity-50"}`}
              >
                <Icone className="size-4" aria-hidden />
                {nome}
              </a>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Exportações deste projeto</h3>
          {erro ? <p className="text-xs text-erro">{erro}</p> : null}
          {exportacoes === null ? (
            <p className="text-xs text-suave">Carregando…</p>
          ) : exportacoes.length === 0 ? (
            <p className="text-xs text-suave">Nenhuma ainda. O vídeo fica guardado aqui para baixar quando quiser.</p>
          ) : (
            <ul className="space-y-2">
              {exportacoes.map((exportacao) => (
                <ItemExportacao key={exportacao.id} exportacao={exportacao} aoExcluir={() => void excluir(exportacao.id)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemExportacao({ exportacao, aoExcluir }: { exportacao: Exportacao; aoExcluir: () => void }) {
  const progresso = exportacao.processamento?.progresso ?? 0;
  const celular = useLinkCelular(exportacao.id);
  const nomeResolucao = RESOLUCOES.find((opcao) => opcao.id === exportacao.resolucao)?.nome ?? exportacao.resolucao;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 rounded-lg border border-borda bg-painel-2/50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {nomeResolucao} · {exportacao.largura} × {exportacao.altura}
        </p>
        <p className="text-xs text-suave">
          {exportacao.status === "pronta"
            ? `${formatarTempo(exportacao.duracao)} · ${exportacao.tamanho ? formatarBytes(exportacao.tamanho) : ""} · ${formatarQuando(exportacao.concluido_em ?? exportacao.criado_em)}`
            : exportacao.status === "erro"
              ? "Não deu certo"
              : `${exportacao.processamento?.mensagem || "Na fila"} · ${progresso}%`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {exportacao.status === "pronta" ? (
          <>
            <a
              href={`/api/exportacoes/${exportacao.id}/arquivos/video.mp4?baixar=true`}
              className="botao-icone"
              aria-label="Baixar o vídeo"
              title="Baixar o vídeo"
            >
              <Download className="size-4" aria-hidden />
            </a>
            <button type="button" className="botao-icone" onClick={() => void celular.gerar()} aria-label="Baixar no celular" title="Baixar no celular (QR code)">
              <QrCode className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
        <button type="button" className="botao-icone" onClick={aoExcluir} aria-label="Excluir exportação" title="Excluir exportação">
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      {exportacao.status === "processando" ? (
        <div className="col-span-full h-1 overflow-hidden rounded bg-painel-3" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-destaque transition-[width]" style={{ width: `${progresso}%` }} />
        </div>
      ) : null}
      {celular.erro ? <p className="col-span-full text-xs text-erro">{celular.erro}</p> : null}
      {celular.link ? <PainelQrCelular link={celular.link} aoFechar={celular.fechar} /> : null}
      {exportacao.status === "erro" && exportacao.erro ? (
        <p className="col-span-full flex items-start gap-1 text-xs text-erro">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          {exportacao.erro}
        </p>
      ) : null}
    </li>
  );
}
