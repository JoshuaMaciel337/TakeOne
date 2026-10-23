"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, Plus, Strikethrough, Underline, X } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import {
  type Alinhamento,
  alternarPalavraChave,
  COR_CHAVE,
  type ContornoExtra,
  CONTORNOS_EXTRAS,
  type Destaque,
  FONTES_TEXTO,
  type FonteTexto,
  ENTRELINHA_PADRAO,
  LIMITES_TEXTO,
  palavrasDoTexto,
  SOMBRA_PADRAO,
  type Texto,
} from "@/lib/projeto/texto";

import { CampoCor } from "./CampoCor";
import { ControleNumerico } from "./ControleNumerico";

type Props = {
  clipe: Clipe;
  faixa: Faixa;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

const MODOS_DESTAQUE: { id: Destaque["modo"] | "nenhum"; nome: string }[] = [
  { id: "nenhum", nome: "Nenhum" },
  { id: "karaoke", nome: "Karaokê (pinta até a palavra falada)" },
  { id: "palavra", nome: "Só a palavra falada" },
];
const COR_DESTAQUE = "#ffd60a";

const ALINHAMENTOS: { id: Alinhamento; nome: string; icone: typeof AlignLeft }[] = [
  { id: "esquerda", nome: "Alinhar à esquerda", icone: AlignLeft },
  { id: "centro", nome: "Centralizar", icone: AlignCenter },
  { id: "direita", nome: "Alinhar à direita", icone: AlignRight },
];

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-borda/60 pb-2 pt-3 first:pt-0 last:border-0">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">{titulo}</h3>
      {children}
    </section>
  );
}

function BotaoAlternar({ ativo, rotulo, desativado, aoClicar, children }: { ativo: boolean; rotulo: string; desativado: boolean; aoClicar: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={rotulo}
      title={rotulo}
      disabled={desativado}
      onClick={aoClicar}
      className={`botao-icone ${ativo ? "bg-painel-3 text-texto" : ""}`}
    >
      {children}
    </button>
  );
}

const PERTO = 1e-6;

