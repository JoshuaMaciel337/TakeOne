"use client";

// O que a grade, a lupa e a comparação do álbum usam juntas: as cores, as categorias da escolha e as estrelas.
import { Aperture, Check, CircleHelp, EyeOff, Layers, Star } from "lucide-react";

import type { Categoria, CorDaFoto } from "@/lib/album/fotos";

export const CLASSE_DA_COR: Record<CorDaFoto, string> = {
  vermelho: "bg-rotulo-vermelho",
  amarelo: "bg-rotulo-amarelo",
  verde: "bg-rotulo-verde",
  azul: "bg-rotulo-azul",
  roxo: "bg-rotulo-roxo",
};

export const CLASSE_DA_CATEGORIA: Record<Categoria, string> = {
  destaque: "bg-grupo-destaque",
  escolhida: "bg-grupo-escolhida",
  talvez: "bg-grupo-talvez",
  parecida: "bg-grupo-parecida",
  desfocada: "bg-grupo-desfocada",
  olhos_fechados: "bg-grupo-olhos-fechados",
};

export function IconeDaCategoria({ categoria }: { categoria: Categoria }) {
  const classe = "size-3";
  if (categoria === "destaque") return <Star className={classe} fill="currentColor" aria-hidden />;
  if (categoria === "escolhida") return <Check className={classe} aria-hidden />;
  if (categoria === "parecida") return <Layers className={classe} aria-hidden />;
  if (categoria === "desfocada") return <Aperture className={classe} aria-hidden />;
  if (categoria === "olhos_fechados") return <EyeOff className={classe} aria-hidden />;
  return <CircleHelp className={classe} aria-hidden />;
}

export function dataDaFoto(iso?: string): string {
  if (!iso) return "";
  const [data, hora] = iso.split("T");
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}${hora ? ` ${hora.slice(0, 5)}` : ""}`;
}

export function Estrelas({ nota, aoMudar, tamanho = "size-3.5" }: { nota: number; aoMudar?: (nota: number) => void; tamanho?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) =>
        aoMudar ? (
          <button key={n} type="button" className="text-aviso hover:scale-110" onClick={() => aoMudar(nota === n ? 0 : n)} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} title={`${n} (tecla ${n})`}>
            <Star className={tamanho} fill={n <= nota ? "currentColor" : "none"} aria-hidden />
          </button>
        ) : (
          <Star key={n} className={`${tamanho} ${n <= nota ? "text-aviso" : "text-white/35"}`} fill={n <= nota ? "currentColor" : "none"} aria-hidden />
        ),
      )}
    </span>
  );
}
