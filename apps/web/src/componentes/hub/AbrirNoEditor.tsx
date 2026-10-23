"use client";

import { Film, Info, LoaderCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { useProjetos } from "@/componentes/projeto/ListaProjetos";
import type { IdFerramenta } from "@/componentes/editor/ferramentas";
import { NOMES_PROPORCAO, PROPORCOES, type Proporcao } from "@/componentes/editor/proporcoes";
import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { formatarQuando } from "@/lib/formatar";
import { enderecoNoEditor } from "@/lib/hub";

/** O pedido de abrir o editor numa ferramenta: em qual projeto quem decide é a pessoa, na janela. */
export type PedidoDoEditor = {
  titulo: string;
  ferramenta: IdFerramenta;
  /** Onde a função fica dentro do editor, quando não é a própria ferramenta. */
  ondeFica?: string;
  /** Um modelo de projeto já escolhido; o projeto novo nasce na proporção dele. */
  modelo?: { id: string; proporcao: Proporcao };
  /** Uma animação já escolhida na ferramenta Texto ou Elementos. */
  animacao?: string;
};

const Contexto = createContext<(pedido: PedidoDoEditor) => void>(() => undefined);

/** Abre a janela "Abrir no editor" de qualquer lugar do hub. */
export function useAbrirNoEditor() {
  return useContext(Contexto);
}

export function ProvedorAbrirNoEditor({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = useState<PedidoDoEditor | null>(null);
  return (
    <Contexto.Provider value={setPedido}>
      {children}
      {pedido ? <JanelaAbrirNoEditor key={pedido.titulo + pedido.ferramenta} pedido={pedido} aoFechar={() => setPedido(null)} /> : null}
    </Contexto.Provider>
  );
}

/** Projeto novo (na proporção escolhida) ou um dos recentes, e o editor abre na ferramenta pedida. */
function JanelaAbrirNoEditor({ pedido, aoFechar }: { pedido: PedidoDoEditor; aoFechar: () => void }) {
  const router = useRouter();
  const { projetos, erro: erroDaLista } = useProjetos();
  const [proporcao, setProporcao] = useState<Proporcao>(pedido.modelo?.proporcao ?? "9:16");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  // Só os de vídeo: as ferramentas daqui são do editor de vídeo
  const recentes = useMemo(() => (projetos ?? []).filter((projeto) => projeto.tipo !== "imagem").slice(0, 6), [projetos]);
  const abrir = useCallback(
    (id: string) => router.push(enderecoNoEditor(id, pedido.ferramenta, { modelo: pedido.modelo?.id, animacao: pedido.animacao })),
    [router, pedido],
  );

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  function criar() {
    setCriando(true);
    setErro("");
    chamarApi<{ id: string }>("/projetos", { metodo: "POST", corpo: { proporcao } })
      .then((projeto) => abrir(projeto.id))
      .catch((e) => {
        setErro(e instanceof ErroApi ? e.message : "Não foi possível criar o projeto.");
        setCriando(false);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-abrir-no-editor"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-abrir-no-editor" className="font-display text-base font-semibold">
            {pedido.titulo}
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4 text-sm">
          {pedido.ondeFica ? (
            <p className="flex gap-2 rounded-lg border border-borda bg-painel-2 p-3 text-xs text-suave">
              <Info className="mt-0.5 size-4 shrink-0 text-destaque" aria-hidden />
              {pedido.ondeFica}
            </p>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Projeto novo</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={proporcao}
                onChange={(evento) => setProporcao(evento.currentTarget.value as Proporcao)}
                aria-label="Formato do projeto novo"
                className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-2 text-xs outline-none focus:border-destaque"
              >
                {PROPORCOES.map((item) => (
                  <option key={item} value={item}>
                    {NOMES_PROPORCAO[item]}
                  </option>
                ))}
              </select>
              <button type="button" className="botao-principal px-4 py-2" onClick={criar} disabled={criando}>
                {criando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                Criar e abrir
              </button>
            </div>
            {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          </section>
          {pedido.modelo ? null : (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Ou continue um projeto</h3>
              {erroDaLista ? <AvisoErro>{erroDaLista}</AvisoErro> : null}
              {projetos === null ? <LoaderCircle className="size-4 animate-spin text-suave" aria-label="Carregando os projetos" /> : null}
              {projetos && !recentes.length ? <p className="text-xs text-suave">Nenhum projeto ainda.</p> : null}
              <ul className="flex flex-col gap-1">
                {recentes.map((projeto) => (
                  <li key={projeto.id}>
                    <button
                      type="button"
                      onClick={() => abrir(projeto.id)}
                      className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-painel-2 focus-visible:outline-2 focus-visible:outline-destaque"
                    >
                      <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-painel-3">
                        {projeto.capa_midia_id ? (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
                          <img src={arquivoDaMidia(projeto.capa_midia_id, "capa.jpg")} alt="" className="size-full object-cover" loading="lazy" />
                        ) : (
                          <Film className="size-4 text-suave" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{projeto.nome}</span>
                        <span className="block text-xs text-suave">
                          {projeto.proporcao} · editado {formatarQuando(projeto.atualizado_em)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
