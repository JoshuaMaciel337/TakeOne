"use client";

// A janela da camada de preenchimento (ADR 0003, onda 13.9): a cor sólida, o degradê (com o editor de degradê, o
// estilo, o ângulo, a escala e o inverter) ou o padrão, com a prévia ao vivo. Abre ao criar a camada e com o clique
// duplo na miniatura dela; trocar o tipo aqui é o "Alterar o conteúdo da camada".
import { useEffect, useMemo, useState } from "react";

import { NOMES_DO_PREENCHIMENTO, type CamadaDePreenchimento } from "@/lib/imagem/camadaDePreenchimento";
import { type Degrade, degradeComCores, DEGRADES_PRONTOS, FORMAS_DO_DEGRADE } from "@/lib/pintura/degrade";
import { type IdDoPadrao, ladrilhoDoPadrao, usePadroes } from "@/lib/pintura/padroes";

import { AmostraDoDegrade, JanelaEditorDeDegrade } from "./Degrades";
import { Moldura } from "./JanelasDePixels";

type Tinta = CamadaDePreenchimento["tinta"];
const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

/** O preenchimento novo de cada tipo, com as cores da pessoa. */
export function preenchimentoNovo(tipo: Tinta["tipo"], primeiroPlano: string, fundo: string, padrao: IdDoPadrao = "xadrez"): CamadaDePreenchimento {
  if (tipo === "cor") return { tinta: { tipo, cor: primeiroPlano } };
  if (tipo === "degrade") return { tinta: { tipo, degrade: degradeComCores(DEGRADES_PRONTOS[0].degrades[0], primeiroPlano, fundo), forma: "linear", angulo: 90, escala: 1, inverter: false } };
  return { tinta: { tipo, padrao, escala: 1 } };
}

/** O ladrilho do padrão, repetido, como fundo do botão. */
function AmostraDoPadrao({ id }: { id: IdDoPadrao }) {
  const endereco = useMemo(() => ladrilhoDoPadrao(id, "#000000", "#ffffff").toDataURL(), [id]);
  return <span className="block h-7 w-full rounded-sm" style={{ backgroundImage: `url(${endereco})`, backgroundSize: "16px 16px" }} aria-hidden />;
}

