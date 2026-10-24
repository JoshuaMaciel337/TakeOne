"use client";

// As propriedades da máscara vetorial (painel Propriedades, com ela em foco): densidade e difusão, a base (revelar ou
// ocultar fora dos caminhos), e os botões de desativar, vincular e excluir. As ferramentas de caminho editam os
// caminhos dela enquanto ela está em foco.
import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import type { Comando } from "@/lib/projeto/comandos";
import type { MascaraVetorial } from "@/lib/vetor/mascaraVetorial";

export type AcaoDaMascaraVetorial = "revelar" | "ocultar" | "caminho" | "ligar" | "vincular" | "excluir" | "foco" | "inverter";

export function PropriedadesDaMascaraVetorial({
  clipeId,
  mascara,
  travada,
  aoPrever,
  aoExecutar,
  aoAcao,
}: {
  clipeId: string;
  mascara: MascaraVetorial;
  travada: boolean;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => unknown;
  aoAcao: (acao: AcaoDaMascaraVetorial) => void;
}) {
  const mudar = (mudanca: Partial<MascaraVetorial>): Comando => ({ comando: "imagem.mascaraVetorial", parametros: { clipeId, mascara: { ...mascara, ...mudanca } } });
  const botao = "botao-secundario px-2 py-1 text-xs";
  return (
    <div className="space-y-3 p-3 text-xs" data-propriedades-mascara-vetorial>
      <div>
        <h3 className="font-semibold">Máscara vetorial</h3>
        <p className="mt-0.5 text-suave">
          {mascara.base === "revelar" ? "Fora dos caminhos a camada aparece; os caminhos que subtraem escondem." : "Fora dos caminhos a camada some; os caminhos que somam mostram."} As ferramentas de caminho (P e A) editam os caminhos dela.
        </p>
      </div>
      <ControleNumerico
        rotulo="Densidade"
        valor={mascara.densidade * 100}
        minimo={0}
        maximo={100}
        sufixo="%"
        desativado={travada}
        aoPrever={(valor) => aoPrever(mudar({ densidade: valor / 100 }))}
        aoConfirmar={(valor) => aoExecutar(mudar({ densidade: valor / 100 }))}
      />
      <ControleNumerico
        rotulo="Difusão"
        valor={mascara.difusao}
        minimo={0}
        maximo={250}
        maximoDigitado={1000}
        passo={0.5}
        sufixo="px"
        desativado={travada}
        aoPrever={(valor) => aoPrever(mudar({ difusao: valor }))}
        aoConfirmar={(valor) => aoExecutar(mudar({ difusao: valor }))}
      />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={botao} disabled={travada} onClick={() => aoAcao("inverter")} title="Troca a base: o que estava à mostra some, e o contrário">
          Inverter
        </button>
        <button type="button" className={botao} disabled={travada} onClick={() => aoAcao("ligar")}>
          {mascara.ligada ? "Desativar" : "Ativar"}
        </button>
        <button type="button" className={botao} disabled={travada} onClick={() => aoAcao("vincular")}>
          {mascara.vinculada ? "Desvincular" : "Vincular"}
        </button>
        <button type="button" className={botao} disabled={travada} onClick={() => aoAcao("excluir")}>
          Excluir
        </button>
      </div>
      <button type="button" className="text-destaque hover:underline" onClick={() => aoAcao("foco")}>
        Voltar à camada
      </button>
    </div>
  );
}
