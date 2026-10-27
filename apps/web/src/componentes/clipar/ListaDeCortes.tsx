"use client";

// A clipagem (ADR 0004, 14.3): o andamento enquanto o TakeOne procura, e depois os cortes, com a nota de 0 a 100,
// as quatro notas com a frase do modelo, o título com as palavras de foco, o resumo, a categoria e os trechos do
// original. Gostei e não gostei ficam guardados. "Abrir no editor" monta o corte num projeto (14.5) e abre.
import { AlertCircle, AlertTriangle, ArrowLeft, Clapperboard, Loader2, RefreshCw, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { ErroApi } from "@/lib/api";
import { projetoDoCorte } from "@/lib/clipar/abrirCorte";
import {
  avaliarCorte,
  CATEGORIAS,
  type Clipagem,
  type Corte,
  CRITERIOS,
  excluirClipagem,
  FAIXAS,
  type Ordem,
  ordenarCortes,
  pedacosDoTitulo,
  verClipagem,
} from "@/lib/clipagens";
import { useEventosJobs } from "@/lib/eventos";
import { formatarTempo } from "@/lib/formatar";
import { useMarca } from "@/lib/marca";

const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "nota", nome: "Maior nota" },
  { id: "video", nome: "Ordem do vídeo" },
  { id: "longos", nome: "Mais longos" },
  { id: "curtos", nome: "Mais curtos" },
];

function corDaNota(nota: number): string {
  if (nota >= 80) return "bg-sucesso/20 text-sucesso";
  if (nota >= 60) return "bg-aviso/20 text-aviso";
  return "bg-painel-3 text-suave";
}

type PropsDoCartao = {
  corte: Corte;
  aoAvaliar: (avaliacao: Corte["avaliacao"]) => void;
  aoAbrir: () => void;
  /** A etapa enquanto este corte é montado; null quando não é ele. */
  abrindo: string | null;
  ocupado: boolean;
};

