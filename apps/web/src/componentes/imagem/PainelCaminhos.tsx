"use client";

// O painel Caminhos do editor de imagem (ADR 0003, onda 13.7): o caminho de trabalho (em itálico) e os salvos. Clicar
// escolhe o caminho (a caneta soma nele e as setas o editam); clicar no vazio esconde. Ctrl + clique carrega como
// seleção (Shift soma, Alt subtrai), duplo clique renomeia (no de trabalho, salva). Embaixo, como lá: preencher,
// traçar, carregar como seleção, criar caminho de trabalho da seleção, novo e excluir; e duplicar e o caminho de recorte.
import { Brush, CircleDashed, Copy, FilePlus2, PaintBucket, Save, Scissors, Spline, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ModoDaSelecao } from "@/lib/selecao/mascara";
import type { CaminhoDoDocumento } from "@/lib/vetor/caminhos";
import { svgDosCaminhos } from "@/lib/vetor/contorno";

type Props = {
  caminhos: CaminhoDoDocumento[];
  documento: { largura: number; altura: number };
  escolhido: string | null;
  aoEscolher: (id: string | null) => void;
  aoRenomear: (id: string, nome: string) => void;
  aoExcluir: (id: string) => void;
  aoDuplicar: (id: string) => void;
  aoNovo: () => void;
  aoRecorte: (id: string | null) => void;
  aoPreencher: (id: string) => void;
  aoTracar: (id: string) => void;
  aoCarregar: (id: string, modo: ModoDaSelecao) => void;
  aoDaSelecao: () => void;
  temSelecao: boolean;
};

export function PainelCaminhos({ caminhos, documento, escolhido, aoEscolher, aoRenomear, aoExcluir, aoDuplicar, aoNovo, aoRecorte, aoPreencher, aoTracar, aoCarregar, aoDaSelecao, temSelecao }: Props) {
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const atual = caminhos.find((caminho) => caminho.id === escolhido) ?? null;
  const linha = "flex w-full items-center gap-2 px-2 py-1 text-left text-xs";
  const botao = (rotulo: string, Icone: typeof Brush, aoClicar: () => void, desativado = false) => (
    <button type="button" className="botao-icone size-6" disabled={desativado} title={rotulo} aria-label={rotulo} onClick={aoClicar}>
      <Icone className="size-4" aria-hidden />
    </button>
  );
  return (
    <div className="flex h-full flex-col" data-painel-caminhos>
      <ul className="min-h-0 flex-1 overflow-y-auto" onClick={(evento) => evento.target === evento.currentTarget && aoEscolher(null)}>
        {caminhos.map((caminho) => {
          const marcado = escolhido === caminho.id;
          return (
            <li key={caminho.id}>
              <div
                role="button"
                tabIndex={0}
                className={`${linha} cursor-default ${marcado ? "bg-destaque/20" : "hover:bg-painel-2"}`}
                aria-pressed={marcado}
                title="Clique para escolher o caminho; Ctrl + clique carrega como seleção (Shift soma, Alt subtrai)"
                onClick={(evento) => {
                  if (evento.ctrlKey || evento.metaKey) aoCarregar(caminho.id, evento.shiftKey && evento.altKey ? "intersectar" : evento.shiftKey ? "somar" : evento.altKey ? "subtrair" : "nova");
                  else aoEscolher(caminho.id);
                }}
                onKeyDown={(evento) => evento.key === "Enter" && aoEscolher(caminho.id)}
                onDoubleClick={() => setRenomeando(caminho.id)}
              >
                <svg viewBox={`0 0 ${documento.largura} ${documento.altura}`} className="h-6 w-9 shrink-0 rounded-sm border border-borda bg-white" aria-hidden>
                  <path d={svgDosCaminhos(caminho.subcaminhos)} fill="#9aa0aa" fillRule="nonzero" stroke="#333" strokeWidth={Math.max(documento.largura, documento.altura) / 60} />
                </svg>
                {renomeando === caminho.id ? (
                  <input
                    autoFocus
                    defaultValue={caminho.trabalho ? "" : caminho.nome}
                    placeholder="Nome do caminho"
                    aria-label="Nome do caminho"
                    maxLength={60}
                    className="min-w-0 flex-1 rounded border border-destaque bg-painel-2 px-1 py-0.5 outline-none"
                    onClick={(evento) => evento.stopPropagation()}
                    onBlur={(evento) => {
                      const nome = evento.currentTarget.value.trim();
                      setRenomeando(null);
                      if (nome && nome !== caminho.nome) aoRenomear(caminho.id, nome);
                    }}
                    onKeyDown={(evento) => {
                      evento.stopPropagation();
                      if (evento.key === "Enter") evento.currentTarget.blur();
                      else if (evento.key === "Escape") {
                        evento.currentTarget.value = "";
                        evento.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <span className={`min-w-0 flex-1 truncate ${caminho.trabalho ? "italic" : ""}`}>{caminho.nome}</span>
                )}
                {caminho.recorte ? <Scissors className="size-3.5 shrink-0 text-suave" aria-label="Caminho de recorte" /> : null}
              </div>
            </li>
          );
        })}
        {!caminhos.length ? <li className="px-2 py-2 text-[11px] text-suave">Nenhum caminho. Desenhe com a Caneta (P) no modo Caminho, ou crie um a partir da seleção.</li> : null}
      </ul>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 border-t border-borda px-2 py-1">
        {botao("Preencher o caminho com a cor de primeiro plano", PaintBucket, () => atual && aoPreencher(atual.id), !atual)}
        {botao("Traçar o caminho com o pincel", Brush, () => atual && aoTracar(atual.id), !atual)}
        {botao("Carregar o caminho como seleção", CircleDashed, () => atual && aoCarregar(atual.id, "nova"), !atual)}
        {botao("Criar caminho de trabalho da seleção", Spline, aoDaSelecao, !temSelecao)}
        {atual?.trabalho ? botao("Salvar o caminho", Save, () => setRenomeando(atual.id)) : null}
        {botao("Duplicar o caminho", Copy, () => atual && aoDuplicar(atual.id), !atual || Boolean(atual.trabalho))}
        {botao(atual?.recorte ? "Tirar o caminho de recorte" : "Usar como caminho de recorte", Scissors, () => atual && aoRecorte(atual.recorte ? null : atual.id), !atual || Boolean(atual.trabalho))}
        {botao("Novo caminho", FilePlus2, aoNovo)}
        {botao("Excluir o caminho", Trash2, () => atual && aoExcluir(atual.id), !atual)}
      </div>
    </div>
  );
}
