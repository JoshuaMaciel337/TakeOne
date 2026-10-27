"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";

import { ErroApi } from "@/lib/api";
import { enderecoDaPrevia, pedirLegendaAnimada } from "@/lib/legendasAnimadas";
import type { Comando } from "@/lib/projeto/comandos";
import { ErroEdicao } from "@/lib/projeto/edicao";
import { ESTILOS_ANIMADOS, faixaDasLegendas, pedidoDasLegendas } from "@/lib/projeto/legendaAnimada";
import type { Projeto } from "@/lib/projeto/modelo";

import { PreviaDaAnimacao } from "./PainelAnimacoes";

type Props = {
  projeto: Projeto;
  aoExecutarQuandoProntas: (midiaIds: string[], comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/**
 * Legenda animada: as legendas do projeto (com o tempo de cada palavra e as palavras-chave) viram uma trilha gravada
 * pelo worker, com a palavra entrando no ritmo da fala. Ela entra por cima quando fica pronta, e a faixa de legendas
 * fica escondida (a pessoa mostra de novo pelo olho, se quiser voltar).
 */
export function LegendaAnimada({ projeto, aoExecutarQuandoProntas, aoAvisar }: Props) {
  const [estilo, setEstilo] = useState(ESTILOS_ANIMADOS[0].id);
  const [pedindo, setPedindo] = useState(false);
  const faixa = faixaDasLegendas(projeto);
  if (!faixa) return null;
  let previa: string | null = null;
  try {
    const pedido = pedidoDasLegendas(projeto);
    previa = enderecoDaPrevia(estilo, projeto.proporcao, pedido.cores, pedido.posicao);
  } catch {
    previa = null;
  }

  const [largura, altura] = projeto.proporcao.split(":").map(Number);

  function animar() {
    let pedido;
    try {
      pedido = pedidoDasLegendas(projeto);
    } catch (erro) {
      aoAvisar(erro instanceof ErroEdicao ? erro.message : "Não foi possível ler as legendas.");
      return;
    }
    setPedindo(true);
    pedirLegendaAnimada(pedido, estilo, projeto.proporcao)
      .then((midia) => {
        aoAvisar("Gravando a legenda animada: ela entra por cima quando ficar pronta.");
        aoExecutarQuandoProntas([midia.id], { comando: "legenda.animar", parametros: { midiaId: midia.id, inicio: pedido.inicio, faixaId: pedido.faixaId } });
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof ErroApi ? erro.message : "Não foi possível pedir a legenda animada agora."))
      .finally(() => setPedindo(false));
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Legenda animada">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Animada</h3>
      <label className="flex flex-col gap-1 text-[11px] text-suave">
        Estilo
        <select
          value={estilo}
          onChange={(evento) => setEstilo(evento.currentTarget.value)}
          className="rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs text-texto outline-none focus:border-destaque"
        >
          {ESTILOS_ANIMADOS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      {previa ? (
        // A largura que cabe em 240 px de altura: em pé, a caixa estreita mostra o quadro inteiro (com a legenda embaixo)
        <div className="mx-auto w-full" style={{ maxWidth: (240 * largura) / altura }}>
          <PreviaDaAnimacao endereco={previa} proporcao={projeto.proporcao} alturaMaxima={240} />
        </div>
      ) : null}
      <button type="button" className="botao-principal px-3 py-2 text-xs" disabled={pedindo} onClick={animar}>
        {pedindo ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        Animar as legendas
      </button>
      <p className="text-[11px] text-suave">Usa o tempo de cada palavra e as palavras-chave das legendas. A faixa de legendas fica escondida.</p>
    </section>
  );
}
