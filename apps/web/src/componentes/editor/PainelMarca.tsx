"use client";

import { Check, ImageOff, Plus, Stamp, Type, X } from "lucide-react";
import { useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { salvarMarca, useMarca } from "@/lib/marca";
import type { Comando } from "@/lib/projeto/comandos";
import { type Canto, CORES_DA_MARCA_MAXIMO, type Marca, transformacaoDoLogo } from "@/lib/projeto/marca";
import { FONTES_TEXTO } from "@/lib/projeto/texto";
import type { Midia } from "@/lib/tipos";


const CANTOS: { id: Canto; nome: string }[] = [
  { id: "superior-direito", nome: "Em cima, à direita" },
  { id: "superior-esquerdo", nome: "Em cima, à esquerda" },
  { id: "inferior-direito", nome: "Embaixo, à direita" },
  { id: "inferior-esquerdo", nome: "Embaixo, à esquerda" },
];

type Props = {
  midias: Midia[];
  proporcao: string;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/** Kit de marca do espaço: cores, fontes e logo, e os atalhos para usar no projeto aberto. */
export function PainelMarca({ midias, proporcao, aoExecutar, aoAvisar }: Props) {
  const salva = useMarca();
  // O rascunho começa no kit salvo e só vai para o servidor no "Salvar"
  const [rascunho, setRascunho] = useState<Marca | null>(null);
  const marca = rascunho ?? salva;
  const [salvando, setSalvando] = useState(false);
  const [canto, setCanto] = useState<Canto>("superior-direito");
  const imagens = midias.filter((midia) => midia.status === "pronta" && midia.imagem && midia.video);
  const logo = imagens.find((midia) => midia.id === marca.logo_midia_id) ?? null;
  const mudar = (mudanca: Partial<Marca>) => setRascunho({ ...marca, ...mudanca });

  function salvar() {
    setSalvando(true);
    salvarMarca(marca)
      .then(() => {
        setRascunho(null);
        aoAvisar("Kit de marca salvo para todos os projetos do espaço.");
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível salvar o kit agora."))
      .finally(() => setSalvando(false));
  }

  function porLogo() {
    if (!logo?.video) return;
    const [largura, altura] = proporcao.split(":").map(Number);
    const transformacao = transformacaoDoLogo({ largura: logo.video.largura, altura: logo.video.altura }, { largura, altura }, canto);
    aoExecutar({ comando: "marca.logo", parametros: { midiaId: logo.id, transformacao } });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Cores</h3>
        <div className="flex flex-wrap items-center gap-2">
          {marca.cores.map((cor, indice) => (
            <span key={indice} className="group relative">
              <input
                type="color"
                value={cor}
                aria-label={`Cor ${indice + 1} da marca`}
                onChange={(evento) => mudar({ cores: marca.cores.map((item, i) => (i === indice ? evento.target.value : item)) })}
                className="size-10 cursor-pointer rounded-md border border-borda bg-painel-2"
              />
              <button
                type="button"
                onClick={() => mudar({ cores: marca.cores.filter((_, i) => i !== indice) })}
                className="absolute -right-1.5 -top-1.5 hidden size-4 place-items-center rounded-full bg-painel-3 text-suave group-hover:grid"
                aria-label={`Tirar a cor ${indice + 1}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          {marca.cores.length < CORES_DA_MARCA_MAXIMO ? (
            <button
              type="button"
              onClick={() => mudar({ cores: [...marca.cores, "#ff624a"] })}
              className="grid size-10 place-items-center rounded-md border border-dashed border-borda text-suave hover:text-texto"
              aria-label="Acrescentar uma cor"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-suave">A primeira é a principal. As cores aparecem nos seletores de cor e nas animações.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Fontes</h3>
        {(
          [
            ["fonte_titulo", "Títulos"],
            ["fonte_texto", "Textos e legendas"],
          ] as const
        ).map(([chave, rotulo]) => (
          <label key={chave} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-suave">{rotulo}</span>
            <select
              value={marca[chave]}
              onChange={(evento) => mudar({ [chave]: evento.target.value } as Partial<Marca>)}
              className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
            >
              {FONTES_TEXTO.map((fonte) => (
                <option key={fonte.id} value={fonte.id}>
                  {fonte.nome}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Logo</h3>
        {imagens.length ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => mudar({ logo_midia_id: null })}
              aria-pressed={!logo}
              title="Sem logo"
              className={`grid size-12 shrink-0 place-items-center rounded-md border bg-painel ${!logo ? "border-destaque ring-1 ring-destaque" : "border-borda"}`}
            >
              <ImageOff className="size-4 text-suave" aria-hidden />
              <span className="sr-only">Sem logo</span>
            </button>
            {imagens.map((midia) => (
              <button
                key={midia.id}
                type="button"
                onClick={() => mudar({ logo_midia_id: midia.id })}
                aria-pressed={midia.id === logo?.id}
                title={midia.nome}
                className={`size-12 shrink-0 overflow-hidden rounded-md border ${midia.id === logo?.id ? "border-destaque ring-1 ring-destaque" : "border-borda"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie */}
                <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt={midia.nome} className="size-full object-contain" draggable={false} />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-suave">Envie o logo como imagem (PNG com fundo transparente fica melhor) e escolha aqui.</p>
        )}
      </section>

      <button type="button" className="botao-principal px-3 py-1.5" disabled={!rascunho || salvando} onClick={salvar}>
        <Check className="size-4" aria-hidden />
        {salvando ? "Salvando…" : rascunho ? "Salvar o kit" : "Kit salvo"}
      </button>

      <section className="flex flex-col gap-2 border-t border-borda pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Neste projeto</h3>
        <div className="flex gap-2">
          <select
            value={canto}
            onChange={(evento) => setCanto(evento.target.value as Canto)}
            aria-label="Canto do logo"
            className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
          >
            {CANTOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={!logo} onClick={porLogo}>
            <Stamp className="size-4" aria-hidden />
            Pôr o logo
          </button>
        </div>
        <button
          type="button"
          className="botao-secundario px-3 py-1.5 text-xs"
          onClick={() => aoExecutar({ comando: "marca.textos", parametros: { fonteTitulo: marca.fonte_titulo, fonteTexto: marca.fonte_texto, cor: marca.cores[0] ?? null } })}
        >
          <Type className="size-4" aria-hidden />
          Aplicar fontes e cor aos textos
        </button>
        <p className="text-[11px] text-suave">Os títulos ganham a fonte de título e a cor principal; as legendas, a fonte de texto e a cor principal nas palavras destacadas.</p>
      </section>
    </div>
  );
}
