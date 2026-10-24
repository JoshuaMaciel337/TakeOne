"use client";

// Editar › Preenchimento generativo (ADR 0003, onda 13.12): o texto do que pôr na área marcada (vazio: o que combina
// com a volta, para tirar algo) e quantas variações. O pedido vai ao worker de GPU; a primeira variação entra como
// camada no lugar e as outras ficam na seção Variações da aba Básico.
import { useState } from "react";

import { JanelaFlutuante } from "../ajustes/JanelaDeAjusteNosPixels";

export function JanelaPreenchimentoGenerativo({ aoGerar, aoCancelar }: { aoGerar: (descricao: string, variacoes: number) => void; aoCancelar: () => void }) {
  const [descricao, setDescricao] = useState("");
  const [variacoes, setVariacoes] = useState(3);
  return (
    <JanelaFlutuante titulo="Preenchimento generativo" aoConfirmar={() => aoGerar(descricao.trim(), variacoes)} aoCancelar={aoCancelar}>
      <div className="flex flex-col gap-3 p-3 text-xs">
        <label className="flex flex-col gap-1">
          O que pôr na área marcada
          <textarea
            className="min-h-20 rounded border border-borda bg-painel-2 px-2 py-1.5 text-texto"
            value={descricao}
            maxLength={800}
            placeholder="Por exemplo: um barco a vela iluminado. Vazio, a área vira o que combina com a volta (para tirar algo)."
            onChange={(evento) => setDescricao(evento.currentTarget.value)}
            aria-label="O que pôr na área marcada"
          />
        </label>
        <label className="flex items-center gap-2 text-suave">
          Variações:
          <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" value={variacoes} onChange={(evento) => setVariacoes(Number(evento.currentTarget.value))} aria-label="Variações">
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <p className="text-suave">Gerado na sua máquina, no worker de GPU (uns 2 min na primeira, depois uns 10 s cada). A camada nova entra só na área, por cima do que está lá.</p>
      </div>
    </JanelaFlutuante>
  );
}
