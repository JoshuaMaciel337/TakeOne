"use client";

import { Check, Copy, Link2, LoaderCircle, LogOut, MessageCircle, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { chamarApi, ErroApi } from "@/lib/api";
import { useSessao } from "@/lib/sessao";
import type { Espaco, MembroDoEspaco } from "@/lib/tipos";

type Convite = { ativo: boolean; expira_em: string | null; caminho: string | null };

function formatarValidade(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Quem trabalha no espaço da vez. O dono chama pelo link e tira pessoas; quem é membro pode sair. */
export default function PaginaEquipe() {
  const { sessao } = useSessao();
  const dono = sessao.usuario.papel === "dono";
  const [membros, setMembros] = useState<MembroDoEspaco[] | null>(null);
  const [convite, setConvite] = useState<Convite | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    chamarApi<MembroDoEspaco[]>("/espacos/atual/membros")
      .then(setMembros)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar a equipe."));
    if (dono) chamarApi<Convite>("/espacos/atual/convite").then(setConvite).catch(() => undefined);
  }, [dono]);

  const link = convite?.caminho ? `${window.location.origin}${convite.caminho}` : "";

  function gerar() {
    setErro("");
    setCopiado(false);
    chamarApi<Convite>("/espacos/atual/convite", { metodo: "POST" })
      .then(setConvite)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível gerar o link."));
  }

  function desligar() {
    chamarApi("/espacos/atual/convite", { metodo: "DELETE" })
      .then(() => setConvite({ ativo: false, expira_em: null, caminho: null }))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível desligar o link."));
  }

  function tirar(membro: MembroDoEspaco) {
    if (!window.confirm(`Tirar ${membro.nome} do espaço? A pessoa deixa de ver os projetos e as mídias daqui.`)) return;
    chamarApi(`/espacos/atual/membros/${membro.id}`, { metodo: "DELETE" })
      .then(() => setMembros((lista) => lista?.filter((m) => m.id !== membro.id) ?? lista))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível tirar a pessoa."));
  }

  async function sair() {
    if (!window.confirm(`Sair de ${sessao.organizacao.nome}? Para voltar, você vai precisar de um convite novo.`)) return;
    try {
      await chamarApi(`/espacos/atual/membros/${sessao.usuario.id}`, { metodo: "DELETE" });
      const espacos = await chamarApi<Espaco[]>("/espacos");
      const proprio = espacos.find((espaco) => espaco.papel === "dono");
      if (proprio) await chamarApi(`/espacos/${proprio.id}/usar`, { metodo: "POST" });
      // Recarrega: o kit de marca e as listas guardadas são do espaço que ficou para trás
      window.location.replace("/app");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível sair do espaço.");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setErro("Não foi possível copiar. Selecione o link e copie.");
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Equipe"
        descricao={`Quem trabalha em ${sessao.organizacao.nome}: todos veem e editam os mesmos projetos, mídias, modelos e o kit de marca. Quando duas pessoas editam o mesmo projeto, o editor avisa antes de uma passar por cima da outra.`}
      />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}

      {dono ? (
        <section className="flex flex-col gap-3 rounded-xl border border-borda bg-painel-2 p-4" data-convite-equipe>
          <h2 className="text-sm font-semibold">Chamar alguém</h2>
          <p className="text-xs text-suave">
            Mande o link para quem já tem conta no TakeOne: a pessoa entra neste espaço sem perder o dela e troca de espaço pelo menu. Quem ainda não tem conta precisa antes de um convite do
            TakeOne.
          </p>
          {link ? (
            <div className="flex flex-col gap-2 rounded-md border border-borda bg-painel p-3">
              <code className="break-all text-xs" data-link-equipe>
                {link}
              </code>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void copiar()} className="botao-secundario px-3 py-1.5 text-xs">
                  {copiado ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copiado ? "Copiado" : "Copiar o link"}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Entre no meu espaço do TakeOne: ${link}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao-secundario px-3 py-1.5 text-xs"
                >
                  <MessageCircle className="size-3.5" aria-hidden /> Mandar pelo WhatsApp
                </a>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button type="button" onClick={gerar} className="botao-principal px-3 py-1.5 text-xs">
              <Link2 className="size-3.5" aria-hidden /> {convite?.ativo ? "Gerar outro link" : "Gerar o link"}
            </button>
            {convite?.ativo && convite.expira_em ? (
              <>
                <span className="text-suave">
                  {link ? "Vale" : "Há um link valendo"} até {formatarValidade(convite.expira_em)}
                  {link ? "; gerar outro desliga este." : " (ele só aparece quando é gerado)."}
                </span>
                <button type="button" onClick={desligar} className="text-suave underline hover:text-texto">
                  Desligar o link
                </button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Pessoas {membros ? `(${membros.length})` : ""}</h2>
        {membros === null && !erro ? <LoaderCircle className="size-5 animate-spin text-suave" aria-label="Carregando" /> : null}
        {membros ? (
          <ul className="flex flex-col divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-painel-2">
            {membros.map((membro) => (
              <li key={membro.id} className="flex items-center gap-3 px-4 py-3" data-membro={membro.papel}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {membro.nome}
                    {membro.id === sessao.usuario.id ? <span className="text-suave"> (você)</span> : null}
                  </p>
                  <p className="truncate text-xs text-suave">
                    {membro.email} · {membro.papel === "dono" ? "dono" : "membro"}
                  </p>
                </div>
                {dono && membro.papel !== "dono" ? (
                  <button type="button" onClick={() => tirar(membro)} className="botao-secundario px-3 py-1.5 text-xs">
                    <UserMinus className="size-3.5" aria-hidden /> Tirar
                  </button>
                ) : null}
                {!dono && membro.id === sessao.usuario.id ? (
                  <button type="button" onClick={() => void sair()} className="botao-secundario px-3 py-1.5 text-xs">
                    <LogOut className="size-3.5" aria-hidden /> Sair do espaço
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {membros && membros.length === 1 && dono ? <p className="text-xs text-suave">Por enquanto, só você. Gere o link acima para chamar alguém.</p> : null}
      </section>
    </main>
  );
}
