"use client";

import { type Animacao, type Animacoes, SEM_ANIMACAO, TIPOS_ANIMACAO, type TipoAnimacao } from "@/lib/projeto/animacao";
import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";

import { ControleNumerico } from "./ControleNumerico";

type Props = {
  clipe: Clipe;
  faixa: Faixa;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

/** Duração de uma animação nova, e a maior que o controle deslizante oferece. */
const DURACAO_PADRAO_S = 0.5;
const DURACAO_MAXIMA_S = 3;
const PERTO = 1e-6;

/** Entrada e saída animadas do clipe. */
export function AbaAnimacao({ clipe, faixa, aoPrever, aoExecutar }: Props) {
  const animacao = clipe.animacao ?? SEM_ANIMACAO;
  const travada = faixa.travada;
  const duracaoS = clipe.duracao / TICKS_POR_SEGUNDO;
  const comando = (mudanca: Partial<Animacoes>): Comando => ({ comando: "clipe.animar", parametros: { clipeIds: [clipe.id], animacao: mudanca } });

  // Função comum (não componente): é chamada direto no JSX
  function parte(nome: "entrada" | "saida", titulo: string) {
    const atual = animacao[nome];
    const mudar = (parcial: Partial<Animacao>) => comando({ [nome]: { ...atual, ...parcial } });
    const segundos = atual.duracao / TICKS_POR_SEGUNDO;
    return (
      <section key={nome} className="border-b border-borda/60 pb-2 pt-3 first:pt-0 last:border-0">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">{titulo}</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {TIPOS_ANIMACAO.map((tipo) => (
            <button
              key={tipo.id}
              type="button"
              disabled={travada}
              aria-pressed={atual.tipo === tipo.id}
              onClick={() => {
                // Escolher um tipo sem duração ainda já dá uma duração que se vê
                const duracao = tipo.id === "nenhuma" ? 0 : atual.duracao || Math.round(DURACAO_PADRAO_S * TICKS_POR_SEGUNDO);
                aoExecutar(mudar({ tipo: tipo.id as TipoAnimacao, duracao }));
              }}
              className={`rounded-md border px-1.5 py-1.5 text-[11px] transition ${
                atual.tipo === tipo.id ? "border-destaque bg-destaque/10 text-texto" : "border-borda text-suave hover:text-texto"
              } disabled:opacity-50`}
            >
              {tipo.nome}
            </button>
          ))}
        </div>
        {atual.tipo !== "nenhuma" ? (
          <ControleNumerico
            rotulo="Duração"
            valor={segundos}
            minimo={0.1}
            maximo={Math.min(DURACAO_MAXIMA_S, duracaoS)}
            maximoDigitado={duracaoS}
            passo={0.1}
            sufixo="s"
            desativado={travada}
            aoPrever={(valor) => aoPrever(mudar({ duracao: Math.round(valor * TICKS_POR_SEGUNDO) }))}
            aoConfirmar={(valor) => {
              if (Math.abs(valor - segundos) < PERTO) aoPrever(null);
              else aoExecutar(mudar({ duracao: Math.round(valor * TICKS_POR_SEGUNDO) }));
            }}
          />
        ) : null}
      </section>
    );
  }

  return (
    <div>
      {travada ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      {parte("entrada", "Entrada")}
      {parte("saida", "Saída")}
    </div>
  );
}
