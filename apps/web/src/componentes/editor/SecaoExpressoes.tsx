"use client";

import { useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import { LIMITES_TREMOR, PERIODO_TREMOR } from "@/lib/projeto/edicao";
import { type Expressao, type PropriedadeAnimavel, PROPRIEDADES_ANIMAVEIS, type Repeticao } from "@/lib/projeto/keyframes";
import type { Clipe } from "@/lib/projeto/modelo";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";

import { ControleNumerico } from "./ControleNumerico";

/** Nome de cada propriedade e o fator que leva o valor guardado ao que aparece (0,05 → 5%). */
const PROPRIEDADES: Record<PropriedadeAnimavel, { nome: string; fator: number; sufixo: string }> = {
  x: { nome: "Posição horizontal", fator: 100, sufixo: "%" },
  y: { nome: "Posição vertical", fator: 100, sufixo: "%" },
  escala: { nome: "Escala", fator: 100, sufixo: "%" },
  rotacao: { nome: "Giro", fator: 1, sufixo: "°" },
  opacidade: { nome: "Opacidade", fator: 100, sufixo: "%" },
};
/** O tremido que entra ao ligar: pequeno, duas vezes por segundo. */
const TREMOR_INICIAL: Record<PropriedadeAnimavel, number> = { x: 0.02, y: 0.02, escala: 0.05, rotacao: 5, opacidade: 0.2 };

type Props = {
  clipe: Clipe;
  travada: boolean;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

/**
 * Expressões por propriedade: depois do último keyframe, repetir o movimento (do começo ou indo e voltando),
 * e tremer em volta do valor (com ou sem keyframes). A conta está em lib/projeto/keyframes.ts.
 */
export function SecaoExpressoes({ clipe, travada, aoPrever, aoExecutar }: Props) {
  const comExpressao = PROPRIEDADES_ANIMAVEIS.filter((p) => clipe.expressoes?.[p]);
  const [escolhida, setEscolhida] = useState<PropriedadeAnimavel>(comExpressao[0] ?? "x");
  const propriedade = PROPRIEDADES[escolhida];
  const expressao: Expressao = clipe.expressoes?.[escolhida] ?? {};
  const pontos = clipe.keyframes?.[escolhida]?.length ?? 0;
  const tremor = expressao.tremer;

  const comando = (nova: Expressao): Comando => ({ comando: "clipe.expressao", parametros: { clipeId: clipe.id, propriedade: escolhida, expressao: nova } });
  const mudarTremor = (mudanca: Partial<NonNullable<Expressao["tremer"]>>, executar: boolean) => {
    if (!tremor) return;
    const nova = comando({ ...expressao, tremer: { ...tremor, ...mudanca } });
    if (executar) aoExecutar(nova);
    else aoPrever(nova);
  };
  const limite = LIMITES_TREMOR[escolhida] * propriedade.fator;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <label className="flex items-center gap-2">
        <span className="flex-1 text-suave">Propriedade</span>
        <select
          value={escolhida}
          onChange={(evento) => setEscolhida(evento.currentTarget.value as PropriedadeAnimavel)}
          className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
        >
          {PROPRIEDADES_ANIMAVEIS.map((p) => (
            <option key={p} value={p}>
              {PROPRIEDADES[p].nome}
              {clipe.expressoes?.[p] ? " •" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="flex-1 text-suave">Depois do último keyframe</span>
        <select
          value={expressao.repetir ?? "parar"}
          disabled={travada || pontos < 2}
          onChange={(evento) => {
            const valor = evento.currentTarget.value;
            aoExecutar(comando({ ...expressao, repetir: valor === "parar" ? null : (valor as Repeticao) }));
          }}
          className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque disabled:opacity-50"
        >
          <option value="parar">Parar no último</option>
          <option value="ciclo">Repetir do começo</option>
          <option value="vaivem">Ir e voltar</option>
        </select>
      </label>
      {pontos < 2 ? <p className="-mt-1 text-[11px] text-suave">Para repetir, ponha pelo menos dois keyframes nesta propriedade.</p> : null}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(tremor)}
          disabled={travada}
          onChange={(evento) =>
            aoExecutar(
              comando({
                ...expressao,
                tremer: evento.currentTarget.checked ? { periodo: TICKS_POR_SEGUNDO / 2, amplitude: TREMOR_INICIAL[escolhida], deslocamento: 0 } : null,
              }),
            )
          }
        />
        <span>Tremer</span>
        <span className="text-[11px] text-suave">um tremido suave em volta do valor</span>
      </label>
      {tremor ? (
        <>
          <ControleNumerico
            rotulo="Intensidade"
            minimo={0}
            maximo={limite}
            passo={escolhida === "rotacao" ? 0.5 : 0.1}
            sufixo={propriedade.sufixo}
            valor={tremor.amplitude * propriedade.fator}
            desativado={travada}
            aoPrever={(valor) => mudarTremor({ amplitude: valor / propriedade.fator }, false)}
            aoConfirmar={(valor) => mudarTremor({ amplitude: valor / propriedade.fator }, true)}
          />
          <ControleNumerico
            rotulo="Vezes por segundo"
            minimo={TICKS_POR_SEGUNDO / PERIODO_TREMOR.maximo}
            maximo={TICKS_POR_SEGUNDO / PERIODO_TREMOR.minimo}
            passo={0.1}
            sufixo="×"
            valor={TICKS_POR_SEGUNDO / tremor.periodo}
            desativado={travada}
            aoPrever={(valor) => mudarTremor({ periodo: TICKS_POR_SEGUNDO / valor }, false)}
            aoConfirmar={(valor) => mudarTremor({ periodo: TICKS_POR_SEGUNDO / valor }, true)}
          />
        </>
      ) : null}
      {comExpressao.length ? (
        <p className="text-[11px] text-suave">Com expressão: {comExpressao.map((p) => PROPRIEDADES[p].nome).join(", ")}.</p>
      ) : null}
    </div>
  );
}
