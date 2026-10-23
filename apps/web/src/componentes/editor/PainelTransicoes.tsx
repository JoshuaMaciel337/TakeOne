"use client";

import { Check } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import { DURACAO_TRANSICAO_S } from "@/lib/projeto/edicao";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { duracaoMaximaDaTransicao, TIPOS_TRANSICAO, type TipoTransicao } from "@/lib/projeto/transicao";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";

import { ControleNumerico } from "./ControleNumerico";

type Props = {
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

const DURACAO_MAXIMA_S = 2;
const PERTO = 1e-6;

/** Ferramenta Transições: a passagem do clipe selecionado (na principal) para o seguinte. */
export function PainelTransicoes({ selecionado, aoPrever, aoExecutar }: Props) {
  const faixa = selecionado?.faixa;
  const clipe = selecionado?.clipe;
  const indice = faixa && clipe ? faixa.clipes.findIndex((item) => item.id === clipe.id) : -1;
  const proximo = faixa?.tipo === "principal" && indice >= 0 ? faixa.clipes[indice + 1] : undefined;

  if (!clipe || !faixa || !proximo) {
    return (
      <p className="text-xs text-suave">
        Selecione um clipe da faixa principal que tenha outro logo depois. A transição fica no corte entre os dois.
      </p>
    );
  }

  const atual = clipe.transicao ?? null;
  const maximoS = duracaoMaximaDaTransicao(clipe, proximo) / TICKS_POR_SEGUNDO;
  const definir = (tipo: TipoTransicao | null, duracaoS = atual ? atual.duracao / TICKS_POR_SEGUNDO : DURACAO_TRANSICAO_S): Comando => ({
    comando: "clipe.transicao",
    parametros: {
      clipeId: clipe.id,
      transicao: tipo ? { tipo, duracao: Math.round(Math.min(duracaoS, maximoS) * TICKS_POR_SEGUNDO), misturar_som: Boolean(atual?.misturar_som) } : null,
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-suave">Passagem do clipe selecionado para o próximo. Metade da transição fica antes do corte e metade depois.</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={faixa.travada}
          aria-pressed={atual === null}
          onClick={() => aoExecutar(definir(null))}
          className={`rounded-lg border p-2 text-left text-xs transition disabled:opacity-50 ${atual === null ? "border-destaque" : "border-borda hover:border-suave"}`}
        >
          <span className="flex items-center gap-1 font-medium">
            {atual === null ? <Check className="size-3" aria-hidden /> : null}
            Corte seco
          </span>
          <span className="text-[11px] text-suave">Sem transição</span>
        </button>
        {TIPOS_TRANSICAO.map((tipo) => (
          <button
            key={tipo.id}
            type="button"
            disabled={faixa.travada}
            aria-pressed={atual?.tipo === tipo.id}
            onClick={() => aoExecutar(definir(tipo.id))}
            className={`rounded-lg border p-2 text-left text-xs transition disabled:opacity-50 ${atual?.tipo === tipo.id ? "border-destaque" : "border-borda hover:border-suave"}`}
          >
            <span className="flex items-center gap-1 font-medium">
              {atual?.tipo === tipo.id ? <Check className="size-3" aria-hidden /> : null}
              {tipo.nome}
            </span>
            <span className="text-[11px] text-suave">{tipo.descricao}</span>
          </button>
        ))}
      </div>
      {atual ? (
        <ControleNumerico
          rotulo="Duração"
          valor={atual.duracao / TICKS_POR_SEGUNDO}
          minimo={0.1}
          maximo={Math.min(DURACAO_MAXIMA_S, maximoS)}
          maximoDigitado={maximoS}
          passo={0.05}
          sufixo="s"
          desativado={faixa.travada}
          aoPrever={(valor) => aoPrever(definir(atual.tipo, valor))}
          aoConfirmar={(valor) => {
            if (Math.abs(valor - atual.duracao / TICKS_POR_SEGUNDO) < PERTO) aoPrever(null);
            else aoExecutar(definir(atual.tipo, valor));
          }}
        />
      ) : null}
      {atual ? (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={Boolean(atual.misturar_som)}
            disabled={faixa.travada}
            onChange={(evento) => aoExecutar({ comando: "clipe.transicao", parametros: { clipeId: clipe.id, transicao: { ...atual, misturar_som: evento.currentTarget.checked } } })}
          />
          <span>
            Misturar o som
            <span className="block text-[11px] text-suave">O som de um some enquanto o do outro aparece, na mesma duração. Sem isso, o som troca no corte.</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
