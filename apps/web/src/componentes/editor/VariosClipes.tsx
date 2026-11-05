"use client";

import { Copy, RotateCcw, Trash2 } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import { FILTROS } from "@/lib/projeto/cor";
import { VOLUME_MAXIMO } from "@/lib/projeto/edicao";
import { EFEITOS, INTENSIDADE_PADRAO, SO_EM_MIDIA, type TipoEfeito } from "@/lib/projeto/efeitos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { ControleNumerico } from "./ControleNumerico";

const PERTO = 1e-6;

/**
 * As propriedades com vários clipes escolhidos (ADR 0007, 17.4): o que vale para todos de uma vez, num passo só do
 * desfazer: a opacidade, o filtro e o efeito dos que aparecem, e o volume e os fades dos que têm som. O valor mostrado
 * é o do primeiro.
 */
export function VariosClipes({
  clipes,
  midias,
  aoPrever,
  aoExecutar,
}: {
  clipes: { clipe: Clipe; faixa: Faixa }[];
  midias: ReadonlyMap<string, Midia>;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
}) {
  const livres = clipes.filter(({ faixa }) => !faixa.travada);
  const visuais = livres.filter(({ faixa, clipe }) => faixa.tipo !== "audio" && !clipe.ajuste);
  const comSom = livres.filter(({ faixa, clipe }) => {
    const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
    return Boolean(midia?.audio) && (faixa.tipo === "audio" || !clipe.som_separado);
  });
  const ids = (lista: typeof clipes) => lista.map(({ clipe }) => clipe.id);
  const primeiroVisual = visuais[0]?.clipe;
  const primeiroComSom = comSom[0]?.clipe;
  const semTexto = visuais.filter(({ clipe }) => !clipe.texto);
  const controle = (atual: number, criar: (valor: number) => Comando, fator = 1) => ({
    valor: atual * fator,
    aoPrever: (valor: number) => aoPrever(criar(valor / fator)),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / fator - atual) < PERTO) aoPrever(null);
      else aoExecutar(criar(valor / fator));
    },
  });
  const seletor = "w-full rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs";
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h2 className="text-sm font-semibold">{clipes.length} clipes escolhidos</h2>
        <p className="text-xs text-suave">O que você mudar aqui vale para todos{livres.length < clipes.length ? ` (menos os ${clipes.length - livres.length} de faixas travadas)` : ""}.</p>
      </div>
      {primeiroVisual ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Imagem ({visuais.length})</h3>
          <ControleNumerico
            rotulo="Opacidade"
            minimo={0}
            maximo={100}
            sufixo="%"
            {...controle(primeiroVisual.transformacao.opacidade, (valor) => ({ comando: "clipe.transformar", parametros: { clipeIds: ids(visuais), transformacao: { opacidade: valor } } }), 100)}
          />
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-suave">Filtro</span>
            <select
              className={seletor}
              value=""
              onChange={(evento) => {
                const filtro = evento.target.value === "nenhum" ? null : evento.target.value;
                aoExecutar({ comando: "clipe.cor", parametros: { clipeIds: ids(visuais), cor: { filtro } } });
              }}
            >
              <option value="" disabled>
                Escolher para todos…
              </option>
              <option value="nenhum">Original (sem filtro)</option>
              {FILTROS.map((filtro) => (
                <option key={filtro.id} value={filtro.id}>
                  {filtro.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-suave">Efeito</span>
            <select
              className={seletor}
              value=""
              onChange={(evento) => {
                const tipo = evento.target.value === "nenhum" ? null : (evento.target.value as TipoEfeito);
                const alvo = tipo && SO_EM_MIDIA.includes(tipo) ? semTexto : visuais;
                aoExecutar({ comando: "clipe.efeito", parametros: { clipeIds: ids(alvo), efeito: tipo ? { tipo, intensidade: INTENSIDADE_PADRAO } : null } });
              }}
            >
              <option value="" disabled>
                Escolher para todos…
              </option>
              <option value="nenhum">Nenhum</option>
              {EFEITOS.map((efeito) => (
                <option key={efeito.id} value={efeito.id}>
                  {efeito.nome}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={() => aoExecutar({ comando: "clipe.restaurar", parametros: { clipeIds: ids(visuais) } })}>
            <RotateCcw className="size-3.5" aria-hidden />
            Restaurar posição e tamanho
          </button>
        </section>
      ) : null}
      {primeiroComSom ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Som ({comSom.length})</h3>
          <ControleNumerico
            rotulo="Volume"
            minimo={0}
            maximo={VOLUME_MAXIMO * 100}
            sufixo="%"
            {...controle(primeiroComSom.volume, (valor) => ({ comando: "clipe.audio", parametros: { clipeIds: ids(comSom), volume: valor } }), 100)}
          />
          <ControleNumerico
            rotulo="Fade de entrada"
            minimo={0}
            maximo={5}
            passo={0.1}
            sufixo="s"
            {...controle(primeiroComSom.fade_entrada / TICKS_POR_SEGUNDO, (valor) => ({ comando: "clipe.audio", parametros: { clipeIds: ids(comSom), fade_entrada: Math.round(valor * TICKS_POR_SEGUNDO) } }))}
          />
          <ControleNumerico
            rotulo="Fade de saída"
            minimo={0}
            maximo={5}
            passo={0.1}
            sufixo="s"
            {...controle(primeiroComSom.fade_saida / TICKS_POR_SEGUNDO, (valor) => ({ comando: "clipe.audio", parametros: { clipeIds: ids(comSom), fade_saida: Math.round(valor * TICKS_POR_SEGUNDO) } }))}
          />
        </section>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={() => aoExecutar({ comando: "clipe.duplicar", parametros: { clipeIds: ids(livres) } })}>
          <Copy className="size-3.5" aria-hidden />
          Duplicar
        </button>
        <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={() => aoExecutar({ comando: "clipe.apagar", parametros: { clipeIds: ids(livres) } })}>
          <Trash2 className="size-3.5" aria-hidden />
          Apagar
        </button>
      </div>
    </div>
  );
}
