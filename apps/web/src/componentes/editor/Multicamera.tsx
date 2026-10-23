"use client";

import { Camera, LoaderCircle, Undo2 } from "lucide-react";
import { useState } from "react";

import { lerNiveis } from "@/lib/niveis";
import type { Comando } from "@/lib/projeto/comandos";
import type { CameraSincronizada } from "@/lib/projeto/edicao";
import { type Clipe, type Faixa, fimDoClipe } from "@/lib/projeto/modelo";
import { atrasoNaLinha, atrasoPeloSom } from "@/lib/projeto/multicamera";
import type { Tick } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

type Props = {
  /** O clipe de referência, na principal: o som dele fica e as câmeras encaixam nele. */
  clipe: Clipe;
  faixas: Faixa[];
  midias: ReadonlyMap<string, Midia>;
  tempo: Tick;
  travada: boolean;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
  /** Num clipe de câmera, só a troca: juntar câmeras é pelo clipe da principal. */
  soTrocar?: boolean;
};

/** Até quantas câmeras além da principal. */
const CAMERAS_MAXIMAS = 6;

/**
 * Multicâmera, na aba Básico de um vídeo da principal: as gravações da mesma cena feitas por outras câmeras
 * encaixam pelo som (lib/projeto/multicamera.ts), cada uma numa faixa logo acima, e a troca de câmera no
 * cursor mostra uma delas (ou a principal) até a próxima troca.
 */
export function Multicamera({ clipe, faixas, midias, tempo, travada, aoExecutar, aoAvisar, soTrocar = false }: Props) {
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const cameras = faixas.filter((faixa) => faixa.multicamera);
  const usadas = new Set([clipe.midia_id, ...cameras.map((faixa) => faixa.multicamera!.midia_id)]);
  const candidatas = [...midias.values()].filter((midia) => midia.status === "pronta" && midia.video && midia.audio && !midia.imagem && !midia.animacao && !usadas.has(midia.id));
  const podeSincronizar = !clipe.curva_velocidade && clipe.velocidade === 1;
  // A câmera que aparece no cursor: a faixa de câmera mais de cima com um clipe ali
  const noCursor = cameras.find((faixa) => faixa.clipes.some((c) => c.inicio <= tempo && tempo < fimDoClipe(c)))?.id ?? null;

  function sincronizar() {
    if (!clipe.midia_id || !escolhidas.length) return;
    setSincronizando(true);
    const referencia = lerNiveis(clipe.midia_id);
    Promise.all(
      escolhidas.map((midiaId) =>
        Promise.all([referencia, lerNiveis(midiaId)]).then(([daReferencia, daCamera]) => ({ midiaId, encaixe: atrasoPeloSom(daReferencia, daCamera) })),
      ),
    )
      .then((resultados) => {
        const encaixadas: CameraSincronizada[] = [];
        const semEncaixe: string[] = [];
        for (const { midiaId, encaixe } of resultados) {
          if (encaixe) encaixadas.push({ midiaId, atraso: atrasoNaLinha(clipe, encaixe) });
          else semEncaixe.push(midias.get(midiaId)?.nome ?? "uma câmera");
        }
        if (encaixadas.length) aoExecutar({ comando: "multicamera.sincronizar", parametros: { cameras: encaixadas } });
        setEscolhidas([]);
        aoAvisar(
          semEncaixe.length
            ? `Não achei no som onde ${semEncaixe.join(", ")} encaixa: precisa ser a mesma cena, com pelo menos 10 s juntos.`
            : "Câmeras sincronizadas. Escolha a câmera no cursor para cortar entre elas. Ctrl+Z desfaz.",
        );
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível sincronizar agora."))
      .finally(() => setSincronizando(false));
  }

  const trocar = (faixaId: string | null) => aoExecutar({ comando: "multicamera.trocar", parametros: { tempo, faixaId } });

  return (
    <div className="flex flex-col gap-2 text-xs">
      {cameras.length ? (
        <>
          <p className="text-[11px] text-suave">Ponha o cursor onde quer trocar e escolha a câmera: ela fica até a próxima troca.</p>
          <div className="flex flex-col gap-1" role="group" aria-label="Câmera no cursor">
            {[{ id: null as string | null, nome: "Principal (com o som)" }, ...cameras.map((faixa, i) => ({ id: faixa.id, nome: midias.get(faixa.multicamera!.midia_id)?.nome ?? `Câmera ${i + 2}` }))].map(
              ({ id, nome }) => (
                <button
                  key={id ?? "principal"}
                  type="button"
                  disabled={travada}
                  aria-pressed={noCursor === id}
                  onClick={() => trocar(id)}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left disabled:opacity-40 ${noCursor === id ? "border-destaque bg-destaque/10" : "border-borda hover:border-texto/40"}`}
                >
                  <Camera className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{nome}</span>
                </button>
              ),
            )}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-suave">Junte as gravações da mesma cena feitas por outras câmeras: o som mostra onde cada uma encaixa neste clipe.</p>
      )}
      {soTrocar ? null : !podeSincronizar ? (
        <p className="text-[11px] text-suave">Volte este clipe à velocidade normal para sincronizar.</p>
      ) : cameras.length < CAMERAS_MAXIMAS && candidatas.length ? (
        <fieldset className="flex flex-col gap-1" disabled={travada || sincronizando}>
          <legend className="mb-1 text-[11px] text-suave">{cameras.length ? "Mais câmeras" : "Outras câmeras"}</legend>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {candidatas.map((midia) => (
              <label key={midia.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={escolhidas.includes(midia.id)}
                  disabled={!escolhidas.includes(midia.id) && cameras.length + escolhidas.length >= CAMERAS_MAXIMAS}
                  onChange={(evento) => {
                    const marcada = evento.currentTarget.checked;
                    setEscolhidas((lista) => (marcada ? [...lista, midia.id] : lista.filter((id) => id !== midia.id)));
                  }}
                />
                <span className="truncate">{midia.nome}</span>
              </label>
            ))}
          </div>
          <button type="button" className="botao-secundario mt-1 self-start px-2 py-1 text-xs" disabled={!escolhidas.length} onClick={sincronizar}>
            {sincronizando ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Camera className="size-3.5" aria-hidden />}
            Sincronizar pelo som
          </button>
        </fieldset>
      ) : null}
      {cameras.length ? (
        <button
          type="button"
          className="botao-secundario self-start px-2 py-1 text-xs"
          disabled={travada}
          title="Os clipes das câmeras ficam onde estão, como clipes comuns"
          onClick={() => aoExecutar({ comando: "multicamera.desfazer", parametros: {} })}
        >
          <Undo2 className="size-3.5" aria-hidden />
          Encerrar a multicâmera
        </button>
      ) : null}
    </div>
  );
}