function Numero({ rotulo, valor, minimo, maximo, sufixo, aoMudar }: { rotulo: string; valor: number; minimo: number; maximo: number; sufixo: string; aoMudar: (valor: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-suave">
      <span className="w-14">{rotulo}:</span>
      <input type="range" min={minimo} max={maximo} value={valor} onChange={(evento) => aoMudar(Number(evento.currentTarget.value))} className="flex-1" aria-label={rotulo} />
      <input
        key={valor}
        aria-label={`${rotulo} (número)`}
        defaultValue={Math.round(valor)}
        inputMode="numeric"
        className={`${campo} w-12 text-right tabular-nums`}
        onBlur={(evento) => {
          const numero = Number(evento.currentTarget.value.replace(",", "."));
          if (Number.isFinite(numero) && numero !== valor) aoMudar(Math.min(maximo, Math.max(minimo, numero)));
        }}
        onKeyDown={(evento) => {
          if (evento.key !== "Enter") return;
          evento.preventDefault();
          evento.currentTarget.blur();
        }}
      />
      <span className="w-3">{sufixo}</span>
    </label>
  );
}

export function JanelaCamadaDePreenchimento({
  inicial,
  primeiroPlano,
  fundo,
  degradesDoEspaco,
  aoPrever,
  aoConfirmar,
  aoCancelar,
}: {
  inicial: CamadaDePreenchimento;
  primeiroPlano: string;
  fundo: string;
  degradesDoEspaco: Degrade[];
  aoPrever: (preenchimento: CamadaDePreenchimento) => void;
  aoConfirmar: (preenchimento: CamadaDePreenchimento) => void;
  aoCancelar: () => void;
}) {
  const [p, setP] = useState<CamadaDePreenchimento>(inicial);
  const [editandoDegrade, setEditandoDegrade] = useState(false);
  const padroes = usePadroes();
  useEffect(() => aoPrever(p), [p, aoPrever]);
  const tinta = p.tinta;
  // O ângulo e a escala valem pela linha do documento: mudar um deles solta as alças arrastadas na tela
  const mudarTinta = (nova: Tinta, soltarAlcas = false) => setP((atual) => (soltarAlcas ? { tinta: nova } : { ...atual, tinta: nova }));
  const degrades = [...DEGRADES_PRONTOS.flatMap((pasta) => pasta.degrades), ...degradesDoEspaco];

  if (editandoDegrade && tinta.tipo === "degrade") {
    return (
      <JanelaEditorDeDegrade
        inicial={tinta.degrade}
        doEspaco={degradesDoEspaco}
        primeiroPlano={primeiroPlano}
        fundo={fundo}
        aoFechar={() => setEditandoDegrade(false)}
        aoConfirmar={(degrade) => {
          setEditandoDegrade(false);
          mudarTinta({ ...tinta, degrade });
        }}
        aoSalvar={() => undefined}
      />
    );
  }
  return (
    <Moldura titulo={NOMES_DO_PREENCHIMENTO[tinta.tipo]} aoFechar={aoCancelar} aoConfirmar={() => aoConfirmar(p)}>
      <span className="flex gap-0.5" role="group" aria-label="Conteúdo da camada">
        {(["cor", "degrade", "padrao"] as const).map((tipo) => (
          <button
            key={tipo}
            type="button"
            aria-pressed={tinta.tipo === tipo}
            className={`flex-1 rounded px-1.5 py-1 ${tinta.tipo === tipo ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}
            onClick={() => tinta.tipo !== tipo && setP(preenchimentoNovo(tipo, primeiroPlano, fundo, padroes[0]?.id))}
          >
            {tipo === "cor" ? "Cor sólida" : tipo === "degrade" ? "Degradê" : "Padrão"}
          </button>
        ))}
      </span>
      {tinta.tipo === "cor" ? (
        <label className="flex items-center gap-2 text-suave">
          Cor:
          <input type="color" value={tinta.cor} onChange={(evento) => mudarTinta({ tipo: "cor", cor: evento.currentTarget.value })} className="h-8 w-16 cursor-pointer rounded border border-borda" aria-label="Cor do preenchimento" />
          <span className="tabular-nums text-texto">{tinta.cor}</span>
          <button type="button" className="ml-auto rounded px-1.5 py-0.5 text-suave hover:text-texto" onClick={() => mudarTinta({ tipo: "cor", cor: primeiroPlano })}>
            Primeiro plano
          </button>
        </label>
      ) : null}
      {tinta.tipo === "degrade" ? (
        <>
          <span className="flex items-center gap-2 text-suave">
            Degradê:
            <button type="button" className="flex-1 rounded hover:ring-2 hover:ring-destaque" title="Editar o degradê" aria-label="Editar o degradê" onClick={() => setEditandoDegrade(true)}>
              <AmostraDoDegrade degrade={tinta.degrade} primeiroPlano={primeiroPlano} fundo={fundo} className="h-6 w-full" />
            </button>
          </span>
          <div className="grid max-h-28 grid-cols-6 gap-1 overflow-y-auto" role="group" aria-label="Degradês prontos">
            {degrades.map((degrade, i) => (
              <button key={`${degrade.nome}-${i}`} type="button" title={degrade.nome} aria-label={degrade.nome} className="rounded hover:ring-2 hover:ring-destaque" onClick={() => mudarTinta({ ...tinta, degrade: degradeComCores(degrade, primeiroPlano, fundo) })}>
                <AmostraDoDegrade degrade={degrade} primeiroPlano={primeiroPlano} fundo={fundo} className="h-5 w-full" />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-suave">
            <span className="w-14">Estilo:</span>
            <select className={`${campo} flex-1`} value={tinta.forma} onChange={(evento) => mudarTinta({ ...tinta, forma: evento.currentTarget.value as typeof tinta.forma })} aria-label="Estilo do degradê">
              {FORMAS_DO_DEGRADE.map((forma) => (
                <option key={forma.id} value={forma.id}>
                  {forma.nome}
                </option>
              ))}
            </select>
          </label>
          <Numero rotulo="Ângulo" valor={tinta.angulo} minimo={-180} maximo={180} sufixo="°" aoMudar={(angulo) => mudarTinta({ ...tinta, angulo }, true)} />
          <Numero rotulo="Escala" valor={Math.round(tinta.escala * 100)} minimo={10} maximo={1000} sufixo="%" aoMudar={(escala) => mudarTinta({ ...tinta, escala: escala / 100 }, true)} />
          <span className="flex items-center gap-3">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={tinta.inverter} onChange={(evento) => mudarTinta({ ...tinta, inverter: evento.currentTarget.checked })} />
              Inverter
            </label>
            <button type="button" className="ml-auto rounded px-1.5 py-0.5 text-suave hover:text-texto disabled:opacity-50" disabled={!p.de} onClick={() => setP({ tinta })}>
              Redefinir o alinhamento
            </button>
          </span>
          <p className="text-suave">Com a ferramenta Degradê, arraste no documento para levar o começo e o fim.</p>
        </>
      ) : null}
      {tinta.tipo === "padrao" ? (
        <>
          <div className="grid max-h-28 grid-cols-6 gap-1 overflow-y-auto" role="group" aria-label="Padrões">
            {padroes.map((padrao) => (
              <button
                key={padrao.id}
                type="button"
                title={padrao.nome}
                aria-label={padrao.nome}
                aria-pressed={tinta.padrao === padrao.id}
                className={`rounded border p-0.5 ${tinta.padrao === padrao.id ? "border-destaque ring-1 ring-destaque" : "border-borda hover:border-destaque"}`}
                onClick={() => mudarTinta({ ...tinta, padrao: padrao.id })}
              >
                <AmostraDoPadrao id={padrao.id} />
              </button>
            ))}
          </div>
          <Numero rotulo="Escala" valor={Math.round(tinta.escala * 100)} minimo={10} maximo={1000} sufixo="%" aoMudar={(escala) => mudarTinta({ ...tinta, escala: escala / 100 })} />
        </>
      ) : null}
    </Moldura>
  );
}
