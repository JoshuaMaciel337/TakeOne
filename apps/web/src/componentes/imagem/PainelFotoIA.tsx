"use client";

import { Expand, LoaderCircle, ZoomIn } from "lucide-react";
import { useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { chamarApi } from "@/lib/api";
import type { Midia } from "@/lib/tipos";

/** O maior lado da foto ampliada (core/utils/foto_ia.py, LADO_MAXIMO). */
const LADO_MAXIMO = 4096;
/** A parte nova pode ter no máximo o dobro da foto (AREA_NOVA_MAXIMA). */
const AREA_NOVA_MAXIMA = 2;
const PROPORCOES = ["9:16", "4:5", "1:1", "4:3", "16:9"] as const;

type Props = {
  /** A foto da camada escolhida; null sem camada de foto. */
  foto: Midia | null;
  /** O tamanho do quadro do projeto, em pixels: a primeira proporção oferecida. */
  quadro: { largura: number; altura: number };
  /** A foto ampliada troca a da camada; a expandida entra numa camada nova (o Editor espera a biblioteca). */
  aoPedir: (acao: "ampliar" | "expandir", midia: Midia) => void;
};

const PASSA_DO_DOBRO = "A parte nova passaria do dobro da foto.";

function razao(proporcao: string): number {
  const [largura, altura] = proporcao.split(":").map(Number);
  return largura / altura;
}

function maiorDivisor(a: number, b: number): number {
  return b ? maiorDivisor(b, a % b) : a;
}

/** O tamanho da foto ampliada `fator` vezes, sem passar de LADO_MAXIMO (tamanho_ampliado). */
export function tamanhoAmpliado(largura: number, altura: number, fator: number): [number, number] {
  const escala = Math.min(fator, LADO_MAXIMO / Math.max(largura, altura));
  return [Math.max(1, Math.round(largura * escala)), Math.max(1, Math.round(altura * escala))];
}

/** Por que a foto não expande para a proporção (conferir_expansao), ou null. */
export function problemaDaExpansao(largura: number, altura: number, proporcao: number): string | null {
  const [novaL, novaA] = largura / altura < proporcao ? [Math.max(largura, Math.round(altura * proporcao)), altura] : [largura, Math.max(altura, Math.round(largura / proporcao))];
  const acrescimo = (novaL * novaA) / (largura * altura) - 1;
  if (acrescimo < 0.01) return "Já está nessa proporção.";
  if (acrescimo > AREA_NOVA_MAXIMA) return PASSA_DO_DOBRO;
  return null;
}

/** Ferramenta Foto com IA: ampliar a foto (2× ou 4×) e expandir até outra proporção, inventando o que falta em volta. */
export function PainelFotoIA({ foto, quadro, aoPedir }: Props) {
  const [pedindo, setPedindo] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  if (!foto?.video) return <p className="text-xs text-suave">Selecione uma camada de foto (na prévia ou na lista de camadas).</p>;
  const { largura, altura } = foto.video;
  const divisor = maiorDivisor(quadro.largura, quadro.altura);
  const doQuadro = `${quadro.largura / divisor}:${quadro.altura / divisor}`;
  const proporcoes = [doQuadro, ...PROPORCOES.filter((p) => p !== doQuadro)];

  function pedir(acao: "ampliar" | "expandir", corpo: object, chave: string) {
    if (!foto) return;
    setPedindo(chave);
    setErro("");
    chamarApi<Midia>(`/midias/${foto.id}/${acao}`, { metodo: "POST", corpo })
      .then((nova) => aoPedir(acao, nova))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível pedir agora."))
      .finally(() => setPedindo(null));
  }

  return (
    <div className="flex flex-col gap-4 text-xs">
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <ZoomIn className="size-3.5" aria-hidden /> Ampliar
        </h3>
        <p className="text-[11px] text-suave">
          A foto fica maior e mais nítida (hoje, {largura} × {altura}). Ela troca a da camada, no mesmo lugar.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {[2, 4].map((fator) => {
            const [l, a] = tamanhoAmpliado(largura, altura, fator);
            const maxima = Math.max(largura, altura) >= LADO_MAXIMO;
            return (
              <button
                key={fator}
                type="button"
                className="botao-secundario flex-col px-2 py-1.5 text-xs"
                disabled={pedindo !== null || maxima || (fator === 4 && l === tamanhoAmpliado(largura, altura, 2)[0])}
                onClick={() => pedir("ampliar", { fator }, `ampliar${fator}`)}
              >
                {pedindo === `ampliar${fator}` ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
                <span>{fator}×</span>
                <span className="text-[10px] text-suave">
                  {l} × {a}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Expand className="size-3.5" aria-hidden /> Expandir
        </h3>
        <p className="text-[11px] text-suave">A foto vai para o meio de uma tela de outra proporção, e a IA inventa o que falta em volta. O resultado entra numa camada nova.</p>
        <div className="grid grid-cols-3 gap-1.5">
          {proporcoes.map((proporcao) => {
            const problema = problemaDaExpansao(largura, altura, razao(proporcao));
            return (
              <button
                key={proporcao}
                type="button"
                className="botao-secundario flex-col px-1 py-1.5 text-xs"
                disabled={pedindo !== null || Boolean(problema)}
                title={problema ?? undefined}
                onClick={() => pedir("expandir", { proporcao }, `expandir${proporcao}`)}
              >
                {pedindo === `expandir${proporcao}` ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
                <span>{proporcao === doQuadro ? "Do quadro" : proporcao}</span>
                {proporcao === doQuadro ? <span className="text-[10px] text-suave">{proporcao}</span> : null}
              </button>
            );
          })}
        </div>
        {proporcoes.some((proporcao) => problemaDaExpansao(largura, altura, razao(proporcao)) === PASSA_DO_DOBRO) ? (
          <p className="text-[11px] text-suave">As proporções apagadas inventariam mais que o dobro da foto: escolha uma mais perto da dela.</p>
        ) : null}
      </section>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <p className="text-[11px] text-suave">As fotos novas ficam também na biblioteca; a original não muda.</p>
    </div>
  );
}
