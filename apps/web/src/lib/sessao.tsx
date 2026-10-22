"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import type { Sessao } from "@/lib/tipos";

type ContextoSessao = {
  sessao: Sessao;
  sair: () => Promise<void>;
};

const Contexto = createContext<ContextoSessao | null>(null);

/**
 * Leva ao login recarregando a página, não pelo roteador: o kit de marca guardado no módulo e os envios
 * esperando nova tentativa são da conta que saiu, e numa navegação suave passavam para quem entrasse depois.
 */
function irParaOLogin(destino: string) {
  window.location.replace(destino);
}

/** Carrega a sessão uma vez para toda a área logada. Se a API recusar, apaga o cookie e volta ao login. */
export function ProvedorSessao({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    chamarApi<Sessao>("/auth/eu")
      .then(setSessao)
      .catch(async (e) => {
        if (e instanceof ErroApi && e.status === 401) {
          await chamarApi("/auth/sair", { metodo: "POST" }).catch(() => undefined);
          irParaOLogin(`/entrar?proximo=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar sua conta.");
      });
  }, []);

  const sair = useCallback(async () => {
    await chamarApi("/auth/sair", { metodo: "POST" }).catch(() => undefined);
    irParaOLogin("/entrar");
  }, []);

  if (!sessao) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-fundo px-4 text-center text-suave">
        {erro || "Carregando..."}
      </div>
    );
  }
  return <Contexto.Provider value={{ sessao, sair }}>{children}</Contexto.Provider>;
}

export function useSessao(): ContextoSessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useSessao precisa estar dentro de ProvedorSessao");
  return contexto;
}
