"use client";

import { LoaderCircle, RotateCcw, WandSparkles } from "lucide-react";
import { useState } from "react";

import { arquivoDaMidia, chamarApi } from "@/lib/api";
import { amostraDaImagem } from "@/lib/previa/amostra";
import type { Comando } from "@/lib/projeto/comandos";
import { AJUSTES_NEUTROS, type AjustesCor, type Cor, COR_PADRAO, CURVAS_NEUTRAS, curvasNeutras, FILTROS, LIMITES_COR, RODAS } from "@/lib/projeto/cor";
import { INTENSIDADE_MAXIMA } from "@/lib/projeto/edicao";
import { ajustesAutomaticos } from "@/lib/projeto/melhorar";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { ControleNumerico } from "./ControleNumerico";
import { EditorDeCurva } from "./EditorDeCurva";
import { usePedirImagemEstavel } from "./Estabilizar";

/**
 * Melhorar: luz, contraste e balanço de branco escolhidos pela imagem (lib/projeto/melhorar.ts), nos controles de
 * sempre. Lê a cópia leve da foto ou a capa do vídeo; o filtro, as curvas e as rodas ficam como estão.
 */
function Melhorar({ midia, travada, aoAplicar }: { midia: Midia; travada: boolean; aoAplicar: (ajustes: Partial<Cor>) => void }) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  function melhorar() {
    setLendo(true);
    setErro("");
    amostraDaImagem(arquivoDaMidia(midia.id, midia.imagem ? "proxy.webp" : "capa.jpg"))
      .then((pixels) => aoAplicar(ajustesAutomaticos(pixels)))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível ler a imagem."))
      .finally(() => setLendo(false));
  }
  return (
    <div className="mt-2">
      <button type="button" className="botao-secundario w-full px-3 py-1.5 text-xs" disabled={travada || lendo} onClick={melhorar} title="Acerta a luz, o contraste e a cor pela imagem">
        {lendo ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <WandSparkles className="size-3.5" aria-hidden />}
        Melhorar
      </button>
      {erro ? <p className="mt-1 text-[11px] text-erro">{erro}</p> : null}
    </div>
  );
}

/** Tirar o ruído (o granulado) da imagem: o worker gera a versão limpa e a prévia e o render usam ela. */
function TirarRuido({ clipe, midia, travada, aoExecutar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void }) {
  const [erroDoPedido, setErroDoPedido] = useState("");
  const limpa = midia.imagem_limpa;
  // Ligar o ruído num clipe estabilizado pede a versão estável sobre a imagem sem ruído
  usePedirImagemEstavel(clipe, midia);
  function mudar(ligar: boolean) {
    aoExecutar({ comando: "clipe.limparImagem", parametros: { clipeIds: [clipe.id], ligar } });
    if (!ligar || limpa?.status === "pronta" || limpa?.status === "processando") return;
    setErroDoPedido("");
    chamarApi(`/midias/${midia.id}/limpeza-imagem`, { metodo: "POST" }).catch((erro: unknown) =>
      setErroDoPedido(erro instanceof Error ? erro.message : "Não foi possível pedir a limpeza agora."),
    );
  }
  return (
    <section className="pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Ruído</h3>
      <label className="mt-1 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(clipe.imagem_limpa)} disabled={travada} onChange={(evento) => mudar(evento.currentTarget.checked)} />
        <span className="flex-1">Tirar o ruído da imagem (o granulado de pouca luz)</span>
      </label>
      {clipe.imagem_limpa ? (
        <p className="mt-1 text-[11px] text-suave" role="status">
          {limpa?.status === "pronta"
            ? "Pronta. A prévia e o vídeo exportado usam a imagem sem ruído."
            : limpa?.status === "erro" || erroDoPedido
              ? `A limpeza falhou: ${erroDoPedido || limpa?.erro}`
              : `Tirando o ruído${limpa?.progresso ? ` · ${limpa.progresso}%` : ""}. Até terminar, a prévia mostra a imagem original.`}
        </p>
      ) : null}
    </section>
  );
}
import { RodaDeCor } from "./RodaDeCor";

