"use client";

import { Film, Image as ImageIcon, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { formatarQuando, formatarTempo } from "@/lib/formatar";
import { enderecoDoProjeto } from "@/lib/hub";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { ProjetoResumo } from "@/lib/tipos";

/** Projetos por página da API; a lista busca todas as páginas, até o teto. */
const POR_PAGINA = 200;
const MAXIMO_DE_PROJETOS = 5000;

async function todosOsProjetos(): Promise<ProjetoResumo[]> {
  const lista: ProjetoResumo[] = [];
  for (;;) {
    const depois = lista.length ? `&antes=${lista[lista.length - 1].id}` : "";
    const pagina = await chamarApi<ProjetoResumo[]>(`/projetos?limite=${POR_PAGINA}${depois}`);
    lista.push(...pagina);
    if (pagina.length < POR_PAGINA || lista.length >= MAXIMO_DE_PROJETOS) return lista;
  }
}

export function useProjetos() {
  const [projetos, setProjetos] = useState<ProjetoResumo[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    todosOsProjetos()
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

/**
 * `limite`: só os mais recentes (a página inicial do hub mostra alguns). `tipo`: só os de vídeo ou só os de imagem.
 * Sem `aoCriar`, não aparece o cartão de criar (a página do editor de imagem tem os tamanhos em cima).
 */
export function ListaProjetos({ aoCriar, criando = false, limite, tipo }: { aoCriar?: () => void; criando?: boolean; limite?: number; tipo?: "video" | "imagem" }) {
  const { projetos: carregados, erro, excluir } = useProjetos();
  const todos = tipo ? carregados?.filter((projeto) => (projeto.tipo ?? "video") === tipo) : carregados;
  const projetos = limite ? todos?.slice(0, limite) : todos;

  return (
    <>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
        {aoCriar ? (
          <button
            type="button"
            onClick={aoCriar}
            disabled={criando}
            className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave transition hover:border-destaque hover:text-texto disabled:opacity-60"
          >
            {criando ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <Plus className="size-6" aria-hidden />}
            <span className="text-sm font-medium">Novo projeto</span>
          </button>
        ) : null}
        {projetos?.map((projeto) => (
          <div key={projeto.id} className="group relative min-w-0">
            <Link
              href={enderecoDoProjeto(projeto)}
              className="block overflow-hidden rounded-xl border border-borda bg-painel-2 transition hover:border-suave/50 focus-visible:outline-2 focus-visible:outline-destaque"
            >
              <span className="relative flex aspect-video items-center justify-center bg-painel-3">
                {projeto.capa_midia_id ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
                  <img src={arquivoDaMidia(projeto.capa_midia_id, "capa.jpg")} alt="" className="size-full object-cover" loading="lazy" />
                ) : projeto.tipo === "imagem" ? (
                  <ImageIcon className="size-7 text-suave" aria-hidden />
                ) : (
                  <Film className="size-7 text-suave" aria-hidden />
                )}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                  {projeto.tipo === "imagem" && projeto.tamanho ? `${projeto.tamanho.largura} × ${projeto.tamanho.altura}` : formatarTempo(projeto.duracao / TICKS_POR_SEGUNDO)}
                </span>
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">{projeto.tipo === "imagem" ? "Imagem" : projeto.proporcao}</span>
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
      {projetos && projetos.length === 0 ? (
        <p className="mt-3 text-xs text-suave">{tipo === "imagem" ? "Nenhuma imagem ainda. Escolha um tamanho acima para começar." : "Nenhum projeto ainda. Crie o primeiro e arraste suas mídias para a linha do tempo."}</p>
      ) : null}
    </>
  );
}
