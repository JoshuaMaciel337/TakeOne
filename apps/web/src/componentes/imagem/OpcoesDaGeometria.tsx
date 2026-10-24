"use client";

// As opções da barra do Corte de perspectiva e da Régua (ADR 0003, onda 13.6).
import { Check, X } from "lucide-react";

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

function Numero({ rotulo, valor, sufixo, aoMudar }: { rotulo: string; valor: number; sufixo: string; aoMudar: (valor: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}
      <input
        key={valor}
        className={`${campo} w-14 text-right tabular-nums`}
        defaultValue={valor || ""}
        placeholder="auto"
        inputMode="numeric"
        aria-label={rotulo}
        onBlur={(evento) => {
          const numero = Math.round(Number(evento.currentTarget.value || 0));
          if (Number.isFinite(numero) && numero >= 0) aoMudar(numero);
        }}
        onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
      />
      {sufixo}
    </label>
  );
}

export function OpcoesDoCortePerspectivaNaBarra({
  opcoes,
  temQuad,
  aoMudar,
  aoConfirmar,
  aoCancelar,
}: {
  opcoes: { largura: number; altura: number; resolucao: number; grade: boolean };
  temQuad: boolean;
  aoMudar: (mudanca: Partial<{ largura: number; altura: number; resolucao: number; grade: boolean }>) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <>
      <Numero rotulo="L" valor={opcoes.largura} sufixo="px" aoMudar={(largura) => aoMudar({ largura })} />
      <Numero rotulo="A" valor={opcoes.altura} sufixo="px" aoMudar={(altura) => aoMudar({ altura })} />
      <Numero rotulo="Resolução" valor={opcoes.resolucao} sufixo="ppi" aoMudar={(resolucao) => aoMudar({ resolucao })} />
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={opcoes.grade} onChange={(evento) => aoMudar({ grade: evento.currentTarget.checked })} />
        Mostrar a grade
      </label>
      <span className="text-suave">{temQuad ? "Leve os cantos aos do que deveria ser reto." : "Arraste um retângulo sobre a imagem."}</span>
      <span className="ml-auto flex items-center gap-1">
        <button type="button" className="botao-icone size-6" onClick={aoCancelar} disabled={!temQuad} title="Limpar (Esc)" aria-label="Cancelar o corte de perspectiva">
          <X className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6 text-destaque" onClick={aoConfirmar} disabled={!temQuad} title="Confirmar (Enter)" aria-label="Confirmar o corte de perspectiva">
          <Check className="size-4" aria-hidden />
        </button>
      </span>
    </>
  );
}

export type Medida = { de: { x: number; y: number }; ate: { x: number; y: number } };

export function OpcoesDaReguaNaBarra({ medida, aoEndireitar, aoLimpar }: { medida: Medida | null; aoEndireitar: () => void; aoLimpar: () => void }) {
  const dx = medida ? medida.ate.x - medida.de.x : 0;
  const dy = medida ? medida.ate.y - medida.de.y : 0;
  // O ângulo como lá: anti-horário positivo, a partir da horizontal
  const angulo = medida ? (-Math.atan2(dy, dx) * 180) / Math.PI : 0;
  const numero = (valor: number, casas = 1) => valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (
    <>
      <span className="tabular-nums text-suave">X: {numero(medida?.de.x ?? 0)}</span>
      <span className="tabular-nums text-suave">Y: {numero(medida?.de.y ?? 0)}</span>
      <span className="tabular-nums text-suave">L: {numero(dx)}</span>
      <span className="tabular-nums text-suave">A: {numero(dy)}</span>
      <span className="tabular-nums text-suave">Â: {numero(angulo)}°</span>
      <span className="tabular-nums text-suave" aria-label="Distância">
        D: {numero(Math.hypot(dx, dy))} px
      </span>
      <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!medida} onClick={aoEndireitar} title="Gira a camada escolhida para a linha medida ficar reta (na horizontal ou na vertical)">
        Endireitar camada
      </button>
      <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" disabled={!medida} onClick={aoLimpar}>
        Limpar
      </button>
    </>
  );
}
