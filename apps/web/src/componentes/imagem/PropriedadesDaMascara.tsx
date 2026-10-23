"use client";

// As propriedades da máscara de camada pintável (painel Propriedades, com a máscara em foco), como nos editores de
// imagem: densidade e difusão, e os botões de inverter, aplicar, desativar, vincular e excluir.
import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import type { Comando } from "@/lib/projeto/comandos";
import type { MascaraDePixels } from "@/lib/projeto/mascaraDePixels";

type Acao = "inverter" | "aplicar" | "ligar" | "vincular" | "excluir" | "foco";

export function PropriedadesDaMascara({
  clipeId,
  mascara,
  travada,
  aoPrever,
  aoExecutar,
  aoAcao,
}: {
  clipeId: string;
  mascara: MascaraDePixels;
  travada: boolean;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => unknown;
  aoAcao: (acao: Acao) => void;
}) {
  const mudar = (mudanca: Partial<MascaraDePixels>): Comando => ({ comando: "mascara.mudar", parametros: { clipeId, mudanca } });
  const botao = "botao-secundario px-2 py-1 text-xs";
  return (
    <div className="space-y-3 p-3 text-xs">
      <div>
        <h3 className="font-semibold">Máscara de pixels</h3>
        <p className="mt-0.5 text-suave">O pincel pinta a máscara: o branco mostra a camada e o preto esconde. Ctrl+\ volta para a imagem.</p>
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
        <button type="button" className={botao} disabled={travada} onClick={() => aoAcao("inverter")}>
          Inverter
        </button>
        <button type="button" className={botao} disabled={travada} onClick={() => aoAcao("aplicar")} title="Grava a máscara nos pixels da camada">
          Aplicar
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
        Voltar a pintar na imagem
      </button>
    </div>
  );
}
