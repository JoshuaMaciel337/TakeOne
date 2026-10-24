"use client";

// Editar › Atalhos de teclado e menus e Barra de ferramentas do editor de imagem (ADR 0003, onda 13.15): três abas
// sobre uma cópia da personalização, que só vale no OK. Atalhos: o atalho de cada comando dos menus (clique e aperte as
// teclas; Backspace tira; Esc desiste), com o aviso dos repetidos e dos que o navegador não deixa usar. Menus: esconder
// e colorir cada item. Ferramentas: a tecla de cada uma, quais ficam na caixa e uma ou duas colunas.
import { Eye, EyeOff, RotateCcw, Search, X } from "lucide-react";
import { useState } from "react";

import { teclaDoEvento } from "@/componentes/area/BarraDeMenus";
import { ATALHOS_DO_NAVEGADOR, atalhosRepetidos, CORES_DOS_ITENS, type CorDoItem, PERSONALIZACAO_PADRAO, type Personalizacao } from "@/lib/imagem/personalizacao";
import { type ItemPesquisavel, semAcento } from "@/lib/pesquisa";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
export type AbaDaPersonalizacao = "atalhos" | "menus" | "ferramentas";
type Ferramenta = { id: string; nome: string; tecla: string; /** O grupo da caixa (as do mesmo grupo dividem a tecla, com Shift). */ grupo: number };
const semChave = <T,>(objeto: Record<string, T>, chave: string) => Object.fromEntries(Object.entries(objeto).filter(([k]) => k !== chave));

type Props = {
  aba: AbaDaPersonalizacao;
  personalizacao: Personalizacao;
  /** Os comandos dos menus como vêm de fábrica (com a chave e o atalho de fábrica). */
  comandos: ItemPesquisavel[];
  ferramentas: Ferramenta[];
  aoFechar: () => void;
  aoConfirmar: (personalizacao: Personalizacao) => void;
};

