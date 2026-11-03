"use client";

import { LoaderCircle, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { chamarApi, ErroApi } from "@/lib/api";
import { useSessao } from "@/lib/sessao";

type ConviteAberto = { espaco: string; dono: string; ja_faz_parte: boolean };

/** O link que o dono de um espaço mandou: quem já entrou na conta confirma e passa a trabalhar no espaço dele. */
export default function PaginaConvite() {
  const { token } = useParams<{ token: string }>();
  const { sessao } = useSessao();
  const [convite, setConvite] = useState<ConviteAberto | null>(null);
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    chamarApi<ConviteAberto>(`/espacos/convite/${token}`)
      .then(setConvite)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível abrir o convite."));
  }, [token]);

  function entrar() {
    setEntrando(true);
    setErro("");
    chamarApi(`/espacos/convite/${token}`, { metodo: "POST" })
      // Recarrega: o kit de marca e as listas guardadas são do espaço de antes
      .then(() => window.location.replace("/app"))
      .catch((e) => {
        setErro(e instanceof ErroApi ? e.message : "Não foi possível entrar no espaço.");
        setEntrando(false);
      });
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 py-16">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {!convite && !erro ? <LoaderCircle className="size-5 animate-spin text-suave" aria-label="Carregando" /> : null}
      {convite ? (
        <section className="flex flex-col items-start gap-4 rounded-xl border border-borda bg-painel-2 p-6">
          <span className="flex size-10 items-center justify-center rounded-full bg-destaque/15 text-destaque">
            <Users className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold">{convite.espaco}</h1>
            <p className="mt-1 text-sm text-suave">
              {convite.ja_faz_parte
                ? "Você já faz parte deste espaço."
                : `${convite.dono || "O dono do espaço"} chamou você para trabalhar neste espaço. Você continua com o seu (${sessao.organizacao.nome}) e troca de espaço pelo menu.`}
            </p>
          </div>
          <button type="button" onClick={entrar} disabled={entrando} className="botao-principal px-4 py-2 text-sm">
            {convite.ja_faz_parte ? "Ir para o espaço" : "Entrar no espaço"}
          </button>
          <p className="text-xs text-suave">Entrando como {sessao.usuario.email}.</p>
        </section>
      ) : null}
    </main>
  );
}
