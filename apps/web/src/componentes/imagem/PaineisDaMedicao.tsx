"use client";

// A medição do editor de imagem (ADR 0003, onda 13.14): as opções da Contagem e da Nota na barra, os painéis Notas e
// Registro de medições e as janelas Definir escala de medida e Inserir marcador de escala.
import { ChevronLeft, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { COLUNAS_DO_REGISTRO, type Contagem, csvDoRegistro, ESCALA_PADRAO, type EscalaDeMedida, grupoAtivo, type GrupoDaContagem, type Medicao, type Nota, textoDaEscala, totalDaContagem, valorDaColuna } from "@/lib/imagem/medicao";

import { Moldura } from "./JanelasDePixels";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

type PropsDaContagem = {
  contagem: Contagem | null;
  aoMudar: (contagem: Contagem | null, nome: string) => void;
  aoNovoGrupo: () => void;
  aoTirarGrupo: (id: string) => void;
};

export function OpcoesDaContagemNaBarra({ contagem, aoMudar, aoNovoGrupo, aoTirarGrupo }: PropsDaContagem) {
  const grupo = grupoAtivo(contagem);
  const mudar = (mudanca: Partial<GrupoDaContagem>, nome: string) => contagem && grupo && aoMudar({ ...contagem, grupos: contagem.grupos.map((g) => (g.id === grupo.id ? { ...g, ...mudanca } : g)) }, nome);
  return (
    <>
      <span className="tabular-nums" aria-label="Total da contagem">
        Contagem: {totalDaContagem(contagem)}
      </span>
      <select aria-label="Grupo de contagem" className={CAMPO} value={grupo?.id ?? ""} disabled={!grupo} onChange={(e) => contagem && aoMudar({ ...contagem, ativo: e.currentTarget.value }, "escolher o grupo de contagem")}>
        {!grupo ? <option value="">Grupo de contagem 1</option> : null}
        {contagem?.grupos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nome} ({g.pontos.length})
          </option>
        ))}
      </select>
      <button type="button" className="botao-icone size-6" onClick={aoNovoGrupo} title="Novo grupo de contagem" aria-label="Novo grupo de contagem">
        <Plus className="size-3.5" aria-hidden />
      </button>
      {grupo ? (
        <>
          <input
            key={grupo.id}
            aria-label="Nome do grupo"
            className={`${CAMPO} w-36`}
            defaultValue={grupo.nome}
            maxLength={60}
            onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value.trim() !== grupo.nome && mudar({ nome: e.currentTarget.value.trim() }, "renomear o grupo de contagem")}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={grupo.visivel} onChange={(e) => mudar({ visivel: e.currentTarget.checked }, "mostrar ou ocultar o grupo")} />
            Visível
          </label>
          <input type="color" aria-label="Cor do grupo" className="h-5 w-7 cursor-pointer rounded border border-borda bg-transparent" value={grupo.cor} onChange={(e) => mudar({ cor: e.currentTarget.value }, "mudar a cor do grupo")} />
          <label className="flex items-center gap-1">
            Marcador:
            <input type="number" aria-label="Tamanho do marcador" className={`${CAMPO} w-12`} min={0} max={10} value={grupo.tamanho_do_marcador} onChange={(e) => mudar({ tamanho_do_marcador: Math.min(10, Math.max(0, Math.round(Number(e.currentTarget.value) || 0))) }, "mudar o marcador")} />
          </label>
          <label className="flex items-center gap-1">
            Rótulo:
            <input type="number" aria-label="Tamanho do rótulo" className={`${CAMPO} w-12`} min={8} max={72} value={grupo.tamanho_do_rotulo} onChange={(e) => mudar({ tamanho_do_rotulo: Math.min(72, Math.max(8, Math.round(Number(e.currentTarget.value) || 12))) }, "mudar o rótulo")} />
          </label>
          <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!grupo.pontos.length} onClick={() => mudar({ pontos: [] }, "limpar a contagem")}>
            Limpar
          </button>
          <button type="button" className="botao-icone size-6" onClick={() => aoTirarGrupo(grupo.id)} title="Excluir o grupo de contagem" aria-label="Excluir o grupo de contagem">
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </>
      ) : null}
      <span className="text-suave">Alt + clique tira um ponto</span>
    </>
  );
}

