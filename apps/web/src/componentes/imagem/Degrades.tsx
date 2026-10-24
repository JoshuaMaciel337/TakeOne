"use client";

// O Editor de degradês e o painel Degradês (ADR 0003, onda 13.5): as predefinições (as prontas e as do espaço), a
// barra com as paradas de opacidade em cima e as de cor embaixo (clicar perto da barra põe uma, arrastar muda o local,
// o losango entre duas muda o ponto médio), o tipo sólido (suavidade) ou de ruído (aspereza) e o nome para salvar.
import { Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { type Degrade, DEGRADES_PRONTOS, type ParadaDeCor, type ParadaDeOpacidade, rgbDe, tabelaDoDegrade } from "@/lib/pintura/degrade";

const XADREZ = "repeating-conic-gradient(#c8cad0 0% 25%, #ffffff 0% 50%) 50% / 10px 10px";

/** A amostra do degradê numa faixa (com o xadrez atrás da transparência). */
export function AmostraDoDegrade({ degrade, primeiroPlano, fundo, className = "h-5 w-full" }: { degrade: Degrade; primeiroPlano: string; fundo: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const dados = ctx.createImageData(256, 1);
    dados.data.set(tabelaDoDegrade(degrade, primeiroPlano, fundo));
    ctx.putImageData(dados, 0, 0);
  }, [degrade, primeiroPlano, fundo]);
  return <canvas ref={ref} className={`block rounded-sm border border-borda ${className}`} style={{ background: XADREZ, imageRendering: "auto" }} aria-hidden />;
}

type Escolha = { tipo: "cor" | "opacidade"; indice: number } | null;

