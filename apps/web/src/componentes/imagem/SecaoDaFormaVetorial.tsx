"use client";

// A seção Forma da aba Básico numa camada vetorial (ADR 0003, onda 13.7): as tintas e o traço, a largura e a altura
// e as medidas da forma viva (os raios dos cantos, os lados e a estrela, as setas da linha). Os números aparecem em
// pixels da imagem (a caixa da forma vezes a escala da camada).
import { Link2, Link2Off } from "lucide-react";
import { useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import type { Tamanho } from "@/lib/projeto/geometria";
import type { Clipe } from "@/lib/projeto/modelo";
import type { Degrade } from "@/lib/pintura/degrade";
import { type CamadaVetorial, type FormaViva, redimensionar, refazerForma, tamanhoDosCaminhos } from "@/lib/vetor/modelo";

import { NumeroDaForma, TintasDaForma } from "./OpcoesDaForma";

export type ContextoDasFormas = { quadro: Tamanho; primeiroPlano: string; fundo: string; degrades: Degrade[]; aoEscolherFoto?: (clipeId: string) => void };

const NOMES: Record<FormaViva["tipo"], string> = { retangulo: "Retângulo", elipse: "Elipse", triangulo: "Triângulo", poligono: "Polígono", linha: "Linha" };

export function SecaoDaFormaVetorial({ clipe, travada, contexto, aoExecutar }: { clipe: Clipe; travada: boolean; contexto: ContextoDasFormas; aoExecutar: (comando: Comando) => void }) {
  const vetor = clipe.vetor!;
  const [raiosJuntos, setRaiosJuntos] = useState(true);
  // Pixels da imagem por unidade da caixa
  const k = Math.min(contexto.quadro.largura / vetor.caixa.largura, contexto.quadro.altura / vetor.caixa.altura) * clipe.transformacao.escala;
  const mudar = (novo: CamadaVetorial) => !travada && aoExecutar({ comando: "imagem.mudarVetor", parametros: { clipeId: clipe.id, vetor: novo } });
  const forma = vetor.forma ?? null;
  // A forma viva mostra as medidas dela (o pentágono não chega ao pé da caixa); o caminho, o tamanho dos pontos
  const tamanho = forma && forma.tipo !== "linha" ? { largura: forma.largura, altura: forma.altura } : tamanhoDosCaminhos(vetor);
  const traco = vetor.traco ?? { tinta: { tipo: "nenhuma" as const }, largura: 3 / k, alinhamento: "dentro" as const, tipo: "solido" as const, pontas: "reta" as const, cantos: "vivo" as const, mitra: 4 };
  const linha = forma?.tipo === "linha";
  const mudarForma = (nova: FormaViva) => mudar(refazerForma(vetor, { forma: nova }));
  return (
    <fieldset disabled={travada} className="mt-2 border-t border-borda/60 pt-2 text-xs">
      <legend className="sr-only">Forma</legend>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Forma</span>
        <span className="text-suave">{forma ? NOMES[forma.tipo] : "Caminho"}</span>
      </div>
      {vetor.quadro ? (
        <div className="mt-1.5 space-y-1.5 rounded border border-borda/60 p-1.5" data-quadro>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-suave">Foto do quadro:</span>
            <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => contexto.aoEscolherFoto?.(clipe.id)}>
              {vetor.preenchimento.tipo === "imagem" ? "Trocar…" : "Escolher…"}
            </button>
            {vetor.preenchimento.tipo === "imagem" ? (
              <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => mudar({ ...vetor, preenchimento: { tipo: "nenhuma" } })}>
                Tirar
              </button>
            ) : null}
          </div>
          {vetor.preenchimento.tipo === "imagem"
            ? (() => {
                const foto = vetor.preenchimento;
                const mudarFoto = (mudanca: Partial<typeof foto>) => mudar({ ...vetor, preenchimento: { ...foto, ...mudanca } });
                return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <label className="flex items-center gap-1 text-suave">
                      Ajuste:
                      <select className="rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto" value={foto.ajuste} onChange={(evento) => mudarFoto({ ajuste: evento.currentTarget.value as typeof foto.ajuste })} aria-label="Ajuste da foto">
                        <option value="cobrir">Cobrir o quadro</option>
                        <option value="conter">Caber no quadro</option>
                      </select>
                    </label>
                    <NumeroDaForma rotulo="Zoom" valor={Math.round(foto.escala * 100)} minimo={10} maximo={2000} sufixo="%" aoMudar={(valor) => mudarFoto({ escala: valor / 100 })} />
                    <NumeroDaForma rotulo="X" valor={Math.round(foto.x * 1000) / 10} minimo={-500} maximo={500} sufixo="%" aoMudar={(valor) => mudarFoto({ x: valor / 100 })} />
                    <NumeroDaForma rotulo="Y" valor={Math.round(foto.y * 1000) / 10} minimo={-500} maximo={500} sufixo="%" aoMudar={(valor) => mudarFoto({ y: valor / 100 })} />
                  </div>
                );
              })()
            : null}
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <TintasDaForma
          preenchimento={vetor.preenchimento.tipo === "imagem" ? { tipo: "nenhuma" } : vetor.preenchimento}
          // A largura do traço em pixels da imagem
          traco={{ ...traco, largura: Math.round(traco.largura * k * 100) / 100 }}
          semPreenchimento={linha || Boolean(vetor.quadro)}
          primeiroPlano={contexto.primeiroPlano}
          fundo={contexto.fundo}
          doEspaco={contexto.degrades}
          aoMudarPreenchimento={(preenchimento) => mudar(refazerForma(vetor, { preenchimento }))}
          aoMudarTraco={(novo) => {
            const semTraco = novo.tinta.tipo === "nenhuma" && !linha;
            mudar(refazerForma(vetor, { traco: semTraco ? null : { ...novo, largura: Math.max(0, novo.largura / k) } }));
          }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {linha && forma.tipo === "linha" ? (
          <>
            <NumeroDaForma rotulo="Comprimento" valor={forma.comprimento * k} minimo={1} maximo={60000} sufixo="px" aoMudar={(px) => mudarForma({ ...forma, comprimento: px / k })} largura="w-16" />
            <NumeroDaForma rotulo="Ângulo" valor={forma.angulo} minimo={-360} maximo={360} sufixo="°" aoMudar={(angulo) => mudarForma({ ...forma, angulo })} />
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={forma.setaInicio} onChange={(evento) => mudarForma({ ...forma, setaInicio: evento.currentTarget.checked })} />
              Seta no início
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={forma.setaFim} onChange={(evento) => mudarForma({ ...forma, setaFim: evento.currentTarget.checked })} />
              Seta no fim
            </label>
            {forma.setaInicio || forma.setaFim ? <NumeroDaForma rotulo="Tamanho da seta" valor={forma.tamanhoDaSeta} minimo={1} maximo={50} sufixo="×" aoMudar={(tamanhoDaSeta) => mudarForma({ ...forma, tamanhoDaSeta })} largura="w-10" /> : null}
          </>
        ) : (
          <>
            <NumeroDaForma rotulo="L" valor={tamanho.largura * k} minimo={1} maximo={60000} sufixo="px" aoMudar={(px) => mudar(redimensionar(vetor, px / k, tamanho.altura))} largura="w-16" />
            <NumeroDaForma rotulo="A" valor={tamanho.altura * k} minimo={1} maximo={60000} sufixo="px" aoMudar={(px) => mudar(redimensionar(vetor, tamanho.largura, px / k))} largura="w-16" />
          </>
        )}
      </div>
      {forma?.tipo === "retangulo" ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-suave">Raios dos cantos:</span>
          <button type="button" className="rounded p-0.5 text-suave hover:text-texto" aria-pressed={raiosJuntos} title={raiosJuntos ? "Os quatro cantos juntos" : "Cada canto com o seu raio"} onClick={() => setRaiosJuntos(!raiosJuntos)}>
            {raiosJuntos ? <Link2 className="size-3.5" aria-label="Cantos juntos" /> : <Link2Off className="size-3.5" aria-label="Cantos separados" />}
          </button>
          {(raiosJuntos ? [0] : [0, 1, 2, 3]).map((i) => (
            <NumeroDaForma
              key={i}
              rotulo={raiosJuntos ? "Raio" : ["Em cima à esquerda", "Em cima à direita", "Embaixo à direita", "Embaixo à esquerda"][i]}
              valor={forma.raios[i] * k}
              minimo={0}
              maximo={30000}
              sufixo="px"
              aoMudar={(px) => {
                const raios = [...forma.raios] as [number, number, number, number];
                if (raiosJuntos) raios.fill(px / k);
                else raios[i] = px / k;
                mudarForma({ ...forma, raios });
              }}
            />
          ))}
        </div>
      ) : null}
      {forma?.tipo === "triangulo" || forma?.tipo === "poligono" ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {forma.tipo === "poligono" ? (
            <>
              <NumeroDaForma rotulo="Lados" valor={forma.lados} minimo={3} maximo={100} aoMudar={(lados) => mudarForma({ ...forma, lados: Math.round(lados) })} largura="w-10" />
              <NumeroDaForma rotulo="Estrela" valor={Math.round(forma.estrela * 100)} minimo={0} maximo={99} sufixo="%" aoMudar={(estrela) => mudarForma({ ...forma, estrela: estrela / 100 })} largura="w-10" />
            </>
          ) : null}
          <NumeroDaForma rotulo="Raio dos cantos" valor={forma.raio * k} minimo={0} maximo={30000} sufixo="px" aoMudar={(px) => mudarForma({ ...forma, raio: px / k })} />
        </div>
      ) : null}
    </fieldset>
  );
}
