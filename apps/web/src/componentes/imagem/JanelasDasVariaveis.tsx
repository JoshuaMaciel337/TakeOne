"use client";

// Imagem › Variáveis do editor de imagem (ADR 0003, onda 13.13): Definir (que camada muda e como) e Conjuntos de dados
// (a tabela, o CSV, aplicar um conjunto e exportar todos). As contas ficam em lib/projeto/variaveis.ts.
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { FORMATOS_DE_EXPORTACAO, type FormatoDeExportacao } from "@/lib/exportacao/exportarComo";
import { type ConjuntoDeDados, conjuntosDoCsv, nomeDeVariavel, NOMES_DOS_TIPOS, type TipoDaVariavel, type Variavel, type VariaveisDoDocumento } from "@/lib/projeto/variaveis";
import type { Midia } from "@/lib/tipos";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

type CamadaDaLista = { faixaId: string; nome: string; tipos: TipoDaVariavel[] };

function Moldura({ titulo, largura = "max-w-xl", aoFechar, children }: { titulo: string; largura?: string; aoFechar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[6vh]" onPointerDown={aoFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${largura} rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60`} onPointerDown={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 className="font-display text-base font-semibold">{titulo}</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4 text-xs">{children}</div>
      </div>
    </div>
  );
}

/** Imagem › Variáveis › Definir: para cada camada, o que muda (o texto, a visibilidade, a foto) e o nome da variável. */
export function JanelaDefinirVariaveis({ camadas, inicial, aoFechar, aoConfirmar }: { camadas: CamadaDaLista[]; inicial: VariaveisDoDocumento; aoFechar: () => void; aoConfirmar: (variaveis: Variavel[]) => void }) {
  const [variaveis, setVariaveis] = useState<Variavel[]>(inicial.variaveis);
  const [erro, setErro] = useState("");
  const daCamada = (faixaId: string, tipo: TipoDaVariavel) => variaveis.find((v) => v.faixa === faixaId && v.tipo === tipo);
  const ligar = (camada: CamadaDaLista, tipo: TipoDaVariavel, ligado: boolean) =>
    setVariaveis((atual) =>
      ligado
        ? [...atual, { faixa: camada.faixaId, tipo, nome: nomeDeVariavel(tipo === "visibilidade" ? `${camada.nome}_visivel` : camada.nome, atual.map((v) => v.nome)) }]
        : atual.filter((v) => !(v.faixa === camada.faixaId && v.tipo === tipo)),
    );
  const confirmar = () => {
    const nomes = variaveis.map((v) => v.nome.toLowerCase());
    if (variaveis.some((v) => !/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(v.nome))) return setErro("O nome da variável começa por letra e tem só letras, números e sublinhado.");
    if (new Set(nomes).size !== nomes.length) return setErro("Duas variáveis têm o mesmo nome.");
    aoConfirmar(variaveis);
  };
  return (
    <Moldura titulo="Variáveis" aoFechar={aoFechar}>
      <p className="text-suave">Marque o que muda em cada camada. Os conjuntos de dados dão um valor a cada variável.</p>
      <div className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto">
        {camadas.map((camada) => (
          <div key={camada.faixaId} className="flex flex-col gap-1 rounded border border-borda/60 p-2">
            <span className="font-medium">{camada.nome}</span>
            {camada.tipos.map((tipo) => {
              const variavel = daCamada(camada.faixaId, tipo);
              return (
                <div key={tipo} className="flex items-center gap-2">
                  <label className="flex w-40 items-center gap-1.5">
                    <input type="checkbox" checked={Boolean(variavel)} onChange={(e) => ligar(camada, tipo, e.currentTarget.checked)} />
                    {NOMES_DOS_TIPOS[tipo]}
                  </label>
                  {variavel ? (
                    <input
                      className={`${CAMPO} flex-1`}
                      value={variavel.nome}
                      maxLength={60}
                      aria-label={`Nome da variável de ${camada.nome} (${NOMES_DOS_TIPOS[tipo]})`}
                      onChange={(e) => {
                        const nome = e.currentTarget.value;
                        setVariaveis((atual) => atual.map((v) => (v === variavel ? { ...v, nome } : v)));
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-secundario px-3 py-1" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="botao-principal px-3 py-1" onClick={confirmar}>
          OK
        </button>
      </div>
    </Moldura>
  );
}

/** Imagem › Variáveis › Conjuntos de dados: a tabela (um conjunto por linha), o CSV, aplicar e exportar. */
export function JanelaConjuntos({
  definicao,
  imagens,
  aoFechar,
  aoSalvar,
  aoAplicar,
  aoDoDocumento,
  aoExportar,
}: {
  definicao: VariaveisDoDocumento;
  imagens: Midia[];
  aoFechar: () => void;
  aoSalvar: (conjuntos: ConjuntoDeDados[]) => void;
  aoAplicar: (conjunto: ConjuntoDeDados) => void;
  /** Os valores de agora do documento, como um conjunto novo. */
  aoDoDocumento: (nome: string) => ConjuntoDeDados;
  aoExportar: (conjuntos: ConjuntoDeDados[], formato: FormatoDeExportacao, padrao: string) => Promise<void>;
}) {
  const [conjuntos, setConjuntos] = useState<ConjuntoDeDados[]>(definicao.conjuntos);
  const [escolhido, setEscolhido] = useState(0);
  const [formato, setFormato] = useState<FormatoDeExportacao>("png");
  const [padrao, setPadrao] = useState("{conjunto}");
  const [aviso, setAviso] = useState("");
  const [exportando, setExportando] = useState(false);
  const mudarValor = (i: number, nome: string, valor: string) => setConjuntos((atual) => atual.map((c, j) => (j === i ? { ...c, valores: { ...c.valores, [nome]: valor } } : c)));
  const nomesDasImagens = imagens.map((m) => m.nome);
  if (!definicao.variaveis.length)
    return (
      <Moldura titulo="Conjuntos de dados" aoFechar={aoFechar} largura="max-w-sm">
        <p>Defina as variáveis antes (Imagem › Variáveis › Definir).</p>
      </Moldura>
    );
  return (
    <Moldura titulo="Conjuntos de dados" aoFechar={aoFechar} largura="max-w-4xl">
      <datalist id="imagens-da-biblioteca">
        {nomesDasImagens.map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="botao-secundario px-2 py-0.5" onClick={() => setConjuntos([...conjuntos, aoDoDocumento(`Conjunto ${conjuntos.length + 1}`)])}>
          + Conjunto (do documento)
        </button>
        <label className="botao-secundario cursor-pointer px-2 py-0.5">
          Importar CSV…
          <input
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="sr-only"
            aria-label="Importar CSV"
            onChange={async (e) => {
              const arquivo = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!arquivo) return;
              const { conjuntos: lidos, ignoradas } = conjuntosDoCsv(await arquivo.text(), definicao.variaveis);
              setConjuntos((atual) => [...atual, ...lidos].slice(0, 1000));
              setAviso(`${lidos.length} ${lidos.length === 1 ? "conjunto importado" : "conjuntos importados"}${ignoradas.length ? `; colunas sem variável: ${ignoradas.join(", ")}` : ""}.`);
            }}
          />
        </label>
        {aviso ? <span className="text-suave">{aviso}</span> : null}
      </div>
      <div className="max-h-[45vh] overflow-auto rounded border border-borda/60">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-painel-2">
            <tr>
              <th className="p-1 text-left font-medium">Conjunto</th>
              {definicao.variaveis.map((v) => (
                <th key={v.nome} className="p-1 text-left font-medium">
                  {v.nome}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {conjuntos.map((conjunto, i) => (
              <tr key={i} className={i === escolhido ? "bg-destaque/15" : ""} onClick={() => setEscolhido(i)}>
                <td className="p-1">
                  <input className={`${CAMPO} w-32`} value={conjunto.nome} maxLength={120} aria-label={`Nome do conjunto ${i + 1}`} onChange={(e) => setConjuntos(conjuntos.map((c, j) => (j === i ? { ...c, nome: e.currentTarget.value } : c)))} />
                </td>
                {definicao.variaveis.map((v) => (
                  <td key={v.nome} className="p-1">
                    {v.tipo === "visibilidade" ? (
                      <select className={CAMPO} value={conjunto.valores[v.nome] ?? "sim"} onChange={(e) => mudarValor(i, v.nome, e.currentTarget.value)} aria-label={`${v.nome} no conjunto ${i + 1}`}>
                        <option value="sim">Visível</option>
                        <option value="não">Oculta</option>
                      </select>
                    ) : (
                      <input
                        className={`${CAMPO} w-40`}
                        value={conjunto.valores[v.nome] ?? ""}
                        maxLength={2000}
                        list={v.tipo === "imagem" ? "imagens-da-biblioteca" : undefined}
                        aria-label={`${v.nome} no conjunto ${i + 1}`}
                        onChange={(e) => mudarValor(i, v.nome, e.currentTarget.value)}
                      />
                    )}
                  </td>
                ))}
                <td className="p-1">
                  <button type="button" className="botao-icone size-5" onClick={() => setConjuntos(conjuntos.filter((_, j) => j !== i))} aria-label={`Excluir o conjunto ${i + 1}`}>
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="botao-secundario px-3 py-1" disabled={!conjuntos[escolhido]} onClick={() => (aoSalvar(conjuntos), aoAplicar(conjuntos[escolhido]))}>
          Aplicar o conjunto escolhido
        </button>
        <span className="flex-1" />
        <label className="flex items-center gap-1">
          Exportar em
          <select className={CAMPO} value={formato} onChange={(e) => setFormato(e.currentTarget.value as FormatoDeExportacao)} aria-label="Formato dos arquivos">
            {FORMATOS_DE_EXPORTACAO.filter((f) => f.id !== "ico").map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Nome
          <input className={`${CAMPO} w-32`} value={padrao} maxLength={80} onChange={(e) => setPadrao(e.currentTarget.value)} aria-label="Nome dos arquivos" title='"{conjunto}", "{n}" e as variáveis entre chaves, como "{titulo}"' />
        </label>
        <button
          type="button"
          className="botao-secundario px-3 py-1"
          disabled={!conjuntos.length || exportando}
          onClick={async () => {
            setExportando(true);
            try {
              aoSalvar(conjuntos);
              await aoExportar(conjuntos, formato, padrao);
            } finally {
              setExportando(false);
            }
          }}
        >
          {exportando ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : null}
          Exportar os conjuntos como arquivos
        </button>
        <button type="button" className="botao-principal px-3 py-1" onClick={() => (aoSalvar(conjuntos), aoFechar())}>
          OK
        </button>
      </div>
    </Moldura>
  );
}
