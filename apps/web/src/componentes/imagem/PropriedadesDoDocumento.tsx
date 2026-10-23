"use client";

import { useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { CampoCor } from "@/componentes/editor/CampoCor";
import type { Comando } from "@/lib/projeto/comandos";
import { problemaNoTamanho, TAMANHOS_PRONTOS, tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";

const campo = "min-w-0 rounded border border-borda bg-painel-2 px-2 py-1 text-xs text-texto outline-none focus:border-destaque";

/**
 * As propriedades do documento: o painel Propriedades sem camada escolhida, como nos editores de imagem profissionais.
 * O tamanho da tela (com os prontos) e o fundo; recortar é a ferramenta Corte (C).
 */
export function PropriedadesDoDocumento({ projeto, aoPrever, aoExecutar }: { projeto: Projeto; aoPrever: (comando: Comando | null) => void; aoExecutar: (comando: Comando) => void }) {
  const atual = tamanhoDaImagem(projeto);
  const [largura, setLargura] = useState(String(atual.largura));
  const [altura, setAltura] = useState(String(atual.altura));
  const [erro, setErro] = useState("");
  // O tamanho mudou de fora (desfazer, corte, modelo): os campos acompanham
  const [visto, setVisto] = useState(atual);
  if (visto.largura !== atual.largura || visto.altura !== atual.altura) {
    setVisto(atual);
    setLargura(String(atual.largura));
    setAltura(String(atual.altura));
  }

  function aplicar(evento: React.FormEvent) {
    evento.preventDefault();
    const tamanho = { largura: Number(largura), altura: Number(altura) };
    const problema = problemaNoTamanho(tamanho);
    setErro(problema ?? "");
    if (!problema) aoExecutar({ comando: "imagem.tamanho", parametros: tamanho });
  }

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <h3 className="text-sm font-semibold">Documento</h3>
      <section className="flex flex-col gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-suave">Tela</h4>
        <form onSubmit={aplicar} className="flex items-end gap-1.5">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-suave">
            L
            <input aria-label="Largura em pixels" value={largura} onChange={(evento) => setLargura(evento.currentTarget.value)} inputMode="numeric" className={campo} />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-suave">
            A
            <input aria-label="Altura em pixels" value={altura} onChange={(evento) => setAltura(evento.currentTarget.value)} inputMode="numeric" className={campo} />
          </label>
          <span className="pb-1.5 text-suave">px</span>
          <button type="submit" className="botao-secundario px-2.5 py-1 text-xs">
            Aplicar
          </button>
        </form>
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        <select
          aria-label="Tamanhos prontos"
          className={campo}
          value={TAMANHOS_PRONTOS.find((item) => item.largura === atual.largura && item.altura === atual.altura)?.id ?? ""}
          onChange={(evento) => {
            const item = TAMANHOS_PRONTOS.find((pronto) => pronto.id === evento.currentTarget.value);
            if (item) aoExecutar({ comando: "imagem.tamanho", parametros: { largura: item.largura, altura: item.altura } });
          }}
        >
          <option value="" disabled>
            Tamanho próprio
          </option>
          {TAMANHOS_PRONTOS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome} ({item.largura} × {item.altura})
            </option>
          ))}
        </select>
        <p className="text-[11px] text-suave">As camadas ficam no mesmo lugar em relação à tela. Para cortar, use a ferramenta Corte (C).</p>
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-suave">Fundo</h4>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(projeto.fundo.transparente)} onChange={(evento) => aoExecutar({ comando: "imagem.fundo", parametros: { transparente: evento.currentTarget.checked } })} />
          Transparente (no PNG e no WebP)
        </label>
        {projeto.fundo.transparente ? null : (
          <CampoCor
            rotulo="Cor do fundo"
            cor={projeto.fundo.cor}
            aoPrever={(cor) => aoPrever({ comando: "imagem.fundo", parametros: { cor } })}
            aoConfirmar={(cor) => aoExecutar({ comando: "imagem.fundo", parametros: { cor } })}
          />
        )}
      </section>
    </div>
  );
}
