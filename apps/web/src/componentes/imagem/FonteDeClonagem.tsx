"use client";

// O painel Fonte de clonagem e as opções do carimbo na barra (ADR 0003, onda 13.5): até cinco fontes (cada uma com o
// ponto marcado por Alt + clique e o deslocamento), a escala e o giro do que é copiado, e a sobreposição.
import { type IdDoPadrao, PADROES } from "@/lib/pintura/padroes";

export type AmostraDoCarimbo = "atual" | "atualEAbaixo" | "todas";
export type FonteDeClonagem = { ponto: { x: number; y: number }; deslocamento: { x: number; y: number } | null };
export type OpcoesDoCarimbo = {
  alinhado: boolean;
  amostra: AmostraDoCarimbo;
  escalaX: number;
  escalaY: number;
  angulo: number;
  sobreposicao: boolean;
  opacidadeDaSobreposicao: number;
  padrao: IdDoPadrao;
};
export const CARIMBO_PADRAO: OpcoesDoCarimbo = { alinhado: true, amostra: "atual", escalaX: 1, escalaY: 1, angulo: 0, sobreposicao: false, opacidadeDaSobreposicao: 0.5, padrao: "xadrez" };

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

/** O alinhado e a amostra (carimbo), ou o padrão e o alinhado (carimbo de padrão), na barra. */
export function OpcoesDoCarimboNaBarra({ padrao, opcoes, aoMudar }: { padrao: boolean; opcoes: OpcoesDoCarimbo; aoMudar: (mudanca: Partial<OpcoesDoCarimbo>) => void }) {
  return (
    <>
      {padrao ? (
        <select className={campo} value={opcoes.padrao} onChange={(evento) => aoMudar({ padrao: evento.currentTarget.value as IdDoPadrao })} aria-label="Padrão">
          {PADROES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      ) : null}
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={opcoes.alinhado} onChange={(evento) => aoMudar({ alinhado: evento.currentTarget.checked })} />
        Alinhado
      </label>
      {padrao ? null : (
        <label className="flex items-center gap-1 text-suave">
          Amostra:
          <select className={campo} value={opcoes.amostra} onChange={(evento) => aoMudar({ amostra: evento.currentTarget.value as AmostraDoCarimbo })} aria-label="Amostra">
            <option value="atual">Camada atual</option>
            <option value="atualEAbaixo">Atual e abaixo</option>
            <option value="todas">Todas as camadas</option>
          </select>
        </label>
      )}
    </>
  );
}

export function PainelFonteDeClonagem({
  fontes,
  ativa,
  opcoes,
  aoEscolher,
  aoMudar,
  aoMudarDeslocamento,
}: {
  fontes: (FonteDeClonagem | null)[];
  ativa: number;
  opcoes: OpcoesDoCarimbo;
  aoEscolher: (indice: number) => void;
  aoMudar: (mudanca: Partial<OpcoesDoCarimbo>) => void;
  aoMudarDeslocamento: (deslocamento: { x: number; y: number } | null) => void;
}) {
  const fonte = fontes[ativa];
  const numero = (rotulo: string, valor: number, aoMudarValor: (valor: number) => void, sufixo: string, passo = 1) => (
    <label className="flex items-center gap-1">
      {rotulo}:
      <input type="number" step={passo} value={Math.round(valor * 100) / 100} onChange={(evento) => aoMudarValor(Number(evento.currentTarget.value) || 0)} className={`${campo} w-16 text-right`} aria-label={rotulo} />
      {sufixo}
    </label>
  );
  return (
    <div className="flex flex-col gap-3 p-3 text-xs" data-painel-fonte-de-clonagem>
      <div className="flex gap-1" role="group" aria-label="Fontes de clonagem">
        {fontes.map((item, i) => (
          <button
            key={i}
            type="button"
            className={`grid size-8 place-items-center rounded border ${i === ativa ? "border-destaque bg-destaque/20" : "border-borda"} ${item ? "text-texto" : "text-suave"}`}
            aria-pressed={i === ativa}
            title={item ? `Fonte ${i + 1}: (${Math.round(item.ponto.x)}, ${Math.round(item.ponto.y)})` : `Fonte ${i + 1}: Alt + clique com o carimbo para marcar`}
            onClick={() => aoEscolher(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="text-suave">{fonte ? `Origem em ${Math.round(fonte.ponto.x)}, ${Math.round(fonte.ponto.y)} px.` : "Escolha o carimbo e faça Alt + clique onde quer copiar."}</p>
      <fieldset className="flex flex-col gap-1.5" disabled={!fonte}>
        <legend className="mb-1 font-semibold">Deslocamento</legend>
        <div className="flex gap-2">
          {numero("X", fonte?.deslocamento?.x ?? 0, (x) => aoMudarDeslocamento({ x, y: fonte?.deslocamento?.y ?? 0 }), "px")}
          {numero("Y", fonte?.deslocamento?.y ?? 0, (y) => aoMudarDeslocamento({ x: fonte?.deslocamento?.x ?? 0, y }), "px")}
        </div>
        <button type="button" className="botao-secundario w-fit px-2 py-0.5 text-xs" onClick={() => aoMudarDeslocamento(null)}>
          Recomeçar o deslocamento
        </button>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-semibold">Escala e giro</legend>
        <div className="flex gap-2">
          {numero("L", opcoes.escalaX * 100, (valor) => aoMudar({ escalaX: Math.min(10, Math.max(0.01, valor / 100)) }), "%")}
          {numero("A", opcoes.escalaY * 100, (valor) => aoMudar({ escalaY: Math.min(10, Math.max(0.01, valor / 100)) }), "%")}
        </div>
        {numero("Ângulo", opcoes.angulo, (angulo) => aoMudar({ angulo }), "°")}
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-semibold">Sobreposição</legend>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={opcoes.sobreposicao} onChange={(evento) => aoMudar({ sobreposicao: evento.currentTarget.checked })} />
          Mostrar a sobreposição
        </label>
        <label className="flex items-center gap-2">
          Opacidade:
          <input type="range" min={5} max={100} value={Math.round(opcoes.opacidadeDaSobreposicao * 100)} onChange={(evento) => aoMudar({ opacidadeDaSobreposicao: Number(evento.currentTarget.value) / 100 })} className="flex-1" aria-label="Opacidade da sobreposição" />
        </label>
      </fieldset>
    </div>
  );
}
