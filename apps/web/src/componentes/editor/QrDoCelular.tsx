"use client";

// Adaptado do QrDoCelular do HolyCut. O botão e o painel ficam separados, para o painel ocupar a
// linha inteira da exportação.
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import type { LinkCelular } from "@/lib/tipos";

function formatarValidade(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Link de 24 h para o celular baixar o vídeo sem entrar na conta. */
export function useLinkCelular(exportacaoId: string) {
  const [link, setLink] = useState<{ url: string; expira_em: string } | null>(null);
  const [erro, setErro] = useState("");

  async function gerar() {
    setErro("");
    try {
      const novo = await chamarApi<LinkCelular>(`/exportacoes/${exportacaoId}/link-celular`, { metodo: "POST" });
      setLink({ url: `${window.location.origin}${novo.caminho}`, expira_em: novo.expira_em });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível gerar o QR code.");
    }
  }

  return { link, erro, gerar, fechar: () => setLink(null) };
}

/** O QR code: aponte a câmera do celular e o download começa. */
export function PainelQrCelular({ link, aoFechar }: { link: { url: string; expira_em: string }; aoFechar: () => void }) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  // O QR abre embaixo da exportação, quase sempre fora da parte visível da lista: rola até ele
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    painel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [link.url]);
  return (
    <div ref={painel} className="col-span-full mt-2 flex flex-col items-center gap-3 rounded-lg border border-borda bg-painel p-4 text-center">
      <div className="flex w-full items-center justify-between">
        <p className="text-sm font-semibold">Aponte a câmera do celular</p>
        <button type="button" onClick={aoFechar} aria-label="Fechar o QR code" className="botao-icone size-6">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG gerado na hora pela API, sem otimização */}
      <img
        src={`/api/qrcode.svg?texto=${encodeURIComponent(link.url)}`}
        alt="QR code para baixar o vídeo no celular"
        width={180}
        height={180}
        className="rounded-lg bg-white"
      />
      <p className="text-xs text-suave">O link vale até {formatarValidade(link.expira_em)} e só baixa este vídeo. Gerar outro desliga este.</p>
      {local ? (
        <p className="text-xs text-aviso">O endereço é deste computador (localhost): o celular só abre pelo túnel ou pelo IP da rede.</p>
      ) : null}
    </div>
  );
}
