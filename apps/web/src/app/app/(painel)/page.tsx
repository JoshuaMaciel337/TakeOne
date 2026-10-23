"use client";

import { ArrowRight, Clapperboard, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EstadoServidor } from "@/componentes/EstadoServidor";
import { useAbrirNoEditor } from "@/componentes/hub/AbrirNoEditor";
import { CartaoFerramenta } from "@/componentes/hub/CartaoFerramenta";
import { CartaoModelo, useUsarDaBiblioteca } from "@/componentes/hub/CartaoModelo";
import { JanelaDoModelo } from "@/componentes/hub/JanelaDoModelo";
import { SecaoDoHub } from "@/componentes/hub/TituloDaPagina";
import { ListaProjetos } from "@/componentes/projeto/ListaProjetos";
import { filtrarItens } from "@/lib/biblioteca";
import { ferramentaDoHub, NO_INICIO, saudacao } from "@/lib/hub";
import { useSessao } from "@/lib/sessao";
import { useBiblioteca } from "@/lib/useBiblioteca";

const VER_TUDO = "inline-flex items-center gap-1 text-xs font-medium text-suave transition hover:text-texto";

export default function PaginaInicio() {
  const { sessao } = useSessao();
  const abrirNoEditor = useAbrirNoEditor();
  const primeiroNome = sessao.usuario.nome.split(" ")[0];
  const criarAutomaticamente = ferramentaDoHub("criar-automaticamente");
  const novoVideo = () => abrirNoEditor({ titulo: "Editor de vídeo", ferramenta: "midia" });
  const biblioteca = useBiblioteca();
  const usar = useUsarDaBiblioteca(biblioteca.contarUso);
  const [aberto, setAberto] = useState<string | null>(null);
  const populares = biblioteca.projetos ? filtrarItens(biblioteca.projetos, { aba: "todos", busca: "", formato: "", categoria: "", ordem: "populares" }).slice(0, 4) : [];
  const itemAberto = aberto ? (biblioteca.projetos?.find((item) => item.chave === aberto) ?? null) : null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-8">
      <section className="flex flex-col gap-1">
        <p className="text-sm text-suave">
          {saudacao(new Date().getHours())}, {primeiroNome}
        </p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">O que vamos criar hoje?</h1>
        <div className="mt-2">
          <EstadoServidor />
        </div>
      </section>

      <section className="grid gap-5 overflow-hidden rounded-2xl border border-borda bg-gradient-to-br from-destaque/20 via-painel to-painel p-6 sm:p-8 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded-full bg-destaque/20 px-2.5 py-0.5 text-[11px] font-semibold text-destaque">Editor de vídeo</span>
          <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">Do vídeo bruto ao pronto para postar.</h2>
          <p className="max-w-lg text-sm text-suave">
            Corte, legende, ponha títulos e música e exporte até 4K. Ou deixe o “Criar automaticamente” tirar as pausas e os retakes e montar o resto.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" className="botao-principal px-5 py-2.5" onClick={novoVideo}>
              <Clapperboard className="size-4" aria-hidden />
              Abrir o editor
            </button>
            <button
              type="button"
              className="botao-secundario px-5 py-2.5"
              onClick={() => {
                if (criarAutomaticamente.destino.tipo === "editor") {
                  abrirNoEditor({ titulo: criarAutomaticamente.nome, ferramenta: criarAutomaticamente.destino.ferramenta, ondeFica: criarAutomaticamente.destino.ondeFica });
                }
              }}
            >
              <WandSparkles className="size-4" aria-hidden />
              Criar automaticamente
            </button>
          </div>
        </div>
        <div className="hidden aspect-video items-center justify-center rounded-xl border border-borda bg-painel-3/70 md:flex" aria-hidden>
          <Clapperboard className="size-16 text-destaque/70" />
        </div>
      </section>

      <SecaoDoHub
        titulo="Ferramentas"
        acao={
          <Link href="/app/ferramentas" className={VER_TUDO}>
            Ver todas <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {NO_INICIO.map((id) => (
            <CartaoFerramenta key={id} ferramenta={ferramentaDoHub(id)} compacto />
          ))}
        </div>
      </SecaoDoHub>

      <SecaoDoHub
        titulo="Continue criando"
        acao={
          <Link href="/app/projetos" className={VER_TUDO}>
            Todos os projetos <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        <ListaProjetos aoCriar={novoVideo} criando={false} limite={7} />
      </SecaoDoHub>

      <SecaoDoHub
        titulo="Modelos"
        acao={
          <Link href="/app/modelos" className={VER_TUDO}>
            Ver todos <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
          {populares.map((item) => (
            <CartaoModelo key={item.chave} item={item} aoAbrir={(alvo) => setAberto(alvo.chave)} aoSalvar={biblioteca.salvar} />
          ))}
        </div>
      </SecaoDoHub>
      {itemAberto ? <JanelaDoModelo item={itemAberto} aoUsar={usar} aoSalvar={biblioteca.salvar} aoExcluir={biblioteca.excluirDoEspaco} aoFechar={() => setAberto(null)} /> : null}
    </main>
  );
}
