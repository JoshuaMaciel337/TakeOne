"use client";

// As janelas do painel Histórico do editor de imagem (ADR 0003, onda 13.15): o instantâneo novo (o nome e o que
// entra nele) e as opções do histórico.
import { useState } from "react";

import { MAXIMO_DE_ESTADOS, type OpcoesDoHistorico } from "@/lib/imagem/opcoesDoHistorico";

import { Moldura } from "./JanelasDePixels";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

export type OrigemDoInstantaneo = "documento" | "mescladas" | "camada";

export function JanelaNovoInstantaneo({ nome, temCamada, aoFechar, aoConfirmar }: { nome: string; temCamada: boolean; aoFechar: () => void; aoConfirmar: (nome: string, de: OrigemDoInstantaneo) => void }) {
  const [texto, setTexto] = useState(nome);
  const [de, setDe] = useState<OrigemDoInstantaneo>("documento");
  const opcoes: { id: OrigemDoInstantaneo; nome: string; desligada?: boolean }[] = [
    { id: "documento", nome: "Documento inteiro" },
    { id: "mescladas", nome: "Camadas mescladas" },
    { id: "camada", nome: "Camada atual", desligada: !temCamada },
  ];
  return (
    <Moldura titulo="Novo instantâneo" aoFechar={aoFechar} aoConfirmar={() => texto.trim() && aoConfirmar(texto.trim(), de)}>
      <label className="flex items-center gap-2">
        Nome:
        <input aria-label="Nome do instantâneo novo" className={`${CAMPO} flex-1`} value={texto} maxLength={60} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setTexto(e.currentTarget.value)} />
      </label>
      <label className="flex items-center gap-2">
        De:
        <select aria-label="De onde vem o instantâneo" className={CAMPO} value={de} onChange={(e) => setDe(e.currentTarget.value as OrigemDoInstantaneo)}>
          {opcoes.map((opcao) => (
            <option key={opcao.id} value={opcao.id} disabled={opcao.desligada}>
              {opcao.nome}
            </option>
          ))}
        </select>
      </label>
      <p className="text-suave">
        {de === "documento" ? "Todas as camadas, como estão." : de === "mescladas" ? "A imagem como aparece, numa camada só." : "Só a camada escolhida (restaurar deixa só ela no documento)."}
      </p>
    </Moldura>
  );
}

export function JanelaOpcoesDoHistorico({ opcoes, aoFechar, aoConfirmar }: { opcoes: OpcoesDoHistorico; aoFechar: () => void; aoConfirmar: (opcoes: OpcoesDoHistorico) => void }) {
  const [valor, setValor] = useState(opcoes);
  const marca = (chave: keyof Omit<OpcoesDoHistorico, "estados">, rotulo: string, dica?: string) => (
    <label className="flex items-start gap-2" title={dica}>
      <input type="checkbox" className="mt-0.5" checked={valor[chave]} onChange={(e) => setValor({ ...valor, [chave]: e.currentTarget.checked })} />
      <span>
        {rotulo}
        {dica ? <span className="block text-suave">{dica}</span> : null}
      </span>
    </label>
  );
  return (
    <Moldura titulo="Opções do histórico" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(valor)}>
      <label className="flex items-center gap-2">
        Estados do histórico:
        <input
          type="number"
          aria-label="Estados do histórico"
          className={`${CAMPO} w-20`}
          min={1}
          max={MAXIMO_DE_ESTADOS}
          value={valor.estados}
          onChange={(e) => setValor({ ...valor, estados: Math.min(MAXIMO_DE_ESTADOS, Math.max(1, Math.round(Number(e.currentTarget.value) || 1))) })}
        />
      </label>
      {marca("primeiroInstantaneo", "Criar o primeiro instantâneo ao abrir")}
      {marca("naoLinear", "Permitir histórico não linear", "Mudar um estado anterior não apaga os que vieram depois: o passo novo entra no fim da lista.")}
      {marca("janelaDoInstantaneo", "Mostrar a janela do instantâneo novo", "Sem ela, o Alt no botão abre a janela.")}
      {marca("visibilidadeDesfazivel", "Mostrar e esconder camadas vira passo do desfazer")}
    </Moldura>
  );
}
