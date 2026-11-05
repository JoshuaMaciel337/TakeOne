"use client";

import { Check, ChevronLeft, ChevronRight, Heart, MessageSquareText, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BotaoTema } from "@/componentes/BotaoTema";
import { Logo } from "@/componentes/Logo";
import { chamarApi, ErroApi } from "@/lib/api";

type FotoDaGaleria = { midia_id: string; nome: string; largura: number | null; altura: number | null; versao: number | null; favorita: boolean; comentario: string };
type Galeria = {
  album: string;
  espaco: string;
  para: string;
  mensagem: string;
  status: "aberta" | "enviada";
  expira_em: string;
  nome: string | null;
  comentario: string | null;
  enviada_em: string | null;
  fotos: FotoDaGaleria[];
};

const CHAVE_DO_NOME = "takeone-aprovador";
const CAMPO = "rounded-lg border border-borda bg-fundo px-3.5 py-2.5 text-texto outline-none transition placeholder:text-suave/60 focus:border-destaque focus:ring-2 focus:ring-destaque/25";

function lerNomeGuardado(): string {
  try {
    return window.localStorage.getItem(CHAVE_DO_NOME) ?? "";
  } catch {
    return "";
  }
}

/** A galeria do cliente (core/modelos/galeria.py): marcar as favoritas, comentar uma foto e enviar a seleção, sem conta. */
export default function PaginaGaleria() {
  const { token } = useParams<{ token: string }>();
  const [galeria, setGaleria] = useState<Galeria | null>(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);
  const [soFavoritas, setSoFavoritas] = useState(false);
  const [nome, setNome] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    chamarApi<Galeria>(`/galeria/${token}`)
      .then((dados) => {
        setGaleria(dados);
        setNome(lerNomeGuardado() || dados.para);
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível abrir a galeria."));
  }, [token]);

  const podeMarcar = galeria?.status === "aberta";
  const fotos = useMemo(() => (galeria ? (soFavoritas ? galeria.fotos.filter((f) => f.favorita) : galeria.fotos) : []), [galeria, soFavoritas]);
  const favoritas = galeria?.fotos.filter((f) => f.favorita).length ?? 0;
  const imagem = (foto: FotoDaGaleria, tipo: "capa" | "proxy") => `/api/galeria/${token}/fotos/${foto.midia_id}/${tipo}${foto.versao ? `?v=${foto.versao}` : ""}`;

  const marcar = useCallback(
    (midiaId: string, mudanca: { favorita?: boolean; comentario?: string }) => {
      setGaleria((g) => (g ? { ...g, fotos: g.fotos.map((f) => (f.midia_id === midiaId ? { ...f, ...mudanca } : f)) } : g));
      chamarApi(`/galeria/${token}/fotos/${midiaId}`, { metodo: "PATCH", corpo: mudanca }).catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível marcar a foto."));
    },
    [token],
  );

  useEffect(() => {
    if (aberta === null) return;
    const tecla = (evento: KeyboardEvent) => {
      if ((evento.target as HTMLElement).tagName === "TEXTAREA") return;
      if (evento.key === "Escape") setAberta(null);
      if (evento.key === "ArrowRight") setAberta((i) => (i === null ? i : Math.min(fotos.length - 1, i + 1)));
      if (evento.key === "ArrowLeft") setAberta((i) => (i === null ? i : Math.max(0, i - 1)));
      if ((evento.key === " " || evento.key.toLowerCase() === "f") && podeMarcar && fotos[aberta]) {
        evento.preventDefault();
        marcar(fotos[aberta].midia_id, { favorita: !fotos[aberta].favorita });
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberta, fotos, podeMarcar, marcar]);

  async function enviar() {
    setEnviando(true);
    setErro("");
    try {
      setGaleria(await chamarApi<Galeria>(`/galeria/${token}/enviar`, { metodo: "POST", corpo: { nome: nome.trim(), comentario: comentario.trim() } }));
      try {
        window.localStorage.setItem(CHAVE_DO_NOME, nome.trim());
      } catch {
        // sem armazenamento: só não lembra o nome
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const foto = aberta !== null ? fotos[aberta] : null;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <Logo tamanho={28} />
        <BotaoTema />
      </div>
      {!galeria ? (
        <p className={erro ? "rounded-lg border border-erro/40 bg-erro/10 px-4 py-3 text-sm text-erro" : "text-sm text-suave"}>{erro || "Carregando as fotos…"}</p>
      ) : (
        <main className="flex flex-col gap-5">
          <div>
            <p className="text-sm text-suave">{galeria.espaco ? `${galeria.espaco} separou estas fotos${galeria.para ? ` para ${galeria.para}` : ""}` : "Suas fotos"}</p>
            <h1 className="mt-1 font-display text-2xl font-bold">{galeria.album}</h1>
            {galeria.mensagem ? <p className="mt-2 whitespace-pre-line text-sm">{galeria.mensagem}</p> : null}
          </div>
          {galeria.status === "enviada" ? (
            <p className="flex items-center gap-2 rounded-lg border border-sucesso/40 bg-sucesso/10 px-4 py-3 text-sm">
              <Check className="size-4 text-sucesso" aria-hidden />
              Seleção enviada por {galeria.nome}: {favoritas} {favoritas === 1 ? "favorita" : "favoritas"}. Obrigado!
            </p>
          ) : (
            <p className="text-sm text-suave">Toque no coração das fotos de que mais gostou. Quando terminar, envie a seleção no fim da página.</p>
          )}
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => setSoFavoritas(false)} className={`rounded-full px-3 py-1 ${!soFavoritas ? "bg-painel-3" : "text-suave hover:text-texto"}`}>
              Todas ({galeria.fotos.length})
            </button>
            <button type="button" onClick={() => setSoFavoritas(true)} className={`flex items-center gap-1 rounded-full px-3 py-1 ${soFavoritas ? "bg-painel-3" : "text-suave hover:text-texto"}`}>
              <Heart className="size-3.5 fill-current text-destaque" aria-hidden />
              Favoritas ({favoritas})
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {fotos.map((f, i) => (
              <li key={f.midia_id} className="group relative aspect-square overflow-hidden rounded-lg bg-painel-2">
                <button type="button" className="size-full" onClick={() => setAberta(i)} aria-label={`Abrir ${f.nome}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem do link, sem otimização */}
                  <img src={imagem(f, "capa")} alt="" loading="lazy" className="size-full object-cover" />
                </button>
                {podeMarcar || f.favorita ? (
                  <button
                    type="button"
                    disabled={!podeMarcar}
                    onClick={() => marcar(f.midia_id, { favorita: !f.favorita })}
                    className="absolute right-1.5 top-1.5 flex size-9 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                    aria-label={f.favorita ? "Tirar das favoritas" : "Marcar como favorita"}
                    aria-pressed={f.favorita}
                  >
                    <Heart className={`size-5 ${f.favorita ? "fill-current text-destaque" : ""}`} aria-hidden />
                  </button>
                ) : null}
                {f.comentario ? <MessageSquareText className="absolute bottom-1.5 left-1.5 size-5 rounded bg-black/50 p-0.5 text-white" aria-label="Com comentário" /> : null}
              </li>
            ))}
          </ul>
          {!fotos.length ? <p className="text-sm text-suave">Nenhuma foto aqui ainda.</p> : null}

          {podeMarcar ? (
            <section className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-4" aria-labelledby="titulo-enviar">
              <h2 id="titulo-enviar" className="text-sm font-semibold">
                Enviar a seleção ({favoritas} {favoritas === 1 ? "favorita" : "favoritas"})
              </h2>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm">Seu nome</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="name" className={CAMPO} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm">Um recado (opcional)</span>
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} rows={2} className={CAMPO} />
              </label>
              <button type="button" onClick={() => void enviar()} disabled={enviando || !nome.trim()} className="botao-principal self-start px-4 py-2 text-sm">
                <Check className="size-4" aria-hidden />
                Enviar a seleção
              </button>
            </section>
          ) : null}
          {erro ? <p className="text-sm text-erro">{erro}</p> : null}
        </main>
      )}

      {foto && aberta !== null ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={foto.nome}>
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-white">
            <span className="text-sm tabular-nums">
              {aberta + 1} de {fotos.length}
            </span>
            <div className="flex items-center gap-1">
              {podeMarcar || foto.favorita ? (
                <button type="button" disabled={!podeMarcar} onClick={() => marcar(foto.midia_id, { favorita: !foto.favorita })} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-white/10" aria-pressed={foto.favorita}>
                  <Heart className={`size-5 ${foto.favorita ? "fill-current text-destaque" : ""}`} aria-hidden />
                  <span className="text-sm">{foto.favorita ? "Favorita" : "Favoritar"}</span>
                </button>
              ) : null}
              <button type="button" onClick={() => setAberta(null)} className="rounded-full p-2 hover:bg-white/10" aria-label="Fechar">
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem do link, sem otimização */}
            <img src={imagem(foto, "proxy")} alt={foto.nome} className="max-h-full max-w-full object-contain" />
            {aberta > 0 ? (
              <button type="button" onClick={() => setAberta(aberta - 1)} className="absolute left-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70" aria-label="Anterior">
                <ChevronLeft className="size-6" aria-hidden />
              </button>
            ) : null}
            {aberta < fotos.length - 1 ? (
              <button type="button" onClick={() => setAberta(aberta + 1)} className="absolute right-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70" aria-label="Próxima">
                <ChevronRight className="size-6" aria-hidden />
              </button>
            ) : null}
          </div>
          {podeMarcar ? (
            <div className="mx-auto w-full max-w-xl px-3 py-2">
              <textarea
                key={foto.midia_id}
                defaultValue={foto.comentario}
                onBlur={(e) => {
                  if (e.target.value.trim() !== foto.comentario) marcar(foto.midia_id, { comentario: e.target.value.trim() });
                }}
                maxLength={500}
                rows={1}
                placeholder="Um comentário nesta foto (opcional)"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50"
              />
            </div>
          ) : foto.comentario ? (
            <p className="px-3 py-2 text-center text-sm text-white/80">{foto.comentario}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
