"use client";

// Adaptado da página de aprovação do HolyCut, com as anotações nos instantes do vídeo.
import { Check, CircleAlert, MessageSquarePlus, MessageSquareText, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BotaoTema } from "@/componentes/BotaoTema";
import { Logo } from "@/componentes/Logo";
import { chamarApi, ErroApi } from "@/lib/api";
import { formatarTempo } from "@/lib/formatar";
import type { AprovacaoPublica } from "@/lib/tipos";

const CHAVE_DO_NOME = "takeone-aprovador";
const CAMPO = "rounded-lg border border-borda bg-fundo px-3.5 py-2.5 text-texto outline-none transition placeholder:text-suave/60 focus:border-destaque focus:ring-2 focus:ring-destaque/25";

function lerNomeGuardado(): string {
  try {
    return window.localStorage.getItem(CHAVE_DO_NOME) ?? "";
  } catch {
    return "";
  }
}

function guardarNome(nome: string) {
  try {
    window.localStorage.setItem(CHAVE_DO_NOME, nome);
  } catch {
    // sem armazenamento no navegador: só não lembra o nome da próxima vez
  }
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/** A página do link de aprovação: quem recebeu assiste, anota nos instantes e responde, sem conta. */
export default function PaginaAprovar() {
  const { token } = useParams<{ token: string }>();
  const [pedido, setPedido] = useState<AprovacaoPublica | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [comentario, setComentario] = useState("");
  const [pedindoAjuste, setPedindoAjuste] = useState(false);
  const [anotando, setAnotando] = useState<{ tempo: number; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const midia = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  useEffect(() => {
    chamarApi<AprovacaoPublica>(`/aprovar/${token}`)
      .then((dados) => {
        setPedido(dados);
        setNome(lerNomeGuardado() || dados.aprovacao.para);
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível abrir o vídeo."));
  }, [token]);

  async function enviar(caminho: string, metodo: "POST" | "DELETE", corpo?: object): Promise<boolean> {
    setEnviando(true);
    setErro("");
    try {
      setPedido(await chamarApi<AprovacaoPublica>(`/aprovar/${token}${caminho}`, { metodo, corpo }));
      if (nome.trim()) guardarNome(nome.trim());
      return true;
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível enviar.");
      return false;
    } finally {
      setEnviando(false);
    }
  }

  function comecarAnotacao() {
    const elemento = midia.current;
    elemento?.pause();
    setAnotando({ tempo: elemento?.currentTime ?? 0, texto: "" });
  }

  async function salvarAnotacao() {
    if (!anotando) return;
    if (await enviar("/anotacoes", "POST", { tempo: anotando.tempo, texto: anotando.texto.trim(), nome: nome.trim() })) setAnotando(null);
  }

  function irPara(tempo: number) {
    const elemento = midia.current;
    if (!elemento) return;
    elemento.currentTime = tempo;
    elemento.pause();
  }

  const aprovacao = pedido?.aprovacao;
  const anotacoes = aprovacao?.anotacoes ?? [];
  const respondido = aprovacao && aprovacao.status !== "pendente";
  const aberto = aprovacao && !respondido && !aprovacao.expirada;
  const arquivo = `/api/aprovar/${token}/arquivo`;
  const temTempo = pedido && ["mp4", "m4a", "wav"].includes(pedido.formato);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <Logo tamanho={28} />
        <BotaoTema />
      </div>
      {!pedido ? (
        <p className={erro ? "rounded-lg border border-erro/40 bg-erro/10 px-4 py-3 text-sm text-erro" : "text-sm text-suave"}>{erro || "Carregando o vídeo…"}</p>
      ) : (
        <main className="flex flex-col gap-5">
          <div>
            <p className="text-sm text-suave">{pedido.espaco ? `${pedido.espaco} pede a sua aprovação` : "Pedem a sua aprovação"}</p>
            <h1 className="mt-1 font-display text-2xl font-bold">{pedido.nome}</h1>
            {pedido.duracao ? <p className="text-sm text-suave">{formatarTempo(pedido.duracao)}</p> : null}
          </div>

          {aprovacao?.expirada ? (
            <p className="rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">Este link expirou em {formatarData(aprovacao.expira_em)}. Peça um novo a quem enviou.</p>
          ) : pedido.formato === "gif" || pedido.formato === "png" ? (
            // eslint-disable-next-line @next/next/no-img-element -- o arquivo vem do link, sem otimização
            <img src={arquivo} alt={pedido.nome} width={pedido.largura} height={pedido.altura} className="mx-auto h-auto max-h-[70vh] w-auto max-w-full rounded-xl bg-black" />
          ) : pedido.formato === "m4a" || pedido.formato === "wav" ? (
            <audio ref={midia} src={arquivo} controls preload="metadata" className="w-full" />
          ) : (
            <video
              ref={midia}
              src={arquivo}
              controls
              playsInline
              preload="metadata"
              className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl bg-black"
              style={{ aspectRatio: `${pedido.largura} / ${pedido.altura}` }}
            />
          )}

          {aberto ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Seu nome</span>
              <input value={nome} onChange={(evento) => setNome(evento.target.value)} maxLength={60} autoComplete="name" className={CAMPO} />
            </label>
          ) : null}

          {anotacoes.length || aberto ? (
            <section className="flex flex-col gap-2" aria-labelledby="titulo-anotacoes">
              <h2 id="titulo-anotacoes" className="text-sm font-semibold">
                Anotações {anotacoes.length ? `(${anotacoes.length})` : ""}
              </h2>
              {anotacoes.length ? (
                <ul className="flex flex-col divide-y divide-borda rounded-lg border border-borda bg-painel">
                  {anotacoes.map((anotacao) => (
                    <li key={anotacao.id} className="flex items-start gap-3 px-3 py-2 text-sm" data-anotacao>
                      {temTempo ? (
                        <button type="button" onClick={() => irPara(anotacao.tempo)} className="shrink-0 font-mono text-destaque hover:underline" title="Ir a este instante">
                          {formatarTempo(anotacao.tempo)}
                        </button>
                      ) : null}
                      <span className="min-w-0 flex-1 whitespace-pre-line">
                        <span className="text-suave">{anotacao.nome}: </span>
                        {anotacao.texto}
                      </span>
                      {aberto ? (
                        <button type="button" onClick={() => void enviar(`/anotacoes/${anotacao.id}`, "DELETE")} disabled={enviando} className="botao-icone size-6 shrink-0" aria-label="Tirar a anotação">
                          <X className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-suave">{temTempo ? "Pause onde algo precisa mudar e anote: quem editou vê a anotação naquele instante." : "Anote o que precisa mudar."}</p>
              )}
              {aberto ? (
                anotando ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-borda bg-painel p-3">
                    <span className="text-sm font-medium">{temTempo ? `Em ${formatarTempo(anotando.tempo)}` : "Anotação"}</span>
                    <textarea
                      value={anotando.texto}
                      onChange={(evento) => setAnotando({ ...anotando, texto: evento.target.value })}
                      maxLength={500}
                      rows={3}
                      autoFocus
                      aria-label="O que precisa mudar neste instante"
                      className={CAMPO}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void salvarAnotacao()} disabled={enviando || !anotando.texto.trim() || !nome.trim()} className="botao-principal px-3 py-2 text-sm">
                        Salvar a anotação
                      </button>
                      <button type="button" onClick={() => setAnotando(null)} className="botao-secundario px-3 py-2 text-sm">
                        Cancelar
                      </button>
                    </div>
                    {!nome.trim() ? <p className="text-xs text-suave">Escreva o seu nome acima para anotar.</p> : null}
                  </div>
                ) : (
                  <button type="button" onClick={comecarAnotacao} className="botao-secundario self-start px-3 py-2 text-sm">
                    <MessageSquarePlus className="size-4" aria-hidden /> {temTempo ? "Anotar neste instante" : "Anotar"}
                  </button>
                )
              ) : null}
            </section>
          ) : null}

          {respondido ? (
            <div className={`rounded-xl border px-4 py-4 ${aprovacao.status === "aprovado" ? "border-sucesso/40 bg-sucesso/10" : "border-aviso/40 bg-aviso/10"}`} data-resposta={aprovacao.status}>
              <p className="flex items-center gap-2 font-semibold">
                {aprovacao.status === "aprovado" ? <Check className="size-5 text-sucesso" aria-hidden /> : <MessageSquareText className="size-5 text-aviso" aria-hidden />}
                {aprovacao.status === "aprovado" ? "Vídeo aprovado" : "Pedido de ajuste enviado"}
              </p>
              <p className="mt-1 text-sm text-suave">
                Por {aprovacao.respondido_por}
                {aprovacao.respondido_em ? `, em ${formatarData(aprovacao.respondido_em)}` : ""}. Obrigado!
              </p>
              {aprovacao.comentario ? <p className="mt-2 whitespace-pre-line text-sm">{aprovacao.comentario}</p> : null}
            </div>
          ) : aberto ? (
            <div className="flex flex-col gap-3">
              {pedindoAjuste ? (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">O que precisa mudar? {anotacoes.length ? <span className="font-normal text-suave">(opcional: as anotações vão junto)</span> : null}</span>
                    <textarea value={comentario} onChange={(evento) => setComentario(evento.target.value)} maxLength={500} rows={4} autoFocus className={CAMPO} />
                  </label>
                  <button
                    type="button"
                    onClick={() => void enviar("", "POST", { decisao: "ajustes", nome: nome.trim(), comentario })}
                    disabled={enviando || !nome.trim() || (!comentario.trim() && !anotacoes.length)}
                    className="botao-principal py-3"
                  >
                    <MessageSquareText className="size-5" aria-hidden /> Enviar o pedido de ajuste
                  </button>
                  <button type="button" onClick={() => setPedindoAjuste(false)} className="text-sm text-suave hover:text-texto">
                    Voltar
                  </button>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => void enviar("", "POST", { decisao: "aprovado", nome: nome.trim(), comentario: "" })} disabled={enviando || !nome.trim()} className="botao-principal py-3">
                    <Check className="size-5" aria-hidden /> Aprovar
                  </button>
                  <button type="button" onClick={() => setPedindoAjuste(true)} disabled={enviando} className="botao-secundario py-3">
                    <MessageSquareText className="size-5" aria-hidden /> Pedir ajustes
                  </button>
                </div>
              )}
              {!nome.trim() ? <p className="text-xs text-suave">Escreva o seu nome para responder.</p> : null}
            </div>
          ) : null}

          {erro ? (
            <p role="alert" className="flex gap-1.5 text-sm text-erro">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {erro}
            </p>
          ) : null}
          <p className="mt-auto pt-4 text-center text-xs text-apagado">Este link só mostra este arquivo e vale por 7 dias.</p>
        </main>
      )}
    </div>
  );
}
