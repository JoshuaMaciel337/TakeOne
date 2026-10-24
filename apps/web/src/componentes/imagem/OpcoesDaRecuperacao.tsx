"use client";

// As opções da barra do Pincel de recuperação para manchas, da Correção e do Mover sensível ao conteúdo (ADR 0003,
// onda 13.5).
export type OpcoesDasManchas = { tipo: "sensivel" | "textura" | "proximidade"; todasAsCamadas: boolean };
export const MANCHAS_PADRAO: OpcoesDasManchas = { tipo: "sensivel", todasAsCamadas: true };

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

export function OpcoesDasManchasNaBarra({ opcoes, aoMudar }: { opcoes: OpcoesDasManchas; aoMudar: (mudanca: Partial<OpcoesDasManchas>) => void }) {
  return (
    <>
      <span className="flex items-center gap-1 text-suave" role="group" aria-label="Tipo">
        Tipo:
        {(
          [
            ["sensivel", "Sensível ao conteúdo"],
            ["textura", "Criar textura"],
            ["proximidade", "Correspondência por proximidade"],
          ] as const
        ).map(([id, nome]) => (
          <button key={id} type="button" className={`rounded px-1.5 py-0.5 text-xs ${opcoes.tipo === id ? "bg-painel-3 text-texto" : "hover:text-texto"}`} aria-pressed={opcoes.tipo === id} onClick={() => aoMudar({ tipo: id })}>
            {nome}
          </button>
        ))}
      </span>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={opcoes.todasAsCamadas} onChange={(evento) => aoMudar({ todasAsCamadas: evento.currentTarget.checked })} />
        Todas as camadas
      </label>
    </>
  );
}

export function OpcoesDaCorrecaoNaBarra({ modo, aoMudar }: { modo: "origem" | "destino"; aoMudar: (modo: "origem" | "destino") => void }) {
  return (
    <>
      <label className="flex items-center gap-1 text-suave">
        Correção:
        <select className={campo} value={modo} onChange={(evento) => aoMudar(evento.currentTarget.value as "origem" | "destino")} aria-label="Modo da correção">
          <option value="origem">De origem (a seleção é refeita com a área para onde a arrasta)</option>
          <option value="destino">De destino (a seleção vai para onde a arrasta)</option>
        </select>
      </label>
      <span className="text-suave">Faça uma seleção e arraste-a.</span>
    </>
  );
}

export function OpcoesDoMoverSensivelNaBarra({ modo, aoMudar }: { modo: "mover" | "estender"; aoMudar: (modo: "mover" | "estender") => void }) {
  return (
    <>
      <label className="flex items-center gap-1 text-suave">
        Modo:
        <select className={campo} value={modo} onChange={(evento) => aoMudar(evento.currentTarget.value as "mover" | "estender")} aria-label="Modo">
          <option value="mover">Mover (o buraco é preenchido)</option>
          <option value="estender">Estender (uma cópia)</option>
        </select>
      </label>
      <span className="text-suave">Faça uma seleção numa camada de pixels e arraste-a.</span>
    </>
  );
}
