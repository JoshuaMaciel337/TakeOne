"use client";

import { Check, Copy, Heart, LoaderCircle, Send, X } from "lucide-react";
import { useEffect, useState } from "react";

import { criarGaleria, desligarGaleria } from "@/lib/album/api";
import type { FotoDoAlbum, GaleriaDoAlbum } from "@/lib/album/fotos";
import { ErroApi } from "@/lib/api";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * A galeria do cliente: um link (15 dias, sem conta) com as fotos escolhidas, em que o cliente marca as favoritas,
 * comenta e envia a seleção. A janela gera o link (gerar outro desliga o anterior), mostra a situação e desliga.
 */
export function JanelaGaleria({
  albumId,
  galeria,
  escolhidas,
  selecionadas,
  visiveis,
  aoMudar,
  aoVerFavoritas,
  aoFechar,
}: {
  albumId: string;
  galeria: GaleriaDoAlbum | null;
  escolhidas: FotoDoAlbum[];
  selecionadas: FotoDoAlbum[];
  visiveis: FotoDoAlbum[];
  /** A galeria mudou: o álbum precisa ser lido de novo. */
  aoMudar: () => void;
  aoVerFavoritas: () => void;
  aoFechar: () => void;
}) {
  const [quais, setQuais] = useState<"escolhidas" | "selecionadas" | "visiveis">(escolhidas.length ? "escolhidas" : selecionadas.length > 1 ? "selecionadas" : "visiveis");
  const [para, setPara] = useState(galeria?.para ?? "");
  const [mensagem, setMensagem] = useState("");
  const [link, setLink] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const fotos = (quais === "escolhidas" ? escolhidas : quais === "selecionadas" ? selecionadas : visiveis).filter((f) => f.status === "pronta");

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
      evento.stopImmediatePropagation();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [aoFechar]);

  async function gerar() {
    setGerando(true);
    setErro("");
    try {
      const { token } = await criarGaleria(albumId, fotos.map((f) => f.midia_id), para, mensagem);
      setLink(`${window.location.origin}/galeria/${token}`);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível gerar o link.");
    } finally {
      setGerando(false);
    }
  }

  const campo = "rounded border border-borda bg-painel-2 px-2 py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]" onPointerDown={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-galeria" className="w-full max-w-md rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-galeria" className="font-display text-base font-semibold">
            Galeria do cliente
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4 text-sm">
          {galeria && !link ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-borda bg-painel-2 p-3 text-xs">
              <p>
                {galeria.status === "enviada" ? (
                  <>
                    <strong className="text-sucesso">{galeria.nome}</strong> enviou a seleção em {galeria.enviada_em ? formatarData(galeria.enviada_em) : ""}:{" "}
                    {galeria.favoritas.toLocaleString("pt-BR")} favoritas de {galeria.fotos.toLocaleString("pt-BR")}.
                  </>
                ) : (
                  <>
                    Link aberto{galeria.para ? ` para ${galeria.para}` : ""} até {formatarData(galeria.expira_em)}: {galeria.favoritas.toLocaleString("pt-BR")} favoritas de{" "}
                    {galeria.fotos.toLocaleString("pt-BR")} até agora.
                  </>
                )}
              </p>
              {galeria.comentario ? <p className="text-suave">“{galeria.comentario}”</p> : null}
              <div className="flex gap-2">
                {galeria.favoritas ? (
                  <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={aoVerFavoritas}>
                    <Heart className="size-3.5" aria-hidden />
                    Ver as favoritas
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-suave hover:bg-painel-3 hover:text-texto"
                  onClick={() => {
                    desligarGaleria(albumId)
                      .then(aoMudar)
                      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível desligar o link."));
                  }}
                >
                  Desligar o link
                </button>
              </div>
            </div>
          ) : null}
          {link ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-suave">Mande o link: ele vale por 15 dias e só mostra estas fotos. Gerar outro desliga este.</p>
              <div className="flex gap-1.5">
                <input readOnly value={link} className={`${campo} min-w-0 flex-1 font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} aria-label="Link da galeria" />
                <button
                  type="button"
                  className="botao-secundario px-2 py-1"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link).then(() => setCopiado(true));
                  }}
                  aria-label="Copiar o link"
                >
                  {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                </button>
              </div>
              <a className="botao-principal justify-center px-3 py-2" href={`https://wa.me/?text=${encodeURIComponent(`Suas fotos estão prontas para escolher: ${link}`)}`} target="_blank" rel="noreferrer">
                <Send className="size-4" aria-hidden />
                Mandar pelo WhatsApp
              </a>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-suave">Quais fotos</span>
                <select className={campo} value={quais} onChange={(e) => setQuais(e.target.value as typeof quais)}>
                  <option value="escolhidas">As escolhidas ({escolhidas.length})</option>
                  <option value="selecionadas">As selecionadas ({selecionadas.length})</option>
                  <option value="visiveis">As que aparecem na grade ({visiveis.length})</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-suave">Para quem</span>
                <input className={campo} maxLength={60} placeholder="Ana e Pedro" value={para} onChange={(e) => setPara(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-suave">Recado (aparece no alto da galeria)</span>
                <textarea className={campo} rows={2} maxLength={500} placeholder="Marque com o coração as fotos para o álbum." value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              </label>
              <button type="button" className="botao-principal px-3 py-2" disabled={!fotos.length || gerando} onClick={() => void gerar()}>
                {gerando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                {galeria ? "Gerar um link novo" : "Gerar o link"} com {fotos.length.toLocaleString("pt-BR")} foto(s)
              </button>
            </>
          )}
          {erro ? <p className="text-xs text-erro">{erro}</p> : null}
        </div>
      </div>
    </div>
  );
}