/** Conteúdo, fonte, cor, contorno, sombra e fundo de um clipe de texto. */
/** `semTempo`: no editor de imagem, sem o destaque da fala (que anda com o tempo). */
export function AbaTexto({ clipe, faixa, aoPrever, aoExecutar, semTempo = false }: Props & { semTempo?: boolean }) {
  const texto = clipe.texto!;
  const travada = faixa.travada;
  const mudar = (mudanca: Partial<Texto>): Comando => ({ comando: "texto.mudar", parametros: { clipeIds: [clipe.id], texto: mudanca } });
  /** Controle deslizante: `fator` converte o valor guardado no que aparece (0,07 → 7%). */
  const controle = (chave: "tamanho" | "contorno_espessura" | "sombra" | "fundo_opacidade" | "brilho", fator: number) => ({
    valor: texto[chave] * fator,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(mudar({ [chave]: valor / fator })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / fator - texto[chave]) < PERTO) aoPrever(null);
      else aoExecutar(mudar({ [chave]: valor / fator }));
    },
  });
  /** Os campos que textos antigos não têm: `padrao` quando faltam. */
  const opcional = (
    chave: "espacamento" | "entrelinha" | "sombra_angulo" | "sombra_distancia" | "sombra_desfoque" | "sombra_espalhar" | "brilho_tamanho" | "preenchimento",
    padrao: number,
    fator: number,
  ) => {
    const atual = texto[chave] ?? padrao;
    return {
      valor: atual * fator,
      desativado: travada,
      aoPrever: (valor: number) => aoPrever(mudar({ [chave]: valor / fator })),
      aoConfirmar: (valor: number) => {
        if (Math.abs(valor / fator - atual) < PERTO) aoPrever(null);
        else aoExecutar(mudar({ [chave]: valor / fator }));
      },
    };
  };
  const cor = (chave: "cor" | "contorno_cor" | "fundo_cor" | "brilho_cor" | "sombra_cor") => ({
    cor: texto[chave] ?? SOMBRA_PADRAO.cor,
    desativado: travada,
    aoPrever: (valor: string) => aoPrever(mudar({ [chave]: valor })),
    aoConfirmar: (valor: string) => aoExecutar(mudar({ [chave]: valor })),
  });

  return (
    <div>
      {travada ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      <Secao titulo="Texto">
        <textarea
          value={texto.conteudo}
          disabled={travada}
          maxLength={LIMITES_TEXTO.conteudo}
          rows={3}
          aria-label="Texto"
          // Cada letra aparece na prévia; vira um passo do desfazer quando sai do campo
          onFocus={(evento) => {
            evento.currentTarget.dataset.inicial = evento.currentTarget.value;
          }}
          onChange={(evento) => aoPrever(mudar({ conteudo: evento.currentTarget.value }))}
          onBlur={(evento) => {
            const { value, dataset } = evento.currentTarget;
            if (value === dataset.inicial) aoPrever(null);
            else aoExecutar(mudar({ conteudo: value }));
          }}
          className="mb-2 w-full resize-y rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-sm outline-none focus:border-destaque disabled:opacity-50"
        />
        <div className="flex items-center gap-2">
          <select
            value={texto.fonte}
            disabled={travada}
            aria-label="Fonte"
            onChange={(evento) => aoExecutar(mudar({ fonte: evento.currentTarget.value as FonteTexto }))}
            className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
          >
            {FONTES_TEXTO.map((fonte) => (
              <option key={fonte.id} value={fonte.id}>
                {fonte.nome}
              </option>
            ))}
          </select>
          <BotaoAlternar ativo={texto.negrito} rotulo="Negrito" desativado={travada} aoClicar={() => aoExecutar(mudar({ negrito: !texto.negrito }))}>
            <Bold className="size-4" aria-hidden />
          </BotaoAlternar>
          <BotaoAlternar ativo={texto.caixa_alta} rotulo="Tudo em maiúsculas" desativado={travada} aoClicar={() => aoExecutar(mudar({ caixa_alta: !texto.caixa_alta }))}>
            <CaseUpper className="size-4" aria-hidden />
          </BotaoAlternar>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-suave">Alinhamento</span>
          <span className="flex gap-1">
            {ALINHAMENTOS.map(({ id, nome, icone: Icone }) => (
              <BotaoAlternar key={id} ativo={texto.alinhamento === id} rotulo={nome} desativado={travada} aoClicar={() => aoExecutar(mudar({ alinhamento: id }))}>
                <Icone className="size-4" aria-hidden />
              </BotaoAlternar>
            ))}
          </span>
        </div>
        <ControleNumerico
          rotulo="Tamanho"
          minimo={LIMITES_TEXTO.tamanho.minimo * 100}
          maximo={LIMITES_TEXTO.tamanho.maximo * 100}
          passo={0.5}
          sufixo="%"
          {...controle("tamanho", 100)}
        />
        <CampoCor rotulo="Cor" {...cor("cor")} />
        <ControleNumerico rotulo="Opacidade das letras" minimo={0} maximo={100} sufixo="%" {...opcional("preenchimento", 1, 100)} />
      </Secao>
      <Secao titulo="Letras e linhas">
        <ControleNumerico
          rotulo="Espaçamento"
          minimo={LIMITES_TEXTO.espacamento.minimo * 100}
          maximo={50}
          maximoDigitado={LIMITES_TEXTO.espacamento.maximo * 100}
          passo={0.5}
          sufixo="%"
          {...opcional("espacamento", 0, 100)}
        />
        <ControleNumerico
          rotulo="Entrelinha"
          minimo={LIMITES_TEXTO.entrelinha.minimo * 100}
          maximo={LIMITES_TEXTO.entrelinha.maximo * 100}
          passo={5}
          sufixo="%"
          {...opcional("entrelinha", ENTRELINHA_PADRAO, 100)}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-suave">Riscos</span>
          <span className="flex gap-1">
            <BotaoAlternar ativo={Boolean(texto.sublinhado)} rotulo="Sublinhado" desativado={travada} aoClicar={() => aoExecutar(mudar({ sublinhado: !texto.sublinhado }))}>
              <Underline className="size-4" aria-hidden />
            </BotaoAlternar>
            <BotaoAlternar ativo={Boolean(texto.tachado)} rotulo="Tachado" desativado={travada} aoClicar={() => aoExecutar(mudar({ tachado: !texto.tachado }))}>
              <Strikethrough className="size-4" aria-hidden />
            </BotaoAlternar>
          </span>
        </div>
      </Secao>
      <Secao titulo="Contorno">
        <ControleNumerico rotulo="Espessura" minimo={0} maximo={LIMITES_TEXTO.contorno.maximo * 100} passo={0.5} sufixo="%" {...controle("contorno_espessura", 100)} />
        <CampoCor rotulo="Cor do contorno" {...cor("contorno_cor")} />
        {(texto.contornos ?? []).map((extra, i) => {
          const trocar = (mudanca: Partial<ContornoExtra>) => (texto.contornos ?? []).map((item, j) => (j === i ? { ...item, ...mudanca } : item));
          return (
            <div key={i} className="mt-2 rounded-md border border-borda/60 p-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-suave">Contorno por fora {i + 1}</span>
                <button
                  type="button"
                  className="botao-icone size-6"
                  disabled={travada}
                  aria-label={`Tirar o contorno por fora ${i + 1}`}
                  onClick={() => aoExecutar(mudar({ contornos: (texto.contornos ?? []).filter((_, j) => j !== i) }))}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              <ControleNumerico
                rotulo="Espessura"
                valor={extra.espessura * 100}
                minimo={0}
                maximo={LIMITES_TEXTO.contorno.maximo * 100}
                passo={0.5}
                sufixo="%"
                desativado={travada}
                aoPrever={(valor) => aoPrever(mudar({ contornos: trocar({ espessura: valor / 100 }) }))}
                aoConfirmar={(valor) => {
                  if (Math.abs(valor / 100 - extra.espessura) < PERTO) aoPrever(null);
                  else aoExecutar(mudar({ contornos: trocar({ espessura: valor / 100 }) }));
                }}
              />
              <CampoCor
                rotulo="Cor"
                cor={extra.cor}
                desativado={travada}
                aoPrever={(valor) => aoPrever(mudar({ contornos: trocar({ cor: valor }) }))}
                aoConfirmar={(valor) => aoExecutar(mudar({ contornos: trocar({ cor: valor }) }))}
              />
            </div>
          );
        })}
        {(texto.contornos?.length ?? 0) < CONTORNOS_EXTRAS ? (
          <button
            type="button"
            className="botao-secundario mt-2 w-full px-3 py-1 text-xs"
            disabled={travada}
            onClick={() => aoExecutar(mudar({ contornos: [...(texto.contornos ?? []), { cor: texto.contornos?.length ? "#ffffff" : "#000000", espessura: 0.06 }] }))}
          >
            <Plus className="size-3.5" aria-hidden /> Contorno por fora
          </button>
        ) : null}
      </Secao>
      <Secao titulo="Sombra">
        <ControleNumerico rotulo="Sombra" minimo={0} maximo={100} sufixo="%" {...controle("sombra", 100)} />
        {texto.sombra > 0 ? (
          <>
            <CampoCor rotulo="Cor da sombra" {...cor("sombra_cor")} />
            <ControleNumerico rotulo="Direção" minimo={-180} maximo={180} passo={5} sufixo="°" {...opcional("sombra_angulo", SOMBRA_PADRAO.angulo, 1)} />
            <ControleNumerico
              rotulo="Distância"
              minimo={0}
              maximo={LIMITES_TEXTO.sombraDistancia.maximo * 100}
              passo={0.5}
              sufixo="%"
              {...opcional("sombra_distancia", SOMBRA_PADRAO.distancia, 100)}
            />
            <ControleNumerico
              rotulo="Desfoque"
              minimo={0}
              maximo={LIMITES_TEXTO.sombraDesfoque.maximo * 100}
              passo={0.5}
              sufixo="%"
              {...opcional("sombra_desfoque", SOMBRA_PADRAO.desfoque, 100)}
            />
            <ControleNumerico rotulo="Espalhar" minimo={0} maximo={100} sufixo="%" {...opcional("sombra_espalhar", 0, 100)} />
          </>
        ) : null}
      </Secao>
      <Secao titulo="Fundo">
        <ControleNumerico rotulo="Fundo" minimo={0} maximo={100} sufixo="%" {...controle("fundo_opacidade", 100)} />
        <CampoCor rotulo="Cor do fundo" {...cor("fundo_cor")} />
      </Secao>
      <Secao titulo="Brilho">
        <ControleNumerico rotulo="Brilho" minimo={0} maximo={100} sufixo="%" {...controle("brilho", 100)} />
        <CampoCor rotulo="Cor do brilho" {...cor("brilho_cor")} />
        {texto.brilho > 0 ? (
          <ControleNumerico
            rotulo="Tamanho do brilho"
            minimo={LIMITES_TEXTO.brilhoTamanho.minimo * 100}
            maximo={LIMITES_TEXTO.brilhoTamanho.maximo * 100}
            passo={5}
            sufixo="%"
            {...opcional("brilho_tamanho", 1, 100)}
          />
        ) : null}
      </Secao>
      <Secao titulo="Palavras-chave">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Palavras-chave">
          {palavrasDoTexto(texto.conteudo).map((palavra, numero) => {
            const ligada = texto.palavras_chave?.includes(numero) ?? false;
            return (
              <button
                key={`${numero}-${palavra}`}
                type="button"
                aria-pressed={ligada}
                disabled={travada}
                onClick={() => aoExecutar(mudar({ palavras_chave: alternarPalavraChave(texto, numero) }))}
                className={`rounded border px-1.5 py-0.5 text-[11px] transition ${ligada ? "border-transparent font-semibold text-black" : "border-borda text-suave hover:text-texto"}`}
                style={ligada ? { background: texto.cor_chave ?? COR_CHAVE } : undefined}
              >
                {palavra}
              </button>
            );
          })}
        </div>
        {texto.palavras_chave?.length ? (
          <CampoCor
            rotulo="Cor das palavras-chave"
            cor={texto.cor_chave ?? COR_CHAVE}
            desativado={travada}
            aoPrever={(valor) => aoPrever(mudar({ cor_chave: valor }))}
            aoConfirmar={(valor) => aoExecutar(mudar({ cor_chave: valor }))}
          />
        ) : (
          <p className="mt-1 text-[11px] text-suave">Toque numa palavra para pintá-la de outra cor.</p>
        )}
      </Secao>
      {semTempo ? null : (
        <Secao titulo="Destaque da fala">
          <select
            aria-label="Destaque da fala"
            className="w-full rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
            disabled={travada}
            value={texto.destaque?.modo ?? "nenhum"}
            onChange={(evento) => {
              const modo = evento.currentTarget.value as Destaque["modo"] | "nenhum";
              aoExecutar(mudar({ destaque: modo === "nenhum" ? null : { modo, cor: texto.destaque?.cor ?? COR_DESTAQUE } }));
            }}
          >
            {MODOS_DESTAQUE.map(({ id, nome }) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          {texto.destaque ? (
            <CampoCor
              rotulo="Cor da palavra"
              cor={texto.destaque.cor}
              desativado={travada}
              aoPrever={(valor) => aoPrever(mudar({ destaque: { ...texto.destaque!, cor: valor } }))}
              aoConfirmar={(valor) => aoExecutar(mudar({ destaque: { ...texto.destaque!, cor: valor } }))}
            />
          ) : null}
          {texto.destaque && !texto.tempos ? <p className="mt-1 text-[11px] text-suave">Sem os tempos da fala, as palavras dividem a duração da legenda.</p> : null}
        </Secao>
      )}
    </div>
  );
}
