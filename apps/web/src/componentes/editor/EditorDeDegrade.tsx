"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { CORES_DO_DEGRADE, type Degrade, DEGRADE_PADRAO, MEIO_DO_DEGRADE, pintarAmostra } from "@/lib/projeto/gradiente";

import { CampoCor } from "./CampoCor";
import { ControleNumerico } from "./ControleNumerico";

type Props = {
  degrade: Degrade | null;
  /** A cor sólida de agora: vira a primeira cor do degradê ao ligar. */
  corSolida: string;
  desativado?: boolean;
  /** Mostra sem gravar (o arrasto de um controle). */
  aoPrever: (degrade: Degrade | null) => void;
  /** Volta ao que está gravado (o controle foi solto sem mudar nada). */
  aoCancelar: () => void;
  aoConfirmar: (degrade: Degrade | null) => void;
};

const PERTO = 1e-6;

/** Cor sólida ou degradê (lib/projeto/gradiente.ts), com a amostra pintada pela mesma conta do servidor. */
export function EditorDeDegrade({ degrade, corSolida, desativado = false, aoPrever, aoCancelar, aoConfirmar }: Props) {
  const amostra = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // A amostra mostra a sequência das cores, da esquerda para a direita (o ângulo fica no controle)
    if (amostra.current && degrade) pintarAmostra(amostra.current, { ...degrade, tipo: "linear", angulo: 0 });
  }, [degrade]);

  const numero = (chave: "angulo" | "meio", fator: number) => ({
    valor: (degrade?.[chave] ?? 0) * fator,
    desativado,
    aoPrever: (valor: number) => degrade && aoPrever({ ...degrade, [chave]: valor / fator }),
    aoConfirmar: (valor: number) => {
      if (!degrade) return;
      if (Math.abs(valor / fator - degrade[chave]) < PERTO) aoCancelar();
      else aoConfirmar({ ...degrade, [chave]: valor / fator });
    },
  });
  const trocarCor = (i: number, cor: string): Degrade => ({ ...degrade!, cores: degrade!.cores.map((item, j) => (j === i ? cor : item)) });

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Preenchimento">
        {(
          [
            ["solida", "Cor sólida"],
            ["degrade", "Degradê"],
          ] as const
        ).map(([id, nome]) => {
          const ativo = id === "degrade" ? Boolean(degrade) : !degrade;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={ativo}
              disabled={desativado}
              onClick={() => {
                if (ativo) return;
                aoConfirmar(id === "degrade" ? { ...DEGRADE_PADRAO, cores: [corSolida, DEGRADE_PADRAO.cores[1]] } : null);
              }}
              className={`rounded-md border px-2 py-1 text-xs ${ativo ? "border-destaque bg-destaque/10" : "border-borda hover:bg-painel-2"}`}
            >
              {nome}
            </button>
          );
        })}
      </div>
      {degrade ? (
        <>
          <canvas ref={amostra} width={160} height={16} className="h-4 w-full rounded" aria-label="Amostra do degradê" />
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-suave">Formato</span>
            <select
              value={degrade.tipo}
              disabled={desativado}
              onChange={(evento) => aoConfirmar({ ...degrade, tipo: evento.currentTarget.value as Degrade["tipo"] })}
              className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
            >
              <option value="linear">Linear</option>
              <option value="radial">Do centro</option>
            </select>
          </label>
          {degrade.tipo === "linear" ? <ControleNumerico rotulo="Ângulo" minimo={-180} maximo={180} passo={5} sufixo="°" {...numero("angulo", 1)} /> : null}
          <ControleNumerico rotulo="Ponto médio" minimo={MEIO_DO_DEGRADE.minimo * 100} maximo={MEIO_DO_DEGRADE.maximo * 100} sufixo="%" {...numero("meio", 100)} />
          {degrade.cores.map((cor, i) => (
            <div key={i} className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <CampoCor
                  rotulo={`Cor ${i + 1}`}
                  cor={cor}
                  desativado={desativado}
                  aoPrever={(valor) => aoPrever(trocarCor(i, valor))}
                  aoConfirmar={(valor) => aoConfirmar(trocarCor(i, valor))}
                />
              </div>
              {degrade.cores.length > CORES_DO_DEGRADE.minimo ? (
                <button
                  type="button"
                  className="botao-icone mb-0.5 size-6"
                  disabled={desativado}
                  aria-label={`Tirar a cor ${i + 1}`}
                  onClick={() => aoConfirmar({ ...degrade, cores: degrade.cores.filter((_, j) => j !== i) })}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          {degrade.cores.length < CORES_DO_DEGRADE.maximo ? (
            <button
              type="button"
              className="botao-secundario px-3 py-1 text-xs"
              disabled={desativado}
              onClick={() => aoConfirmar({ ...degrade, cores: [...degrade.cores, degrade.cores[degrade.cores.length - 1]] })}
            >
              <Plus className="size-3.5" aria-hidden /> Cor
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
