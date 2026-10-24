"use client";

// As formas personalizadas (ADR 0003, onda 13.7): a biblioteca do TakeOne (lib/vetor/formasProntas.ts) e as do espaço
// (Editar › Definir forma personalizada). O painel Formas escolhe a forma da ferramenta Forma personalizada (U) e põe
// uma no meio da imagem com o clique duplo; a barra da ferramenta tem o mesmo seletor num balão.
import { Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { svgDosCaminhos } from "@/lib/vetor/contorno";
import { CATEGORIAS_DAS_FORMAS, type CategoriaDaForma, FORMAS_PRONTAS } from "@/lib/vetor/formasProntas";
import { caixaDosCaminhos, type Subcaminho } from "@/lib/vetor/modelo";

import { Balao } from "./OpcoesDaForma";

/** Uma forma do espaço (o recurso "forma"). */
export type FormaDoEspaco = { id: string; nome: string; subcaminhos: Subcaminho[] };
/** A forma escolhida: o id da biblioteca, ou "espaco:<id>". */
export type IdDaFormaPersonalizada = string;

/** Os caminhos de uma forma escolhida (null se ela não existe mais). */
export function caminhosDaFormaPersonalizada(id: IdDaFormaPersonalizada, doEspaco: FormaDoEspaco[]): { nome: string; caminhos: Subcaminho[] } | null {
  if (id.startsWith("espaco:")) {
    const forma = doEspaco.find((item) => item.id === id.slice(7));
    return forma ? { nome: forma.nome, caminhos: forma.subcaminhos } : null;
  }
  const forma = FORMAS_PRONTAS.find((item) => item.id === id);
  return forma ? { nome: forma.nome, caminhos: forma.caminhos() } : null;
}

export function MiniaturaDaForma({ caminhos, className = "size-8" }: { caminhos: Subcaminho[]; className?: string }) {
  const caixa = caixaDosCaminhos(caminhos) ?? { x0: 0, y0: 0, x1: 100, y1: 100 };
  const lado = Math.max(caixa.x1 - caixa.x0, caixa.y1 - caixa.y0, 1);
  const folga = lado * 0.06;
  const cx = (caixa.x0 + caixa.x1) / 2;
  const cy = (caixa.y0 + caixa.y1) / 2;
  return (
    <svg viewBox={`${cx - lado / 2 - folga} ${cy - lado / 2 - folga} ${lado + 2 * folga} ${lado + 2 * folga}`} className={className} aria-hidden>
      {caminhos.map((sub, i) => (
        // Os caminhos que subtraem aparecem na cor do fundo (vale para os furos de todas as formas da biblioteca)
        <path key={i} d={svgDosCaminhos([sub])} fill={sub.operacao === "subtrair" ? "var(--to-painel)" : "currentColor"} />
      ))}
    </svg>
  );
}

/** A grade das formas, com as categorias e a busca. */
function GradeDasFormas({ escolhida, doEspaco, aoEscolher, aoPor, aoExcluir, alta = false }: { escolhida: IdDaFormaPersonalizada; doEspaco: FormaDoEspaco[]; aoEscolher: (id: IdDaFormaPersonalizada) => void; aoPor?: (id: IdDaFormaPersonalizada) => void; aoExcluir?: (id: string) => void; alta?: boolean }) {
  const [categoria, setCategoria] = useState<CategoriaDaForma | "todas" | "espaco">("todas");
  const [busca, setBusca] = useState("");
  const termo = busca
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  const semAcento = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const prontas = categoria === "espaco" ? [] : FORMAS_PRONTAS.filter((forma) => (categoria === "todas" || forma.categoria === categoria) && (!termo || semAcento(forma.nome).includes(termo)));
  const minhas = categoria === "todas" || categoria === "espaco" ? doEspaco.filter((forma) => !termo || semAcento(forma.nome).includes(termo)) : [];
  const item = (id: string, nome: string, caminhos: Subcaminho[], excluir?: () => void) => (
    <li key={id} className="group relative">
      <button
        type="button"
        title={`${nome}${aoPor ? " (clique duplo põe no meio da imagem)" : ""}`}
        aria-label={nome}
        aria-pressed={escolhida === id}
        className={`flex size-11 items-center justify-center rounded text-texto ${escolhida === id ? "bg-destaque/25 ring-1 ring-destaque" : "hover:bg-painel-2"}`}
        onClick={() => aoEscolher(id)}
        onDoubleClick={() => aoPor?.(id)}
      >
        <MiniaturaDaForma caminhos={caminhos} />
      </button>
      {excluir ? (
        <button type="button" className="absolute -right-1 -top-1 hidden rounded-full bg-painel p-0.5 text-suave hover:text-texto group-hover:block" title="Excluir a forma do espaço" aria-label={`Excluir ${nome}`} onClick={excluir}>
          <Trash2 className="size-3" aria-hidden />
        </button>
      ) : null}
    </li>
  );
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <select className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs" value={categoria} onChange={(evento) => setCategoria(evento.currentTarget.value as typeof categoria)} aria-label="Categoria das formas">
          <option value="todas">Todas</option>
          {CATEGORIAS_DAS_FORMAS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
          <option value="espaco">Do espaço</option>
        </select>
        <label className="flex min-w-0 flex-1 items-center gap-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5">
          <Search className="size-3 shrink-0 text-suave" aria-hidden />
          <input value={busca} onChange={(evento) => setBusca(evento.currentTarget.value)} placeholder="Procurar" aria-label="Procurar forma" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
        </label>
      </div>
      <ul className={`grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1 overflow-y-auto ${alta ? "max-h-none" : "max-h-64"}`}>
        {minhas.map((forma) => item(`espaco:${forma.id}`, forma.nome, forma.subcaminhos, aoExcluir ? () => aoExcluir(forma.id) : undefined))}
        {prontas.map((forma) => item(forma.id, forma.nome, forma.caminhos()))}
        {!minhas.length && !prontas.length ? <li className="col-span-full px-1 py-2 text-[11px] text-suave">{categoria === "espaco" ? "Nenhuma forma do espaço. Use Editar › Definir forma personalizada numa camada de forma." : "Nenhuma forma com esse nome."}</li> : null}
      </ul>
    </div>
  );
}

/** O painel Formas. */
export function PainelFormasPersonalizadas(props: { escolhida: IdDaFormaPersonalizada; doEspaco: FormaDoEspaco[]; aoEscolher: (id: IdDaFormaPersonalizada) => void; aoPor: (id: IdDaFormaPersonalizada) => void; aoExcluir: (id: string) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col p-2" data-painel-formas>
      <GradeDasFormas {...props} alta />
      <p className="mt-2 shrink-0 text-[11px] text-suave">Clique escolhe a forma da ferramenta Forma personalizada (U); clique duplo põe uma no meio da imagem.</p>
    </div>
  );
}

/** O seletor da barra: a forma escolhida e o balão com a grade. */
export function SeletorDeFormaPersonalizada({ escolhida, doEspaco, aoEscolher }: { escolhida: IdDaFormaPersonalizada; doEspaco: FormaDoEspaco[]; aoEscolher: (id: IdDaFormaPersonalizada) => void }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const atual = caminhosDaFormaPersonalizada(escolhida, doEspaco);
  return (
    <span className="flex items-center gap-1 text-suave">
      Forma:
      <button type="button" aria-label="Escolher a forma" aria-expanded={Boolean(ancora)} title={atual?.nome} className="flex size-6 items-center justify-center rounded border border-borda bg-painel-2 text-texto hover:ring-2 hover:ring-destaque" onClick={(evento) => setAncora(ancora ? null : evento.currentTarget)}>
        {atual ? <MiniaturaDaForma caminhos={atual.caminhos} className="size-5" /> : null}
      </button>
      {ancora ? (
        <Balao ancora={ancora} aoFechar={() => setAncora(null)}>
          <GradeDasFormas
            escolhida={escolhida}
            doEspaco={doEspaco}
            aoEscolher={(id) => {
              aoEscolher(id);
              setAncora(null);
            }}
          />
        </Balao>
      ) : null}
    </span>
  );
}
