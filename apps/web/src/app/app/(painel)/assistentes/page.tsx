"use client";

import { Copy, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { chamarApi, ErroApi } from "@/lib/api";
import { formatarQuando } from "@/lib/formatar";

type Chave = { id: string; nome: string; inicio: string; criado_em: string; usado_em: string | null };

/** A configuração de um cliente MCP (Claude Desktop, Claude Code) para o servidor do TakeOne, com a chave dada. */
function configuracao(chave: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        takeone: {
          command: "python",
          args: ["apps/servidor_mcp/servidor.py"],
          env: { TAKEONE_URL: "http://localhost:8010", TAKEONE_CHAVE: chave },
        },
      },
    },
    null,
    2,
  );
}

/** Chaves de acesso para assistentes (o servidor MCP) e outros programas da própria pessoa. */
export default function PaginaAssistentes() {
  const [chaves, setChaves] = useState<Chave[] | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("Assistente");
  const [nova, setNova] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    chamarApi<Chave[]>("/chaves")
      .then(setChaves)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as chaves."));
  }, []);

  function criar() {
    setCriando(true);
    setErro("");
    chamarApi<Chave & { chave: string }>("/chaves", { metodo: "POST", corpo: { nome: nome.trim() || "Assistente" } })
      .then((criada) => {
        setNova(criada.chave);
        setCopiado(false);
        setChaves((lista) => [criada, ...(lista ?? [])]);
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível criar a chave."))
      .finally(() => setCriando(false));
  }

  function apagar(id: string) {
    chamarApi(`/chaves/${id}`, { metodo: "DELETE" })
      .then(() => setChaves((lista) => lista?.filter((chave) => chave.id !== id) ?? lista))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível apagar a chave."));
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Assistentes"
        descricao="Ligue um assistente (pelo protocolo MCP) ao TakeOne: ele vê seus projetos e mídias, monta vídeos na linha do tempo e exporta, com as mesmas permissões que você."
      />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}

      <section className="flex flex-col gap-3 rounded-xl border border-borda bg-painel-2 p-4">
        <h2 className="text-sm font-semibold">Criar uma chave de acesso</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={nome}
            onChange={(evento) => setNome(evento.currentTarget.value)}
            maxLength={60}
            aria-label="Nome da chave"
            className="min-w-0 flex-1 rounded-md border border-borda bg-painel px-3 py-1.5 text-sm"
          />
          <button type="button" className="botao-principal px-3 py-1.5 text-sm" disabled={criando} onClick={criar}>
            {criando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
            Criar chave
          </button>
        </div>
        {nova ? (
          <div className="flex flex-col gap-2 rounded-lg border border-destaque/50 bg-destaque/5 p-3">
            <p className="text-xs">Copie agora: a chave inteira não aparece de novo. Quem tiver ela entra no seu espaço.</p>
            <code className="break-all rounded bg-painel px-2 py-1 text-xs">{nova}</code>
            <p className="text-xs text-suave">No cliente MCP (por exemplo, a configuração do Claude Desktop), na pasta do TakeOne e com o pacote do servidor instalado (pip install -r apps/servidor_mcp/requirements.txt):</p>
            <pre className="overflow-x-auto rounded bg-painel p-2 text-[11px] leading-relaxed">{configuracao(nova)}</pre>
            <button
              type="button"
              className="botao-secundario self-start px-3 py-1.5 text-xs"
              onClick={() => void navigator.clipboard.writeText(configuracao(nova)).then(() => setCopiado(true))}
            >
              <Copy className="size-3.5" aria-hidden />
              {copiado ? "Copiado" : "Copiar a configuração"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Suas chaves</h2>
        {chaves === null && !erro ? <LoaderCircle className="size-5 animate-spin text-suave" aria-label="Carregando" /> : null}
        {chaves && !chaves.length ? <p className="text-sm text-suave">Nenhuma chave ainda.</p> : null}
        {chaves?.length ? (
          <ul className="flex flex-col divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-painel-2">
            {chaves.map((chave) => (
              <li key={chave.id} className="flex items-center gap-3 p-3">
                <KeyRound className="size-4 shrink-0 text-suave" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{chave.nome}</p>
                  <p className="text-xs text-suave">
                    {chave.inicio}… · criada {formatarQuando(chave.criado_em)}
                    {chave.usado_em ? ` · usada ${formatarQuando(chave.usado_em)}` : " · nunca usada"}
                  </p>
                </div>
                <button type="button" className="botao-icone" onClick={() => apagar(chave.id)} aria-label={`Apagar a chave ${chave.nome}`} title="Apagar (o programa que usa para de entrar)">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
