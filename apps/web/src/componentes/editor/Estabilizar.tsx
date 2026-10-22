"use client";

import { useCallback, useEffect, useState } from "react";

import { chamarApi } from "@/lib/api";
import type { Comando } from "@/lib/projeto/comandos";
import { chaveDaEstabilizacao, type Clipe } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

/**
 * Pede ao worker a imagem estável que o clipe usa: sobre a imagem sem ruído quando "Tirar o ruído" está
 * ligado (e pronto), senão sobre a original. Roda na aba Básico e na aba Cor, porque ligar o ruído troca
 * a versão de que o clipe precisa. Devolve o erro do pedido, se houver, e como pedir de novo depois de uma
 * falha (a falha conta como pedida: sem o botão, nada a refazia e a exportação ficava recusada).
 */
export function usePedirImagemEstavel(clipe: Clipe, midia: Midia): { erro: string; pedirDeNovo: () => void } {
  const [erro, setErro] = useState("");
  const limpa = Boolean(clipe.imagem_limpa);
  const chave = chaveDaEstabilizacao(limpa);
  const pedida = Boolean(midia.estabilizacoes?.[chave]);
  // Sobre a sem ruído, só depois de ela ficar pronta (a API recusa antes)
  const podePedir = Boolean(clipe.estabilizar) && !pedida && (!limpa || midia.imagem_limpa?.status === "pronta");
  useEffect(() => {
    if (!podePedir) return;
    let vivo = true;
    chamarApi(`/midias/${midia.id}/estabilizacao`, { metodo: "POST", corpo: { limpa } })
      .then(() => vivo && setErro(""))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível pedir a estabilização agora."));
    return () => {
      vivo = false;
    };
  }, [podePedir, midia.id, limpa]);
  const pedirDeNovo = useCallback(() => {
    setErro("");
    chamarApi(`/midias/${midia.id}/estabilizacao`, { metodo: "POST", corpo: { limpa } }).catch((e: unknown) =>
      setErro(e instanceof Error ? e.message : "Não foi possível pedir a estabilização agora."),
    );
  }, [midia.id, limpa]);
  return { erro, pedirDeNovo };
}

/** Estabilizar (tirar o tremor da câmera): o worker gera a versão estável e a prévia e o render usam ela. */
export function Estabilizar({ clipe, midia, travada, aoExecutar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void }) {
  const { erro: erroDoPedido, pedirDeNovo } = usePedirImagemEstavel(clipe, midia);
  const limpa = Boolean(clipe.imagem_limpa);
  const estado = midia.estabilizacoes?.[chaveDaEstabilizacao(limpa)];
  const esperandoLimpa = limpa && midia.imagem_limpa?.status !== "pronta";
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={Boolean(clipe.estabilizar)}
          disabled={travada}
          onChange={(evento) => aoExecutar({ comando: "clipe.estabilizar", parametros: { clipeIds: [clipe.id], ligar: evento.currentTarget.checked } })}
        />
        <span className="flex-1">Estabilizar (tirar o tremor da câmera)</span>
      </label>
      {clipe.estabilizar ? (
        <p className="mt-1 text-[11px] text-suave" role="status">
          {estado?.status === "pronta"
            ? "Pronto. A imagem fica um pouco ampliada, para não aparecer borda."
            : estado?.status === "erro" || erroDoPedido
              ? `A estabilização falhou: ${erroDoPedido || estado?.erro}`
              : esperandoLimpa
                ? "Esperando a imagem sem ruído ficar pronta para estabilizar sobre ela."
                : "Estabilizando. Até terminar, a prévia mostra a imagem tremida."}
        </p>
      ) : null}
      {clipe.estabilizar && (estado?.status === "erro" || erroDoPedido) ? (
        <button type="button" className="mt-1 text-[11px] text-destaque underline-offset-2 hover:underline" onClick={pedirDeNovo}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}
