"use client";

// As janelas de Editar › Preencher (Shift+F5), Editar › Traçado e Imagem › Aparar (ADR 0003, onda 13.4).
import { X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { type IdDoPadrao, usePadroes } from "@/lib/pintura/padroes";
import type { ModoDaPintura } from "@/lib/pintura/traco";
import { MESCLAGENS_DA_IMAGEM } from "@/lib/projeto/modelo";

export type ConteudoDoPreenchimento = "primeiroPlano" | "fundo" | "cor" | "sensivel" | "padrao" | "historico" | "preto" | "cinza" | "branco";
export type Preenchimento = { conteudo: ConteudoDoPreenchimento; cor: string; padrao: IdDoPadrao; modo: ModoDaPintura; opacidade: number; preservar: boolean };
export type Tracado = { largura: number; cor: string; onde: "dentro" | "centro" | "fora"; modo: ModoDaPintura; opacidade: number; preservar: boolean };

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5";

export function Moldura({ titulo, aoFechar, aoConfirmar, children }: { titulo: string; aoFechar: () => void; aoConfirmar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <form
        role="dialog"
        aria-modal
        aria-label={titulo}
        className="w-full max-w-sm rounded-lg border border-borda bg-painel shadow-2xl"
        onClick={(evento) => evento.stopPropagation()}
        onSubmit={(evento) => {
          evento.preventDefault();
          aoConfirmar();
        }}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-2 p-4 text-xs">{children}</div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao-principal px-3 py-1 text-xs">
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

/** O modo e a opacidade da mistura, como no pincel. */
function ModoEOpacidade({ modo, opacidade, preservar, aoMudar, semPreservar = false }: { modo: ModoDaPintura; opacidade: number; preservar: boolean; aoMudar: (mudanca: { modo?: ModoDaPintura; opacidade?: number; preservar?: boolean }) => void; semPreservar?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-2 border-t border-borda pt-2">
      <legend className="sr-only">Mistura</legend>
      <label className="flex items-center gap-2">
        Modo:
        <select className={`${campo} flex-1`} value={modo} onChange={(evento) => aoMudar({ modo: evento.currentTarget.value as ModoDaPintura })}>
          {MESCLAGENS_DA_IMAGEM.map((grupo, indice) => (
            <Fragment key={grupo[0].id}>
              {indice > 0 ? <option disabled>──────────</option> : null}
              {grupo.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Fragment>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        Opacidade:
        <input type="range" min={1} max={100} value={Math.round(opacidade * 100)} onChange={(evento) => aoMudar({ opacidade: Number(evento.currentTarget.value) / 100 })} className="flex-1" aria-label="Opacidade" />
        <span className="w-9 text-right tabular-nums">{Math.round(opacidade * 100)}%</span>
      </label>
      {semPreservar ? null : (
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={preservar} onChange={(evento) => aoMudar({ preservar: evento.currentTarget.checked })} />
          Preservar transparência
        </label>
      )}
    </fieldset>
  );
}

/** Editar › Preencher (Shift+F5): o conteúdo, o modo, a opacidade e o preservar transparência. */
export function JanelaPreencher({ inicial, comFoto, aoFechar, aoConfirmar }: { inicial: Preenchimento; comFoto: boolean; aoFechar: () => void; aoConfirmar: (preenchimento: Preenchimento) => void }) {
  const [p, setP] = useState(inicial);
  const padroes = usePadroes();
  const mudar = (mudanca: Partial<Preenchimento>) => setP((atual) => ({ ...atual, ...mudanca }));
  const sensivel = p.conteudo === "sensivel";
  return (
    <Moldura titulo="Preencher" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(p)}>
      <label className="flex items-center gap-2">
        Conteúdo:
        <select className={`${campo} flex-1`} value={p.conteudo} onChange={(evento) => mudar({ conteudo: evento.currentTarget.value as ConteudoDoPreenchimento })}>
          <option value="primeiroPlano">Cor do primeiro plano</option>
          <option value="fundo">Cor do fundo</option>
          <option value="cor">Cor…</option>
          <option value="sensivel" disabled={!comFoto}>
            Sensível ao conteúdo{comFoto ? "" : " (numa foto)"}
          </option>
          <option value="padrao">Padrão</option>
          <option value="historico">Histórico</option>
          <option value="preto">Preto</option>
          <option value="cinza">50% cinza</option>
          <option value="branco">Branco</option>
        </select>
      </label>
      {p.conteudo === "cor" ? (
        <label className="flex items-center gap-2">
          Cor:
          <input type="color" value={p.cor} onChange={(evento) => mudar({ cor: evento.currentTarget.value })} aria-label="Cor do preenchimento" />
        </label>
      ) : null}
      {p.conteudo === "padrao" ? (
        <label className="flex items-center gap-2">
          Padrão:
          <select className={`${campo} flex-1`} value={p.padrao} onChange={(evento) => mudar({ padrao: evento.currentTarget.value as IdDoPadrao })}>
            {padroes.map((padrao) => (
              <option key={padrao.id} value={padrao.id}>
                {padrao.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {sensivel ? <p className="text-suave">A IA refaz o que está na seleção pelo que está em volta (na foto escolhida).</p> : <ModoEOpacidade modo={p.modo} opacidade={p.opacidade} preservar={p.preservar} aoMudar={mudar} />}
    </Moldura>
  );
}

/** Editar › Traçado: a largura, a cor, onde (dentro, centro, fora), o modo e a opacidade. */
export function JanelaTracado({ inicial, aoFechar, aoConfirmar }: { inicial: Tracado; aoFechar: () => void; aoConfirmar: (tracado: Tracado) => void }) {
  const [t, setT] = useState(inicial);
  const mudar = (mudanca: Partial<Tracado>) => setT((atual) => ({ ...atual, ...mudanca }));
  return (
    <Moldura titulo="Traçado" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(t)}>
      <label className="flex items-center gap-2">
        Largura:
        <input type="number" min={1} max={250} value={t.largura} onChange={(evento) => mudar({ largura: Math.min(250, Math.max(1, Number(evento.currentTarget.value) || 1)) })} className={`${campo} w-16 text-right`} aria-label="Largura do traçado" />
        px
      </label>
      <label className="flex items-center gap-2">
        Cor:
        <input type="color" value={t.cor} onChange={(evento) => mudar({ cor: evento.currentTarget.value })} aria-label="Cor do traçado" />
      </label>
      <fieldset className="flex items-center gap-3">
        <legend className="mb-1">Local:</legend>
        {(
          [
            ["dentro", "Dentro"],
            ["centro", "Centro"],
            ["fora", "Fora"],
          ] as const
        ).map(([id, nome]) => (
          <label key={id} className="flex items-center gap-1">
            <input type="radio" name="local" checked={t.onde === id} onChange={() => mudar({ onde: id })} />
            {nome}
          </label>
        ))}
      </fieldset>
      <ModoEOpacidade modo={t.modo} opacidade={t.opacidade} preservar={t.preservar} aoMudar={mudar} />
    </Moldura>
  );
}

/** Editar › Atenuar (Ctrl+Shift+F): quanto do último passo fica (a opacidade) e o modo da mistura com o de antes. */
export function JanelaAtenuar({ nome, aoFechar, aoConfirmar }: { nome: string; aoFechar: () => void; aoConfirmar: (opacidade: number, modo: ModoDaPintura) => void }) {
  const [opacidade, setOpacidade] = useState(1);
  const [modo, setModo] = useState<ModoDaPintura>("normal");
  return (
    <Moldura titulo={`Atenuar: ${nome}`} aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(opacidade, modo)}>
      <ModoEOpacidade modo={modo} opacidade={opacidade} preservar={false} aoMudar={(mudanca) => {
        if (mudanca.modo) setModo(mudanca.modo);
        if (mudanca.opacidade !== undefined) setOpacidade(mudanca.opacidade);
      }} semPreservar />
    </Moldura>
  );
}

/** Imagem › Aparar: pela transparência, ou pela cor do canto de cima à esquerda ou do de baixo à direita. */
export function JanelaAparar({ temTransparencia, aoFechar, aoConfirmar }: { temTransparencia: boolean; aoFechar: () => void; aoConfirmar: (por: "transparencia" | "cantoDeCima" | "cantoDeBaixo") => void }) {
  const [por, setPor] = useState<"transparencia" | "cantoDeCima" | "cantoDeBaixo">(temTransparencia ? "transparencia" : "cantoDeCima");
  return (
    <Moldura titulo="Aparar" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(por)}>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1">Com base em:</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="aparar" disabled={!temTransparencia} checked={por === "transparencia"} onChange={() => setPor("transparencia")} />
          Pixels transparentes
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="aparar" checked={por === "cantoDeCima"} onChange={() => setPor("cantoDeCima")} />
          Cor do pixel de cima à esquerda
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="aparar" checked={por === "cantoDeBaixo"} onChange={() => setPor("cantoDeBaixo")} />
          Cor do pixel de baixo à direita
        </label>
      </fieldset>
    </Moldura>
  );
}
