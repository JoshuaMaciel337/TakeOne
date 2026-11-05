"use client";

import { Check, LoaderCircle, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { arquivoDaMidia, chamarApi } from "@/lib/api";
import { divisoesNasTrocas, trocasDaQualidade } from "@/lib/clipar/editorDoCorte";
import { amostraDaImagem } from "@/lib/previa/amostra";
import { type Comando, executarComando, type ResultadoDoComando } from "@/lib/projeto/comandos";
import { ajustesAutomaticos } from "@/lib/projeto/melhorar";
import { analisarProjeto, type SugestaoDoProjeto, type TipoDeSugestao } from "@/lib/projeto/melhorarProjeto";
import { acharClipe, type Projeto } from "@/lib/projeto/modelo";
import { buscarQualidade } from "@/lib/qualidade";
import type { Midia } from "@/lib/tipos";

import { contextoDasMidias } from "./contexto";

export type AmbienteDaMelhoria = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  executar: (comando: Comando) => ResultadoDoComando;
  avisar: (mensagem: string) => void;
  abrirLegendas: () => void;
  andamento?: (texto: string) => void;
};

/**
 * Aplica uma melhoria aos clipes (a janela "Melhorar o projeto" e o botão direito de um clipe usam esta mesma conta).
 * As que mexem em vários clipes com contas diferentes (a cor, as cenas) vão num passo só do desfazer.
 */
export async function aplicarMelhoria(tipo: TipoDeSugestao, clipeIds: string[], ambiente: AmbienteDaMelhoria): Promise<void> {
  const { projeto, midias, executar, avisar } = ambiente;
  if (tipo === "legendas") {
    ambiente.abrirLegendas();
    return;
  }
  if (tipo === "volume") {
    if (executar({ comando: "clipe.audio", parametros: { clipeIds, igualar_volume: true } })) avisar(`Volume igualado em ${clipeIds.length === 1 ? "1 clipe" : `${clipeIds.length} clipes`} (a -14 LUFS). Ctrl+Z desfaz.`);
    return;
  }
  if (tipo === "voz") {
    const ids = [...new Set(clipeIds.map((id) => acharClipe(projeto, id)?.clipe.midia_id).filter((id): id is string => Boolean(id)))];
    await Promise.all(ids.map((id) => chamarApi(`/midias/${id}/voz-limpa`, { metodo: "POST" }).catch(() => undefined)));
    if (executar({ comando: "clipe.audio", parametros: { clipeIds, voz_limpa: true } })) avisar("A voz limpa está sendo preparada; os clipes já usam ela quando ficar pronta. Ctrl+Z desfaz.");
    return;
  }
  const ctx = contextoDasMidias(midias);
  let atual = projeto;
  if (tipo === "cor") {
    let feitos = 0;
    for (const id of clipeIds) {
      const achado = acharClipe(atual, id);
      const midia = achado?.clipe.midia_id ? midias.get(achado.clipe.midia_id) : undefined;
      if (!achado || !midia) continue;
      ambiente.andamento?.(`Lendo a imagem ${feitos + 1} de ${clipeIds.length}`);
      try {
        const pixels = await amostraDaImagem(arquivoDaMidia(midia.id, midia.imagem ? "proxy.webp" : "capa.jpg"));
        atual = executarComando(atual, { comando: "clipe.cor", parametros: { clipeIds: [id], cor: ajustesAutomaticos(pixels) } }, ctx).projeto;
        feitos++;
      } catch {
        // A imagem que não abre fica como estava
      }
    }
    if (feitos && executar({ comando: "edicao.pedido", parametros: { projeto: atual } })) avisar(`Cor melhorada em ${feitos === 1 ? "1 clipe" : `${feitos} clipes`}. Ctrl+Z desfaz.`);
    return;
  }
  // As trocas de cena: o worker dá a nota de cada instante da mídia (core/utils/qualidade.py), com os cortes
  let divididos = 0;
  const porMidia = new Map<string, string[]>();
  for (const id of clipeIds) {
    const midiaId = acharClipe(projeto, id)?.clipe.midia_id;
    if (midiaId) porMidia.set(midiaId, [...(porMidia.get(midiaId) ?? []), id]);
  }
  for (const [midiaId, ids] of porMidia) {
    const qualidade = await buscarQualidade(midiaId, (progresso) => ambiente.andamento?.(`Procurando as trocas de cena · ${progresso}%`), () => true);
    if (!qualidade) continue;
    const trocas = trocasDaQualidade(qualidade);
    const clipes = ids.map((id) => acharClipe(atual, id)?.clipe).filter((c) => c !== undefined);
    for (const divisao of divisoesNasTrocas(clipes, trocas)) {
      const principal = atual.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
      const clipe = principal.find((item) => item.inicio < divisao.tempo && divisao.tempo < item.inicio + item.duracao);
      if (!clipe) continue;
      atual = executarComando(atual, { comando: "linha.dividir", parametros: { tempo: divisao.tempo, clipeIds: [clipe.id] } }, ctx).projeto;
      divididos++;
    }
  }
  if (!divididos) avisar("Nenhuma troca de cena dentro desses clipes.");
  else if (executar({ comando: "edicao.pedido", parametros: { projeto: atual } })) avisar(`${divididos === 1 ? "1 troca de cena virou" : `${divididos} trocas de cena viraram`} um corte. Ctrl+Z desfaz.`);
}

