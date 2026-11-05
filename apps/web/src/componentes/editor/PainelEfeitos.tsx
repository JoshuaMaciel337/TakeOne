"use client";

import type { Comando } from "@/lib/projeto/comandos";
import { type Efeito, EFEITOS, INTENSIDADE_PADRAO, SO_EM_MIDIA, type TipoEfeito } from "@/lib/projeto/efeitos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";

import { ControleNumerico } from "./ControleNumerico";
import { GradeDeMateriais } from "./GradeDeMateriais";

const CATEGORIA_DO_EFEITO: Record<TipoEfeito, string> = {
  desfoque: "Foco",
  nitidez: "Foco",
  clareza: "Foco",
  zoom: "Movimento",
  giro: "Movimento",
  distorcao: "Lente",
  pixelizar: "Lente",
  brilho: "Luz",
  luz: "Luz",
  vhs: "Retrô",
  glitch: "Retrô",
  granulacao: "Retrô",
};

type Props = {
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  /** A prévia do efeito sob o mouse (null só tira a prévia). */
  aoMostrar?: (comando: Comando | null) => void;
};

const PERTO = 1e-6;

/** Ferramenta Efeitos: um efeito de vídeo no clipe selecionado, com a intensidade. */
export function PainelEfeitos({ selecionado, aoPrever, aoExecutar, aoMostrar }: Props) {
  const podeAplicar = selecionado !== null && selecionado.faixa.tipo !== "audio";
  const travada = podeAplicar && selecionado.faixa.travada;
  const atual = podeAplicar ? (selecionado.clipe.efeito ?? null) : null;
  const ehTexto = podeAplicar && Boolean(selecionado.clipe.texto);
  const comando = (efeito: Efeito | null): Comando => ({ comando: "clipe.efeito", parametros: { clipeIds: [selecionado!.clipe.id], efeito } });
  const escolher = (tipo: TipoEfeito | null) => {
    if (!podeAplicar || travada) return;
    aoExecutar(comando(tipo ? { tipo, intensidade: atual?.intensidade ?? INTENSIDADE_PADRAO } : null));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-suave">
        {podeAplicar ? "Escolha um efeito para o clipe selecionado, ou arraste um até um clipe da linha do tempo." : "Selecione um clipe de imagem, ou arraste um efeito até um clipe da linha do tempo."}
      </p>
      {travada ? <p className="rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      <GradeDeMateriais
        tipo="efeito"
        itens={EFEITOS.map((efeito) => ({ id: efeito.id, nome: efeito.nome, descricao: efeito.descricao, categoria: CATEGORIA_DO_EFEITO[efeito.id] }))}
        atual={atual?.tipo ?? null}
        nenhum={{ nome: "Nenhum", descricao: "A imagem como veio" }}
        desativado={(id) => Boolean(travada || (ehTexto && id && SO_EM_MIDIA.includes(id as TipoEfeito)))}
        aoEscolher={(id) => escolher(id as TipoEfeito | null)}
        aoPassar={podeAplicar && !travada && aoMostrar ? (id) => aoMostrar(id === null ? null : comando({ tipo: id as TipoEfeito, intensidade: atual?.intensidade ?? INTENSIDADE_PADRAO })) : undefined}
      />
      {atual ? (
        <ControleNumerico
          rotulo="Intensidade"
          valor={atual.intensidade * 100}
          minimo={0}
          maximo={100}
          sufixo="%"
          desativado={travada}
          aoPrever={(valor) => aoPrever(comando({ ...atual, intensidade: valor / 100 }))}
          aoConfirmar={(valor) => {
            if (Math.abs(valor / 100 - atual.intensidade) < PERTO) aoPrever(null);
            else aoExecutar(comando({ ...atual, intensidade: valor / 100 }));
          }}
        />
      ) : null}
    </div>
  );
}
