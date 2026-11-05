"use client";

import { LoaderCircle, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { OPCOES_DA_ESCOLHA, type OpcoesDaEscolha } from "@/lib/album/api";

const QUANTAS: { id: OpcoesDaEscolha["quantas"]; nome: string; faixa: string }[] = [
  { id: "minima", nome: "Mínima", faixa: "uns 15%" },
  { id: "poucas", nome: "Poucas", faixa: "uns 25%" },
  { id: "padrao", nome: "Padrão", faixa: "uns 40%" },
  { id: "muitas", nome: "Muitas", faixa: "uns 60%" },
];
const RIGORES: { id: OpcoesDaEscolha["rigor"]; nome: string }[] = [
  { id: "tolerante", nome: "Tolerante" },
  { id: "moderado", nome: "Moderado" },
  { id: "rigido", nome: "Rígido" },
];
const GRUPOS: { id: OpcoesDaEscolha["grupos"]; nome: string }[] = [
  { id: "pequeno", nome: "Pequenos" },
  { id: "padrao", nome: "Padrão" },
  { id: "grande", nome: "Grandes" },
  { id: "muito_grande", nome: "Muito grandes" },
];

function Segmentado<T extends string>({ valor, opcoes, aoMudar, rotulo }: { valor: T; opcoes: { id: T; nome: string; faixa?: string }[]; aoMudar: (valor: T) => void; rotulo: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-suave">{rotulo}</span>
      <div className="grid gap-1 rounded-lg bg-painel-2 p-1" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={rotulo}>
        {opcoes.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            role="radio"
            aria-checked={valor === opcao.id}
            onClick={() => aoMudar(opcao.id)}
            className={`flex flex-col items-center rounded-md px-1.5 py-1 text-xs transition ${valor === opcao.id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}
          >
            {opcao.nome}
            {opcao.faixa ? <span className="text-[10px] text-apagado">{opcao.faixa}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * As opções de "Escolher as melhores": automático (a IA dá as estrelas e escolhe) ou assistido (só agrupa e mostra
 * as categorias), quantas ficam ou um número exato, o rigor com o foco, os olhos fechados e o tamanho dos grupos.
 */
export function JanelaEscolher({
  iniciais,
  faltamAnalisar,
  total,
  ocupado,
  aoEscolher,
  aoFechar,
}: {
  iniciais: Partial<OpcoesDaEscolha> | null;
  faltamAnalisar: number;
  total: number;
  ocupado: string;
  aoEscolher: (opcoes: OpcoesDaEscolha) => void;
  aoFechar: () => void;
}) {
  const [opcoes, setOpcoes] = useState<OpcoesDaEscolha>({ ...OPCOES_DA_ESCOLHA, ...(iniciais ?? {}) });
  const [exato, setExato] = useState(Boolean(iniciais?.alvo));
  const muda = (campos: Partial<OpcoesDaEscolha>) => setOpcoes((atual) => ({ ...atual, ...campos }));

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !ocupado) aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar, ocupado]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]" onPointerDown={() => !ocupado && aoFechar()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-escolher"
        className="w-full max-w-md rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-escolher" className="font-display text-base font-semibold">
            Escolher as melhores
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar" disabled={Boolean(ocupado)}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4 text-sm">
          <Segmentado
            rotulo="Como"
            valor={opcoes.aplicar ? "automatico" : "assistido"}
            opcoes={[
              { id: "automatico", nome: "Automático", faixa: "dá as estrelas" },
              { id: "assistido", nome: "Assistido", faixa: "só agrupa" },
            ]}
            aoMudar={(modo) => muda({ aplicar: modo === "automatico" })}
          />
          <div className="flex flex-col gap-2">
            <Segmentado rotulo="Quantas ficam" valor={opcoes.quantas} opcoes={QUANTAS} aoMudar={(quantas) => muda({ quantas, alvo: 0 })} />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={exato}
                onChange={(evento) => {
                  setExato(evento.target.checked);
                  muda({ alvo: evento.target.checked ? Math.max(1, Math.round(total * 0.3)) : 0 });
                }}
              />
              Exatamente
              <input
                type="number"
                min={1}
                max={Math.max(1, total)}
                value={opcoes.alvo || ""}
                disabled={!exato}
                onChange={(evento) => muda({ alvo: Math.max(0, Math.min(total, Number(evento.target.value) || 0)) })}
                className="w-20 rounded border border-borda bg-painel-2 px-2 py-0.5 disabled:opacity-50"
                aria-label="Número de fotos"
              />
              fotos
            </label>
          </div>
          <Segmentado rotulo="Rigor com o foco" valor={opcoes.rigor} opcoes={RIGORES} aoMudar={(rigor) => muda({ rigor })} />
          <Segmentado rotulo="Tamanho dos grupos de parecidas" valor={opcoes.grupos} opcoes={GRUPOS} aoMudar={(grupos) => muda({ grupos })} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={opcoes.olhos_fechados} onChange={(evento) => muda({ olhos_fechados: evento.target.checked })} />
            Tirar as fotos com alguém de olhos fechados
          </label>
          {opcoes.aplicar ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={opcoes.manter_feitas_a_mao} onChange={(evento) => muda({ manter_feitas_a_mao: evento.target.checked })} />
              Manter as notas e marcações que você já deu
            </label>
          ) : null}
          {faltamAnalisar ? <p className="text-xs text-suave">Antes, {faltamAnalisar.toLocaleString("pt-BR")} foto(s) são analisadas (foco, exposição, rostos, olhos e sorriso).</p> : null}
          <button type="button" className="botao-principal px-3 py-2" disabled={Boolean(ocupado) || (exato && !opcoes.alvo)} onClick={() => aoEscolher(opcoes)}>
            {ocupado ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <WandSparkles className="size-4" aria-hidden />}
            {ocupado || "Escolher"}
          </button>
        </div>
      </div>
    </div>
  );
}