export function JanelaPersonalizar({ aba: abaInicial, personalizacao, comandos, ferramentas, aoFechar, aoConfirmar }: Props) {
  const [aba, setAba] = useState(abaInicial);
  const [p, setP] = useState(personalizacao);
  const [busca, setBusca] = useState("");
  const [gravando, setGravando] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const atalhoDe = (item: ItemPesquisavel) => (item.chave! in p.atalhos ? p.atalhos[item.chave!] : (item.atalho ?? ""));
  const repetidos = atalhosRepetidos(comandos.map((item) => ({ chave: item.chave!, atalho: atalhoDe(item) })));
  const filtro = semAcento(busca.trim());
  const visiveis = comandos.filter((item) => !filtro || semAcento(`${item.caminho} ${item.nome}`).includes(filtro));
  const restaurar = () => setP(aba === "atalhos" ? { ...p, atalhos: {} } : aba === "menus" ? { ...p, ocultos: [], cores: {} } : { ...p, teclas: {}, ferramentasOcultas: [], colunas: PERSONALIZACAO_PADRAO.colunas });
  const aba_ = (id: AbaDaPersonalizacao, nome: string) => (
    <button type="button" role="tab" aria-selected={aba === id} className={`px-3 py-1.5 text-xs ${aba === id ? "border-b-2 border-destaque text-texto" : "text-suave hover:text-texto"}`} onClick={() => setAba(id)}>
      {nome}
    </button>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Atalhos de teclado e menus" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Atalhos de teclado e menus</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div role="tablist" className="flex border-b border-borda px-2">
          {aba_("atalhos", "Atalhos de teclado")}
          {aba_("menus", "Menus")}
          {aba_("ferramentas", "Barra de ferramentas")}
        </div>
        {aba !== "ferramentas" ? (
          <label className="mx-4 mt-3 flex items-center gap-2">
            <Search className="size-3.5 text-suave" aria-hidden />
            <input aria-label="Procurar um comando" className={`${CAMPO} flex-1`} placeholder="Procurar um comando" value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
          </label>
        ) : null}
        {aviso ? <p className="mx-4 mt-2 text-xs text-amber-400">{aviso}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 text-xs">
          {aba === "atalhos" ? (
            <table className="w-full" aria-label="Atalhos dos comandos">
              <tbody>
                {visiveis.map((item) => {
                  const atalho = atalhoDe(item);
                  const repetido = atalho.split(" ou ").some((parte) => (repetidos.get(parte)?.length ?? 0) > 1);
                  const mudado = item.chave! in p.atalhos;
                  return (
                    <tr key={item.chave} className="border-b border-borda/40">
                      <td className="py-1 pr-2">
                        <span className="text-suave">{item.caminho} › </span>
                        {item.nome}
                      </td>
                      <td className="w-48 py-1">
                        <button
                          type="button"
                          aria-label={`Atalho de ${item.nome}`}
                          className={`${CAMPO} w-full text-left ${gravando === item.chave ? "ring-1 ring-destaque" : ""} ${repetido ? "text-erro" : ""}`}
                          onClick={() => setGravando(item.chave!)}
                          onBlur={() => setGravando((g) => (g === item.chave ? null : g))}
                          onKeyDown={(evento) => {
                            if (gravando !== item.chave) return;
                            evento.preventDefault();
                            evento.stopPropagation();
                            if (evento.key === "Escape") return setGravando(null);
                            if (evento.key === "Backspace" || evento.key === "Delete") {
                              setP({ ...p, atalhos: { ...p.atalhos, [item.chave!]: "" } });
                              return setGravando(null);
                            }
                            const tecla = teclaDoEvento(evento.nativeEvent);
                            if (!tecla) return;
                            if (ATALHOS_DO_NAVEGADOR.has(tecla)) return setAviso(`${tecla} é do navegador: a página não recebe essa tecla.`);
                            setAviso("");
                            setP({ ...p, atalhos: { ...p.atalhos, [item.chave!]: tecla } });
                            setGravando(null);
                          }}
                        >
                          {gravando === item.chave ? "Aperte as teclas…" : atalho.split(" ou ")[0] || "—"}
                        </button>
                      </td>
                      <td className="w-8 py-1 text-right">
                        {mudado ? (
                          <button
                            type="button"
                            className="botao-icone size-5"
                            aria-label={`Voltar o atalho de fábrica de ${item.nome}`}
                            title={`De fábrica: ${item.atalho ?? "nenhum"}`}
                            onClick={() => setP({ ...p, atalhos: semChave(p.atalhos, item.chave!) })}
                          >
                            <RotateCcw className="size-3" aria-hidden />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : aba === "menus" ? (
            <table className="w-full" aria-label="Itens dos menus">
              <tbody>
                {visiveis.map((item) => {
                  const oculto = p.ocultos.includes(item.chave!);
                  return (
                    <tr key={item.chave} className="border-b border-borda/40">
                      <td className="w-8 py-1">
                        <button
                          type="button"
                          className="botao-icone size-6"
                          aria-label={`${oculto ? "Mostrar" : "Esconder"} ${item.nome}`}
                          aria-pressed={!oculto}
                          onClick={() => setP({ ...p, ocultos: oculto ? p.ocultos.filter((c) => c !== item.chave) : [...p.ocultos, item.chave!] })}
                        >
                          {oculto ? <EyeOff className="size-3.5 text-suave" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                        </button>
                      </td>
                      <td className={`py-1 pr-2 ${oculto ? "text-suave line-through" : ""}`} style={p.cores[item.chave!] ? { background: CORES_DOS_ITENS.find((c) => c.id === p.cores[item.chave!])?.fundo } : undefined}>
                        <span className="text-suave">{item.caminho} › </span>
                        {item.nome}
                      </td>
                      <td className="w-32 py-1">
                        <select
                          aria-label={`Cor de ${item.nome}`}
                          className={`${CAMPO} w-full`}
                          value={p.cores[item.chave!] ?? ""}
                          onChange={(e) => {
                            const resto = semChave(p.cores, item.chave!);
                            setP({ ...p, cores: e.currentTarget.value ? { ...resto, [item.chave!]: e.currentTarget.value as CorDoItem } : resto });
                          }}
                        >
                          <option value="">Nenhuma</option>
                          {CORES_DOS_ITENS.map((cor) => (
                            <option key={cor.id} value={cor.id}>
                              {cor.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="space-y-2">
              <fieldset className="flex items-center gap-3">
                <legend className="sr-only">Colunas</legend>
                Colunas da caixa de ferramentas:
                {([1, 2] as const).map((n) => (
                  <label key={n} className="flex items-center gap-1">
                    <input type="radio" name="colunas-da-caixa" checked={p.colunas === n} onChange={() => setP({ ...p, colunas: n })} />
                    {n === 1 ? "Uma" : "Duas"}
                  </label>
                ))}
              </fieldset>
              <table className="w-full" aria-label="Ferramentas">
                <tbody>
                  {ferramentas.map((item) => {
                    const oculta = p.ferramentasOcultas.includes(item.id);
                    const tecla = item.id in p.teclas ? p.teclas[item.id] : item.tecla;
                    return (
                      <tr key={item.id} className="border-b border-borda/40">
                        <td className="w-8 py-1">
                          <input
                            type="checkbox"
                            aria-label={`${item.nome} na caixa`}
                            checked={!oculta}
                            onChange={(e) => setP({ ...p, ferramentasOcultas: e.currentTarget.checked ? p.ferramentasOcultas.filter((id) => id !== item.id) : [...p.ferramentasOcultas, item.id] })}
                          />
                        </td>
                        <td className={`py-1 ${oculta ? "text-suave" : ""}`}>{item.nome}</td>
                        <td className="w-20 py-1">
                          <input
                            aria-label={`Tecla de ${item.nome}`}
                            className={`${CAMPO} w-12 text-center uppercase`}
                            maxLength={1}
                            value={tecla}
                            onChange={(e) => {
                              const valor = e.currentTarget.value.toUpperCase();
                              if (valor && !/^[A-Z]$/.test(valor)) return;
                              // A tecla sai das ferramentas de outros grupos que a usavam, como lá
                              const tiradas = valor ? ferramentas.filter((outra) => outra.id !== item.id && outra.grupo !== item.grupo && (outra.id in p.teclas ? p.teclas[outra.id] : outra.tecla) === valor) : [];
                              setAviso(tiradas.length ? `${valor} saiu de: ${tiradas.map((outra) => outra.nome).join(", ")}.` : "");
                              setP({ ...p, teclas: { ...p.teclas, ...Object.fromEntries(tiradas.map((outra) => [outra.id, ""])), [item.id]: valor } });
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-icone h-7 w-auto gap-1 px-2 text-xs" onClick={restaurar}>
            <RotateCcw className="size-3.5" aria-hidden />
            Restaurar os de fábrica
          </button>
          {repetidos.size && aba === "atalhos" ? <span className="text-xs text-erro">{repetidos.size} {repetidos.size === 1 ? "atalho usado" : "atalhos usados"} em mais de um comando</span> : null}
          <span className="ml-auto" />
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(p)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
