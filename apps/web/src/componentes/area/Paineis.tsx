"use client";

// Os grupos de painéis com abas dos editores (ADR 0002): a faixa de abas com o menu "≡" no fim, duplo clique na
// faixa recolhe o grupo, e o divisor entre dois grupos muda a altura do de cima. O estado de cada área de trabalho
// fica no navegador (lib/areaDeTrabalho.ts tem as contas).
import { Menu as IconeMenu } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  abrirPainel,
  alternarPainel,
  alternarRecolhido,
  ativarAba,
  estadoValido,
  type EstadoDaArea,
  fecharGrupo,
  fecharPainel,
  type GrupoDaArea,
  moverGrupo,
  mudarAltura,
  painelAberto,
} from "@/lib/areaDeTrabalho";

import { type ItemDeMenu } from "./BarraDeMenus";

export type Painel = { nome: string; conteudo: ReactNode; menu?: ItemDeMenu[] };

type Guardado = { area: string; porArea: Record<string, EstadoDaArea> };

function ler(chave: string): Guardado | null {
  try {
    const texto = window.localStorage.getItem(chave);
    return texto ? (JSON.parse(texto) as Guardado) : null;
  } catch {
    return null;
  }
}

/**
 * A área de trabalho escolhida e o estado dos painéis dela, guardados no navegador por editor. Cada área lembra o
 * próprio arranjo; "Restaurar" volta ao padrão da área.
 */
