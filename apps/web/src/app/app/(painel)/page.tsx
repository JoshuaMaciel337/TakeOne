"use client";

import { LoaderCircle, Plus } from "lucide-react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { EstadoServidor } from "@/componentes/EstadoServidor";
import { CartaoMidia } from "@/componentes/midia/CartaoMidia";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import { ListaProjetos, useNovoProjeto } from "@/componentes/projeto/ListaProjetos";
import { ErroApi } from "@/lib/api";
import { useMidias } from "@/lib/useMidias";
import { useSessao } from "@/lib/sessao";

export default function PaginaInicio() {
  const { sessao } = useSessao();
  const { midias, erro, excluir } = useMidias();
  const novoProjeto = useNovoProjeto();
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
        <button type="button" onClick={novoProjeto.criar} disabled={novoProjeto.criando} className="botao-principal px-6 py-3 text-base">
          {novoProjeto.criando ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Plus className="size-5" aria-hidden />}
          Novo projeto
        </button>
      </section>

      <section aria-labelledby="titulo-projetos">
        <h2 id="titulo-projetos" className="font-display text-lg font-semibold">
          Projetos
        </h2>
        {novoProjeto.erro ? <AvisoErro>{novoProjeto.erro}</AvisoErro> : null}
        <ListaProjetos aoCriar={novoProjeto.criar} criando={novoProjeto.criando} />
      </section>

      <section aria-labelledby="titulo-midias" className="flex flex-col gap-4">
        <h2 id="titulo-midias" className="font-display text-lg font-semibold">
          Suas mídias
        </h2>
        <ZonaDeEnvio />
        <ListaEnvios />
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        {midias && midias.some((midia) => !midia.elemento) ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {midias.filter((midia) => !midia.elemento).map((midia) => (
              <CartaoMidia
                key={midia.id}
                midia={midia}
                aoExcluir={(alvo) => {
                  if (!window.confirm(`Excluir "${alvo.nome}"? O arquivo sai da biblioteca.`)) return;
                  excluir(alvo.id).catch((e) => window.alert(e instanceof ErroApi ? e.message : "Não foi possível excluir a mídia."));
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
