"use client";

import { Bookmark, LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PreviaDaAnimacao } from "@/componentes/editor/PainelAnimacoes";
import type { Proporcao } from "@/componentes/editor/proporcoes";
import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { type ItemDaBiblioteca, textoDeUsos } from "@/lib/biblioteca";
import { formatarTempo } from "@/lib/formatar";
import { enderecoNoEditor } from "@/lib/hub";
import { MODELOS_DE_PROJETO } from "@/lib/projeto/modelos";

import { useAbrirNoEditor } from "./AbrirNoEditor";

/** O endereço da animação tocando com os campos de exemplo, a mesma página que o worker grava. */
export function enderecoDaPrevia(item: ItemDaBiblioteca, proporcao = "16:9"): string {
  return `/api/animacoes/previa?${new URLSearchParams({ modelo: item.id, proporcao, duracao: String(item.duracaoS), campos: "{}" })}`;
}

/** "Usar" de cada tipo: o pronto e a animação passam pela janela do editor; o do espaço cria o projeto dele. */
export function useUsarDaBiblioteca(contarUso: (item: ItemDaBiblioteca) => void) {
  const abrirNoEditor = useAbrirNoEditor();
  const router = useRouter();
  return async (item: ItemDaBiblioteca): Promise<string | null> => {
    if (item.tipo === "espaco") {
      try {
        const projeto = await chamarApi<{ id: string }>(`/modelos/${item.id}/usar`, { metodo: "POST" });
        router.push(enderecoNoEditor(projeto.id, "modelos"));
        return null;
      } catch (e) {
        return e instanceof ErroApi ? e.message : "Não foi possível usar o modelo agora.";
      }
    }
    contarUso(item);
    if (item.tipo === "animacao") abrirNoEditor({ titulo: `Usar “${item.nome}”`, ferramenta: item.grupo ?? "elementos", animacao: item.id });
    else abrirNoEditor({ titulo: `Usar “${item.nome}”`, ferramenta: "modelos", modelo: { id: item.id, proporcao: item.proporcao as Proporcao } });
    return null;
  };
}

/** O desenho no lugar da prévia em vídeo dos modelos de projeto (a prévia de verdade fica para depois). */
export function DesenhoDoModelo({ item, grande = false }: { item: ItemDaBiblioteca; grande?: boolean }) {
  const [largura, altura] = (item.proporcao ?? "16:9").split(":").map(Number);
  const pronto = item.tipo === "projeto" ? MODELOS_DE_PROJETO.find((modelo) => modelo.id === item.id) : undefined;
  const total = pronto ? pronto.cenas.reduce((soma, cena) => soma + cena.duracaoS, 0) : 0;
  return (
    <span
      className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-destaque/35 to-destaque-2/10"
      style={{ aspectRatio: `${largura} / ${altura}`, height: largura >= altura ? "auto" : "100%", width: largura >= altura ? "100%" : "auto" }}
    >
      {item.capaMidiaId ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
        <img src={arquivoDaMidia(item.capaMidiaId, "capa.jpg")} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <LayoutTemplate className={`${grande ? "size-12" : "size-8"} text-texto/80`} aria-hidden />
      )}
      {pronto ? (
        <span className="absolute inset-x-2 bottom-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {pronto.cenas.map((cena, i) => (
            <span key={cena.id} className="h-full bg-white" style={{ width: `${(cena.duracaoS / total) * 100}%`, opacity: 0.35 + (0.55 * (i + 1)) / pronto.cenas.length }} />
          ))}
        </span>
      ) : null}
      {item.proporcao ? <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">{item.proporcao}</span> : null}
    </span>
  );
}

/** A linha de baixo do cartão: o que é, quanto dura e quantas vezes foi usado. */
export function resumoDoItem(item: ItemDaBiblioteca): string {
  const partes = [item.categoria];
  if (item.tipo === "espaco") partes.push(item.vagas ? `${item.vagas} para trocar` : "do espaço");
  if (item.cenas) partes.push(`${item.cenas} ${item.cenas === 1 ? "cena" : "cenas"}`);
  partes.push(formatarTempo(item.duracaoS));
  if (item.usos) partes.push(textoDeUsos(item.usos));
  return partes.join(" · ");
}

/** Um item da biblioteca na grade: a prévia (a animação toca ao passar o mouse), o nome e o marcador dos salvos. */
export function CartaoModelo({ item, aoAbrir, aoSalvar }: { item: ItemDaBiblioteca; aoAbrir: (item: ItemDaBiblioteca) => void; aoSalvar?: (item: ItemDaBiblioteca) => void }) {
  const [tocando, setTocando] = useState(false);
  const [mouseEm, setMouseEm] = useState(false);
  // Só depois de um instante parado em cima: passar o mouse pela grade não abre dezenas de animações
  useEffect(() => {
    if (!mouseEm || item.tipo !== "animacao") return;
    const espera = window.setTimeout(() => setTocando(true), 300);
    return () => window.clearTimeout(espera);
  }, [mouseEm, item.tipo]);

  return (
    <div
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-borda bg-painel-2 transition hover:-translate-y-0.5 hover:border-suave/50"
      onPointerEnter={() => setMouseEm(true)}
      onPointerLeave={() => {
        setMouseEm(false);
        setTocando(false);
      }}
    >
      <button type="button" onClick={() => aoAbrir(item)} className="flex flex-1 flex-col text-left focus-visible:outline-2 focus-visible:outline-destaque">
        <span className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-painel-3 p-3 sm:h-44">
          {item.tipo === "animacao" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas fixas, geradas pelo worker */}
              <img src={`/animacoes/${item.id}.webp`} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              {tocando ? (
                <span className="absolute inset-0 flex items-center">
                  <PreviaDaAnimacao endereco={enderecoDaPrevia(item)} proporcao="16:9" />
                </span>
              ) : null}
            </>
          ) : (
            <DesenhoDoModelo item={item} />
          )}
        </span>
        <span className="flex flex-1 flex-col gap-1 p-3">
          <span className="truncate text-sm font-semibold">{item.nome}</span>
          <span className="line-clamp-2 text-xs text-suave">{item.descricao}</span>
          <span className="mt-auto truncate pt-1 text-[11px] text-apagado">{resumoDoItem(item)}</span>
        </span>
      </button>
      {aoSalvar ? (
        <button
          type="button"
          onClick={() => aoSalvar(item)}
          aria-pressed={item.salvo}
          aria-label={item.salvo ? `Tirar “${item.nome}” dos salvos` : `Salvar “${item.nome}”`}
          title={item.salvo ? "Tirar dos salvos" : "Salvar"}
          className={`absolute left-1.5 top-1.5 flex size-7 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/80 ${
            item.salvo ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          }`}
        >
          <Bookmark className={`size-3.5 ${item.salvo ? "fill-white" : ""}`} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
