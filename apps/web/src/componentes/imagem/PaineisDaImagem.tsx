"use client";

// Os painéis pequenos do editor de imagem (ADR 0002): Cor, Amostras, Ajustes, Histórico, Biblioteca e Modelos. Os
// grandes (Camadas e Propriedades) ficam nos arquivos deles.
import { History, ImageIcon, LoaderCircle } from "lucide-react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { MiniaturaDeImagem } from "@/componentes/hub/CartaoModelo";
import { formatoMaisPerto, GerarImagem } from "@/componentes/midia/GerarImagem";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import { arquivoDaMidia } from "@/lib/api";
import { useMarca } from "@/lib/marca";
import { MODELOS_DE_IMAGEM, type ModeloDeImagem } from "@/lib/projeto/modelosDeImagem";
import type { Midia } from "@/lib/tipos";

import { AJUSTES, type Ajuste } from "./ajustesDaImagem";

/** As amostras de sempre: tons de cinza e as cores básicas, depois das cores da marca. */
const AMOSTRAS_PADRAO = [
  "#000000", "#404040", "#808080", "#bfbfbf", "#ffffff",
  "#ff0000", "#ff8000", "#ffff00", "#80ff00", "#00ff00", "#00ff80", "#00ffff", "#0080ff", "#0000ff", "#8000ff", "#ff00ff", "#ff0080",
  "#800000", "#804000", "#808000", "#008000", "#008080", "#000080", "#400080", "#800040",
  "#ffcccc", "#ffe5cc", "#ffffcc", "#ccffcc", "#ccffff", "#cce5ff", "#e5ccff", "#ffcce5",
];

type Cores = { primeiroPlano: string; fundo: string; editando: "primeiroPlano" | "fundo" };

/** Cor: as duas cores da caixa de ferramentas, a que está sendo mudada em destaque, o seletor e o código. */
export function PainelCor({ cores, aoMudar, aoEscolherEditada }: { cores: Cores; aoMudar: (qual: "primeiroPlano" | "fundo", cor: string) => void; aoEscolherEditada: (qual: "primeiroPlano" | "fundo") => void }) {
  const atual = cores[cores.editando];
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0">
          <button
            type="button"
            onClick={() => aoEscolherEditada("fundo")}
            aria-pressed={cores.editando === "fundo"}
            title="Cor de fundo"
            className={`absolute bottom-0 right-0 size-8 rounded-sm border-2 ${cores.editando === "fundo" ? "border-destaque" : "border-white/50"}`}
            style={{ background: cores.fundo }}
          />
          <button
            type="button"
            onClick={() => aoEscolherEditada("primeiroPlano")}
            aria-pressed={cores.editando === "primeiroPlano"}
            title="Cor de primeiro plano"
            className={`absolute left-0 top-0 size-8 rounded-sm border-2 ${cores.editando === "primeiroPlano" ? "border-destaque" : "border-white/50"}`}
            style={{ background: cores.primeiroPlano }}
          />
        </div>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-suave">{cores.editando === "primeiroPlano" ? "Primeiro plano" : "Fundo"}</span>
          <span className="flex items-center gap-2">
            <input type="color" value={atual} onChange={(evento) => aoMudar(cores.editando, evento.currentTarget.value)} className="h-8 w-12 cursor-pointer rounded border border-borda bg-painel-2" aria-label="Escolher a cor" />
            <input
              key={atual}
              defaultValue={atual}
              aria-label="Código da cor"
              onBlur={(evento) => /^#[0-9a-f]{6}$/i.test(evento.currentTarget.value) && aoMudar(cores.editando, evento.currentTarget.value.toLowerCase())}
              onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
              className="w-20 rounded border border-borda bg-painel-2 px-1.5 py-1 font-mono uppercase"
            />
          </span>
        </label>
      </div>
      <p className="text-[11px] text-suave">O primeiro plano é a cor das formas e dos textos novos; o Conta-gotas pega uma cor da imagem.</p>
    </div>
  );
}

