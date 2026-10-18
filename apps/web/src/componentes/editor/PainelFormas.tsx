"use client";

import { ArrowRight, Circle, Heart, LoaderCircle, MessageSquare, Minus, RectangleHorizontal, Square, Star, Triangle } from "lucide-react";
import { useState } from "react";

import { criarForma, FORMAS, type TipoDeForma } from "@/lib/elementos";
import { useMarca } from "@/lib/marca";
import type { Midia } from "@/lib/tipos";

const ICONES: Record<TipoDeForma, typeof Square> = {
  retangulo: RectangleHorizontal,
  arredondado: Square,
  elipse: Circle,
  triangulo: Triangle,
  estrela: Star,
  seta: ArrowRight,
  linha: Minus,
  balao: MessageSquare,
  coracao: Heart,
};

type Props = {
  /** A forma pronta: entra no cursor, numa faixa por cima. */
  aoPedir: (midia: Midia) => void;
  aoAvisar: (mensagem: string) => void;
};

/** Formas prontas para pôr por cima do vídeo: a cor, o contorno e um clique na forma. */
export function PainelFormas({ aoPedir, aoAvisar }: Props) {
  const marca = useMarca();
  const [cor, setCor] = useState<string | null>(null);
  const [preenchida, setPreenchida] = useState(true);
  const [contornoCor, setContornoCor] = useState("#ffffff");
  const [espessura, setEspessura] = useState(0);
  const [pedindo, setPedindo] = useState<TipoDeForma | null>(null);
  // A cor começa na principal da marca, se houver
  const corNaTela = cor ?? marca.cores[0] ?? "#ff624a";

  function pedir(tipo: TipoDeForma) {
    if (!preenchida && espessura <= 0) {
      aoAvisar("Uma forma sem preenchimento precisa de contorno.");
      return;
    }
    setPedindo(tipo);
    criarForma({ tipo, cor: preenchida ? corNaTela : null, contorno_cor: contornoCor, contorno: espessura / 100, proporcao: null })
      .then(aoPedir)
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível desenhar a forma agora."))
      .finally(() => setPedindo(null));
  }

  const amostras = (aoEscolher: (valor: string) => void) =>
    marca.cores.length ? (
      <span className="flex gap-1">
        {marca.cores.map((item) => (
          <button key={item} type="button" onClick={() => aoEscolher(item)} title={item} aria-label={`Usar ${item}`} className="size-4 rounded-full border border-borda" style={{ backgroundColor: item }} />
        ))}
      </span>
    ) : null;

  return (
    <section className="flex flex-col gap-2 border-b border-borda pb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Formas</h3>
      <div className="grid grid-cols-5 gap-1.5">
        {FORMAS.map(({ tipo, nome }) => {
          const Icone = ICONES[tipo];
          return (
            <button
              key={tipo}
              type="button"
              title={nome}
              aria-label={`Pôr ${nome.toLowerCase()}`}
              disabled={pedindo !== null}
              onClick={() => pedir(tipo)}
              className="grid aspect-square place-items-center rounded-md border border-borda bg-painel-2 hover:border-destaque disabled:opacity-60"
            >
              {pedindo === tipo ? (
                <LoaderCircle className="size-5 animate-spin text-suave" aria-hidden />
              ) : (
                <Icone className="size-5" style={{ color: preenchida ? corNaTela : contornoCor }} fill={preenchida && tipo !== "seta" && tipo !== "linha" ? corNaTela : "none"} aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <label className="flex flex-1 items-center gap-2">
          <input type="checkbox" checked={preenchida} onChange={(evento) => setPreenchida(evento.currentTarget.checked)} />
          Preenchida
        </label>
        {amostras(setCor)}
        <input type="color" value={corNaTela} disabled={!preenchida} onChange={(evento) => setCor(evento.currentTarget.value)} aria-label="Cor da forma" className="h-7 w-10 cursor-pointer rounded border border-borda bg-painel-2 disabled:opacity-50" />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="flex-1 text-suave">Contorno</span>
        <input type="range" min={0} max={25} value={espessura} onChange={(evento) => setEspessura(Number(evento.currentTarget.value))} aria-label="Espessura do contorno" className="w-20" />
        <span className="w-8 text-right tabular-nums text-suave">{espessura}%</span>
        {amostras(setContornoCor)}
        <input type="color" value={contornoCor} onChange={(evento) => setContornoCor(evento.currentTarget.value)} aria-label="Cor do contorno" className="h-7 w-10 cursor-pointer rounded border border-borda bg-painel-2" />
      </div>
    </section>
  );
}
