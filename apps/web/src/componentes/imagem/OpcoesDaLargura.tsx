"use client";

// As opções da ferramenta Largura do traço na barra (ADR 0003, onda 13.16): os perfis prontos, inverter e limpar.
import { PERFIS_DE_LARGURA, type PontoDeLargura } from "@/lib/vetor/largura";

export function OpcoesDaLarguraNaBarra({ perfil, comTraco, aoMudar }: { perfil: PontoDeLargura[] | null; comTraco: boolean; aoMudar: (perfil: PontoDeLargura[]) => void }) {
  if (!perfil || !comTraco) return <span className="text-suave">Escolha uma forma com traço para mudar a largura dele.</span>;
  return (
    <>
      <label className="flex items-center gap-1">
        Perfil
        <select aria-label="Perfil de largura" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value="" onChange={(e) => aoMudar(PERFIS_DE_LARGURA.find((item) => item.id === e.currentTarget.value)?.pontos ?? perfil)}>
          <option value="" disabled>
            Escolher…
          </option>
          {PERFIS_DE_LARGURA.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!perfil.length} onClick={() => aoMudar(perfil.map((p) => ({ ...p, t: 1 - p.t, esquerda: p.direita, direita: p.esquerda })).sort((a, b) => a.t - b.t))}>
        Inverter
      </button>
      <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!perfil.length} onClick={() => aoMudar([])}>
        Limpar
      </button>
      <span className="text-suave">Arraste a partir do caminho para a largura (Alt: um lado só); clique duplo num ponto o tira</span>
    </>
  );
}