export function useAreaDeTrabalho(editor: string, areas: Record<string, EstadoDaArea>, inicial: string, paineis: readonly string[]) {
  const chave = `takeone-area-${editor}`;
  const [guardado, setGuardado] = useState<Guardado>({ area: inicial, porArea: {} });
  const carregado = useRef(false);
  // Lido depois de montar: no servidor não há navegador
  useEffect(() => {
    const lido = ler(chave);
    carregado.current = true;
    if (lido && areas[lido.area]) {
      const porArea = Object.fromEntries(Object.entries(lido.porArea ?? {}).filter(([nome, estado]) => areas[nome] && estadoValido(estado, paineis)));
      void Promise.resolve().then(() => setGuardado({ area: lido.area, porArea }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na primeira montagem
  }, [chave]);
  useEffect(() => {
    if (!carregado.current) return;
    try {
      window.localStorage.setItem(chave, JSON.stringify(guardado));
    } catch {
      // Sem armazenamento (janela anônima): a área vale só nesta aba
    }
  }, [chave, guardado]);

  const area = areas[guardado.area] ? guardado.area : inicial;
  const padrao = areas[area];
  const estado = guardado.porArea[area] ?? padrao;
  const mudar = useCallback(
    (conta: (estado: EstadoDaArea) => EstadoDaArea) =>
      setGuardado((atual) => {
        const nome = areas[atual.area] ? atual.area : inicial;
        return { area: nome, porArea: { ...atual.porArea, [nome]: conta(atual.porArea[nome] ?? areas[nome]) } };
      }),
    [areas, inicial],
  );
  return {
    area,
    estado,
    escolherArea: (nome: string) => setGuardado((atual) => ({ ...atual, area: nome })),
    restaurar: () =>
      setGuardado((atual) => {
        const porArea = { ...atual.porArea };
        delete porArea[area];
        return { ...atual, porArea };
      }),
    aberto: (painel: string) => painelAberto(estado, painel),
    abrir: (painel: string) => mudar((atual) => abrirPainel(atual, painel, padrao)),
    alternar: (painel: string) => mudar((atual) => alternarPainel(atual, painel, padrao)),
    fechar: (painel: string) => mudar((atual) => fecharPainel(atual, painel)),
    fecharGrupo: (grupo: string) => mudar((atual) => fecharGrupo(atual, grupo)),
    ativar: (grupo: string, painel: string) => mudar((atual) => ativarAba(atual, grupo, painel)),
    recolher: (grupo: string) => mudar((atual) => alternarRecolhido(atual, grupo)),
    mudarAltura: (grupo: string, altura: number) => mudar((atual) => mudarAltura(atual, grupo, altura)),
    mover: (grupo: string, passo: -1 | 1) => mudar((atual) => moverGrupo(atual, grupo, passo)),
  };
}

export type AreaDeTrabalho = ReturnType<typeof useAreaDeTrabalho>;

/** O menu "≡" do grupo, com o menu da aba ativa em cima. */
function MenuDoGrupo({ itens }: { itens: ItemDeMenu[] }) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (!caixaRef.current?.contains(evento.target as Node)) setAberto(false);
    };
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && setAberto(false);
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  return (
    <div ref={caixaRef} className="relative ml-auto">
      <button type="button" className="grid size-6 place-items-center rounded text-suave hover:bg-painel-3 hover:text-texto" aria-label="Menu do painel" aria-expanded={aberto} onClick={() => setAberto((valor) => !valor)}>
        <IconeMenu className="size-3.5" aria-hidden />
      </button>
      {aberto ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-0.5 min-w-52 rounded-md border border-borda bg-painel-2 py-1 text-xs shadow-xl shadow-black/50">
          {itens.map((item, i) =>
            item === "-" ? (
              <div key={i} role="separator" className="my-1 h-px bg-borda" />
            ) : "itens" in item ? null : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.desativado}
                onClick={() => {
                  setAberto(false);
                  item.aoEscolher();
                }}
                className="flex w-full items-center px-3 py-1 text-left hover:bg-destaque/20 disabled:opacity-40"
              >
                <span className="flex-1">{item.nome}</span>
                {item.atalho ? <span className="pl-4 text-[11px] text-suave">{item.atalho}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Um grupo de painéis: a faixa de abas (duplo clique recolhe) e o corpo da aba ativa. */
export function GrupoDePaineis({ grupo, paineis, area, className = "", style }: { grupo: GrupoDaArea; paineis: Record<string, Painel>; area: AreaDeTrabalho; className?: string; style?: React.CSSProperties }) {
  const ativo = paineis[grupo.ativa];
  const menu: ItemDeMenu[] = [
    ...(ativo?.menu?.length ? [...ativo.menu, "-" as const] : []),
    { nome: grupo.recolhido ? "Expandir o grupo de painéis" : "Recolher o grupo de painéis", aoEscolher: () => area.recolher(grupo.id) },
    { nome: "Subir o grupo", aoEscolher: () => area.mover(grupo.id, -1) },
    { nome: "Descer o grupo", aoEscolher: () => area.mover(grupo.id, 1) },
    "-",
    { nome: "Fechar", aoEscolher: () => area.fechar(grupo.ativa) },
    { nome: "Fechar o grupo de abas", aoEscolher: () => area.fecharGrupo(grupo.id) },
  ];
  return (
    <section aria-label={ativo?.nome ?? grupo.id} className={`flex min-h-0 flex-col overflow-hidden bg-painel ${className}`} style={style}>
      <div role="tablist" className="flex h-7 shrink-0 items-stretch bg-painel-2/60 pr-1" onDoubleClick={(evento) => evento.target === evento.currentTarget && area.recolher(grupo.id)}>
        {grupo.abas.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === grupo.ativa}
            onClick={() => (id === grupo.ativa && grupo.recolhido ? area.recolher(grupo.id) : area.ativar(grupo.id, id))}
            onDoubleClick={() => area.recolher(grupo.id)}
            className={`max-w-40 truncate border-r border-borda/60 px-3 text-[11px] transition ${id === grupo.ativa && !grupo.recolhido ? "bg-painel font-semibold text-texto" : "text-suave hover:text-texto"}`}
          >
            {paineis[id]?.nome ?? id}
          </button>
        ))}
        <MenuDoGrupo itens={menu} />
      </div>
      {grupo.recolhido ? null : <div className="min-h-0 flex-1 overflow-y-auto">{ativo?.conteudo}</div>}
    </section>
  );
}

/**
 * Uma coluna de grupos de cima para baixo. Cada grupo tem a altura guardada, menos o último aberto, que preenche o
 * resto; o divisor abaixo de um grupo muda a altura dele.
 */
export function ColunaDePaineis({ grupos, paineis, area, className = "", style }: { grupos: GrupoDaArea[]; paineis: Record<string, Painel>; area: AreaDeTrabalho; className?: string; style?: React.CSSProperties }) {
  const ultimoAberto = grupos.map((grupo) => !grupo.recolhido).lastIndexOf(true);
  return (
    <div className={`flex min-h-0 flex-col gap-px bg-borda ${className}`} style={style}>
      {grupos.map((grupo, i) => {
        const preenche = i === ultimoAberto;
        return (
          <div key={grupo.id} className={`flex min-h-0 flex-col ${preenche ? "flex-1" : "shrink-0"}`}>
            <GrupoDePaineis grupo={grupo} paineis={paineis} area={area} className={preenche ? "flex-1" : ""} style={!preenche && !grupo.recolhido ? { height: grupo.altura ?? 220 } : undefined} />
            {!preenche && !grupo.recolhido && i < grupos.length - 1 ? <DivisorDeGrupo altura={grupo.altura ?? 220} aoMudar={(altura) => area.mudarAltura(grupo.id, altura)} /> : null}
          </div>
        );
      })}
      {grupos.length === 0 ? <div className="flex-1 bg-painel" /> : null}
    </div>
  );
}

function DivisorDeGrupo({ altura, aoMudar }: { altura: number; aoMudar: (altura: number) => void }) {
  const inicio = useRef<{ y: number; altura: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Altura do grupo de painéis"
      className="h-1 shrink-0 cursor-row-resize touch-none bg-borda hover:bg-destaque/60"
      onPointerDown={(evento) => {
        evento.currentTarget.setPointerCapture(evento.pointerId);
        inicio.current = { y: evento.clientY, altura };
      }}
      onPointerMove={(evento) => {
        if (inicio.current) aoMudar(Math.max(60, Math.min(900, inicio.current.altura + evento.clientY - inicio.current.y)));
      }}
      onPointerUp={() => {
        inicio.current = null;
      }}
    />
  );
}
