"use client";

import { MousePointerClick } from "lucide-react";
import { useState } from "react";

import { formatarBytes, formatarTempo } from "@/lib/formatar";
import type { Midia } from "@/lib/tipos";

// As abas da seção 5 do plano. Só "Informações" já tem conteúdo; as outras chegam com os clipes.
const ABAS = [
  { id: "info", nome: "Informações", fase: "" },
  { id: "basico", nome: "Básico", fase: "Fase 2" },
  { id: "audio", nome: "Áudio", fase: "Fase 3" },
  { id: "velocidade", nome: "Velocidade", fase: "Fase 4" },
  { id: "animacao", nome: "Animação", fase: "Fase 3" },
  { id: "cor", nome: "Cor", fase: "Fase 4" },
] as const;

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-borda/60 py-2 text-xs last:border-0">
      <dt className="text-suave">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right font-medium tabular-nums" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

export function PainelPropriedades({ midia, className = "", style }: { midia: Midia | null; className?: string; style?: React.CSSProperties }) {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("info");
  const atual = ABAS.find((item) => item.id === aba)!;

  if (!midia) {
    return (
      <aside aria-label="Propriedades" style={style} className={`flex shrink-0 flex-col items-center justify-center gap-2 bg-painel p-6 text-center ${className}`}>
        <MousePointerClick className="size-6 text-suave" aria-hidden />
        <p className="text-xs text-suave">Selecione uma mídia ou um clipe para ver as propriedades.</p>
      </aside>
    );
  }

  return (
    <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
      <div role="tablist" aria-label="Propriedades" className="flex shrink-0 gap-1 overflow-x-auto border-b border-borda px-2 py-1.5">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === aba}
            onClick={() => setAba(item.id)}
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition ${
              item.id === aba ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"
            }`}
          >
            {item.nome}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-3">
        {aba === "info" ? (
          <>
            <h3 className="truncate text-sm font-semibold" title={midia.nome}>
              {midia.nome}
            </h3>
            <dl className="mt-2">
              <Linha rotulo="Arquivo" valor={midia.nome_original} />
              <Linha rotulo="Tamanho" valor={formatarBytes(midia.tamanho_total)} />
              <Linha rotulo="Duração" valor={formatarTempo(midia.duracao)} />
              {midia.video ? (
                <>
                  <Linha rotulo="Resolução" valor={`${midia.video.largura} × ${midia.video.altura}`} />
                  <Linha rotulo="Quadros por segundo" valor={midia.video.fps ? String(midia.video.fps) : "-"} />
                  <Linha rotulo="Codec do vídeo" valor={midia.video.codec?.toUpperCase() ?? "-"} />
                </>
              ) : null}
              {midia.audio ? (
                <Linha
                  rotulo="Áudio"
                  valor={`${midia.audio.codec?.toUpperCase() ?? "-"} · ${midia.audio.canais === 1 ? "mono" : `${midia.audio.canais} canais`} · ${(midia.audio.taxa / 1000).toLocaleString("pt-BR")} kHz`}
                />
              ) : (
                <Linha rotulo="Áudio" valor="Sem áudio" />
              )}
            </dl>
          </>
        ) : (
          <p className="py-8 text-center text-xs text-suave">
            Os ajustes de {atual.nome.toLowerCase()} aparecem quando um clipe estiver na linha do tempo ({atual.fase.toLowerCase()}).
          </p>
        )}
      </div>
    </aside>
  );
}
