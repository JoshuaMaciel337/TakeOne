"use client";

import { Check, SlidersHorizontal } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import { AJUSTES_NEUTROS, aplicarCor, FILTROS } from "@/lib/projeto/cor";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import type { Tick } from "@/lib/tempo";

/** Cores de amostra para mostrar o que cada filtro faz: pele, céu, folha, sombra e claro. */
const AMOSTRAS: [number, number, number][] = [
  [0.85, 0.62, 0.5],
  [0.35, 0.6, 0.9],
  [0.3, 0.6, 0.25],
  [0.15, 0.12, 0.2],
  [0.95, 0.9, 0.75],
];

function paraCss([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

/** As amostras com o filtro aplicado pela mesma conta da prévia e do render. */
function Amostras({ ajustes }: { ajustes: (typeof FILTROS)[number]["ajustes"] }) {
  const completos = { ...AJUSTES_NEUTROS, ...ajustes };
  return (
    <span className="flex h-8 w-full overflow-hidden rounded" aria-hidden>
      {AMOSTRAS.map((amostra, i) => (
        <span key={i} className="flex-1" style={{ background: paraCss(aplicarCor(amostra, completos)) }} />
      ))}
    </span>
  );
}

type Props = {
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoExecutar: (comando: Comando) => void;
  /** O cursor: a camada de ajuste nova começa nele. Sem ele (editor de imagem), o botão não aparece. */
  tempo?: Tick;
};

/** Ferramenta Filtros: aplica um filtro pronto ao clipe selecionado. A intensidade fica na aba Cor. */
export function PainelFiltros({ selecionado, aoExecutar, tempo }: Props) {
  const podeAplicar = selecionado !== null && selecionado.faixa.tipo !== "audio";
  const atual = podeAplicar ? (selecionado.clipe.cor?.filtro ?? null) : null;
  const aplicar = (filtro: string | null) => {
    if (podeAplicar) aoExecutar({ comando: "clipe.cor", parametros: { clipeIds: [selecionado.clipe.id], cor: { filtro } } });
  };

  return (
    <div className="flex flex-col gap-3">
      {tempo !== undefined ? (
        <button
          type="button"
          className="botao-secundario w-full px-3 py-1.5 text-xs"
          onClick={() => aoExecutar({ comando: "clipe.adicionarAjuste", parametros: { inicio: tempo } })}
          title="Uma camada sem mídia: o filtro e a cor dela valem para tudo o que está embaixo, enquanto ela dura"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Pôr uma camada de ajuste no cursor
        </button>
      ) : null}
      <p className="text-xs text-suave">
        {podeAplicar ? "Escolha um filtro para o clipe selecionado. A intensidade e os ajustes finos ficam na aba Cor." : "Selecione um clipe de imagem na prévia ou na linha do tempo."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!podeAplicar}
          onClick={() => aplicar(null)}
          aria-pressed={podeAplicar && atual === null}
          className={`flex flex-col gap-1 rounded-lg border p-2 text-left text-xs transition disabled:opacity-50 ${
            podeAplicar && atual === null ? "border-destaque" : "border-borda hover:border-suave"
          }`}
        >
          <Amostras ajustes={{}} />
          <span className="flex items-center gap-1">
            {podeAplicar && atual === null ? <Check className="size-3" aria-hidden /> : null}
            Original
          </span>
        </button>
        {FILTROS.map((filtro) => (
          <button
            key={filtro.id}
            type="button"
            disabled={!podeAplicar}
            onClick={() => aplicar(filtro.id)}
            aria-pressed={atual === filtro.id}
            className={`flex flex-col gap-1 rounded-lg border p-2 text-left text-xs transition disabled:opacity-50 ${
              atual === filtro.id ? "border-destaque" : "border-borda hover:border-suave"
            }`}
          >
            <Amostras ajustes={filtro.ajustes} />
            <span className="flex items-center gap-1">
              {atual === filtro.id ? <Check className="size-3" aria-hidden /> : null}
              {filtro.nome}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
