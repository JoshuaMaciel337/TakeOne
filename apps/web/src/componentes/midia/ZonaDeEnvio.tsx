"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { ACEITAR_ARQUIVOS, useEnvios } from "@/lib/envios";

/** Área de soltar arquivos. "compacta" é a versão do painel do editor. */
export function ZonaDeEnvio({ compacta = false }: { compacta?: boolean }) {
  const { iniciar } = useEnvios();
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  function receber(lista: FileList | null) {
    if (lista && lista.length > 0) iniciar(Array.from(lista));
  }

  return (
    <div
      onDragOver={(evento) => {
        evento.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(evento) => {
        evento.preventDefault();
        setArrastando(false);
        receber(evento.dataTransfer.files);
      }}
      className={`flex w-full min-w-0 flex-col items-center gap-3 rounded-xl border-2 border-dashed text-center transition ${
        compacta ? "p-4" : "p-8"
      } ${arrastando ? "border-destaque bg-destaque/10" : "border-borda bg-painel-2/50"}`}
    >
      <UploadCloud className={`${compacta ? "size-6" : "size-9"} text-destaque`} aria-hidden />
      <div>
        <p className={`font-semibold ${compacta ? "text-sm" : "text-base"}`}>Arraste vídeos, áudios e imagens para cá</p>
        <p className="mt-1 text-xs text-suave">
          MP4, MOV, MP3, WAV, JPG, PNG e outros. Se a internet cair, o envio continua de onde parou.
        </p>
      </div>
      <button
        type="button"
        className={compacta ? "botao-principal w-full py-2" : "botao-principal"}
        onClick={() => entrada.current?.click()}
      >
        Importar do computador
      </button>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEITAR_ARQUIVOS}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(evento) => {
          receber(evento.target.files);
          evento.target.value = "";
        }}
      />
    </div>
  );
}
