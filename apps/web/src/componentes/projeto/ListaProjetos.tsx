"use client";

import { Film, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { formatarQuando, formatarTempo } from "@/lib/formatar";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { ProjetoResumo } from "@/lib/tipos";

export function useProjetos() {
  const [projetos, setProjetos] = useState<ProjetoResumo[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    chamarApi<ProjetoResumo[]>("/projetos")
      .then((lista) => {
        if (ativo) setProjetos(lista);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os projetos.");
      });
    return () => {
      ativo = false;
    };
  }, []);

  const excluir = useCallback((projetoId: string) => {
    return chamarApi(`/projetos/${projetoId}`, { metodo: "DELETE" }).then(
      () => setProjetos((lista) => lista?.filter((projeto) => projeto.id !== projetoId) ?? lista),
      (e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir o projeto."),
    );
  }, []);

  return { projetos, erro, excluir };
}

/** Cria um projeto vazio e abre no editor. */
export function useNovoProjeto() {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");

  const criar = useCallback(() => {
    setCriando(true);
    setErro("");
    chamarApi<{ id: string }>("/projetos", { metodo: "POST", corpo: {} })
      .then((projeto) => router.push(`/app/editor/${projeto.id}`))
      .catch((e) => {
        setErro(e instanceof ErroApi ? e.message : "Não foi possível criar o projeto.");
        setCriando(false);
      });
  }, [router]);

  return { criar, criando, erro };
}

export function ListaProjetos({ aoCriar, criando }: { aoCriar: () => void; criando: boolean }) {
  const { projetos, erro, excluir } = useProjetos();

  return (
    <>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        <button
          type="button"
          onClick={aoCriar}
          disabled={criando}
          className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave transition hover:border-destaque hover:text-texto disabled:opacity-60"
        >
          {criando ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <Plus className="size-6" aria-hidden />}
          <span className="text-sm font-medium">Novo projeto</span>
        </button>
        {projetos?.map((projeto) => (
          <div key={projeto.id} className="group relative min-w-0">
            <Link
              href={`/app/editor/${projeto.id}`}
              className="block overflow-hidden rounded-xl border border-borda bg-painel-2 transition hover:border-suave/50 focus-visible:outline-2 focus-visible:outline-destaque"
            >
              <span className="relative flex aspect-video items-center justify-center bg-painel-3">
                {projeto.capa_midia_id ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
                  <img src={arquivoDaMidia(projeto.capa_midia_id, "capa.jpg")} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <Film className="size-7 text-suave" aria-hidden />
                )}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                  {formatarTempo(projeto.duracao / TICKS_POR_SEGUNDO)}
                </span>
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">{projeto.proporcao}</span>
              </span>
              <span className="block px-3 py-2">
                <span className="block truncate text-sm font-medium">{projeto.nome}</span>
                <span className="block text-xs text-suave">Editado {formatarQuando(projeto.atualizado_em)}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Excluir o projeto "${projeto.nome}"? As mídias continuam na biblioteca.`)) void excluir(projeto.id);
              }}
              className="absolute right-1.5 top-1.5 hidden size-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-erro group-hover:flex group-focus-within:flex [@media(hover:none)]:flex"
              aria-label={`Excluir o projeto ${projeto.nome}`}
              title="Excluir projeto"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      {projetos && projetos.length === 0 ? <p className="mt-3 text-xs text-suave">Nenhum projeto ainda. Crie o primeiro e arraste suas mídias para a linha do tempo.</p> : null}
    </>
  );
}
