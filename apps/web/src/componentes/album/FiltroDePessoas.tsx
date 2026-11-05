"use client";

import { Pencil, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type Filtro, type FotoDoAlbum, type PessoaDoAlbum, recorteDoRosto } from "@/lib/album/fotos";
import { arquivoDaMidia } from "@/lib/api";

/** As pessoas que valem a pena no filtro: com nome, ou em pelo menos duas fotos (um rosto só costuma ser alguém ao fundo). */
export function pessoasDoFiltro(pessoas: PessoaDoAlbum[]): PessoaDoAlbum[] {
  return pessoas.filter((p) => p.nome || p.fotos >= 2);
}

/** O rosto de uma pessoa, recortado da capa da foto que a representa. */
export function RostoDaPessoa({ pessoa, tamanhos, lado = 44 }: { pessoa: PessoaDoAlbum; tamanhos: Map<string, [number, number]>; lado?: number }) {
  const [largura, altura] = tamanhos.get(pessoa.capa_midia_id) ?? [1, 1];
  return (
    <span
      className="shrink-0 rounded-full bg-painel-3 bg-no-repeat"
      style={{ width: lado, height: lado, backgroundImage: `url(${arquivoDaMidia(pessoa.capa_midia_id, "capa.jpg")})`, ...recorteDoRosto(pessoa.caixa, largura, altura, 1.4) }}
      aria-hidden
    />
  );
}

/**
 * O botão "Pessoas" da barra de filtros: os rostos achados no álbum, para mostrar as fotos de uma ou mais pessoas
 * ("alguma delas" ou "todas juntas"), e o lápis que dá nome a cada uma.
 */
export function FiltroDePessoas({
  pessoas,
  fotos,
  filtro,
  aoMudar,
  aoNomear,
}: {
  pessoas: PessoaDoAlbum[];
  fotos: FotoDoAlbum[];
  filtro: Filtro;
  aoMudar: (filtro: Filtro) => void;
  aoNomear: (numero: number, nome: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = pessoasDoFiltro(pessoas);
  const tamanhos = new Map(fotos.map((f) => [f.midia_id, [f.largura ?? 1, f.altura ?? 1] as [number, number]]));

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    };
    window.addEventListener("pointerdown", fora);
    return () => window.removeEventListener("pointerdown", fora);
  }, [aberto]);

  if (!lista.length) return null;
  const alternar = (numero: number) =>
    aoMudar({ ...filtro, pessoas: filtro.pessoas.includes(numero) ? filtro.pessoas.filter((n) => n !== numero) : [...filtro.pessoas, numero] });

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${filtro.pessoas.length ? "border-destaque text-texto" : "border-borda text-suave hover:text-texto"} bg-painel-2`}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
      >
        <Users className="size-3.5" aria-hidden />
        Pessoas{filtro.pessoas.length ? ` · ${filtro.pessoas.length}` : ""}
      </button>
      {aberto ? (
        <div className="fixed z-30 mt-1 w-72 rounded-lg border border-borda bg-painel p-2 shadow-2xl shadow-black/50" role="dialog" aria-label="Pessoas do álbum">
          <div className="mb-2 flex items-center gap-1 text-xs">
            <span className="flex-1 text-suave">Mostrar as fotos com</span>
            <div className="flex rounded-md bg-painel-2 p-0.5" role="radiogroup" aria-label="Como juntar as pessoas">
              {(
                [
                  ["alguma", "alguma"],
                  ["todas", "todas juntas"],
                ] as const
              ).map(([id, nome]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={filtro.pessoasModo === id}
                  onClick={() => aoMudar({ ...filtro, pessoasModo: id })}
                  className={`rounded px-2 py-0.5 ${filtro.pessoasModo === id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}
                >
                  {nome}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {lista.map((pessoa) => {
              const ligada = filtro.pessoas.includes(pessoa.numero);
              return (
                <li key={pessoa.numero} className={`flex items-center gap-2 rounded-md p-1 ${ligada ? "bg-destaque/15" : "hover:bg-painel-2"}`}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => alternar(pessoa.numero)} aria-pressed={ligada}>
                    <RostoDaPessoa pessoa={pessoa} tamanhos={tamanhos} />
                    {editando === pessoa.numero ? null : (
                      <span className="flex min-w-0 flex-col text-xs">
                        <span className={`truncate ${pessoa.nome ? "font-medium" : "text-suave"}`}>{pessoa.nome || `Pessoa ${pessoa.numero}`}</span>
                        <span className="text-[11px] text-apagado">{pessoa.fotos.toLocaleString("pt-BR")} fotos</span>
                      </span>
                    )}
                  </button>
                  {editando === pessoa.numero ? (
                    <input
                      autoFocus
                      defaultValue={pessoa.nome}
                      maxLength={80}
                      placeholder="Nome"
                      aria-label="Nome da pessoa"
                      className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs"
                      onBlur={(evento) => {
                        if (evento.target.value.trim() !== pessoa.nome) aoNomear(pessoa.numero, evento.target.value.trim());
                        setEditando(null);
                      }}
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter") evento.currentTarget.blur();
                        if (evento.key === "Escape") {
                          evento.currentTarget.value = pessoa.nome;
                          evento.currentTarget.blur();
                        }
                        evento.stopPropagation();
                      }}
                    />
                  ) : (
                    <button type="button" className="botao-icone" onClick={() => setEditando(pessoa.numero)} aria-label={`Dar nome a ${pessoa.nome || `Pessoa ${pessoa.numero}`}`} title="Dar nome">
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {filtro.pessoas.length ? (
            <button type="button" className="mt-2 w-full rounded-md py-1 text-xs text-suave hover:bg-painel-2 hover:text-texto" onClick={() => aoMudar({ ...filtro, pessoas: [] })}>
              Todas as fotos
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
