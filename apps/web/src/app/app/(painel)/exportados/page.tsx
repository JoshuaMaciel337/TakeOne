"use client";

import { Download, FolderOpen, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { chamarApi, ErroApi } from "@/lib/api";
import { arquivoDaExportacao, resumoDaExportacao } from "@/lib/exportacao/formatos";
import { formatarBytes, formatarQuando, formatarTempo } from "@/lib/formatar";
import type { Exportacao } from "@/lib/tipos";

export default function PaginaExportados() {
  const [exportacoes, setExportacoes] = useState<Exportacao[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    chamarApi<Exportacao[]>("/exportacoes?limite=100")
      .then((lista) => {
        if (ativo) setExportacoes(lista);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as exportações.");
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina titulo="Exportados" descricao="Os vídeos, GIFs, quadros e sons gerados pelo servidor, do mais novo ao mais antigo. A exportação rápida no navegador baixa na hora e não fica aqui." />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {exportacoes === null && !erro ? <LoaderCircle className="size-5 animate-spin text-suave" aria-label="Carregando" /> : null}
      {exportacoes && !exportacoes.length ? <p className="text-sm text-suave">Nenhum vídeo exportado ainda. No editor, use o botão Exportar.</p> : null}
      {exportacoes && exportacoes.length ? (
        <ul className="flex flex-col divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-painel-2">
          {exportacoes.map((exportacao) => (
            <li key={exportacao.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{exportacao.nome}</p>
                <p className="text-xs text-suave">
                  {resumoDaExportacao(exportacao)}
                  {exportacao.duracao ? ` · ${formatarTempo(exportacao.duracao)}` : ""}
                  {exportacao.tamanho ? ` · ${formatarBytes(exportacao.tamanho)}` : ""} · {formatarQuando(exportacao.criado_em)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {exportacao.status === "processando" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-suave">
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                    {exportacao.processamento ? `${Math.round(exportacao.processamento.progresso)}%` : "Na fila"}
                  </span>
                ) : exportacao.status === "erro" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-erro" title={exportacao.erro ?? undefined}>
                    <TriangleAlert className="size-3.5" aria-hidden />
                    Falhou
                  </span>
                ) : (
                  <a href={`/api/exportacoes/${exportacao.id}/arquivos/${arquivoDaExportacao(exportacao)}?baixar=true`} className="botao-principal px-3 py-1.5 text-xs">
                    <Download className="size-3.5" aria-hidden />
                    Baixar
                  </a>
                )}
                <Link href={`/app/editor/${exportacao.projeto_id}`} className="botao-secundario px-3 py-1.5 text-xs">
                  <FolderOpen className="size-3.5" aria-hidden />
                  Abrir o projeto
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
