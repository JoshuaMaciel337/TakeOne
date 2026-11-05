"use client";

import { Settings2 } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import { duracaoDoProjeto, type Projeto } from "@/lib/projeto/modelo";
import { formatarTimecode } from "@/lib/tempo";

import { CampoCor } from "./CampoCor";
import { NOMES_PROPORCAO, PROPORCOES, type Proporcao, razao } from "./proporcoes";

/** O tamanho do vídeo em 1080p (o lado menor em 1080, os dois lados pares). */
export function tamanhoEm1080(proporcao: Proporcao): [number, number] {
  const r = razao(proporcao);
  const par = (n: number) => Math.round(n / 2) * 2;
  return r < 1 ? [1080, par(1080 / r)] : [par(1080 * r), 1080];
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <dt className="text-suave">{rotulo}</dt>
      <dd className="text-right tabular-nums">{valor}</dd>
    </div>
  );
}

/**
 * As propriedades sem nada escolhido no Takecut (ADR 0007, 17.1): os detalhes do projeto (formato, tamanho, quadros
 * por segundo, duração, faixas e clipes) e o que se muda nele (o formato, a cor de fundo e a sequência).
 */
export function DetalhesDoProjeto({
  projeto,
  aoPrever,
  aoExecutar,
  aoConfigurar,
}: {
  projeto: Projeto;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  aoConfigurar: () => void;
}) {
  const [largura, altura] = tamanhoEm1080(projeto.proporcao);
  const clipes = projeto.faixas.reduce((soma, faixa) => soma + faixa.clipes.length, 0);
  const faixasUsadas = projeto.faixas.filter((faixa) => faixa.clipes.length).length;
  const fps = projeto.taxa.num / projeto.taxa.den;
  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h2 className="text-sm font-semibold">Projeto</h2>
        <p className="mt-0.5 truncate text-xs text-suave" title={projeto.nome}>
          {projeto.nome}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-suave">Formato</span>
          <select
            value={projeto.proporcao}
            onChange={(evento) => aoExecutar({ comando: "projeto.proporcao", parametros: { proporcao: evento.target.value as Proporcao } })}
            className="rounded-md border border-borda bg-painel-2 px-2 py-1.5"
          >
            {PROPORCOES.map((opcao) => (
              <option key={opcao} value={opcao}>
                {NOMES_PROPORCAO[opcao]}
              </option>
            ))}
          </select>
        </label>
        <CampoCor
          rotulo="Cor de fundo"
          cor={projeto.fundo.cor}
          aoPrever={(cor) => aoPrever({ comando: "projeto.fundo", parametros: { cor } })}
          aoConfirmar={(cor) => aoExecutar({ comando: "projeto.fundo", parametros: { cor } })}
        />
      </section>
      <dl className="divide-y divide-borda/60">
        <Linha rotulo="Tamanho em 1080p" valor={`${largura} × ${altura}`} />
        <Linha rotulo="Quadros por segundo" valor={Number.isInteger(fps) ? fps : fps.toFixed(2).replace(".", ",")} />
        <Linha rotulo="Duração" valor={formatarTimecode(duracaoDoProjeto(projeto), projeto.taxa)} />
        <Linha rotulo="Clipes" valor={`${clipes.toLocaleString("pt-BR")} em ${faixasUsadas} ${faixasUsadas === 1 ? "faixa" : "faixas"}`} />
        <Linha rotulo="Marcadores" valor={(projeto.marcadores ?? []).length} />
      </dl>
      <button type="button" className="botao-secundario justify-center px-3 py-1.5 text-xs" onClick={aoConfigurar}>
        <Settings2 className="size-4" aria-hidden />
        Configurações da sequência
      </button>
      <p className="text-xs text-suave">Escolha um clipe na prévia ou na linha do tempo para ajustar a posição, a cor, o som e os efeitos dele.</p>
    </div>
  );
}
