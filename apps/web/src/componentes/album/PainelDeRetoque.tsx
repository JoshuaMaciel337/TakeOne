"use client";

import { Brush, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { type EdicaoDaFoto, edicaoParaEnviar } from "@/lib/album/edicao";
import type { FotoDoAlbum, PessoaDoAlbum } from "@/lib/album/fotos";
import { comPredefinicao, comValores, CONTROLES_DO_RETOQUE, type ControleDoRetoque, predefinicaoDe, PREDEFINICOES_DE_RETOQUE, type Retoque } from "@/lib/album/retoque";

/**
 * O retoque de retrato das fotos escolhidas: uma predefinição ou controle a controle (pele, manchas, sardas, rugas,
 * olheiras, olhos, dentes, brilho, uniformizar, contornar, pescoço e roupa), só nos rostos de algumas pessoas se
 * pedido, e o pincel de incluir e excluir na lupa. O worker retoca antes da cor (core/utils/retoque.py).
 */
export function PainelDeRetoque({
  alvos,
  referencia,
  pessoas,
  aoEditar,
  aoPincel,
}: {
  alvos: FotoDoAlbum[];
  referencia: FotoDoAlbum | null;
  pessoas: PessoaDoAlbum[];
  aoEditar: (edicoes: { midia_id: string; edicao: EdicaoDaFoto | null }[], aviso: string) => Promise<void>;
  /** Abre a lupa da foto do cursor com o pincel do retoque. */
  aoPincel: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [rascunho, setRascunho] = useState<Partial<Record<ControleDoRetoque, number>>>({});
  const prontas = alvos.filter((foto) => foto.status === "pronta");
  const atual: Retoque = referencia?.edicao?.retoque ?? {};
  const nasFotos = [...new Set(prontas.flatMap((foto) => foto.pessoas ?? []))];
  const nomeDe = (n: number) => pessoas.find((p) => p.numero === n)?.nome || `Pessoa ${n}`;
  const nome = prontas.length > 1 ? `as ${prontas.length.toLocaleString("pt-BR")} fotos` : "a foto";

  async function mudar(conta: (retoque: Retoque | null | undefined) => Retoque, aviso: string) {
    setOcupado(true);
    try {
      await aoEditar(
        prontas.map((foto) => ({ midia_id: foto.midia_id, edicao: { ...edicaoParaEnviar(foto.edicao), retoque: conta(foto.edicao?.retoque) } })),
        aviso,
      );
    } finally {
      setOcupado(false);
    }
  }

  if (!prontas.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Retoque de retrato">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-apagado uppercase">
        Retoque de retrato
        {ocupado ? <LoaderCircle className="size-3 animate-spin" aria-label="Guardando" /> : null}
      </h3>
      <div className="flex items-center gap-1.5">
        <select
          className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs"
          value={predefinicaoDe(atual)}
          disabled={ocupado}
          aria-label="Predefinição do retoque"
          onChange={(evento) => {
            const id = evento.target.value;
            void mudar((r) => comPredefinicao(r, id), id ? `Retoque "${PREDEFINICOES_DE_RETOQUE.find((p) => p.id === id)?.nome}" em ${nome}.` : `Retoque tirado de ${nome}.`);
          }}
        >
          <option value="">{CONTROLES_DO_RETOQUE.some((c) => atual[c.id]) ? "Do seu jeito" : "Sem retoque"}</option>
          {PREDEFINICOES_DE_RETOQUE.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <button type="button" className="flex items-center gap-1 rounded-md bg-painel-2 px-2 py-1 text-xs hover:bg-painel-3 disabled:opacity-40" onClick={aoPincel} disabled={!referencia || ocupado} title="Pintar na foto o que é pele (incluir) e o que não deve ser retocado (excluir)">
          <Brush className="size-3.5" aria-hidden />
          Pincel
        </button>
      </div>
      {nasFotos.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1 text-[11px]" role="group" aria-label="Retocar só estas pessoas">
          <span className="text-suave">Só em:</span>
          {nasFotos.map((n) => {
            const ligada = (atual.pessoas ?? []).includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={ligada}
                disabled={ocupado}
                className={`rounded-full px-2 py-0.5 ${ligada ? "bg-destaque text-white" : "bg-painel-2 text-suave hover:text-texto"}`}
                onClick={() =>
                  void mudar(
                    (r) => {
                      const lista = r?.pessoas ?? [];
                      return { ...(r ?? {}), pessoas: lista.includes(n) ? lista.filter((x) => x !== n) : [...lista, n] };
                    },
                    `Retoque ${ligada ? "também fora de" : "só em"} ${nomeDe(n)}.`,
                  )
                }
              >
                {nomeDe(n)}
              </button>
            );
          })}
        </div>
      ) : null}
      <details>
        <summary className="cursor-pointer text-xs text-suave">Controle a controle</summary>
        <div className="mt-2 flex flex-col gap-1">
          {CONTROLES_DO_RETOQUE.map((c) => {
            const valor = rascunho[c.id] ?? atual[c.id] ?? 0;
            const enviar = () => {
              const novo = rascunho[c.id];
              if (novo === undefined) return;
              void mudar((r) => comValores(r, { [c.id]: novo }), `${c.nome} em ${nome}.`).then(() =>
                setRascunho((r) => {
                  const resto = { ...r };
                  delete resto[c.id];
                  return resto;
                }),
              );
            };
            return (
              <label key={c.id} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-1.5 text-xs">
                <span className="truncate text-suave">{c.nome}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={valor}
                  disabled={ocupado}
                  onChange={(evento) => setRascunho((r) => ({ ...r, [c.id]: Number(evento.target.value) }))}
                  onPointerUp={enviar}
                  onKeyUp={enviar}
                  className="accent-[var(--to-destaque)]"
                  aria-label={c.nome}
                />
                <span className="text-right tabular-nums text-suave">{valor}</span>
              </label>
            );
          })}
        </div>
      </details>
    </section>
  );
}