export function OpcoesDaNotaNaBarra({ autor, cor, total, aoMudarAutor, aoMudarCor, aoLimpar }: { autor: string; cor: string; total: number; aoMudarAutor: (autor: string) => void; aoMudarCor: (cor: string) => void; aoLimpar: () => void }) {
  return (
    <>
      <label className="flex items-center gap-1">
        Autor:
        <input aria-label="Autor das notas" className={`${CAMPO} w-36`} value={autor} maxLength={60} onChange={(e) => aoMudarAutor(e.currentTarget.value)} />
      </label>
      <label className="flex items-center gap-1">
        Cor:
        <input type="color" aria-label="Cor das notas" className="h-5 w-7 cursor-pointer rounded border border-borda bg-transparent" value={cor} onChange={(e) => aoMudarCor(e.currentTarget.value)} />
      </label>
      <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!total} onClick={aoLimpar}>
        Limpar tudo
      </button>
      <span className="text-suave">Clique para pôr uma nota; Alt + clique numa nota a tira</span>
    </>
  );
}

export function PainelNotas({ notas, escolhida, aoEscolher, aoMudar }: { notas: Nota[]; escolhida: string | null; aoEscolher: (id: string | null) => void; aoMudar: (notas: Nota[], escolhida?: string) => void }) {
  const indice = notas.findIndex((nota) => nota.id === escolhida);
  const nota = indice >= 0 ? notas[indice] : null;
  const mudar = (mudanca: Partial<Nota>) => nota && aoMudar(notas.map((n) => (n.id === nota.id ? { ...n, ...mudanca } : n)), nota.id);
  if (!notas.length) return <p className="p-3 text-xs text-suave">Nenhuma nota. Use a ferramenta Nota (I) e clique na imagem para pôr uma.</p>;
  return (
    <div className="flex h-full flex-col gap-2 p-2 text-xs">
      <div className="flex items-center gap-1">
        <button type="button" className="botao-icone size-6" disabled={indice <= 0 && nota !== null} onClick={() => aoEscolher(notas[Math.max(0, indice - 1)].id)} aria-label="Nota anterior" title="Nota anterior">
          <ChevronLeft className="size-3.5" aria-hidden />
        </button>
        <span className="tabular-nums text-suave">{nota ? `${indice + 1} de ${notas.length}` : `${notas.length} notas`}</span>
        <button type="button" className="botao-icone size-6" disabled={indice >= notas.length - 1} onClick={() => aoEscolher(notas[Math.min(notas.length - 1, indice + 1)].id)} aria-label="Próxima nota" title="Próxima nota">
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone ml-auto size-6"
          disabled={!nota}
          onClick={() =>
            nota &&
            aoMudar(
              notas.filter((n) => n.id !== nota.id),
              notas[indice + 1]?.id ?? notas[indice - 1]?.id,
            )
          }
          aria-label="Excluir a nota"
          title="Excluir a nota"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      {nota ? (
        <>
          <input key={`autor-${nota.id}`} aria-label="Autor da nota" className={CAMPO} defaultValue={nota.autor} maxLength={60} placeholder="Autor" onBlur={(e) => e.currentTarget.value !== nota.autor && mudar({ autor: e.currentTarget.value })} />
          <textarea
            key={`texto-${nota.id}`}
            aria-label="Texto da nota"
            className={`${CAMPO} min-h-24 flex-1 resize-none`}
            defaultValue={nota.texto}
            maxLength={4000}
            placeholder="Escreva a nota"
            autoFocus={!nota.texto}
            onBlur={(e) => e.currentTarget.value !== nota.texto && mudar({ texto: e.currentTarget.value })}
          />
        </>
      ) : (
        <p className="text-suave">Clique numa nota na imagem (ou nas setas) para abrir.</p>
      )}
    </div>
  );
}