/** A janela "Melhorar o projeto": o que dá para melhorar, com "Aplicar" em cada item e "Aplicar tudo". */
export function MelhorarOProjeto({ ambiente, aoFechar }: { ambiente: AmbienteDaMelhoria; aoFechar: () => void }) {
  const sugestoes = analisarProjeto(ambiente.projeto, ambiente.midias);
  const [feitas, setFeitas] = useState<TipoDeSugestao[]>([]);
  const [andando, setAndando] = useState<{ tipo: TipoDeSugestao; texto: string } | null>(null);

  useEffect(() => {
    // Na captura, antes dos atalhos do editor (o Esc lá tira a seleção)
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.stopImmediatePropagation();
      aoFechar();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [aoFechar]);

  async function aplicar(sugestao: SugestaoDoProjeto) {
    setAndando({ tipo: sugestao.tipo, texto: "Aplicando" });
    try {
      await aplicarMelhoria(sugestao.tipo, sugestao.clipeIds, { ...ambiente, andamento: (texto) => setAndando({ tipo: sugestao.tipo, texto }) });
      setFeitas((lista) => [...lista, sugestao.tipo]);
    } catch (erro) {
      ambiente.avisar(erro instanceof Error ? erro.message : "Não foi possível aplicar a melhoria.");
    } finally {
      setAndando(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-melhorar" className="w-full max-w-md rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60" onPointerDown={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-melhorar" className="flex items-center gap-2 font-display text-base font-semibold">
            <WandSparkles className="size-4 text-destaque" aria-hidden />
            Melhorar o projeto
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-2 p-4">
          {!sugestoes.length ? <p className="py-4 text-center text-sm text-suave">Nada a melhorar: o som, a cor, as legendas e a voz já estão em dia.</p> : null}
          {sugestoes.map((sugestao) => {
            const feita = feitas.includes(sugestao.tipo);
            return (
              <div key={sugestao.tipo} className="flex items-start gap-3 rounded-lg border border-borda bg-painel-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{sugestao.titulo}</p>
                  <p className="text-xs text-suave">{andando?.tipo === sugestao.tipo ? andando.texto : sugestao.descricao}</p>
                </div>
                <button type="button" className="botao-secundario shrink-0 px-3 py-1 text-xs" disabled={Boolean(andando) || feita} onClick={() => void aplicar(sugestao)}>
                  {andando?.tipo === sugestao.tipo ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : feita ? <Check className="size-3.5" aria-hidden /> : null}
                  {feita ? "Feito" : sugestao.tipo === "legendas" ? "Abrir" : "Aplicar"}
                </button>
              </div>
            );
          })}
          {sugestoes.filter((s) => s.tipo !== "legendas" && !feitas.includes(s.tipo)).length > 1 ? (
            <button
              type="button"
              className="botao-principal mt-1 px-3 py-2"
              disabled={Boolean(andando)}
              onClick={async () => {
                // Uma de cada vez: cada uma parte do projeto que a anterior deixou
                for (const sugestao of sugestoes.filter((s) => s.tipo !== "legendas" && !feitas.includes(s.tipo))) await aplicar(sugestao);
              }}
            >
              <WandSparkles className="size-4" aria-hidden />
              Aplicar tudo
            </button>
          ) : null}
          <p className="text-[11px] text-suave">Tudo roda aqui e no servidor do TakeOne, sem custo. Cada melhoria é um passo do desfazer.</p>
        </div>
      </div>
    </div>
  );
}
