"use client";

import type { Comando } from "@/lib/projeto/comandos";
import { DURACAO_TRANSICAO_S } from "@/lib/projeto/edicao";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { duracaoMaximaDaTransicao, TIPOS_TRANSICAO, type TipoTransicao } from "@/lib/projeto/transicao";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";

import { ControleNumerico } from "./ControleNumerico";
import { GradeDeMateriais } from "./GradeDeMateriais";

const CATEGORIA_DA_TRANSICAO: Record<TipoTransicao, string> = {
  fusao: "Básicas",
  escurecer: "Básicas",
  desfoque: "Básicas",
  deslizar: "Movimento",
  empurrar: "Movimento",
  zoom: "Movimento",
  zoom_desfoque: "Movimento",
  cortina_direita: "Cortinas",
  cortina_esquerda: "Cortinas",
  cortina_baixo: "Cortinas",
  cortina_cima: "Cortinas",
  relogio: "Formas",
  iris: "Formas",
  losango: "Formas",
  persianas: "Formas",
  diagonal: "Formas",
  blocos: "Formas",
  flash: "Luz",
  clarao: "Luz",
};

type Props = {
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  /** A prévia da transição sob o mouse (null só tira a prévia). */
  aoMostrar?: (comando: Comando | null) => void;
};

const DURACAO_MAXIMA_S = 2;
const PERTO = 1e-6;

/** Ferramenta Transições: a passagem do clipe selecionado (na principal) para o seguinte. */
export function PainelTransicoes({ selecionado, aoPrever, aoExecutar, aoMostrar }: Props) {
  const faixa = selecionado?.faixa;
  const clipe = selecionado?.clipe;
  const indice = faixa && clipe ? faixa.clipes.findIndex((item) => item.id === clipe.id) : -1;
  const proximo = faixa?.tipo === "principal" && indice >= 0 ? faixa.clipes[indice + 1] : undefined;

  // "Aplicar a todos os cortes" usa a escolhida do clipe ou a fusão, na duração dela
  const emTodos = (tipo: TipoTransicao | null) =>
    aoExecutar({
      comando: "linha.transicaoEmTodos",
      parametros: { transicao: tipo ? { tipo, duracao: clipe?.transicao?.duracao ?? Math.round(DURACAO_TRANSICAO_S * TICKS_POR_SEGUNDO), misturar_som: Boolean(clipe?.transicao?.misturar_som) } : null },
    });

  if (!clipe || !faixa || !proximo) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-suave">
          Selecione um clipe da faixa principal que tenha outro logo depois (a transição fica no corte entre os dois), ou arraste uma transição até perto de um corte da linha do tempo.
        </p>
        <button type="button" className="botao-secundario px-3 py-1.5 text-xs" onClick={() => emTodos("fusao")}>
          Pôr fusão em todos os cortes
        </button>
      </div>
    );
  }

  const atual = clipe.transicao ?? null;
  const maximoS = duracaoMaximaDaTransicao(clipe, proximo) / TICKS_POR_SEGUNDO;
  const definir = (tipo: TipoTransicao | null, duracaoS = atual ? atual.duracao / TICKS_POR_SEGUNDO : DURACAO_TRANSICAO_S): Comando => ({
    comando: "clipe.transicao",
    parametros: {
      clipeId: clipe.id,
      transicao: tipo ? { tipo, duracao: Math.round(Math.min(duracaoS, maximoS) * TICKS_POR_SEGUNDO), misturar_som: Boolean(atual?.misturar_som) } : null,
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-suave">Passagem do clipe selecionado para o próximo (ou arraste uma até perto de um corte). Metade da transição fica antes do corte e metade depois.</p>
      <GradeDeMateriais
        tipo="transicao"
        itens={TIPOS_TRANSICAO.map((tipo) => ({ id: tipo.id, nome: tipo.nome, descricao: tipo.descricao, categoria: CATEGORIA_DA_TRANSICAO[tipo.id] }))}
        atual={atual?.tipo ?? null}
        nenhum={{ nome: "Corte seco", descricao: "Sem transição" }}
        desativado={() => faixa.travada}
        aoEscolher={(id) => aoExecutar(definir(id as TipoTransicao | null))}
        aoPassar={faixa.travada || !aoMostrar ? undefined : (id) => aoMostrar(id === null ? null : definir(id as TipoTransicao))}
      />
      <button
        type="button"
        className="botao-secundario px-3 py-1.5 text-xs"
        disabled={faixa.travada}
        onClick={() => emTodos(atual?.tipo ?? "fusao")}
        title="A transição deste corte, na mesma duração, em todos os cortes da principal"
      >
        {atual ? `Aplicar ${TIPOS_TRANSICAO.find((tipo) => tipo.id === atual.tipo)?.nome ?? ""} a todos os cortes` : "Pôr fusão em todos os cortes"}
      </button>
      {faixa.clipes.some((item) => item.transicao) ? (
        <button type="button" className="text-left text-[11px] text-suave hover:text-texto" disabled={faixa.travada} onClick={() => emTodos(null)}>
          Tirar a transição de todos os cortes
        </button>
      ) : null}
      {atual ? (
        <ControleNumerico
          rotulo="Duração"
          valor={atual.duracao / TICKS_POR_SEGUNDO}
          minimo={0.1}
          maximo={Math.min(DURACAO_MAXIMA_S, maximoS)}
          maximoDigitado={maximoS}
          passo={0.05}
          sufixo="s"
          desativado={faixa.travada}
          aoPrever={(valor) => aoPrever(definir(atual.tipo, valor))}
          aoConfirmar={(valor) => {
            if (Math.abs(valor - atual.duracao / TICKS_POR_SEGUNDO) < PERTO) aoPrever(null);
            else aoExecutar(definir(atual.tipo, valor));
          }}
        />
      ) : null}
      {atual ? (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={Boolean(atual.misturar_som)}
            disabled={faixa.travada}
            onChange={(evento) => aoExecutar({ comando: "clipe.transicao", parametros: { clipeId: clipe.id, transicao: { ...atual, misturar_som: evento.currentTarget.checked } } })}
          />
          <span>
            Misturar o som
            <span className="block text-[11px] text-suave">O som de um some enquanto o do outro aparece, na mesma duração. Sem isso, o som troca no corte.</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