export function PainelRegistro({ medicoes, aoRegistrar, aoExcluir }: { medicoes: Medicao[]; aoRegistrar: () => void; aoExcluir: (ids: string[]) => void }) {
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const validas = escolhidas.filter((id) => medicoes.some((m) => m.id === id));
  // Só as colunas com algum valor
  const colunas = COLUNAS_DO_REGISTRO.filter((coluna) => ["rotulo", "data", "fonte"].includes(coluna.id) || medicoes.some((m) => m[coluna.id] !== undefined));
  const exportar = () => {
    const linhas = validas.length ? medicoes.filter((m) => validas.includes(m.id)) : medicoes;
    const blob = new Blob([`﻿${csvDoRegistro(linhas)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "medicoes.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-1 p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={aoRegistrar} title="Imagem › Análise › Registrar medições (Ctrl+Shift+M)">
          Registrar medições
        </button>
        <button type="button" className="botao-icone h-6 w-auto px-1.5 text-xs" disabled={!medicoes.length} onClick={() => setEscolhidas(validas.length === medicoes.length ? [] : medicoes.map((m) => m.id))}>
          {validas.length === medicoes.length && medicoes.length ? "Desmarcar tudo" : "Selecionar tudo"}
        </button>
        <button type="button" className="botao-icone size-6" disabled={!medicoes.length} onClick={exportar} title={validas.length ? "Exportar as escolhidas (CSV)" : "Exportar todas (CSV)"} aria-label="Exportar as medições">
          <Download className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone size-6"
          disabled={!validas.length}
          onClick={() => {
            aoExcluir(validas);
            setEscolhidas([]);
          }}
          title="Excluir as escolhidas"
          aria-label="Excluir as medições escolhidas"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      {medicoes.length ? (
        <div className="min-h-0 flex-1 overflow-auto rounded border border-borda">
          <table className="w-max min-w-full border-collapse tabular-nums" aria-label="Medições">
            <thead className="sticky top-0 bg-painel-2">
              <tr>
                {colunas.map((coluna) => (
                  <th key={coluna.id} className="whitespace-nowrap border-b border-borda px-1.5 py-0.5 text-left font-medium text-suave">
                    {coluna.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {medicoes.map((medicao) => {
                const escolhida = validas.includes(medicao.id);
                return (
                  <tr
                    key={medicao.id}
                    className={`cursor-default ${escolhida ? "bg-destaque/20" : "hover:bg-painel-2"}`}
                    onClick={(e) => setEscolhidas((atual) => (e.ctrlKey || e.metaKey ? (atual.includes(medicao.id) ? atual.filter((id) => id !== medicao.id) : [...atual, medicao.id]) : [medicao.id]))}
                    aria-selected={escolhida}
                  >
                    {colunas.map((coluna) => (
                      <td key={coluna.id} className="whitespace-nowrap border-b border-borda/50 px-1.5 py-0.5">
                        {valorDaColuna(medicao, coluna.id)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-suave">Faça uma seleção (ou uma medida com a Régua, ou uma contagem) e clique em Registrar medições.</p>
      )}
    </div>
  );
}

export function JanelaEscalaDeMedida({ escala, comprimentoDaRegua, aoFechar, aoConfirmar }: { escala: EscalaDeMedida | null | undefined; comprimentoDaRegua: number | null; aoFechar: () => void; aoConfirmar: (escala: EscalaDeMedida | null) => void }) {
  const [valor, setValor] = useState<EscalaDeMedida>(escala ?? { pixels: comprimentoDaRegua ? Math.round(comprimentoDaRegua * 100) / 100 : 1, comprimento: 1, unidade: comprimentoDaRegua ? "cm" : "pixels" });
  const valida = valor.pixels > 0 && valor.comprimento > 0 && valor.unidade.trim();
  const padrao = valor.pixels === 1 && valor.comprimento === 1 && valor.unidade.trim() === "pixels";
  return (
    <Moldura titulo="Definir escala de medida" aoFechar={aoFechar} aoConfirmar={() => valida && aoConfirmar(padrao ? null : { ...valor, unidade: valor.unidade.trim() })}>
      <p className="text-suave">Quantos pixels da imagem são quanto da unidade escolhida. O Registro de medições usa a escala.</p>
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        Comprimento em pixels:
        <span className="flex items-center gap-1">
          <input type="number" aria-label="Comprimento em pixels" className={`${CAMPO} w-24`} min={0} step="any" value={valor.pixels} autoFocus onChange={(e) => setValor({ ...valor, pixels: Number(e.currentTarget.value) || 0 })} />
          {comprimentoDaRegua ? (
            <button type="button" className="botao-icone h-6 w-auto px-1.5 text-xs" onClick={() => setValor({ ...valor, pixels: Math.round(comprimentoDaRegua * 100) / 100 })} title="O comprimento medido pela Régua">
              Da régua
            </button>
          ) : null}
        </span>
        Comprimento lógico:
        <input type="number" aria-label="Comprimento lógico" className={`${CAMPO} w-24`} min={0} step="any" value={valor.comprimento} onChange={(e) => setValor({ ...valor, comprimento: Number(e.currentTarget.value) || 0 })} />
        Unidades lógicas:
        <input aria-label="Unidades lógicas" className={`${CAMPO} w-24`} maxLength={20} value={valor.unidade} onChange={(e) => setValor({ ...valor, unidade: e.currentTarget.value })} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-suave">{valida ? textoDaEscala(valor) : "Preencha os três campos."}</span>
        <button type="button" className="botao-icone ml-auto h-6 w-auto px-1.5 text-xs" onClick={() => setValor(ESCALA_PADRAO)}>
          Padrão
        </button>
      </div>
    </Moldura>
  );
}

export type OpcoesDoMarcador = { comprimento: number; fonte: number; mostrarTexto: boolean; textoEmBaixo: boolean; cor: "preto" | "branco" };

export function JanelaMarcadorDeEscala({ escala, aoFechar, aoConfirmar }: { escala: EscalaDeMedida | null | undefined; aoFechar: () => void; aoConfirmar: (opcoes: OpcoesDoMarcador) => void }) {
  const e = escala ?? ESCALA_PADRAO;
  const [opcoes, setOpcoes] = useState<OpcoesDoMarcador>({ comprimento: e.unidade === "pixels" ? 100 : e.comprimento, fonte: 18, mostrarTexto: true, textoEmBaixo: false, cor: "preto" });
  return (
    <Moldura titulo="Inserir marcador de escala" aoFechar={aoFechar} aoConfirmar={() => opcoes.comprimento > 0 && aoConfirmar(opcoes)}>
      <p className="text-suave">Uma barra com o comprimento escolhido na escala ({textoDaEscala(escala)}), no canto de baixo à esquerda, numa pasta.</p>
      <label className="flex items-center gap-2">
        Comprimento:
        <input type="number" aria-label="Comprimento do marcador" className={`${CAMPO} w-24`} min={0} step="any" value={opcoes.comprimento} autoFocus onChange={(ev) => setOpcoes({ ...opcoes, comprimento: Number(ev.currentTarget.value) || 0 })} />
        {e.unidade}
      </label>
      <label className="flex items-center gap-2">
        Tamanho da fonte:
        <input type="number" aria-label="Tamanho da fonte do marcador" className={`${CAMPO} w-16`} min={6} max={300} value={opcoes.fonte} onChange={(ev) => setOpcoes({ ...opcoes, fonte: Math.min(300, Math.max(6, Number(ev.currentTarget.value) || 18)) })} />
        px
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={opcoes.mostrarTexto} onChange={(ev) => setOpcoes({ ...opcoes, mostrarTexto: ev.currentTarget.checked })} />
        Mostrar o texto
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={opcoes.textoEmBaixo} disabled={!opcoes.mostrarTexto} onChange={(ev) => setOpcoes({ ...opcoes, textoEmBaixo: ev.currentTarget.checked })} />
        Texto embaixo da barra
      </label>
      <fieldset className="flex gap-3">
        <legend className="mb-1">Cor</legend>
        {(["preto", "branco"] as const).map((cor) => (
          <label key={cor} className="flex items-center gap-1">
            <input type="radio" name="cor-do-marcador" checked={opcoes.cor === cor} onChange={() => setOpcoes({ ...opcoes, cor })} />
            {cor === "preto" ? "Preto" : "Branco"}
          </label>
        ))}
      </fieldset>
    </Moldura>
  );
}
