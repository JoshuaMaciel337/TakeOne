"use client";

import { useEffect, useState } from "react";

import { chamarApi } from "@/lib/api";
import { useConexao } from "@/lib/eventos";
import type { Sistema } from "@/lib/tipos";

const INTERVALO_MS = 30_000;

/** Bolinha com o estado do servidor: se há worker ligado para preparar as mídias. */
export function EstadoServidor() {
  const conexao = useConexao();
  const [sistema, setSistema] = useState<Sistema | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const consultar = () =>
      chamarApi<Sistema>("/sistema")
        .then((dados) => {
          if (cancelado) return;
          setSistema(dados);
          setFalhou(false);
        })
        .catch(() => {
          if (!cancelado) setFalhou(true);
        });
    void consultar();
    const intervalo = setInterval(consultar, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  const workers = sistema?.workers.length ?? 0;
  const [cor, texto] = falhou
    ? ["bg-erro", "Servidor fora do ar"]
    : !sistema
      ? ["bg-suave", "Verificando o servidor"]
      : workers === 0
        ? ["bg-aviso", "Servidor sem worker: as mídias esperam na fila"]
        : ["bg-sucesso", conexao === "ao-vivo" ? "Servidor pronto, ao vivo" : "Servidor pronto"];

  return (
    <span className="inline-flex items-center gap-2 text-xs text-suave" role="status">
      <span className={`size-2 rounded-full ${cor}`} aria-hidden />
      {texto}
    </span>
  );
}
