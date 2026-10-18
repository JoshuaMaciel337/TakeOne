"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { criarForma, FORMAS, type PedidoDeForma } from "@/lib/elementos";
import type { Clipe } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { CampoCor } from "./CampoCor";

type Props = {
  clipe: Clipe;
  midia: Midia & { elemento: PedidoDeForma };
  travada: boolean;
  /** A forma nova (outra imagem) entra no lugar da atual quando ficar pronta. */
  aoTrocarMidia: (clipeIds: string[], midia: Midia) => void;
  aoAvisar: (mensagem: string) => void;
};

/**
 * Cor, contorno e proporção de um clipe de forma. A forma é uma imagem desenhada no servidor: cada mudança
 * pede a imagem nova e troca a do clipe, que guarda posição, tempo, keyframes e animações.
 */
export function SecaoForma({ clipe, midia, travada, aoTrocarMidia, aoAvisar }: Props) {
  const forma = midia.elemento;
  const [espessura, setEspessura] = useState<number | null>(null);
  const [proporcao, setProporcao] = useState<string | null>(null);
  // A cor escolhida enquanto o seletor está aberto: o campo é controlado e voltaria para a cor antiga
  const [cores, setCores] = useState<{ cor?: string; contorno_cor?: string }>({});
  const [pedindo, setPedindo] = useState(false);
  const estica = FORMAS.find((item) => item.tipo === forma.tipo)?.estica ?? false;
  const proporcaoAtual = midia.video ? midia.video.largura / midia.video.altura : 1;

  function pedir(mudanca: Partial<PedidoDeForma>) {
    const pedido = { ...forma, ...mudanca };
    if (!pedido.cor && pedido.contorno <= 0) {
      aoAvisar("Uma forma sem preenchimento precisa de contorno.");
      return;
    }
    setPedindo(true);
    criarForma(pedido)
      .then((nova) => {
        if (nova.id !== midia.id) aoTrocarMidia([clipe.id], nova);
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível mudar a forma agora."))
      .finally(() => {
        setPedindo(false);
        setEspessura(null);
        setProporcao(null);
        setCores({});
      });
  }

  const espessuraNaTela = espessura ?? Math.round(forma.contorno * 100);
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">Forma</span>
        {pedindo ? <LoaderCircle className="size-3.5 animate-spin text-suave" aria-label="Desenhando a forma" /> : null}
      </div>
      <label className="mt-1 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(forma.cor)} disabled={travada || pedindo} onChange={(evento) => pedir({ cor: evento.currentTarget.checked ? "#ffffff" : null })} />
        <span className="flex-1">Preenchida</span>
      </label>
      {forma.cor ? (
        <CampoCor
          rotulo="Cor"
          cor={cores.cor ?? forma.cor}
          desativado={travada || pedindo}
          aoPrever={(cor) => setCores({ ...cores, cor })}
          aoConfirmar={(cor) => cor !== forma.cor && pedir({ cor })}
        />
      ) : null}
      <CampoCor
        rotulo="Contorno"
        cor={cores.contorno_cor ?? forma.contorno_cor}
        desativado={travada || pedindo}
        aoPrever={(contorno_cor) => setCores({ ...cores, contorno_cor })}
        aoConfirmar={(cor) => cor !== forma.contorno_cor && pedir({ contorno_cor: cor, contorno: forma.contorno || 0.04 })}
      />
      <label className="flex items-center gap-2 py-1.5 text-xs">
        <span className="w-24 text-suave">Espessura</span>
        <input
          type="range"
          min={0}
          max={25}
          value={espessuraNaTela}
          disabled={travada || pedindo}
          onChange={(evento) => setEspessura(Number(evento.currentTarget.value))}
          // Só pede a forma nova ao soltar: cada pedido desenha uma imagem
          onPointerUp={() => espessura !== null && pedir({ contorno: espessura / 100 })}
          onKeyUp={() => espessura !== null && pedir({ contorno: espessura / 100 })}
          className="flex-1"
          aria-label="Espessura do contorno"
        />
        <span className="w-9 text-right tabular-nums text-suave">{espessuraNaTela}%</span>
      </label>
      {estica ? (
        <label className="flex items-center gap-2 py-1.5 text-xs">
          <span className="w-24 text-suave">Largura / altura</span>
          <input
            type="number"
            min={0.05}
            max={20}
            step={0.1}
            value={proporcao ?? proporcaoAtual.toFixed(2)}
            disabled={travada || pedindo}
            onChange={(evento) => setProporcao(evento.currentTarget.value)}
            onBlur={() => {
              const valor = Number(proporcao);
              if (proporcao !== null && valor >= 0.05 && valor <= 20 && Math.abs(valor - proporcaoAtual) > 0.01) pedir({ proporcao: valor });
              else setProporcao(null);
            }}
            onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
            className="w-20 rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
          />
        </label>
      ) : null}
    </div>
  );
}
