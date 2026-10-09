"use client";

import { ProvedorEnvios } from "@/lib/envios";
import { ProvedorEventos } from "@/lib/eventos";
import { ProvedorSessao } from "@/lib/sessao";

// Fica montado ao trocar de página: a sessão, a conexão de eventos e os envios em andamento continuam.
export default function LayoutApp({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProvedorSessao>
      <ProvedorEventos>
        <ProvedorEnvios>{children}</ProvedorEnvios>
      </ProvedorEventos>
    </ProvedorSessao>
  );
}
