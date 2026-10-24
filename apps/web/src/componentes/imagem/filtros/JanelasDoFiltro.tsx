"use client";

// As janelas dos filtros inteligentes (ADR 0003, onda 13.11): as opções de um filtro da pilha (flutuando, com o
// Visualizar) e as opções de mesclagem dele (o modo e a opacidade com que o resultado entra sobre o que chegou).
import { useEffect, useState } from "react";

import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import { FILTRO_POR_ID, type Valores } from "@/lib/imagem/filtros/catalogo";
import { MESCLAGENS_DA_IMAGEM, type Mesclagem } from "@/lib/projeto/modelo";

import { JanelaFlutuante } from "../ajustes/JanelaDeAjusteNosPixels";
import { Moldura } from "../JanelasDePixels";
import { OpcoesDoFiltro } from "./OpcoesDoFiltro";

export function JanelaDoFiltroInteligente({
  tipo,
  inicial,
  aoPrever,
  aoConfirmar,
  aoCancelar,
}: {
  tipo: string;
  inicial: Valores;
  /** O filtro com as opções da vez (null: sem o Visualizar, como estava). */
  aoPrever: (valores: Valores | null) => void;
  aoConfirmar: (valores: Valores) => void;
  aoCancelar: () => void;
}) {
  const definicao = FILTRO_POR_ID.get(tipo);
  const [valores, setValores] = useState<Valores>(inicial);
  const [visualizar, setVisualizar] = useState(true);
  useEffect(() => aoPrever(visualizar ? valores : null), [valores, visualizar, aoPrever]);
  if (!definicao) return null;
  return (
    <JanelaFlutuante
      titulo={definicao.nome}
      aoConfirmar={() => aoConfirmar(valores)}
      aoCancelar={aoCancelar}
      rodape={
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={visualizar} onChange={(evento) => setVisualizar(evento.currentTarget.checked)} />
          Visualizar
        </label>
      }
    >
      <div className="p-3 text-xs">
        <OpcoesDoFiltro definicao={definicao} valores={valores} aoPrever={setValores} aoMudar={setValores} />
      </div>
    </JanelaFlutuante>
  );
}

export function JanelaMesclagemDoFiltro({
  nome,
  inicial,
  aoPrever,
  aoConfirmar,
  aoCancelar,
}: {
  nome: string;
  inicial: { modo: Exclude<Mesclagem, "passagem">; opacidade: number };
  aoPrever: (mesclagem: { modo: Exclude<Mesclagem, "passagem">; opacidade: number }) => void;
  aoConfirmar: (mesclagem: { modo: Exclude<Mesclagem, "passagem">; opacidade: number }) => void;
  aoCancelar: () => void;
}) {
  const [m, setM] = useState(inicial);
  useEffect(() => aoPrever(m), [m, aoPrever]);
  return (
    <Moldura titulo={`Opções de mesclagem (${nome})`} aoFechar={aoCancelar} aoConfirmar={() => aoConfirmar(m)}>
      <label className="flex items-center gap-2 text-suave">
        Modo:
        <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" aria-label="Modo do filtro" value={m.modo} onChange={(evento) => setM({ ...m, modo: evento.currentTarget.value as Exclude<Mesclagem, "passagem"> })}>
          {MESCLAGENS_DA_IMAGEM.flat().map((modo) => (
            <option key={modo.id} value={modo.id}>
              {modo.nome}
            </option>
          ))}
        </select>
      </label>
      <ControleNumerico rotulo="Opacidade" valor={m.opacidade * 100} minimo={0} maximo={100} sufixo="%" aoPrever={(v) => setM({ ...m, opacidade: v / 100 })} aoConfirmar={(v) => setM({ ...m, opacidade: v / 100 })} />
    </Moldura>
  );
}
