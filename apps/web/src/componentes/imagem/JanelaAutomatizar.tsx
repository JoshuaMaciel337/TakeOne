"use client";

// Arquivo › Automatizar (Lote, Folha de contato, Fotomesclagem, Mesclar para HDR) e Arquivo › Scripts (Processador de
// imagens, Carregar arquivos em pilha) do editor de imagem (ADR 0003, onda 13.13): as imagens (do computador ou da
// biblioteca) e as opções de cada um. O trabalho fica em lib/automatizar.
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { arquivoDaMidia } from "@/lib/api";
import { carregarEmPilha, type FonteDaAutomacao, folhaDeContato, fotomesclagem, mesclarParaHdr } from "@/lib/automatizar/executar";
import { OPCOES_PADRAO_DA_FOLHA, type OpcoesDaFolha, paginasDaFolha } from "@/lib/automatizar/folha";
import { OPCOES_PADRAO_DO_HDR } from "@/lib/automatizar/hdr";
import { type ModoDePilha, MODOS_DE_PILHA } from "@/lib/automatizar/pilha";
import { type PassosDoLote, processarLote, type SaidaDoLote } from "@/lib/automatizar/processador";
import { baixarBlob, FORMATOS_DE_EXPORTACAO, type FormatoDeExportacao } from "@/lib/exportacao/exportarComo";
import { ACEITAR_IMAGENS } from "@/lib/envios";
import type { ModoDeCor } from "@/lib/imagem/modos";
import type { AjusteDaImagem } from "@/lib/imagem/ajustes";
import type { Midia } from "@/lib/tipos";
import type { ProjecaoDoAlinhamento } from "@/lib/transformar/alinhar";

export type TipoDaAutomacao = "lote" | "processador" | "pilha" | "fotomesclagem" | "hdr" | "folha";

const TITULOS: Record<TipoDaAutomacao, string> = {
  lote: "Lote",
  processador: "Processador de imagens",
  pilha: "Carregar arquivos em pilha",
  fotomesclagem: "Fotomesclagem",
  hdr: "Mesclar para HDR",
  folha: "Folha de contato",
};
const EXPLICACOES: Record<TipoDaAutomacao, string> = {
  lote: "Cada imagem passa pelos passos escolhidos e sai nos formatos marcados, num ZIP.",
  processador: "Cada imagem sai nos formatos marcados, cabendo no tamanho de cada um, num ZIP.",
  pilha: "Um documento novo com uma camada por imagem e, se quiser, a pilha calculada por cima (a mediana tira o que passa pela cena).",
  fotomesclagem: "As fotos de um panorama (com partes em comum) são alinhadas e misturadas num documento novo.",
  hdr: "As exposições da mesma cena (da escura à clara) viram uma imagem com os detalhes de todas.",
  folha: "As imagens numa grade, com o nome embaixo, uma página por documento.",
};
const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

type Props = {
  tipo: TipoDaAutomacao;
  imagens: Midia[];
  /** As camadas de ajuste visíveis deste documento e o modo dele (o Lote pode aplicá-los). */
  ajustesDoDocumento: AjusteDaImagem[];
  modoDoDocumento: ModoDeCor | null;
  aoFechar: () => void;
  /** O documento criado (o primeiro, quando são vários) e os avisos; os outros aparecem em Abrir recentes. */
  aoCriar: (ids: string[], avisos: string[]) => void;
  aoAvisar: (mensagem: string) => void;
};

const FORMATOS_DO_LOTE = FORMATOS_DE_EXPORTACAO.filter((item) => item.id !== "ico");