/** Amostras: as cores da marca e as de sempre; clique põe no primeiro plano, Alt + clique no fundo. */
export function PainelAmostras({ aoEscolher }: { aoEscolher: (cor: string, paraOFundo: boolean) => void }) {
  const { cores } = useMarca();
  const grade = (lista: string[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,20px)] gap-0.5">
      {lista.map((cor) => (
        <button key={cor} type="button" title={`${cor} (Alt: fundo)`} aria-label={cor} onClick={(evento) => aoEscolher(cor, evento.altKey)} className="size-5 border border-black/30" style={{ background: cor }} />
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {cores.length ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold text-suave">Kit de marca</h3>
          {grade(cores)}
        </section>
      ) : null}
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[11px] font-semibold text-suave">Básicas</h3>
        {grade(AMOSTRAS_PADRAO)}
      </section>
    </div>
  );
}

/** Ajustes: um botão por tipo; cada um põe uma camada de ajuste por cima. */
export function PainelAjustes({ aoCriar }: { aoCriar: (ajuste: Ajuste) => void }) {
  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      <h3 className="text-[11px] text-suave">Adicionar um ajuste</h3>
      <div className="grid grid-cols-5 gap-1">
        {AJUSTES.map((ajuste) => {
          const Icone = ajuste.icone;
          return (
            <button
              key={ajuste.id}
              type="button"
              onClick={() => aoCriar(ajuste)}
              title={ajuste.atalho ? `${ajuste.nome} (${ajuste.atalho})` : ajuste.nome}
              aria-label={ajuste.nome}
              className="grid aspect-square place-items-center rounded border border-borda text-suave transition hover:border-destaque hover:text-texto"
            >
              <Icone className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-suave">O ajuste vale para todas as camadas embaixo dele; mude a ordem no painel Camadas.</p>
    </div>
  );
}

/** Histórico: o estado de abertura e os passos; clicar volta (ou avança) até ele. Os desfeitos ficam apagados. */
export function PainelHistorico({ nome, feitos, desfeitos, aoIr }: { nome: string; feitos: string[]; desfeitos: string[]; aoIr: (desfazer: number, refazer: number) => void }) {
  const linha = "flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-painel-2";
  return (
    <ol aria-label="Histórico" className="flex flex-col py-1">
      <li>
        <button type="button" className={`${linha} ${feitos.length ? "" : "bg-destaque/25"}`} onClick={() => aoIr(feitos.length, 0)}>
          <ImageIcon className="size-3.5 text-suave" aria-hidden />
          <span className="truncate font-medium">{nome || "Imagem"}</span>
        </button>
      </li>
      {feitos.map((passo, i) => (
        <li key={`f${i}`}>
          <button type="button" className={`${linha} ${i === feitos.length - 1 ? "bg-destaque/25" : ""}`} onClick={() => aoIr(feitos.length - 1 - i, 0)}>
            <History className="size-3.5 text-suave" aria-hidden />
            <span className="truncate first-letter:uppercase">{passo}</span>
          </button>
        </li>
      ))}
      {desfeitos.map((passo, i) => (
        <li key={`d${i}`}>
          <button type="button" className={`${linha} text-apagado`} onClick={() => aoIr(0, i + 1)}>
            <History className="size-3.5" aria-hidden />
            <span className="truncate first-letter:uppercase">{passo}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Biblioteca: o envio, gerar com IA e as imagens do espaço (clique põe como camada). */
export function PainelBiblioteca({
  imagens,
  erro,
  quadro,
  aoPorImagem,
  aoGerada,
}: {
  imagens: Midia[];
  erro: string | null;
  quadro: { largura: number; altura: number };
  aoPorImagem: (midia: Midia) => void;
  aoGerada: (midia: Midia) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <ZonaDeEnvio compacta />
      <ListaEnvios />
      <GerarImagem formato={formatoMaisPerto(quadro.largura, quadro.altura)} aoPedir={aoGerada} />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <p className="text-[11px] text-suave">{imagens.length ? "Clique numa imagem para pôr como camada." : "Envie fotos, logos e PNGs com fundo transparente."}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {imagens.map((midia) => (
          <button
            key={midia.id}
            type="button"
            disabled={midia.status !== "pronta"}
            onClick={() => aoPorImagem(midia)}
            title={midia.nome}
            className="aspect-square overflow-hidden rounded border border-borda bg-painel-3 transition hover:border-destaque disabled:opacity-50"
          >
            {midia.status === "pronta" ? (
              // eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie
              <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt={midia.nome} className="size-full object-cover" loading="lazy" />
            ) : (
              <LoaderCircle className="m-auto size-4 animate-spin text-suave" aria-label="Preparando" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Modelos: os modelos de imagem; o escolhido entra por cima do que já existe. */
export function PainelModelosDaImagem({ aplicando, aoAplicar }: { aplicando: string | null; aoAplicar: (modelo: ModeloDeImagem) => void }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] text-suave">O modelo entra por cima do que já existe, com o tamanho e o fundo dele, nas cores do kit de marca. Depois, troque as fotos e os textos.</p>
      <div className="grid grid-cols-2 gap-2">
        {MODELOS_DE_IMAGEM.map((modelo) => (
          <button
            key={modelo.id}
            type="button"
            disabled={aplicando !== null}
            onClick={() => aoAplicar(modelo)}
            title={modelo.descricao}
            className="flex flex-col gap-1 rounded border border-borda bg-painel-2 p-1.5 text-left transition hover:border-destaque disabled:opacity-60"
          >
            <span className="relative flex h-24 items-center justify-center">
              <MiniaturaDeImagem modeloId={modelo.id} />
              {aplicando === modelo.id ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <LoaderCircle className="size-5 animate-spin text-white" aria-label="Aplicando" />
                </span>
              ) : null}
            </span>
            <span className="truncate text-[11px] font-medium">{modelo.nome}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
