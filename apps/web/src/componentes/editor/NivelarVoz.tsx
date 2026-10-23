"use client";

import { AudioLines, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { FORCA_PADRAO, mudarForca, type Nivelamento, nivelamentoDaVoz } from "@/lib/projeto/nivelar";

import { ControleNumerico } from "./ControleNumerico";

type Props = {
  clipe: Clipe;
  faixa: Faixa;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

// Os níveis de cada mídia mudam só numa nova ingestão: lidos uma vez por página
const niveisLidos = new Map<string, Promise<Int8Array>>();
function lerNiveis(midiaId: string): Promise<Int8Array> {
  let pedido = niveisLidos.get(midiaId);
  if (!pedido) {
    pedido = fetch(arquivoDaMidia(midiaId, "niveis.bin"), { credentials: "same-origin" })
      .then((resposta) => (resposta.ok ? resposta.arrayBuffer() : Promise.reject(new Error("Os níveis desta mídia não estão disponíveis. Envie de novo para medir."))))
      .then((dados) => new Int8Array(dados));
    pedido.catch(() => niveisLidos.delete(midiaId));
    niveisLidos.set(midiaId, pedido);
  }
  return pedido;
}

/**
 * Nivelar a voz, na aba Áudio: os trechos falados mais baixo sobem e os mais altos descem (lib/projeto/nivelar.ts),
 * pelos níveis que a ingestão já mediu. A força muda a curva gravada sem ler os níveis de novo.
 */
export function NivelarVoz({ clipe, faixa, aoPrever, aoExecutar, aoAvisar }: Props) {
  const [lendo, setLendo] = useState(false);
  const [forca, setForca] = useState(clipe.nivelamento?.forca ?? FORCA_PADRAO);
  const nivelamento = clipe.nivelamento;
  const travada = faixa.travada;
  const comando = (valor: Nivelamento | null): Comando => ({ comando: "clipe.nivelar", parametros: { clipeId: clipe.id, nivelamento: valor } });

  function nivelar() {
    if (!clipe.midia_id) return;
    setLendo(true);
    lerNiveis(clipe.midia_id)
      .then((niveis) => {
        const curva = nivelamentoDaVoz(clipe, niveis, forca);
        if (!curva) {
          aoAvisar(clipe.curva_velocidade?.length ? "Clipe com velocidade em curva não nivela." : "Não achei fala neste clipe para nivelar.");
          return;
        }
        aoExecutar(comando(curva));
        aoAvisar("A fala deste clipe agora fica num volume só. Ctrl+Z desfaz.");
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível nivelar agora."))
      .finally(() => setLendo(false));
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <ControleNumerico
        rotulo="Força"
        valor={(nivelamento?.forca ?? forca) * 100}
        minimo={10}
        maximo={100}
        passo={5}
        sufixo="%"
        desativado={travada}
        aoPrever={(valor) => (nivelamento ? aoPrever(comando(mudarForca(nivelamento, valor / 100))) : setForca(valor / 100))}
        aoConfirmar={(valor) => {
          setForca(valor / 100);
          if (!nivelamento) return;
          if (Math.abs(valor / 100 - nivelamento.forca) < 1e-6) aoPrever(null);
          else aoExecutar(comando(mudarForca(nivelamento, valor / 100)));
        }}
      />
      <div className="flex gap-1.5">
        <button type="button" className="botao-secundario flex-1 px-3 py-1.5 text-xs" disabled={travada || lendo} onClick={nivelar}>
          {lendo ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <AudioLines className="size-4" aria-hidden />}
          {nivelamento ? "Refazer o nivelamento" : "Nivelar a voz"}
        </button>
        {nivelamento ? (
          <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={travada} onClick={() => aoExecutar(comando(null))}>
            Tirar
          </button>
        ) : null}
      </div>
      <p className="text-[11px] text-suave">Sobe os trechos falados mais baixo e desce os mais altos, até 12 dB. O silêncio fica como está.</p>
    </div>
  );
}