export function JanelaAutomatizar({ tipo, imagens, ajustesDoDocumento, modoDoDocumento, aoFechar, aoCriar, aoAvisar }: Props) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [daBiblioteca, setDaBiblioteca] = useState<string[]>([]);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  // Pilha, fotomesclagem e HDR
  const [alinhar, setAlinhar] = useState(true);
  const [modoDaPilha, setModoDaPilha] = useState<ModoDePilha | "">("mediana");
  const [projecao, setProjecao] = useState<ProjecaoDoAlinhamento>("auto");
  const [misturar, setMisturar] = useState(true);
  const [tonsECores, setTonsECores] = useState(true);
  const [hdr, setHdr] = useState(OPCOES_PADRAO_DO_HDR);
  // Folha de contato
  const [folha, setFolha] = useState<OpcoesDaFolha & { fundo: string }>({ ...OPCOES_PADRAO_DA_FOLHA, fundo: "#ffffff" });
  // Lote e processador
  const [saidas, setSaidas] = useState<SaidaDoLote[]>([{ formato: "jpeg", qualidade: 0.85, caber: { largura: 2048, altura: 2048 } }]);
  const [passos, setPassos] = useState<PassosDoLote>({ tom: false, contraste: false, cor: false, ajustes: [], modo: null });
  const [padrao, setPadrao] = useState("{nome}");

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !progresso) aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar, progresso]);

  const fontes: FonteDaAutomacao[] = [
    ...arquivos.map((arquivo) => ({ tipo: "arquivo" as const, arquivo })),
    ...daBiblioteca.flatMap((id) => {
      const midia = imagens.find((item) => item.id === id);
      return midia ? [{ tipo: "midia" as const, midia }] : [];
    }),
  ];
  const minimo = tipo === "fotomesclagem" || tipo === "hdr" ? 2 : 1;

  async function executar() {
    setErro("");
    setProgresso("Começando…");
    try {
      if (tipo === "lote" || tipo === "processador") {
        const { nome, blob } = await processarLote(fontes, { saidas, passos: tipo === "lote" ? passos : { tom: false, contraste: false, cor: false, ajustes: [], modo: null }, padrao }, setProgresso);
        baixarBlob(blob, nome);
        aoAvisar(`${fontes.length} ${fontes.length === 1 ? "imagem processada" : "imagens processadas"}.`);
        aoFechar();
        return;
      }
      if (tipo === "folha") return aoCriar(await folhaDeContato(fontes, folha, setProgresso), []);
      const feito =
        tipo === "pilha"
          ? await carregarEmPilha(fontes, { alinhar, modo: modoDaPilha || null }, setProgresso)
          : tipo === "fotomesclagem"
            ? await fotomesclagem(fontes, { projecao, misturar, tonsECores }, setProgresso)
            : await mesclarParaHdr(fontes, { alinhar, hdr }, setProgresso);
      aoCriar([feito.id], feito.avisos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível terminar.");
    } finally {
      setProgresso("");
    }
  }

  const mudarSaida = (indice: number, mudanca: Partial<SaidaDoLote>) => setSaidas((atual) => atual.map((saida, i) => (i === indice ? { ...saida, ...mudanca } : saida)));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[5vh]" onPointerDown={() => !progresso && aoFechar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-automatizar" className="w-full max-w-2xl rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60" onPointerDown={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-automatizar" className="font-display text-base font-semibold">
            {TITULOS[tipo]}
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} disabled={Boolean(progresso)} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid gap-4 p-4 text-xs sm:grid-cols-2">
          <section className="flex min-w-0 flex-col gap-2">
            <p className="text-suave">{EXPLICACOES[tipo]}</p>
            <label className="botao-secundario cursor-pointer self-start px-2.5 py-1">
              Escolher do computador…
              <input
                type="file"
                multiple
                accept={`${ACEITAR_IMAGENS},.psd,.psb`}
                className="sr-only"
                aria-label="Escolher imagens do computador"
                onChange={(evento) => {
                  const novos = Array.from(evento.currentTarget.files ?? []);
                  evento.currentTarget.value = "";
                  setArquivos((atual) => [...atual, ...novos]);
                }}
              />
            </label>
            {arquivos.length ? (
              <ul className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                {arquivos.map((arquivo, i) => (
                  <li key={`${arquivo.name}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{arquivo.name}</span>
                    <button type="button" className="botao-icone size-5" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))} aria-label={`Tirar ${arquivo.name}`}>
                      <Trash2 className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-suave">Ou da biblioteca:</p>
            <div className="grid max-h-56 grid-cols-4 gap-1 overflow-y-auto">
              {imagens.map((midia) => {
                const marcada = daBiblioteca.includes(midia.id);
                return (
                  <button
                    key={midia.id}
                    type="button"
                    aria-pressed={marcada}
                    title={midia.nome}
                    onClick={() => setDaBiblioteca(marcada ? daBiblioteca.filter((id) => id !== midia.id) : [...daBiblioteca, midia.id])}
                    className={`relative aspect-square overflow-hidden rounded border-2 ${marcada ? "border-destaque" : "border-transparent"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt={midia.nome} className="size-full object-cover" />
                    {marcada ? <span className="absolute right-0.5 top-0.5 rounded bg-destaque px-1 text-[10px] font-semibold text-white">{daBiblioteca.indexOf(midia.id) + 1 + arquivos.length}</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="text-suave">{fontes.length} {fontes.length === 1 ? "imagem escolhida" : "imagens escolhidas"}</p>
          </section>
          <section className="flex min-w-0 flex-col gap-2">
            {tipo === "pilha" || tipo === "hdr" ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={alinhar} onChange={(e) => setAlinhar(e.currentTarget.checked)} />
                Alinhar as imagens automaticamente
              </label>
            ) : null}
            {tipo === "pilha" ? (
              <label className="flex items-center gap-2">
                Modo de pilha:
                <select className={`${CAMPO} flex-1`} value={modoDaPilha} onChange={(e) => setModoDaPilha(e.currentTarget.value as ModoDePilha | "")} aria-label="Modo de pilha">
                  <option value="">Nenhum (só as camadas)</option>
                  {MODOS_DE_PILHA.map((modo) => (
                    <option key={modo.id} value={modo.id}>
                      {modo.nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tipo === "fotomesclagem" ? (
              <>
                <label className="flex items-center gap-2">
                  Projeção:
                  <select className={`${CAMPO} flex-1`} value={projecao} onChange={(e) => setProjecao(e.currentTarget.value as ProjecaoDoAlinhamento)} aria-label="Projeção">
                    <option value="auto">Automática</option>
                    <option value="perspectiva">Perspectiva</option>
                    <option value="colagem">Colagem</option>
                    <option value="reposicionar">Reposicionar</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={misturar} onChange={(e) => setMisturar(e.currentTarget.checked)} />
                  Misturar as imagens juntas
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={tonsECores} disabled={!misturar} onChange={(e) => setTonsECores(e.currentTarget.checked)} />
                  Igualar os tons e as cores
                </label>
              </>
            ) : null}
            {tipo === "hdr" ? (
              <>
                {(["contraste", "saturacao", "exposicao"] as const).map((chave) => (
                  <label key={chave} className="flex items-center gap-2">
                    <span className="w-28">{{ contraste: "Peso do detalhe", saturacao: "Peso da cor", exposicao: "Peso da luz certa" }[chave]}</span>
                    <input type="range" className="flex-1" min={0} max={2} step={0.1} value={hdr[chave]} onChange={(e) => setHdr({ ...hdr, [chave]: Number(e.currentTarget.value) })} aria-label={chave} />
                    <span className="w-6 text-right tabular-nums">{hdr[chave].toFixed(1)}</span>
                  </label>
                ))}
              </>
            ) : null}
            {tipo === "folha" ? (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["largura", "Largura (px)"],
                      ["altura", "Altura (px)"],
                      ["colunas", "Colunas"],
                      ["linhas", "Linhas"],
                      ["margem", "Margem (px)"],
                      ["espaco", "Espaço (px)"],
                      ["legenda", "Altura do nome (px)"],
                    ] as const
                  ).map(([chave, rotulo]) => (
                    <label key={chave} className="flex flex-col gap-0.5">
                      {rotulo}
                      <input type="number" className={CAMPO} min={0} max={8192} value={folha[chave]} onChange={(e) => setFolha({ ...folha, [chave]: Math.max(chave === "colunas" || chave === "linhas" ? 1 : 0, Number(e.currentTarget.value) || 0) })} aria-label={rotulo} />
                    </label>
                  ))}
                  <label className="flex flex-col gap-0.5">
                    Fundo
                    <input type="color" className="h-6 w-full rounded border border-borda bg-transparent" value={folha.fundo} onChange={(e) => setFolha({ ...folha, fundo: e.currentTarget.value })} aria-label="Cor do fundo" />
                  </label>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={folha.girar} onChange={(e) => setFolha({ ...folha, girar: e.currentTarget.checked })} />
                  Girar para caber melhor
                </label>
                <p className="text-suave">{paginasDaFolha(fontes.length, folha)} {paginasDaFolha(fontes.length, folha) === 1 ? "página" : "páginas"}.</p>
              </>
            ) : null}
            {tipo === "lote" || tipo === "processador" ? (
              <>
                {tipo === "lote" ? (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 font-medium">Passos</legend>
                    {(["tom", "contraste", "cor"] as const).map((jeito) => (
                      <label key={jeito} className="flex items-center gap-2">
                        <input type="checkbox" checked={passos[jeito]} onChange={(e) => setPassos({ ...passos, [jeito]: e.currentTarget.checked })} />
                        {{ tom: "Tom automático", contraste: "Contraste automático", cor: "Cor automática" }[jeito]}
                      </label>
                    ))}
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={passos.ajustes.length > 0} disabled={!ajustesDoDocumento.length} onChange={(e) => setPassos({ ...passos, ajustes: e.currentTarget.checked ? ajustesDoDocumento : [] })} />
                      As camadas de ajuste deste documento ({ajustesDoDocumento.length})
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={passos.modo !== null} disabled={!modoDoDocumento} onChange={(e) => setPassos({ ...passos, modo: e.currentTarget.checked ? modoDoDocumento : null })} />
                      O modo de cor deste documento
                    </label>
                  </fieldset>
                ) : null}
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1 font-medium">Salvar como</legend>
                  {saidas.map((saida, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1">
                      <select className={CAMPO} value={saida.formato} onChange={(e) => mudarSaida(i, { formato: e.currentTarget.value as FormatoDeExportacao })} aria-label={`Formato ${i + 1}`}>
                        {FORMATOS_DO_LOTE.map((formato) => (
                          <option key={formato.id} value={formato.id}>
                            {formato.nome}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={saida.caber !== null} onChange={(e) => mudarSaida(i, { caber: e.currentTarget.checked ? { largura: 2048, altura: 2048 } : null })} />
                        caber em
                      </label>
                      {saida.caber ? (
                        <>
                          <input type="number" className={`${CAMPO} w-16`} min={1} max={8192} value={saida.caber.largura} onChange={(e) => mudarSaida(i, { caber: { ...saida.caber!, largura: Math.max(1, Number(e.currentTarget.value) || 1) } })} aria-label={`Largura máxima ${i + 1}`} />×
                          <input type="number" className={`${CAMPO} w-16`} min={1} max={8192} value={saida.caber.altura} onChange={(e) => mudarSaida(i, { caber: { ...saida.caber!, altura: Math.max(1, Number(e.currentTarget.value) || 1) } })} aria-label={`Altura máxima ${i + 1}`} />
                        </>
                      ) : null}
                      {saidas.length > 1 ? (
                        <button type="button" className="botao-icone size-5" onClick={() => setSaidas(saidas.filter((_, j) => j !== i))} aria-label={`Tirar o formato ${i + 1}`}>
                          <Trash2 className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {saidas.length < 4 ? (
                    <button type="button" className="botao-secundario self-start px-2 py-0.5" onClick={() => setSaidas([...saidas, { formato: "png", qualidade: 0.92, caber: null }])}>
                      + Formato
                    </button>
                  ) : null}
                </fieldset>
                <label className="flex flex-col gap-0.5">
                  Nome dos arquivos ({"{nome}"}, {"{n}"}, {"{data}"})
                  <input className={CAMPO} value={padrao} maxLength={80} onChange={(e) => setPadrao(e.currentTarget.value)} aria-label="Nome dos arquivos" />
                </label>
              </>
            ) : null}
            {erro ? <AvisoErro>{erro}</AvisoErro> : null}
            <button type="button" className="botao-principal mt-auto px-4 py-2" disabled={Boolean(progresso) || fontes.length < minimo} onClick={() => void executar()}>
              {progresso ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {progresso || (tipo === "lote" || tipo === "processador" ? "Processar e baixar" : "Criar")}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Arquivo › Automatizar › Ajustar imagem: o maior tamanho, na proporção, que cabe na largura e na altura pedidas. */
export function JanelaAjustarImagem({ antes, aoFechar, aoConfirmar }: { antes: { largura: number; altura: number }; aoFechar: () => void; aoConfirmar: (tamanho: { largura: number; altura: number }) => void }) {
  const [largura, setLargura] = useState(antes.largura);
  const [altura, setAltura] = useState(antes.altura);
  const [naoAumentar, setNaoAumentar] = useState(true);
  const escala = Math.min(largura / antes.largura, altura / antes.altura, naoAumentar ? 1 : Infinity);
  const novo = { largura: Math.max(1, Math.round(antes.largura * escala)), altura: Math.max(1, Math.round(antes.altura * escala)) };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onPointerDown={aoFechar}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Ajustar imagem"
        className="flex w-full max-w-xs flex-col gap-2 rounded-xl border border-borda bg-painel p-4 text-xs shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
        onSubmit={(evento) => {
          evento.preventDefault();
          aoConfirmar(novo);
        }}
      >
        <h2 className="font-display text-sm font-semibold">Ajustar imagem</h2>
        <label className="flex items-center justify-between gap-2">
          Largura máxima
          <input type="number" className={`${CAMPO} w-20`} min={1} max={8192} value={largura} onChange={(e) => setLargura(Math.max(1, Math.min(8192, Number(e.currentTarget.value) || 1)))} aria-label="Largura máxima" />
        </label>
        <label className="flex items-center justify-between gap-2">
          Altura máxima
          <input type="number" className={`${CAMPO} w-20`} min={1} max={8192} value={altura} onChange={(e) => setAltura(Math.max(1, Math.min(8192, Number(e.currentTarget.value) || 1)))} aria-label="Altura máxima" />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={naoAumentar} onChange={(e) => setNaoAumentar(e.currentTarget.checked)} />
          Não aumentar
        </label>
        <p className="text-suave tabular-nums">
          {antes.largura} × {antes.altura} → {novo.largura} × {novo.altura} px
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="botao-secundario px-3 py-1" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao-principal px-3 py-1">
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
