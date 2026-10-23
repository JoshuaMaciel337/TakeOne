"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { SecaoDoHub, TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { ListaProjetos } from "@/componentes/projeto/ListaProjetos";
import { chamarApi, ErroApi } from "@/lib/api";
import { problemaNoTamanho, TAMANHOS_PRONTOS, type TamanhoDaImagem } from "@/lib/projeto/imagem";

/** O desenho de um tamanho: o retângulo na proporção, dentro de uma caixa fixa. */
function Formato({ largura, altura }: TamanhoDaImagem) {
  const escala = 56 / Math.max(largura, altura);
  return (
    <span className="flex size-16 items-center justify-center">
      <span
        className="rounded-sm border-2 border-current"
        style={{
          width: Math.max(8, largura * escala),
          height: Math.max(8, altura * escala),
        }}
      />
    </span>
  );
}

export default function PaginaEditorDeImagem() {
  const router = useRouter();
  const [criando, setCriando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [largura, setLargura] = useState("1080");
  const [altura, setAltura] = useState("1080");

  function criar(id: string, tamanho: TamanhoDaImagem) {
    const problema = problemaNoTamanho(tamanho);
    if (problema) {
      setErro(problema);
      return;
    }
    setCriando(id);
    setErro("");
    chamarApi<{ id: string }>("/projetos", {
      metodo: "POST",
      corpo: { tamanho },
    })
      .then((projeto) => router.push(`/app/imagem/${projeto.id}`))
      .catch((e) => {
        setErro(e instanceof ErroApi ? e.message : "Não foi possível criar a imagem.");
        setCriando(null);
      });
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8">
      <TituloDaPagina
        titulo="Editor de imagem"
        descricao="Posts, capas, stories e banners em camadas: fotos, textos e formas, com cor, efeitos e fundo removido. Sai em PNG, JPG ou WebP."
      />
      <SecaoDoHub titulo="Novo design">
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
          {TAMANHOS_PRONTOS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={criando !== null}
              onClick={() => criar(item.id, item)}
              className="flex flex-col items-center gap-1 rounded-xl border border-borda bg-painel-2 p-3 text-suave transition hover:-translate-y-0.5 hover:border-suave/50 hover:text-texto disabled:opacity-60"
            >
              {criando === item.id ? (
                <span className="flex size-16 items-center justify-center">
                  <LoaderCircle className="size-6 animate-spin" aria-hidden />
                </span>
              ) : (
                <Formato largura={item.largura} altura={item.altura} />
              )}
              <span className="text-sm font-medium text-texto">{item.nome}</span>
              <span className="text-xs tabular-nums">
                {item.largura} × {item.altura}
              </span>
            </button>
          ))}
          <form
            className="flex flex-col gap-2 rounded-xl border border-dashed border-borda p-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              criar("personalizado", {
                largura: Number(largura),
                altura: Number(altura),
              });
            }}
          >
            <span className="text-sm font-medium">Tamanho próprio</span>
            <div className="flex gap-1.5">
              <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-suave">
                Largura
                <input
                  value={largura}
                  onChange={(evento) => setLargura(evento.currentTarget.value)}
                  inputMode="numeric"
                  className="min-w-0 rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-suave">
                Altura
                <input
                  value={altura}
                  onChange={(evento) => setAltura(evento.currentTarget.value)}
                  inputMode="numeric"
                  className="min-w-0 rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
                />
              </label>
            </div>
            <button type="submit" className="botao-secundario px-2 py-1 text-xs" disabled={criando !== null}>
              {criando === "personalizado" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
              Criar
            </button>
          </form>
        </div>
      </SecaoDoHub>
      <SecaoDoHub titulo="Suas imagens">
        <ListaProjetos tipo="imagem" />
      </SecaoDoHub>
    </main>
  );
}
