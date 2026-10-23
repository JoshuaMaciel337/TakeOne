"use client";

import { Box, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { chamarApi } from "@/lib/api";
import type { Clipe } from "@/lib/projeto/modelo";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

/** Os movimentos da câmera (core/utils/foto_ia.py). */
const MOVIMENTOS = [
  { id: "aproximar", nome: "Aproximar" },
  { id: "afastar", nome: "Afastar" },
  { id: "lado", nome: "De um lado ao outro" },
  { id: "circular", nome: "Em círculo" },
] as const;
const DURACAO = { minimo: 2, maximo: 10 };

type Props = {
  clipe: Clipe;
  midia: Midia;
  travada: boolean;
  /** O vídeo pedido entra no lugar da foto do clipe quando ficar pronto (o Editor espera a biblioteca). */
  aoPedir: (clipeId: string, midia: Midia) => void;
  aoAvisar: (mensagem: string) => void;
};

/**
 * Foto em 3D, na aba Básico de uma foto: o worker mede a profundidade e grava um vídeo com a câmera andando, a frente
 * mais que o fundo. O vídeo dura o clipe (de 2 a 10 s) e entra no lugar da foto, com a posição e o resto do clipe.
 */
export function FotoEm3D({ clipe, midia, travada, aoPedir, aoAvisar }: Props) {
  const [movimento, setMovimento] = useState<(typeof MOVIMENTOS)[number]["id"]>("aproximar");
  const [pedindo, setPedindo] = useState(false);
  const duracao = Math.min(DURACAO.maximo, Math.max(DURACAO.minimo, Math.round((clipe.duracao / TICKS_POR_SEGUNDO) * 10) / 10));

  function pedir() {
    setPedindo(true);
    chamarApi<Midia>(`/midias/${midia.id}/foto-3d`, { metodo: "POST", corpo: { movimento, duracao } })
      .then((nova) => {
        aoPedir(clipe.id, nova);
        aoAvisar("Criando a foto em 3D: o vídeo entra no lugar da foto quando ficar pronto.");
      })
      .catch((e: unknown) => aoAvisar(e instanceof Error ? e.message : "Não foi possível pedir a foto em 3D agora."))
      .finally(() => setPedindo(false));
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 text-xs">
      <span className="font-medium">Foto em 3D</span>
      <p className="text-[11px] text-suave">A foto vira um vídeo de {duracao.toLocaleString("pt-BR")} s com a câmera andando pela profundidade dela: o que está perto anda mais que o fundo.</p>
      <div className="flex items-center gap-2">
        <select
          value={movimento}
          disabled={travada || pedindo}
          onChange={(evento) => setMovimento(evento.currentTarget.value as typeof movimento)}
          aria-label="Movimento da câmera"
          className="min-w-0 flex-1 rounded-md border border-borda bg-painel px-2 py-1"
        >
          {MOVIMENTOS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
        <button type="button" className="botao-secundario px-2 py-1 text-xs" disabled={travada || pedindo} onClick={pedir}>
          {pedindo ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Box className="size-3.5" aria-hidden />}
          Criar
        </button>
      </div>
    </div>
  );
}
