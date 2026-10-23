"use client";

// Os painéis do editor de vídeo no layout dos programas profissionais (ADR 0002) que juntam ferramentas de antes:
// Efeitos (em pastas), Texto (Transcrição, Legendas e Gráficos) e Gráficos essenciais (Modelos e Elementos).
import { ChevronRight, Folder } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { IdFerramenta } from "./ferramentas";

type Conteudo = (ferramenta: IdFerramenta) => ReactNode;

/** Abas dentro de um painel; cada aba só monta na primeira vez que aparece e depois fica montada (guarda o que estava aberto). */
export type PedidoDeAba = { aba: string; vez: number };

function AbasDoPainel({ abas, pedido }: { abas: { id: string; nome: string; conteudo: () => ReactNode }[]; pedido?: PedidoDeAba }) {
  const [ativa, setAtiva] = useState(pedido?.aba ?? abas[0].id);
  const [vistas, setVistas] = useState<string[]>([ativa]);
  // Um pedido de fora (os menus) troca a aba uma vez, durante a renderização
  const [vezVista, setVezVista] = useState(pedido?.vez ?? 0);
  if (pedido && pedido.vez !== vezVista) {
    setVezVista(pedido.vez);
    setAtiva(pedido.aba);
    if (!vistas.includes(pedido.aba)) setVistas([...vistas, pedido.aba]);
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" className="flex h-8 shrink-0 items-end gap-3 border-b border-borda px-3 text-xs">
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={aba.id === ativa}
            onClick={() => {
              setAtiva(aba.id);
              setVistas((atual) => (atual.includes(aba.id) ? atual : [...atual, aba.id]));
            }}
            className={`-mb-px border-b-2 pb-1.5 ${aba.id === ativa ? "border-destaque text-texto" : "border-transparent text-suave hover:text-texto"}`}
          >
            {aba.nome}
          </button>
        ))}
      </div>
      {abas.map((aba) =>
        vistas.includes(aba.id) ? (
          <div key={aba.id} role="tabpanel" hidden={aba.id !== ativa} className="min-h-0 flex-1 overflow-y-auto p-3">
            {aba.conteudo()}
          </div>
        ) : null,
      )}
    </div>
  );
}

/** Uma pasta do painel Efeitos: abre e fecha como no navegador de efeitos dos editores profissionais. */
function Pasta({ nome, aberta: abertaInicial = false, children }: { nome: string; aberta?: boolean; children: ReactNode }) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <section className="border-b border-borda/60">
      <button type="button" aria-expanded={aberta} onClick={() => setAberta((atual) => !atual)} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-painel-2">
        <ChevronRight className={`size-3.5 text-suave transition ${aberta ? "rotate-90" : ""}`} aria-hidden />
        <Folder className="size-3.5 text-suave" aria-hidden />
        {nome}
      </button>
      {aberta ? <div className="px-3 pb-3 pt-1">{children}</div> : null}
    </section>
  );
}

/** Efeitos: as predefinições de cor (os filtros), os efeitos de vídeo e as transições, em pastas. */
export function PainelEfeitosDoVideo({ conteudo }: { conteudo: Conteudo }) {
  return (
    <div className="h-full overflow-y-auto">
      <Pasta nome="Predefinições de cor">{conteudo("filtros")}</Pasta>
      <Pasta nome="Efeitos de vídeo" aberta>
        {conteudo("efeitos")}
      </Pasta>
      <Pasta nome="Transições de vídeo">{conteudo("transicoes")}</Pasta>
      <Pasta nome="Efeitos de áudio">
        <p className="text-xs text-suave">Equalizador, eco, reverb, tom, limpar a voz e nivelar ficam na aba Áudio dos Controles de efeito do clipe.</p>
      </Pasta>
      <Pasta nome="Transições de áudio">
        <p className="text-xs text-suave">Na pasta Transições de vídeo, a opção &quot;Misturar o som&quot; faz o som de um clipe passar para o do outro no corte.</p>
      </Pasta>
    </div>
  );
}

/** Texto: a transcrição (com o "Criar automaticamente"), as legendas e os gráficos de texto. */
export function PainelTextoDoVideo({ conteudo, pedido }: { conteudo: Conteudo; pedido?: PedidoDeAba }) {
  return (
    <AbasDoPainel
      pedido={pedido}
      abas={[
        { id: "transcricao", nome: "Transcrição", conteudo: () => conteudo("transcricao") },
        { id: "legendas", nome: "Legendas", conteudo: () => conteudo("legendas") },
        { id: "graficos", nome: "Gráficos", conteudo: () => conteudo("texto") },
      ]}
    />
  );
}

/** Gráficos essenciais: os modelos de projeto e os elementos (formas, adesivos e animações). */
export function PainelGraficosEssenciais({ conteudo, pedido }: { conteudo: Conteudo; pedido?: PedidoDeAba }) {
  return (
    <AbasDoPainel
      pedido={pedido}
      abas={[
        { id: "modelos", nome: "Modelos", conteudo: () => conteudo("modelos") },
        { id: "elementos", nome: "Elementos", conteudo: () => conteudo("elementos") },
      ]}
    />
  );
}

/** Um painel simples com rolagem e margem, para os conteúdos das ferramentas de antes. */
export function PainelComRolagem({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto p-3">{children}</div>;
}
