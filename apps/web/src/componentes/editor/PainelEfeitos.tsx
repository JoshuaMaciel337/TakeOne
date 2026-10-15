"use client";

import { Check } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import { type Efeito, EFEITOS, INTENSIDADE_PADRAO, type TipoEfeito } from "@/lib/projeto/efeitos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";

import { ControleNumerico } from "./ControleNumerico";

type Props = {
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

const PERTO = 1e-6;

/** Ferramenta Efeitos: um efeito de vídeo no clipe selecionado, com a intensidade. */
export function PainelEfeitos({ selecionado, aoPrever, aoExecutar }: Props) {
  const podeAplicar = selecionado !== null && selecionado.faixa.tipo !== "audio";
  const travada = podeAplicar && selecionado.faixa.travada;
  const atual = podeAplicar ? (selecionado.clipe.efeito ?? null) : null;
  const comando = (efeito: Efeito | null): Comando => ({ comando: "clipe.efeito", parametros: { clipeIds: [selecionado!.clipe.id], efeito } });
  const escolher = (tipo: TipoEfeito | null) => {
    if (!podeAplicar || travada) return;
    aoExecutar(comando(tipo ? { tipo, intensidade: atual?.intensidade ?? INTENSIDADE_PADRAO } : null));
  };
  const botao = (selecionadoAgora: boolean) =>
    `flex flex-col gap-0.5 rounded-lg border p-2 text-left text-xs transition disabled:opacity-50 ${
      selecionadoAgora ? "border-destaque" : "border-borda hover:border-suave"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-suave">
        {podeAplicar ? "Escolha um efeito para o clipe selecionado." : "Selecione um clipe de imagem na prévia ou na linha do tempo."}
      </p>
      {travada ? <p className="rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!podeAplicar || travada} onClick={() => escolher(null)} aria-pressed={podeAplicar && !atual} className={botao(podeAplicar && !atual)}>
          <span className="flex items-center gap-1 font-medium">
            {podeAplicar && !atual ? <Check className="size-3" aria-hidden /> : null}
            Nenhum
          </span>
          <span className="text-[11px] text-suave">A imagem como veio</span>
        </button>
        {EFEITOS.map((efeito) => (
          <button
            key={efeito.id}
            type="button"
            disabled={!podeAplicar || travada}
            onClick={() => escolher(efeito.id)}
            aria-pressed={atual?.tipo === efeito.id}
            className={botao(atual?.tipo === efeito.id)}
          >
            <span className="flex items-center gap-1 font-medium">
              {atual?.tipo === efeito.id ? <Check className="size-3" aria-hidden /> : null}
              {efeito.nome}
            </span>
            <span className="text-[11px] text-suave">{efeito.descricao}</span>
          </button>
        ))}
      </div>
      {atual ? (
        <ControleNumerico
          rotulo="Intensidade"
          valor={atual.intensidade * 100}
          minimo={0}
          maximo={100}
          sufixo="%"
          desativado={travada}
          aoPrever={(valor) => aoPrever(comando({ ...atual, intensidade: valor / 100 }))}
          aoConfirmar={(valor) => {
            if (Math.abs(valor / 100 - atual.intensidade) < PERTO) aoPrever(null);
            else aoExecutar(comando({ ...atual, intensidade: valor / 100 }));
          }}
        />
      ) : null}
    </div>
  );
}
