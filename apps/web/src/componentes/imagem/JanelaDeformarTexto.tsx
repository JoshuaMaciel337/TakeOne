"use client";

// Texto › Deformar texto (ADR 0003, onda 13.8): o estilo, a direção, a curvatura e as distorções, com a prévia no texto
// enquanto mexe; OK guarda, Cancelar volta como estava.
import { useState } from "react";

import { type Deformacao, ESTILOS_DA_DEFORMACAO, type EstiloDaDeformacao } from "@/lib/texto/deformar";
import { Moldura } from "./JanelasDePixels";

type Props = {
  inicial: Deformacao | null;
  /** A deformação a mostrar no texto (null: sem deformação). */
  aoPrever: (deformacao: Deformacao | null) => void;
  aoConfirmar: (deformacao: Deformacao | null) => void;
  aoCancelar: () => void;
};

function Deslizante({ nome, valor, aoMudar, desligado }: { nome: string; valor: number; aoMudar: (valor: number) => void; desligado: boolean }) {
  return (
    <label className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-suave">
      {nome}
      <input type="range" aria-label={nome} min={-100} max={100} step={1} value={valor} disabled={desligado} onChange={(evento) => aoMudar(Number(evento.currentTarget.value))} />
      <input
        aria-label={`${nome} (número)`}
        className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-right text-texto"
        value={valor}
        disabled={desligado}
        inputMode="numeric"
        onChange={(evento) => {
          const numero = Number(evento.currentTarget.value.replace(",", "."));
          if (Number.isFinite(numero)) aoMudar(Math.max(-100, Math.min(100, Math.round(numero))));
        }}
      />
    </label>
  );
}

export function JanelaDeformarTexto({ inicial, aoPrever, aoConfirmar, aoCancelar }: Props) {
  const [estilo, setEstilo] = useState<EstiloDaDeformacao | "nenhum">(inicial?.estilo ?? "nenhum");
  const [valores, setValores] = useState({ vertical: inicial?.vertical ?? false, curvatura: inicial?.curvatura ?? 50, distorcaoH: inicial?.distorcaoH ?? 0, distorcaoV: inicial?.distorcaoV ?? 0 });
  const montar = (e: typeof estilo, v: typeof valores): Deformacao | null => (e === "nenhum" ? null : { estilo: e, ...v });
  const mudar = (e: typeof estilo, v: typeof valores) => {
    setEstilo(e);
    setValores(v);
    aoPrever(montar(e, v));
  };
  const desligado = estilo === "nenhum";
  return (
    <Moldura titulo="Deformar texto" aoFechar={aoCancelar} aoConfirmar={() => aoConfirmar(montar(estilo, valores))}>
      <label className="flex items-center gap-2 text-suave">
        Estilo:
        <select aria-label="Estilo da deformação" className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" value={estilo} onChange={(evento) => mudar(evento.currentTarget.value as EstiloDaDeformacao | "nenhum", valores)}>
          <option value="nenhum">Nenhum</option>
          {ESTILOS_DA_DEFORMACAO.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-4 text-texto" role="radiogroup" aria-label="Direção">
        {(
          [
            [false, "Horizontal"],
            [true, "Vertical"],
          ] as const
        ).map(([vertical, nome]) => (
          <label key={nome} className="flex items-center gap-1">
            <input type="radio" name="direcao-da-deformacao" checked={valores.vertical === vertical} disabled={desligado} onChange={() => mudar(estilo, { ...valores, vertical })} />
            {nome}
          </label>
        ))}
      </div>
      <Deslizante nome="Curvatura" valor={valores.curvatura} desligado={desligado} aoMudar={(curvatura) => mudar(estilo, { ...valores, curvatura })} />
      <Deslizante nome="Distorção horizontal" valor={valores.distorcaoH} desligado={desligado} aoMudar={(distorcaoH) => mudar(estilo, { ...valores, distorcaoH })} />
      <Deslizante nome="Distorção vertical" valor={valores.distorcaoV} desligado={desligado} aoMudar={(distorcaoV) => mudar(estilo, { ...valores, distorcaoV })} />
    </Moldura>
  );
}
