"use client";

import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, LockOpen, Shapes, Trash2, Type } from "lucide-react";

import { arquivoDaMidia } from "@/lib/api";
import type { Comando } from "@/lib/projeto/comandos";
import { camadasDaImagem } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  selecao: string[];
  aoSelecionar: (ids: string[]) => void;
  aoExecutar: (comando: Comando) => void;
};

/** As camadas de cima para baixo, com esconder, travar, subir, descer, duplicar e apagar. */
export function PainelCamadas({ projeto, midias, selecao, aoSelecionar, aoExecutar }: Props) {
  const camadas = camadasDaImagem(projeto);
  if (!camadas.length) return <p className="px-3 py-4 text-center text-xs text-suave">Nenhuma camada ainda.</p>;
  return (
    <ol className="flex flex-col gap-1 p-2" aria-label="Camadas, de cima para baixo">
      {camadas.map(({ faixa, clipe }, indice) => {
        const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
        const nome = clipe.texto ? clipe.texto.conteudo.replace(/\s+/g, " ").trim() || "Texto" : (midia?.nome ?? "Imagem");
        const marcada = selecao.includes(clipe.id);
        const botao = "botao-icone size-6";
        return (
          <li key={faixa.id}>
            <div className={`group flex items-center gap-2 rounded-lg border p-1.5 ${marcada ? "border-destaque bg-destaque/10" : "border-transparent hover:bg-painel-2"}`}>
              <button type="button" onClick={() => aoSelecionar([clipe.id])} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={marcada}>
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-painel-3">
                  {clipe.texto ? (
                    <Type className="size-4 text-suave" aria-hidden />
                  ) : midia?.elemento ? (
                    <Shapes className="size-4 text-suave" aria-hidden />
                  ) : midia ? (
                    // eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie
                    <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className={`min-w-0 flex-1 truncate text-xs ${faixa.oculta ? "text-apagado line-through" : ""}`}>{nome}</span>
              </button>
              <span className="flex shrink-0 items-center">
                <button
                  type="button"
                  className={botao}
                  onClick={() =>
                    aoExecutar({
                      comando: "faixa.alternar",
                      parametros: { faixaId: faixa.id, propriedade: "oculta" },
                    })
                  }
                  aria-label={faixa.oculta ? `Mostrar ${nome}` : `Esconder ${nome}`}
                  title={faixa.oculta ? "Mostrar" : "Esconder"}
                >
                  {faixa.oculta ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                </button>
                <button
                  type="button"
                  className={botao}
                  onClick={() =>
                    aoExecutar({
                      comando: "faixa.alternar",
                      parametros: { faixaId: faixa.id, propriedade: "travada" },
                    })
                  }
                  aria-label={faixa.travada ? `Destravar ${nome}` : `Travar ${nome}`}
                  title={faixa.travada ? "Destravar" : "Travar"}
                >
                  {faixa.travada ? <Lock className="size-3.5" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
                </button>
                <button
                  type="button"
                  className={botao}
                  disabled={indice === 0}
                  onClick={() =>
                    aoExecutar({
                      comando: "imagem.mover",
                      parametros: { faixaId: faixa.id, para: "cima" },
                    })
                  }
                  aria-label={`Trazer ${nome} para a frente`}
                  title="Para a frente"
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={botao}
                  disabled={indice === camadas.length - 1}
                  onClick={() =>
                    aoExecutar({
                      comando: "imagem.mover",
                      parametros: { faixaId: faixa.id, para: "baixo" },
                    })
                  }
                  aria-label={`Levar ${nome} para trás`}
                  title="Para trás"
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={botao}
                  onClick={() =>
                    aoExecutar({
                      comando: "imagem.duplicar",
                      parametros: { faixaId: faixa.id },
                    })
                  }
                  aria-label={`Duplicar ${nome}`}
                  title="Duplicar (Ctrl+D)"
                >
                  <Copy className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={botao}
                  disabled={faixa.travada}
                  onClick={() =>
                    aoExecutar({
                      comando: "imagem.apagar",
                      parametros: { faixaId: faixa.id },
                    })
                  }
                  aria-label={`Apagar ${nome}`}
                  title="Apagar (Delete)"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
