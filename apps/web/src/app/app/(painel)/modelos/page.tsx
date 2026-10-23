"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { NOMES_PROPORCAO, PROPORCOES } from "@/componentes/editor/proporcoes";
import { CartaoModelo, useUsarDaBiblioteca } from "@/componentes/hub/CartaoModelo";
import { JanelaDoModelo } from "@/componentes/hub/JanelaDoModelo";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { ABAS, type Aba, categoriasDos, filtrarItens, type ItemDaBiblioteca, type Ordem, ORDENS } from "@/lib/biblioteca";
import { TAMANHOS_PRONTOS } from "@/lib/projeto/imagem";
import { useBiblioteca } from "@/lib/useBiblioteca";

const POR_PAGINA = 48;
const SELETOR = "rounded-lg border border-borda bg-painel-2 px-2.5 py-2 text-xs outline-none focus:border-destaque";

const VAZIOS: Record<Aba, string> = {
  todos: "Nenhum modelo com esses filtros.",
  espaco: "Nenhum modelo do espaço ainda. No editor, use “Salvar como modelo” para guardar um projeto aqui.",
  salvos: "Nada salvo ainda. Use o marcador no canto de um modelo para guardar aqui.",
  destaques: "Nenhum destaque com esses filtros.",
};

export default function PaginaModelos() {
  const biblioteca = useBiblioteca({ comAnimacoes: true });
  const usar = useUsarDaBiblioteca(biblioteca.contarUso);
  const [tipo, setTipo] = useState<"projetos" | "imagens" | "animacoes">("projetos");
  const [aba, setAba] = useState<Aba>("todos");
  const [busca, setBusca] = useState("");
  const [formato, setFormato] = useState("");
  const [categoria, setCategoria] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("populares");
  const [mostrando, setMostrando] = useState(POR_PAGINA);
  const [aberto, setAberto] = useState<string | null>(null);

  const todos = tipo === "projetos" ? biblioteca.projetos : tipo === "imagens" ? biblioteca.imagens : biblioteca.animacoes;
  const categorias = useMemo(() => categoriasDos(todos ?? []), [todos]);
  const itens = useMemo(
    () => (todos ? filtrarItens(todos, { aba, busca, formato: tipo === "animacoes" ? "" : formato, categoria, ordem }) : null),
    [todos, aba, busca, formato, categoria, ordem, tipo],
  );
  // O item aberto acompanha a lista (o marcador de salvo muda o item)
  const itemAberto = aberto ? (todos?.find((item) => item.chave === aberto) ?? null) : null;
  const trocar = <T,>(mudar: (valor: T) => void) => (valor: T) => {
    mudar(valor);
    setMostrando(POR_PAGINA);
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8">
      <TituloDaPagina titulo="Modelos" descricao="Projetos de vídeo prontos, designs de imagem e animações. Passe o mouse numa animação para ver ela tocando." />

      <div className="flex gap-1 border-b border-borda" role="tablist" aria-label="Tipo de modelo">
        {(
          [
            ["projetos", "Modelos de vídeo", biblioteca.projetos?.length],
            ["imagens", "Modelos de imagem", biblioteca.imagens?.length],
            ["animacoes", "Animações", biblioteca.animacoes?.length],
          ] as const
        ).map(([id, nome, quantos]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tipo === id}
            onClick={() => {
              setTipo(id);
              setCategoria("");
              setFormato("");
              setMostrando(POR_PAGINA);
            }}
            className={`border-b-2 px-3 py-2 text-sm transition ${tipo === id ? "border-destaque font-medium text-texto" : "border-transparent text-suave hover:text-texto"}`}
          >
            {nome}
            {quantos !== undefined ? <span className="ml-1.5 text-xs text-apagado">{quantos}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Quais modelos">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={aba === item.id}
            onClick={() => trocar(setAba)(item.id)}
            className={`rounded-full border px-3 py-1 text-xs transition ${aba === item.id ? "border-destaque bg-destaque/15 text-texto" : "border-borda text-suave hover:text-texto"}`}
          >
            {item.nome}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-borda bg-painel-2 px-3 py-2 sm:max-w-sm">
          <Search className="size-4 text-suave" aria-hidden />
          <input
            value={busca}
            onChange={(evento) => trocar(setBusca)(evento.currentTarget.value)}
            placeholder={tipo === "animacoes" ? "Buscar animações ou temas…" : "Buscar modelos…"}
            aria-label="Buscar"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {tipo === "projetos" ? (
            <select value={formato} onChange={(evento) => trocar(setFormato)(evento.currentTarget.value)} aria-label="Formato" className={SELETOR}>
              <option value="">Qualquer formato</option>
              {PROPORCOES.map((item) => (
                <option key={item} value={item}>
                  {NOMES_PROPORCAO[item]}
                </option>
              ))}
            </select>
          ) : tipo === "imagens" ? (
            <select value={formato} onChange={(evento) => trocar(setFormato)(evento.currentTarget.value)} aria-label="Tamanho" className={SELETOR}>
              <option value="">Qualquer tamanho</option>
              {TAMANHOS_PRONTOS.map((item) => (
                <option key={item.id} value={item.nome}>
                  {item.nome}
                </option>
              ))}
            </select>
          ) : null}
          <select value={categoria} onChange={(evento) => trocar(setCategoria)(evento.currentTarget.value)} aria-label="Categoria" className={SELETOR}>
            <option value="">Todas as categorias</option>
            {categorias.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={ordem} onChange={(evento) => trocar(setOrdem)(evento.currentTarget.value as Ordem)} aria-label="Ordem" className={SELETOR}>
            {ORDENS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {biblioteca.erro ? <AvisoErro>{biblioteca.erro}</AvisoErro> : null}
      {itens === null && !biblioteca.erro ? <LoaderCircle className="size-5 animate-spin text-suave" aria-label="Carregando" /> : null}
      {itens && !itens.length ? <p className="text-sm text-suave">{VAZIOS[aba]}</p> : null}
      {itens && itens.length ? (
        <>
          <p className="text-xs text-apagado">{itens.length === 1 ? "1 modelo" : `${itens.length} modelos`}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
            {itens.slice(0, mostrando).map((item: ItemDaBiblioteca) => (
              <CartaoModelo key={item.chave} item={item} aoAbrir={(alvo) => setAberto(alvo.chave)} aoSalvar={biblioteca.salvar} />
            ))}
          </div>
          {itens.length > mostrando ? (
            <button type="button" className="botao-secundario mx-auto px-5 py-2" onClick={() => setMostrando((n) => n + POR_PAGINA)}>
              Mostrar mais ({itens.length - mostrando})
            </button>
          ) : null}
        </>
      ) : null}

      {itemAberto ? (
        <JanelaDoModelo item={itemAberto} aoUsar={usar} aoSalvar={biblioteca.salvar} aoExcluir={biblioteca.excluirDoEspaco} aoFechar={() => setAberto(null)} />
      ) : null}
    </main>
  );
}