function CartaoDoCorte({ corte, aoAvaliar, aoAbrir, abrindo, ocupado }: PropsDoCartao) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-4">
      <div className="flex items-start gap-3">
        <span className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-lg font-display text-lg font-bold ${corDaNota(corte.nota)}`} title="Nota de 0 a 100">
          {corte.nota}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">
            {pedacosDoTitulo(corte.titulo, corte.foco).map((pedaco, i) =>
              pedaco.foco ? (
                <mark key={i} className="rounded bg-destaque/20 px-0.5 text-texto">
                  {pedaco.texto}
                </mark>
              ) : (
                <span key={i}>{pedaco.texto}</span>
              ),
            )}
          </p>
          <p className="mt-0.5 text-xs text-suave">
            {CATEGORIAS[corte.categoria] ?? corte.categoria} · {formatarTempo(corte.duracao)} ·{" "}
            {corte.trechos.map((trecho) => `${formatarTempo(trecho.inicio)}–${formatarTempo(trecho.fim)}`).join(" + ")}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className={`botao-icone size-8 ${corte.avaliacao === "gostei" ? "text-sucesso" : ""}`}
            aria-pressed={corte.avaliacao === "gostei"}
            aria-label="Gostei"
            title="Gostei"
            onClick={() => aoAvaliar(corte.avaliacao === "gostei" ? null : "gostei")}
          >
            <ThumbsUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className={`botao-icone size-8 ${corte.avaliacao === "nao_gostei" ? "text-erro" : ""}`}
            aria-pressed={corte.avaliacao === "nao_gostei"}
            aria-label="Não gostei"
            title="Não gostei"
            onClick={() => aoAvaliar(corte.avaliacao === "nao_gostei" ? null : "nao_gostei")}
          >
            <ThumbsDown className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {corte.resumo ? <p className="text-sm text-suave">{corte.resumo}</p> : null}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {CRITERIOS.map((criterio) => (
          <div key={criterio.id} className="text-xs" title={`${criterio.dica} ${corte.motivos[criterio.id] ?? ""}`.trim()}>
            <div className="flex justify-between">
              <span className="text-suave">{criterio.nome}</span>
              <span className="tabular-nums">{corte.notas[criterio.id]}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-painel-3">
              <div className="h-full rounded-full bg-destaque" style={{ width: `${corte.notas[criterio.id] * 10}%` }} />
            </div>
            {corte.motivos[criterio.id] ? <p className="mt-1 line-clamp-2 text-[11px] text-apagado">{corte.motivos[criterio.id]}</p> : null}
          </div>
        ))}
      </div>
      {corte.propaganda ? (
        <p className="flex items-center gap-1.5 text-xs text-aviso">
          <AlertTriangle className="size-3.5" aria-hidden /> Parece ter propaganda ou uma chamada do vídeo original.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="botao-principal" disabled={ocupado} onClick={aoAbrir}>
          {abrindo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Clapperboard className="size-4" aria-hidden />}
          {abrindo ?? (corte.projeto_id ? "Abrir no editor" : "Montar e abrir no editor")}
        </button>
        {!corte.projeto_id && !abrindo ? <span className="text-xs text-suave">Com as legendas, o título, os zooms e o enquadramento em pé.</span> : null}
      </div>
    </li>
  );
}

export function ListaDeCortes({ clipagemId }: { clipagemId: string }) {
  const router = useRouter();
  const [clipagem, setClipagem] = useState<Clipagem | null>(null);
  const [erro, setErro] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("nota");
  const [versao, setVersao] = useState(0);
  const marca = useMarca();
  const [abrindo, setAbrindo] = useState<{ corte: string; etapa: string } | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  useEffect(() => {
    verClipagem(clipagemId)
      .then((doc) => {
        setClipagem(doc);
        setErro("");
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não encontrei a clipagem."));
  }, [clipagemId, versao]);

  // Enquanto processa: os eventos dos jobs (a busca e a transcrição do vídeo) e, por garantia, a cada 5 s
  const processando = clipagem?.status === "processando";
  useEffect(() => {
    if (!processando) return;
    const intervalo = setInterval(() => setVersao((n) => n + 1), 5000);
    return () => clearInterval(intervalo);
  }, [processando]);
  useEventosJobs((job) => {
    if (!clipagem) return;
    if (job.entrada.clipagem_id === clipagem.id || (job.tipo === "transcricao" && job.entrada.midia_id === clipagem.midia_id)) setVersao((n) => n + 1);
  });

  async function avaliar(corte: Corte, avaliacao: Corte["avaliacao"]) {
    if (!clipagem) return;
    setClipagem({ ...clipagem, cortes: clipagem.cortes.map((item) => (item.id === corte.id ? { ...item, avaliacao } : item)) });
    try {
      setClipagem(await avaliarCorte(clipagem.id, corte.id, avaliacao));
    } catch {
      setVersao((n) => n + 1);
    }
  }

  async function abrir(corte: Corte) {
    if (!clipagem || abrindo) return;
    setErro("");
    setAbrindo({ corte: corte.id, etapa: "Preparando" });
    try {
      const id = await projetoDoCorte(clipagem, corte, marca, (etapa) => ativo.current && setAbrindo({ corte: corte.id, etapa }), () => ativo.current);
      if (id && ativo.current) router.push(`/app/editor/${id}`);
    } catch (e) {
      if (ativo.current) setErro(e instanceof Error ? e.message : "Não consegui montar o corte.");
    } finally {
      if (ativo.current) setAbrindo(null);
    }
  }

  async function excluir() {
    if (!clipagem || !window.confirm("Excluir esta clipagem e os cortes dela? O vídeo continua na biblioteca.")) return;
    await excluirClipagem(clipagem.id).catch(() => undefined);
    router.push("/app/clipar");
  }

  if (!clipagem) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-5 py-8">
        {erro ? (
          <p className="flex items-center gap-2 text-erro">
            <AlertCircle className="size-4" aria-hidden /> {erro}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-suave">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
          </p>
        )}
      </main>
    );
  }

  const faixa = FAIXAS.find((item) => item.id === clipagem.opcoes.faixa)?.nome ?? "";
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-8">
      <Link href="/app/clipar" className="inline-flex items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden /> Clipar
      </Link>
      <TituloDaPagina
        titulo={clipagem.nome}
        descricao={`${formatarTempo(clipagem.duracao)} · ${clipagem.status === "pronta" ? `${clipagem.total_de_cortes} cortes` : "procurando os cortes"} · ${faixa}`}
      >
        <Link href={`/app/clipar/novo/${clipagem.midia_id}`} className="botao-secundario">
          <RefreshCw className="size-4" aria-hidden /> Refazer com outras opções
        </Link>
        <button type="button" className="botao-secundario" onClick={() => void excluir()}>
          <Trash2 className="size-4" aria-hidden /> Excluir
        </button>
      </TituloDaPagina>

      {clipagem.status === "processando" ? (
        <section className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-destaque" aria-hidden />
            {clipagem.andamento?.mensagem ?? "Na fila"}
          </p>
          <div className="h-2 rounded-full bg-painel-3">
            <div className="h-full rounded-full bg-destaque transition-all" style={{ width: `${clipagem.andamento?.progresso ?? 0}%` }} />
          </div>
          <p className="text-xs text-suave">
            {clipagem.andamento?.etapa === "transcricao" ? "Primeiro a fala é transcrita; depois o modelo lê e escolhe os momentos." : "O modelo lê a fala em pedaços e escolhe os momentos."} Pode sair
            desta página: os cortes ficam guardados aqui.
          </p>
        </section>
      ) : clipagem.status === "erro" ? (
        <section className="flex flex-col gap-2 rounded-xl border border-erro/40 bg-erro/10 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-erro">
            <AlertCircle className="size-4" aria-hidden /> {clipagem.erro ?? "Não deu para achar os cortes."}
          </p>
          <Link href={`/app/clipar/novo/${clipagem.midia_id}`} className="text-sm text-destaque">
            Tentar com outras opções
          </Link>
        </section>
      ) : (
        <>
          {erro ? (
            <p className="flex items-center gap-2 text-sm text-erro" role="alert">
              <AlertCircle className="size-4" aria-hidden /> {erro}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-suave">Ordenar:</span>
            {ORDENS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={ordem === item.id}
                onClick={() => setOrdem(item.id)}
                className={`rounded-lg border px-2.5 py-1 ${ordem === item.id ? "border-destaque bg-destaque/15" : "border-borda text-suave hover:text-texto"}`}
              >
                {item.nome}
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-3">
            {ordenarCortes(clipagem.cortes, ordem).map((corte) => (
              <CartaoDoCorte
                key={corte.id}
                corte={corte}
                aoAvaliar={(avaliacao) => void avaliar(corte, avaliacao)}
                aoAbrir={() => void abrir(corte)}
                abrindo={abrindo?.corte === corte.id ? abrindo.etapa : null}
                ocupado={abrindo !== null}
              />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
