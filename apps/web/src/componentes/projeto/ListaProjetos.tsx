"use client";

import { Copy, Film, Image as ImageIcon, LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { formatarQuando, formatarTempo } from "@/lib/formatar";
import { enderecoDoProjeto } from "@/lib/hub";
import { paraBusca } from "@/lib/materiais";
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

  // Excluir leva para a lixeira (ADR 0007, 17.7): ela guarda o projeto por 30 dias
  const excluir = useCallback((projetoId: string) => {
    return chamarApi(`/projetos/${projetoId}`, { metodo: "DELETE" }).then(
      () => setProjetos((lista) => lista?.filter((projeto) => projeto.id !== projetoId) ?? lista),
      (e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir o projeto."),
    );
  }, []);

  const renomear = useCallback((projetoId: string, nome: string) => {
    return chamarApi<ProjetoResumo>(`/projetos/${projetoId}`, { metodo: "PATCH", corpo: { nome } }).then(
      (novo) => setProjetos((lista) => lista?.map((projeto) => (projeto.id === projetoId ? { ...projeto, nome: novo.nome, atualizado_em: novo.atualizado_em } : projeto)) ?? lista),
      (e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível renomear o projeto."),
    );
  }, []);

  const duplicar = useCallback((projetoId: string) => {
    return chamarApi<ProjetoResumo>(`/projetos/${projetoId}/duplicar`, { metodo: "POST" }).then(
      (copia) => setProjetos((lista) => (lista ? [copia, ...lista] : lista)),
      (e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível duplicar o projeto."),
    );
  }, []);

  return { projetos, erro, excluir, renomear, duplicar };
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
export function ListaProjetos({
  aoCriar,
  criando = false,
  limite,
  tipo,
  comFiltros = false,
}: {
  aoCriar?: () => void;
  criando?: boolean;
  limite?: number;
  tipo?: "video" | "imagem";
  /** A busca e a ordem em cima da lista (a página Projetos). */
  comFiltros?: boolean;
}) {
  const { projetos: carregados, erro, excluir, renomear, duplicar } = useProjetos();
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"recentes" | "nome" | "duracao">("recentes");
  const termo = paraBusca(busca.trim());
  const todos = (tipo ? carregados?.filter((projeto) => (projeto.tipo ?? "video") === tipo) : carregados)
    ?.filter((projeto) => !termo || paraBusca(projeto.nome).includes(termo))
    .sort((a, b) => (ordem === "nome" ? a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) : ordem === "duracao" ? b.duracao - a.duracao : 0));
  const projetos = limite ? todos?.slice(0, limite) : todos;
  const botaoDoCartao = "flex size-7 items-center justify-center rounded-md bg-black/70 text-white transition";

  return (
    <>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {comFiltros ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-borda bg-painel-2 px-3 py-1.5 sm:max-w-sm">
            <Search className="size-4 text-suave" aria-hidden />
            <input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar projetos" aria-label="Buscar projetos" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <select value={ordem} onChange={(evento) => setOrdem(evento.target.value as typeof ordem)} aria-label="Ordem dos projetos" className="rounded-lg border border-borda bg-painel-2 px-2 py-1.5 text-sm">
            <option value="recentes">Editados há menos tempo</option>
            <option value="nome">Nome</option>
            <option value="duracao">Duração</option>
          </select>
        </div>
      ) : null}
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
            <span className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex group-focus-within:flex [@media(hover:none)]:flex">
              <button
                type="button"
                onClick={() => {
                  const nome = window.prompt("Nome do projeto:", projeto.nome);
                  if (nome?.trim() && nome.trim() !== projeto.nome) void renomear(projeto.id, nome.trim());
                }}
                className={`${botaoDoCartao} hover:bg-painel-3`}
                aria-label={`Renomear o projeto ${projeto.nome}`}
                title="Renomear"
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
              <button type="button" onClick={() => void duplicar(projeto.id)} className={`${botaoDoCartao} hover:bg-painel-3`} aria-label={`Duplicar o projeto ${projeto.nome}`} title="Duplicar">
                <Copy className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Levar "${projeto.nome}" para a lixeira? Ele fica lá por 30 dias e pode voltar.`)) void excluir(projeto.id);
                }}
                className={`${botaoDoCartao} hover:bg-erro`}
                aria-label={`Excluir o projeto ${projeto.nome}`}
                title="Levar para a lixeira"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </span>
          </div>
        ))}
      </div>
      {projetos && projetos.length === 0 ? (
        <p className="mt-3 text-xs text-suave">{tipo === "imagem" ? "Nenhuma imagem ainda. Escolha um tamanho acima para começar." : "Nenhum projeto ainda. Crie o primeiro e arraste suas mídias para a linha do tempo."}</p>
      ) : null}
    </>
  );
}

/** A lixeira dos projetos (ADR 0007, 17.7): os excluídos nos últimos 30 dias, para restaurar ou apagar de vez. */
export function LixeiraDeProjetos() {
  const [projetos, setProjetos] = useState<ProjetoResumo[] | null>(null);
  const [erro, setErro] = useState("");
  // O instante da leitura, para contar os dias que faltam (fora da renderização)
  const [lidaEm, setLidaEm] = useState(0);
  useEffect(() => {
    let ativo = true;
    chamarApi<ProjetoResumo[]>("/projetos/lixeira/lista")
      .then((lista) => {
        if (!ativo) return;
        setProjetos(lista);
        setLidaEm(Date.now());
      })
      .catch((e) => ativo && setErro(e instanceof ErroApi ? e.message : "Não foi possível abrir a lixeira."));
    return () => {
      ativo = false;
    };
  }, []);
  const tirar = (id: string) => setProjetos((lista) => lista?.filter((projeto) => projeto.id !== id) ?? lista);
  const dias = (iso: string | null | undefined) => (iso ? Math.max(0, 30 - Math.floor((lidaEm - new Date(iso).getTime()) / 86_400_000)) : 30);
  return (
    <section className="flex flex-col gap-2" aria-label="Lixeira">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {projetos && !projetos.length ? <p className="text-sm text-suave">A lixeira está vazia. O projeto excluído fica aqui por 30 dias.</p> : null}
      <ul className="flex flex-col divide-y divide-borda rounded-xl border border-borda bg-painel">
        {projetos?.map((projeto) => (
          <li key={projeto.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{projeto.nome}</span>
              <span className="text-xs text-suave">Sai de vez em {dias(projeto.lixeira_em)} dias</span>
            </span>
            <button
              type="button"
              className="botao-secundario px-3 py-1 text-xs"
              onClick={() =>
                chamarApi(`/projetos/${projeto.id}/restaurar`, { metodo: "POST" }).then(
                  () => tirar(projeto.id),
                  (e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível restaurar."),
                )
              }
            >
              Restaurar
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1 text-xs text-suave hover:bg-erro/20 hover:text-erro"
              onClick={() => {
                if (!window.confirm(`Apagar "${projeto.nome}" de vez? Não tem volta (as mídias continuam na biblioteca).`)) return;
                chamarApi(`/projetos/${projeto.id}/definitivo`, { metodo: "DELETE" }).then(
                  () => tirar(projeto.id),
                  (e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível apagar."),
                );
              }}
            >
              Apagar de vez
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