export function JanelaEditorDeDegrade({
  inicial,
  doEspaco,
  primeiroPlano,
  fundo,
  aoFechar,
  aoConfirmar,
  aoSalvar,
}: {
  inicial: Degrade;
  doEspaco: Degrade[];
  primeiroPlano: string;
  fundo: string;
  aoFechar: () => void;
  aoConfirmar: (degrade: Degrade) => void;
  aoSalvar: (degrade: Degrade) => void;
}) {
  const [d, setD] = useState<Degrade>(inicial);
  const [escolha, setEscolha] = useState<Escolha>({ tipo: "cor", indice: 0 });
  const barraRef = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ tipo: "cor" | "opacidade" | "meioCor" | "meioOpacidade"; indice: number } | null>(null);
  const tabela = useMemo(() => tabelaDoDegrade(d, primeiroPlano, fundo), [d, primeiroPlano, fundo]);
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  const naBarra = (clientX: number) => {
    const r = barraRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const mudarCor = (indice: number, mudanca: Partial<ParadaDeCor>) => setD((atual) => ({ ...atual, cores: atual.cores.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)) }));
  const mudarOpacidade = (indice: number, mudanca: Partial<ParadaDeOpacidade>) => setD((atual) => ({ ...atual, opacidades: atual.opacidades.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)) }));
  /** Os índices em ordem de posição, para os losangos do ponto médio (entre cada parada e a seguinte). */
  const ordem = <T extends { posicao: number }>(lista: T[]) => lista.map((p, i) => ({ p, i })).sort((a, b) => a.p.posicao - b.p.posicao);

  const corNoT = (t: number) => {
    const k = Math.round(t * 255) * 4;
    return `#${[tabela[k], tabela[k + 1], tabela[k + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  const escolhida = escolha?.tipo === "cor" ? d.cores[escolha.indice] : null;
  const escolhidaOpacidade = escolha?.tipo === "opacidade" ? d.opacidades[escolha.indice] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Editor de degradês" className="w-full max-w-lg rounded-lg border border-borda bg-painel text-xs shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Editor de degradês</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="grid max-h-28 grid-cols-6 gap-1.5 overflow-y-auto" role="list" aria-label="Predefinições">
            {[...DEGRADES_PRONTOS.flatMap((pasta) => pasta.degrades), ...doEspaco].map((pronto, i) => (
              <button key={`${pronto.nome}-${i}`} type="button" title={pronto.nome} aria-label={pronto.nome} onClick={() => setD(pronto)} className="rounded-sm hover:ring-2 hover:ring-destaque">
                <AmostraDoDegrade degrade={pronto} primeiroPlano={primeiroPlano} fundo={fundo} className="h-6 w-full" />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            Nome:
            <input className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={d.nome} maxLength={80} onChange={(evento) => setD({ ...d, nome: evento.currentTarget.value })} />
            <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => aoSalvar(d)} title="Guarda este degradê no espaço (painel Degradês)">
              Novo
            </button>
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              Tipo:
              <select className="rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={d.tipo} onChange={(evento) => setD({ ...d, tipo: evento.currentTarget.value as Degrade["tipo"] })}>
                <option value="solido">Sólido</option>
                <option value="ruido">Ruído</option>
              </select>
            </label>
            {d.tipo === "solido" ? (
              <label className="flex flex-1 items-center gap-2">
                Suavidade:
                <input type="range" min={0} max={100} value={Math.round(d.suavidade * 100)} onChange={(evento) => setD({ ...d, suavidade: Number(evento.currentTarget.value) / 100 })} className="flex-1" aria-label="Suavidade" />
              </label>
            ) : (
              <>
                <label className="flex flex-1 items-center gap-2">
                  Aspereza:
                  <input type="range" min={0} max={100} value={Math.round(d.aspereza * 100)} onChange={(evento) => setD({ ...d, aspereza: Number(evento.currentTarget.value) / 100 })} className="flex-1" aria-label="Aspereza" />
                </label>
                <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => setD({ ...d, semente: Math.floor(Math.random() * 1e9) })}>
                  Sortear
                </button>
              </>
            )}
          </div>
          {/* A barra: as paradas de opacidade em cima, as de cor embaixo, os losangos do ponto médio da escolhida */}
          <div
            className="relative select-none px-2 py-5"
            onPointerMove={(evento) => {
              const a = arrasto.current;
              if (!a) return;
              const t = naBarra(evento.clientX);
              if (a.tipo === "cor") mudarCor(a.indice, { posicao: t });
              else if (a.tipo === "opacidade") mudarOpacidade(a.indice, { posicao: t });
              else {
                const lista: { posicao: number }[] = a.tipo === "meioCor" ? d.cores : d.opacidades;
                const ordenada = ordem(lista);
                const k = ordenada.findIndex((item) => item.i === a.indice);
                const proxima = ordenada[k + 1];
                if (!proxima) return;
                const de = lista[a.indice].posicao;
                const meio = Math.min(0.95, Math.max(0.05, (t - de) / Math.max(1e-6, proxima.p.posicao - de)));
                if (a.tipo === "meioCor") mudarCor(a.indice, { meio });
                else mudarOpacidade(a.indice, { meio });
              }
            }}
            onPointerUp={() => {
              arrasto.current = null;
            }}
          >
            <div
              ref={barraRef}
              className="relative h-8 cursor-copy"
              onPointerDown={(evento) => {
                // Clicar na metade de cima da barra põe uma parada de opacidade; na de baixo, uma de cor
                const r = evento.currentTarget.getBoundingClientRect();
                const t = naBarra(evento.clientX);
                if (evento.clientY - r.top < r.height / 2) {
                  const opacidade = tabela[Math.round(t * 255) * 4 + 3] / 255;
                  setD((atual) => ({ ...atual, opacidades: [...atual.opacidades, { posicao: t, opacidade, meio: 0.5 }] }));
                  setEscolha({ tipo: "opacidade", indice: d.opacidades.length });
                } else {
                  setD((atual) => ({ ...atual, cores: [...atual.cores, { posicao: t, cor: corNoT(t), meio: 0.5 }] }));
                  setEscolha({ tipo: "cor", indice: d.cores.length });
                }
              }}
            >
              <AmostraDoDegrade degrade={d} primeiroPlano={primeiroPlano} fundo={fundo} className="size-full" />
            </div>
            {d.opacidades.map((parada, i) => (
              <button
                key={`o${i}`}
                type="button"
                aria-label={`Parada de opacidade ${Math.round(parada.opacidade * 100)}% em ${Math.round(parada.posicao * 100)}%`}
                className={`absolute top-0 size-3.5 -translate-x-1/2 rounded-sm border ${escolha?.tipo === "opacidade" && escolha.indice === i ? "border-destaque ring-2 ring-destaque" : "border-texto"}`}
                style={{ left: `calc(0.5rem + (100% - 1rem) * ${parada.posicao})`, background: `rgba(0,0,0,${parada.opacidade})` }}
                onPointerDown={(evento) => {
                  evento.stopPropagation();
                  (evento.currentTarget.parentElement as HTMLElement).setPointerCapture(evento.pointerId);
                  setEscolha({ tipo: "opacidade", indice: i });
                  arrasto.current = { tipo: "opacidade", indice: i };
                }}
              />
            ))}
            {d.cores.map((parada, i) => (
              <button
                key={`c${i}`}
                type="button"
                aria-label={`Parada de cor em ${Math.round(parada.posicao * 100)}%`}
                className={`absolute bottom-0 size-3.5 -translate-x-1/2 rounded-sm border ${escolha?.tipo === "cor" && escolha.indice === i ? "border-destaque ring-2 ring-destaque" : "border-texto"}`}
                style={{ left: `calc(0.5rem + (100% - 1rem) * ${parada.posicao})`, background: `rgb(${rgbDe(parada.cor, primeiroPlano, fundo).join(",")})` }}
                onPointerDown={(evento) => {
                  evento.stopPropagation();
                  (evento.currentTarget.parentElement as HTMLElement).setPointerCapture(evento.pointerId);
                  setEscolha({ tipo: "cor", indice: i });
                  arrasto.current = { tipo: "cor", indice: i };
                }}
              />
            ))}
            {escolha
              ? (() => {
                  // O losango entre a parada escolhida e a seguinte
                  const lista = escolha.tipo === "cor" ? d.cores : d.opacidades;
                  const ordenada = ordem(lista as { posicao: number }[]);
                  const k = ordenada.findIndex((item) => item.i === escolha.indice);
                  const proxima = ordenada[k + 1];
                  const atual = lista[escolha.indice];
                  if (!proxima || !atual) return null;
                  const posicao = atual.posicao + (proxima.p.posicao - atual.posicao) * atual.meio;
                  return (
                    <button
                      type="button"
                      aria-label="Ponto médio"
                      className={`absolute size-2.5 -translate-x-1/2 rotate-45 border border-texto bg-painel ${escolha.tipo === "cor" ? "bottom-4" : "top-4"}`}
                      style={{ left: `calc(0.5rem + (100% - 1rem) * ${posicao})` }}
                      onPointerDown={(evento) => {
                        evento.stopPropagation();
                        (evento.currentTarget.parentElement as HTMLElement).setPointerCapture(evento.pointerId);
                        arrasto.current = { tipo: escolha.tipo === "cor" ? "meioCor" : "meioOpacidade", indice: escolha.indice };
                      }}
                    />
                  );
                })()
              : null}
          </div>
          <div className="flex min-h-7 items-center gap-2">
            {escolhida && escolha ? (
              <>
                <span>Cor:</span>
                <input type="color" value={`#${rgbDe(escolhida.cor, primeiroPlano, fundo).map((v) => v.toString(16).padStart(2, "0")).join("")}`} onChange={(evento) => mudarCor(escolha.indice, { cor: evento.currentTarget.value })} aria-label="Cor da parada" />
                <button type="button" className="botao-secundario px-1.5 py-0.5 text-[11px]" onClick={() => mudarCor(escolha.indice, { cor: "primeiroPlano" })}>
                  Primeiro plano
                </button>
                <button type="button" className="botao-secundario px-1.5 py-0.5 text-[11px]" onClick={() => mudarCor(escolha.indice, { cor: "fundo" })}>
                  Fundo
                </button>
                <label className="ml-auto flex items-center gap-1">
                  Local:
                  <input type="number" min={0} max={100} value={Math.round(escolhida.posicao * 100)} onChange={(evento) => mudarCor(escolha.indice, { posicao: Math.min(1, Math.max(0, Number(evento.currentTarget.value) / 100)) })} className="w-12 rounded border border-borda bg-painel-2 px-1 text-right" aria-label="Local da parada" />%
                </label>
              </>
            ) : null}
            {escolhidaOpacidade && escolha ? (
              <>
                <label className="flex items-center gap-1">
                  Opacidade:
                  <input type="number" min={0} max={100} value={Math.round(escolhidaOpacidade.opacidade * 100)} onChange={(evento) => mudarOpacidade(escolha.indice, { opacidade: Math.min(1, Math.max(0, Number(evento.currentTarget.value) / 100)) })} className="w-12 rounded border border-borda bg-painel-2 px-1 text-right" aria-label="Opacidade da parada" />%
                </label>
                <label className="ml-auto flex items-center gap-1">
                  Local:
                  <input type="number" min={0} max={100} value={Math.round(escolhidaOpacidade.posicao * 100)} onChange={(evento) => mudarOpacidade(escolha.indice, { posicao: Math.min(1, Math.max(0, Number(evento.currentTarget.value) / 100)) })} className="w-12 rounded border border-borda bg-painel-2 px-1 text-right" aria-label="Local da parada" />%
                </label>
              </>
            ) : null}
            {escolha ? (
              <button
                type="button"
                className="botao-icone size-6"
                title="Excluir a parada (ficam pelo menos duas)"
                aria-label="Excluir a parada"
                disabled={(escolha.tipo === "cor" ? d.cores : d.opacidades).length <= 2}
                onClick={() => {
                  if (escolha.tipo === "cor") setD({ ...d, cores: d.cores.filter((_, i) => i !== escolha.indice) });
                  else setD({ ...d, opacidades: d.opacidades.filter((_, i) => i !== escolha.indice) });
                  setEscolha(null);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(d)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/** O painel Degradês: as predefinições em pastas e as do espaço (que se excluem). */
export function PainelDegrades({
  doEspaco,
  primeiroPlano,
  fundo,
  aoEscolher,
  aoExcluir,
}: {
  doEspaco: { id: string; degrade: Degrade }[];
  primeiroPlano: string;
  fundo: string;
  aoEscolher: (degrade: Degrade) => void;
  aoExcluir: (id: string) => void;
}) {
  const pastas = [...DEGRADES_PRONTOS.map((pasta) => ({ pasta: pasta.pasta, itens: pasta.degrades.map((degrade) => ({ id: null as string | null, degrade })) })), ...(doEspaco.length ? [{ pasta: "Do espaço", itens: doEspaco }] : [])];
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs" data-painel-degrades>
      {pastas.map((pasta) => (
        <section key={pasta.pasta}>
          <h3 className="mb-1.5 font-semibold">{pasta.pasta}</h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {pasta.itens.map(({ id, degrade }, i) => (
              <li key={`${degrade.nome}-${i}`} className="group relative">
                <button type="button" className="flex w-full flex-col gap-0.5 rounded p-1 text-left hover:bg-painel-2" onClick={() => aoEscolher(degrade)} title={degrade.nome}>
                  <AmostraDoDegrade degrade={degrade} primeiroPlano={primeiroPlano} fundo={fundo} className="h-5 w-full" />
                  <span className="truncate text-[11px] text-suave">{degrade.nome}</span>
                </button>
                {id ? (
                  <button type="button" className="botao-icone absolute right-1 top-1 hidden size-5 group-hover:grid" aria-label={`Excluir ${degrade.nome}`} onClick={() => aoExcluir(id)}>
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
