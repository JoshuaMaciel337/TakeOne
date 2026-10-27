"use client";

import { Play, Plus, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import type { Midia } from "@/lib/tipos";

type Efeito = { id: string; nome: string; descricao: string };

type Props = {
  /** O efeito entra no cursor, numa faixa de áudio, quando a mídia ficar pronta (ou já, se o espaço já tem). */
  aoPedir: (midia: Midia) => void;
};

/** Efeitos sonoros desenhados aqui (core/utils/efeitos_sonoros.py): ouvir e pôr no cursor. */
export function EfeitosSonoros({ aoPedir }: Props) {
  const [efeitos, setEfeitos] = useState<Efeito[]>([]);
  const [tocando, setTocando] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    chamarApi<Efeito[]>("/efeitos-sonoros")
      .then(setEfeitos)
      .catch(() => setEfeitos([]));
    return () => audio.current?.pause();
  }, []);

  function ouvir(id: string) {
    audio.current?.pause();
    if (tocando === id) {
      setTocando(null);
      return;
    }
    const som = new Audio(`/api/efeitos-sonoros/${id}.wav`);
    som.onended = () => setTocando((atual) => (atual === id ? null : atual));
    audio.current = som;
    setTocando(id);
    void som.play().catch(() => setTocando(null));
  }

  function pedir(efeito: Efeito) {
    setPedindo(efeito.id);
    chamarApi<Midia>(`/efeitos-sonoros/${efeito.id}`, { metodo: "POST" })
      .then((midia) => {
        aoPedir(midia);
        setAviso(midia.status === "pronta" ? `${efeito.nome} no cursor.` : `${efeito.nome}: entra no cursor quando ficar pronto.`);
      })
      .catch((erro: unknown) => setAviso(erro instanceof ErroApi ? erro.message : "Não foi possível pôr o efeito agora."))
      .finally(() => setPedindo(null));
  }

  if (!efeitos.length) return null;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda bg-painel-2 p-3" aria-label="Efeitos sonoros">
      <p className="text-xs font-semibold">Efeitos sonoros</p>
      <ul className="flex flex-col gap-1">
        {efeitos.map((efeito) => (
          <li key={efeito.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-painel">
            <button type="button" className="botao-icone size-7 shrink-0" aria-label={tocando === efeito.id ? `Parar ${efeito.nome}` : `Ouvir ${efeito.nome}`} onClick={() => ouvir(efeito.id)}>
              {tocando === efeito.id ? <Square className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            </button>
            <span className="min-w-0 flex-1">
              <span className="block text-xs">{efeito.nome}</span>
              <span className="block truncate text-[10px] text-suave" title={efeito.descricao}>
                {efeito.descricao}
              </span>
            </span>
            <button type="button" className="botao-icone size-7 shrink-0" aria-label={`Pôr ${efeito.nome} no cursor`} disabled={pedindo === efeito.id} onClick={() => pedir(efeito)}>
              <Plus className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {aviso ? (
        <p className="text-[11px] text-suave" role="status">
          {aviso}
        </p>
      ) : null}
      <p className="text-[10px] text-suave">Desenhados aqui por síntese, sem arquivos de terceiros.</p>
    </section>
  );
}
