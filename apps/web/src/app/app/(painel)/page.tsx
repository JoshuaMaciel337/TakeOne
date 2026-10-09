"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { AvisoErro } from "@/componentes/AvisoErro";
import { EstadoServidor } from "@/componentes/EstadoServidor";
import { CartaoMidia } from "@/componentes/midia/CartaoMidia";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import { useMidias } from "@/lib/useMidias";
import { useSessao } from "@/lib/sessao";

export default function PaginaInicio() {
  const { sessao } = useSessao();
  const { midias, erro, excluir } = useMidias();
  const primeiroNome = sessao.usuario.nome.split(" ")[0];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Olá, {primeiroNome}</h1>
          <p className="mt-1 text-sm text-suave">O que vamos editar hoje?</p>
          <div className="mt-3">
            <EstadoServidor />
          </div>
        </div>
        <Link href="/app/editor" className="botao-principal px-6 py-3 text-base">
          <Plus className="size-5" aria-hidden />
          Novo projeto
        </Link>
      </section>

      <section aria-labelledby="titulo-projetos">
        <h2 id="titulo-projetos" className="font-display text-lg font-semibold">
          Projetos
        </h2>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          <Link
            href="/app/editor"
            className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave transition hover:border-destaque hover:text-texto"
          >
            <Plus className="size-6" aria-hidden />
            <span className="text-sm font-medium">Novo projeto</span>
          </Link>
        </div>
        <p className="mt-3 text-xs text-suave">Os projetos salvos aparecem aqui quando o salvamento chegar ao editor.</p>
      </section>

      <section aria-labelledby="titulo-midias" className="flex flex-col gap-4">
        <h2 id="titulo-midias" className="font-display text-lg font-semibold">
          Suas mídias
        </h2>
        <ZonaDeEnvio />
        <ListaEnvios />
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        {midias && midias.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {midias.map((midia) => (
              <CartaoMidia
                key={midia.id}
                midia={midia}
                aoExcluir={(alvo) => {
                  if (window.confirm(`Excluir "${alvo.nome}"? O arquivo sai da biblioteca.`)) void excluir(alvo.id);
                }}
              />
            ))}
          </div>
        ) : midias ? (
          <p className="text-sm text-suave">Nenhuma mídia ainda. Envie o primeiro vídeo acima.</p>
        ) : null}
      </section>
    </main>
  );
}
