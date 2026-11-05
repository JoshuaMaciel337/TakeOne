"use client";

import { ChevronRight, Folder, HardDrive, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { importarPasta, type PastaDoComputador, pastaDoComputador } from "@/lib/album/api";
import { ErroApi } from "@/lib/api";

/**
 * As fotos que já estão no computador do servidor (a pasta das fotos, montada só para leitura) entram no álbum sem
 * cópia: a pessoa anda pelas pastas e importa a escolhida, com as de dentro ou não.
 */
export function JanelaImportarPasta({ albumId, aoFechar, aoImportar }: { albumId: string; aoFechar: () => void; aoImportar: (mensagem: string) => void }) {
  const [caminho, setCaminho] = useState("");
  const [pasta, setPasta] = useState<PastaDoComputador | null>(null);
  const [subpastas, setSubpastas] = useState(true);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    pastaDoComputador(caminho)
      .then((lida) => {
        setPasta(lida);
        setErro("");
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível ler a pasta."));
  }, [caminho]);

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  const partes = caminho ? caminho.split("/") : [];
  const fotosAqui = pasta?.fotos ?? 0;
  const fotosDentro = pasta?.pastas.reduce((soma, p) => soma + p.fotos, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-importar-pasta"
        className="flex max-h-[75vh] w-full max-w-lg flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-importar-pasta" className="font-display text-base font-semibold">
            Importar do computador
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="px-4 pt-3 text-xs text-suave">As fotos ficam onde estão: o TakeOne só lê e prepara a cópia leve de cada uma. Importar a mesma pasta de novo traz só as fotos novas.</p>
        <nav className="flex flex-wrap items-center gap-1 px-4 pt-3 text-xs" aria-label="Caminho">
          <button type="button" className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-painel-2" onClick={() => setCaminho("")}>
            <HardDrive className="size-3.5" aria-hidden />
            Fotos
          </button>
          {partes.map((parte, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-apagado" aria-hidden />
              <button type="button" className="rounded px-1.5 py-0.5 hover:bg-painel-2" onClick={() => setCaminho(partes.slice(0, i + 1).join("/"))}>
                {parte}
              </button>
            </span>
          ))}
        </nav>
        <div className="min-h-32 flex-1 overflow-y-auto px-2 py-2">
          {!pasta && !erro ? <LoaderCircle className="mx-auto my-6 size-5 animate-spin text-suave" aria-label="Lendo" /> : null}
          {pasta && !pasta.disponivel ? (
            <p className="px-2 py-4 text-sm text-suave">
              O servidor não tem a pasta das fotos. No arquivo <code>.env</code> do TakeOne, aponte <code>PASTA_DAS_FOTOS_HOST</code> para a pasta dos ensaios e suba o servidor de novo.
            </p>
          ) : null}
          {pasta?.disponivel && pasta.pastas.length === 0 && fotosAqui === 0 ? <p className="px-2 py-4 text-sm text-suave">Esta pasta está vazia.</p> : null}
          {pasta?.pastas.map((sub) => (
            <button key={sub.caminho} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-painel-2" onClick={() => setCaminho(sub.caminho)}>
              <Folder className="size-4 text-suave" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{sub.nome}</span>
              {sub.fotos ? <span className="text-xs text-suave tabular-nums">{sub.fotos.toLocaleString("pt-BR")} fotos</span> : null}
              <ChevronRight className="size-3.5 text-apagado" aria-hidden />
            </button>
          ))}
        </div>
        {erro ? <p className="px-4 pb-2 text-xs text-erro">{erro}</p> : null}
        {pasta?.disponivel ? (
          <div className="flex flex-col gap-2 border-t border-borda px-4 py-3">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={subpastas} onChange={(evento) => setSubpastas(evento.target.checked)} />
              Com as pastas de dentro (cada uma vira um filtro do álbum)
            </label>
            <button
              type="button"
              className="botao-principal px-3 py-2"
              disabled={importando || (fotosAqui === 0 && (!subpastas || pasta.pastas.length === 0))}
              onClick={() => {
                setImportando(true);
                importarPasta(albumId, caminho, subpastas)
                  .then(() => {
                    aoImportar(`Importando as fotos de "${caminho || "Fotos"}": elas aparecem conforme ficam prontas.`);
                    aoFechar();
                  })
                  .catch((e) => {
                    setErro(e instanceof ErroApi ? e.message : "Não foi possível importar a pasta.");
                    setImportando(false);
                  });
              }}
            >
              {importando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Folder className="size-4" aria-hidden />}
              Importar {caminho ? `"${partes[partes.length - 1]}"` : "a pasta"}
              {fotosAqui || (subpastas && fotosDentro) ? ` (${(fotosAqui + (subpastas ? fotosDentro : 0)).toLocaleString("pt-BR")}${subpastas && pasta.pastas.length ? "+" : ""} fotos)` : ""}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