type Props = {
  clipe: Clipe;
  faixa: Faixa;
  /** A mídia do clipe: a limpeza do ruído é dela. */
  midia: Midia | null;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

type Grupo = "luz" | "cor" | "efeito";

const AJUSTES: { chave: keyof AjustesCor; nome: string; grupo: Grupo }[] = [
  { chave: "exposicao", nome: "Exposição", grupo: "luz" },
  { chave: "contraste", nome: "Contraste", grupo: "luz" },
  { chave: "realces", nome: "Realces", grupo: "luz" },
  { chave: "sombras", nome: "Sombras", grupo: "luz" },
  { chave: "temperatura", nome: "Temperatura", grupo: "cor" },
  { chave: "tom", nome: "Tom", grupo: "cor" },
  { chave: "saturacao", nome: "Saturação", grupo: "cor" },
  { chave: "vinheta", nome: "Vinheta", grupo: "efeito" },
];
const GRUPOS = [
  { id: "luz", nome: "Luz" },
  { id: "cor", nome: "Cor" },
  { id: "efeito", nome: "Efeito" },
] as const;

const PERTO = 1e-6;

/** Filtro pronto e ajustes de luz e cor do clipe. */
export function AbaCor({ clipe, faixa, midia, aoPrever, aoExecutar }: Props) {
  const cor: Cor = { ...COR_PADRAO, ...clipe.cor };
  const travada = faixa.travada;
  const comando = (mudanca: Partial<Cor>): Comando => ({ comando: "clipe.cor", parametros: { clipeIds: [clipe.id], cor: mudanca } });
  /** Os ajustes aparecem de -100 a 100 (a exposição, em pontos de luz, de -2 a 2). */
  const fator = (chave: keyof AjustesCor) => (chave === "exposicao" ? 1 : 100);
  const mudou =
    (Object.keys(AJUSTES_NEUTROS) as (keyof AjustesCor)[]).some((chave) => Math.abs(cor[chave]) > PERTO) || cor.filtro !== null || !curvasNeutras(cor.curvas);

  const controle = (chave: keyof AjustesCor) => ({
    valor: cor[chave] * fator(chave),
    minimo: LIMITES_COR[chave].minimo * fator(chave),
    maximo: LIMITES_COR[chave].maximo * fator(chave),
    passo: chave === "exposicao" ? 0.05 : 1,
    sufixo: chave === "exposicao" ? "EV" : "",
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ [chave]: valor / fator(chave) })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / fator(chave) - cor[chave]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ [chave]: valor / fator(chave) }));
    },
  });

  const secao = (grupo: (typeof GRUPOS)[number]) => (
    <section key={grupo.id} className="border-b border-borda/60 pb-2 pt-3 last:border-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">{grupo.nome}</h3>
      {AJUSTES.filter((ajuste) => ajuste.grupo === grupo.id).map((ajuste) => (
        <ControleNumerico key={ajuste.chave} rotulo={ajuste.nome} {...controle(ajuste.chave)} />
      ))}
    </section>
  );

  return (
    <div>
      {travada ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      <section className="border-b border-borda/60 pb-2">
        <div className="flex min-h-6 items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Filtro</h3>
          <button
            type="button"
            className="botao-icone size-6"
            disabled={travada || !mudou}
            onClick={() => aoExecutar(comando(COR_PADRAO))}
            aria-label="Voltar à cor original"
            title="Voltar à cor original"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        </div>
        <select
          value={cor.filtro ?? ""}
          disabled={travada}
          aria-label="Filtro"
          onChange={(evento) => aoExecutar(comando({ filtro: evento.currentTarget.value || null }))}
          className="mt-1 w-full rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
        >
          <option value="">Nenhum</option>
          {FILTROS.map((filtro) => (
            <option key={filtro.id} value={filtro.id}>
              {filtro.nome}
            </option>
          ))}
        </select>
        {cor.filtro ? (
          <ControleNumerico
            rotulo="Intensidade"
            valor={cor.intensidade * 100}
            minimo={0}
            maximo={INTENSIDADE_MAXIMA * 100}
            sufixo="%"
            desativado={travada}
            aoPrever={(valor) => aoPrever(comando({ intensidade: valor / 100 }))}
            aoConfirmar={(valor) => {
              if (Math.abs(valor / 100 - cor.intensidade) < PERTO) aoPrever(null);
              else aoExecutar(comando({ intensidade: valor / 100 }));
            }}
          />
        ) : null}
        {midia?.video && !midia.elemento && !midia.animacao ? <Melhorar midia={midia} travada={travada} aoAplicar={(ajustes) => aoExecutar(comando(ajustes))} /> : null}
      </section>
      {GRUPOS.filter((grupo) => grupo.id !== "efeito").map(secao)}
      <section className="border-b border-borda/60 pb-3 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Rodas de cor</h3>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {RODAS.map((roda) => (
            <RodaDeCor
              key={roda.id}
              nome={roda.nome}
              matiz={cor[roda.matiz]}
              forca={cor[roda.forca]}
              desativado={travada}
              aoPrever={(matiz, forca) => aoPrever(comando({ [roda.matiz]: matiz, [roda.forca]: forca }))}
              aoConfirmar={(matiz, forca) => {
                if (Math.abs(matiz - cor[roda.matiz]) < PERTO && Math.abs(forca - cor[roda.forca]) < PERTO) aoPrever(null);
                else aoExecutar(comando({ [roda.matiz]: matiz, [roda.forca]: forca }));
              }}
            />
          ))}
        </div>
      </section>
      <section className="border-b border-borda/60 pb-3 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Curvas</h3>
        <EditorDeCurva
          curvas={{ ...CURVAS_NEUTRAS, ...cor.curvas }}
          desativado={travada}
          aoPrever={(curvas) => aoPrever(curvas ? comando({ curvas }) : null)}
          aoConfirmar={(curvas) => aoExecutar(comando({ curvas }))}
        />
      </section>
      {GRUPOS.filter((grupo) => grupo.id === "efeito").map(secao)}
      {!clipe.texto && midia?.video && !midia.imagem ? <TirarRuido clipe={clipe} midia={midia} travada={travada} aoExecutar={aoExecutar} /> : null}
    </div>
  );
}
