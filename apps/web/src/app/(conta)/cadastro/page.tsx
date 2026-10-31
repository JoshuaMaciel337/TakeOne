"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { CampoTexto } from "@/componentes/CampoTexto";
import { chamarApi, ErroApi } from "@/lib/api";
import type { Sessao } from "@/lib/tipos";

export default function PaginaCadastro() {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Com o site aberto na internet, o cadastro pede um convite (o link traz o código: /cadastro?convite=...)
  const [convite, setConvite] = useState<{ pedido: boolean; codigo: string }>({ pedido: false, codigo: "" });

  useEffect(() => {
    chamarApi<{ so_com_convite: boolean }>("/auth/cadastro")
      .then((r) => setConvite({ pedido: r.so_com_convite, codigo: new URLSearchParams(window.location.search).get("convite") ?? "" }))
      .catch(() => undefined);
  }, []);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setErro("");
    setEnviando(true);
    try {
      await chamarApi<Sessao>("/auth/cadastro", {
        metodo: "POST",
        corpo: {
          nome: dados.get("nome"),
          email: dados.get("email"),
          senha: dados.get("senha"),
          nome_organizacao: dados.get("nome_organizacao") || null,
          convite: dados.get("convite") || null,
        },
      });
      router.replace("/app");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível criar a conta. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold">Criar conta</h1>
      <p className="mt-1 text-sm text-suave">Seus projetos e mídias ficam salvos no seu espaço.</p>
      <form onSubmit={enviar} className="mt-6 flex flex-col gap-4" noValidate>
        <CampoTexto rotulo="Seu nome" name="nome" autoComplete="name" required />
        <CampoTexto rotulo="E-mail" name="email" type="email" autoComplete="email" required />
        <CampoTexto
          rotulo="Senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={8}
          dica="Pelo menos 8 caracteres."
          required
        />
        <CampoTexto
          rotulo="Nome do espaço (opcional)"
          name="nome_organizacao"
          autoComplete="organization"
          dica="Seu canal, produtora ou empresa."
        />
        {convite.pedido ? (
          <CampoTexto
            key={convite.codigo}
            rotulo="Código do convite"
            name="convite"
            autoComplete="off"
            defaultValue={convite.codigo}
            dica="Por enquanto o TakeOne está aberto só para convidados."
            required
          />
        ) : null}
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        <button type="submit" className="botao-principal mt-2 w-full" disabled={enviando}>
          {enviando ? "Criando conta..." : "Criar conta"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-suave">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-destaque hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
