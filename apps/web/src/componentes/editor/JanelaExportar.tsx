"use client";

import { Download, FileCode, FolderArchive, LoaderCircle, QrCode, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ErroApi } from "@/lib/api";
import {
  arquivoDaExportacao,
  type FormatoExportacao,
  GIF_MAXIMO_S,
  resumoDaExportacao,
  TAXA_PADRAO_DO_GIF,
  TAXAS_DO_GIF,
  TAXAS_DO_VIDEO,
} from "@/lib/exportacao/formatos";
import { formatarBytes, formatarQuando, formatarTempo } from "@/lib/formatar";
import { duracaoDoProjeto, type Projeto, type Proporcao, textoDosCapitulos } from "@/lib/projeto/modelo";
import { ajustarAoQuadro, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Exportacao, Midia } from "@/lib/tipos";
import { type PedidoDeExportacao, useExportacoes } from "@/lib/useExportacoes";

import { ExportarNoNavegador } from "./ExportarNoNavegador";
import { PainelQrCelular, useLinkCelular } from "./QrDoCelular";
import type { EstadoSalvamento } from "./useProjeto";

type Resolucao = PedidoDeExportacao["resolucao"];
type Escolha = "video" | "gif" | "quadro" | "som";

const ESCOLHAS: { id: Escolha; nome: string }[] = [
  { id: "video", nome: "Vídeo" },
  { id: "gif", nome: "GIF" },
  { id: "quadro", nome: "Quadro" },
  { id: "som", nome: "Só o som" },
];

const RESOLUCOES: { id: Resolucao; nome: string; lado: number; dica: string }[] = [
  { id: "720p", nome: "720p", lado: 720, dica: "Mais leve, sai mais rápido" },
  { id: "1080p", nome: "1080p", lado: 1080, dica: "O padrão das redes sociais" },
  { id: "4k", nome: "4K", lado: 2160, dica: "Máxima qualidade, demora mais" },
];

/** Mesma conta de core/modelos/exportacao.py: a resolução é o lado menor, sempre par. */
function tamanhoDeSaida(proporcao: Proporcao, lado: number): string {
  const [l, a] = proporcao.split(":").map(Number);
  const par = (valor: number) => Math.max(2, Math.round(valor / 2) * 2);
  return l >= a ? `${par((lado * l) / a)} × ${lado}` : `${lado} × ${par((lado * a) / l)}`;
}

type Props = {
  projetoId: string;
  /** O projeto e as mídias, para a exportação no navegador (o mesmo desenho da prévia). */
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  proporcao: Proporcao;
  salvamento: EstadoSalvamento;
  /** O cursor: o instante do quadro em PNG. */
  tempo: Tick;
  aoFechar: () => void;
};

/** Escolher a resolução, acompanhar o render e baixar o vídeo (no computador ou no celular), ou levar a edição para outro editor. */
export function JanelaExportar({ projetoId, projeto, midias, proporcao, salvamento, tempo, aoFechar }: Props) {
  const { exportacoes, erro, exportar, excluir } = useExportacoes(projetoId, true);
  const [escolha, setEscolha] = useState<Escolha>("video");
  const [resolucao, setResolucao] = useState<Resolucao>("1080p");
  const [taxa, setTaxa] = useState<number | null>(null);
  const [taxaDoGif, setTaxaDoGif] = useState(TAXA_PADRAO_DO_GIF);
  const [formatoDoSom, setFormatoDoSom] = useState<FormatoExportacao>("m4a");
  // O quadro que a prévia mostra no cursor (o começo dele), como o render escolhe
  const instante = ajustarAoQuadro(projeto.taxa, tempo);
  const duracao = duracaoDoProjeto(projeto);
  const gifLongo = escolha === "gif" && duracao > GIF_MAXIMO_S * TICKS_POR_SEGUNDO;
  const quadroForaDoVideo = escolha === "quadro" && instante >= duracao;
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const salvo = salvamento === "salvo";

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  function pedir() {
    setEnviando(true);
    setAviso("");
    const pedido: PedidoDeExportacao =
      escolha === "gif"
        ? { resolucao, formato: "gif", taxa: taxaDoGif }
        : escolha === "quadro"
          ? { resolucao, formato: "png", tempo: instante }
          : escolha === "som"
            ? { resolucao, formato: formatoDoSom }
            : { resolucao, formato: "mp4", ...(taxa ? { taxa } : {}) };
    exportar(pedido)
      .catch((e) => setAviso(e instanceof ErroApi ? e.message : "Não foi possível pedir a exportação."))
      .finally(() => setEnviando(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-exportar"
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-exportar" className="font-display text-base font-semibold">
            Exportar
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* A janela inteira rola, não só a lista: numa tela de 768 px a lista ficava com uns 75 px e o QR do
            celular não cabia nela */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 border-b border-borda p-4">
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-painel-2 p-1" role="radiogroup" aria-label="Formato">
              {ESCOLHAS.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  role="radio"
                  aria-checked={escolha === opcao.id}
                  onClick={() => setEscolha(opcao.id)}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${escolha === opcao.id ? "bg-painel-3 text-texto shadow" : "text-suave hover:text-texto"}`}
                >
                  {opcao.nome}
                </button>
              ))}
            </div>
            {escolha === "video" || escolha === "quadro" ? (
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="mb-2 text-xs text-suave">Resolução</legend>
              {RESOLUCOES.map((opcao) => (
                <label
                  key={opcao.id}
                  title={opcao.dica}
                  className={`cursor-pointer rounded-lg border px-2 py-2 text-center transition ${
                    resolucao === opcao.id ? "border-destaque bg-destaque/10" : "border-borda hover:bg-painel-2"
                  }`}
                >
                  <input type="radio" name="resolucao" value={opcao.id} checked={resolucao === opcao.id} onChange={() => setResolucao(opcao.id)} className="sr-only" />
                  <span className="block text-sm font-semibold">{opcao.nome}</span>
                  <span className="block text-[11px] tabular-nums text-suave">{tamanhoDeSaida(proporcao, opcao.lado)}</span>
                </label>
              ))}
            </fieldset>
            ) : null}
            {escolha === "video" ? (
              <>
                <label className="flex items-center justify-between gap-2 text-xs text-suave">
                  Quadros por segundo
                  <select
                    className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs text-texto"
                    value={taxa ?? ""}
                    onChange={(evento) => setTaxa(evento.target.value ? Number(evento.target.value) : null)}
                  >
                    <option value="">Os do projeto ({formatarTaxa(projeto.taxa)})</option>
                    {TAXAS_DO_VIDEO.map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {opcao}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-suave">MP4 (H.264 e AAC), com o volume no padrão das redes sociais (-14 LUFS).</p>
              </>
            ) : escolha === "gif" ? (
              <>
                <label className="flex items-center justify-between gap-2 text-xs text-suave">
                  Quadros por segundo
                  <select
                    className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs text-texto"
                    value={taxaDoGif}
                    onChange={(evento) => setTaxaDoGif(Number(evento.target.value))}
                  >
                    {TAXAS_DO_GIF.map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {opcao}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-suave">
                  GIF em laço, com o lado menor em 480 px ({tamanhoDeSaida(proporcao, 480)}) e sem som. Vale para vídeos de até {GIF_MAXIMO_S} s.
                </p>
              </>
            ) : escolha === "quadro" ? (
              <p className="text-xs text-suave">
                O quadro do cursor ({formatarInstante(instante)}) numa imagem PNG, como a prévia mostra. Mova o cursor na linha do tempo para escolher outro.
              </p>
            ) : (
              <>
                <fieldset className="grid grid-cols-2 gap-2">
                  <legend className="sr-only">Formato do som</legend>
                  {[
                    { id: "m4a" as const, nome: "M4A", dica: "AAC, leve, toca em qualquer lugar" },
                    { id: "wav" as const, nome: "WAV", dica: "Sem perda (24 bits), para levar a outro programa" },
                  ].map((opcao) => (
                    <label
                      key={opcao.id}
                      className={`cursor-pointer rounded-lg border px-2 py-2 text-center transition ${
                        formatoDoSom === opcao.id ? "border-destaque bg-destaque/10" : "border-borda hover:bg-painel-2"
                      }`}
                    >
                      <input type="radio" name="formato-som" checked={formatoDoSom === opcao.id} onChange={() => setFormatoDoSom(opcao.id)} className="sr-only" />
                      <span className="block text-sm font-semibold">{opcao.nome}</span>
                      <span className="block text-[11px] text-suave">{opcao.dica}</span>
                    </label>
                  ))}
                </fieldset>
                <p className="text-xs text-suave">A mistura de todas as faixas, com o volume no padrão das redes sociais (-14 LUFS).</p>
              </>
            )}
            {gifLongo ? <p className="text-xs text-erro">O vídeo passa de {GIF_MAXIMO_S} s. Para ele, exporte em vídeo.</p> : null}
            {quadroForaDoVideo ? <p className="text-xs text-erro">O cursor está depois do fim do vídeo.</p> : null}
            <button type="button" className="botao-principal w-full" disabled={!salvo || enviando || gifLongo || quadroForaDoVideo} onClick={pedir}>
              {enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              {!salvo ? "Esperando salvar…" : escolha === "gif" ? "Exportar o GIF" : escolha === "quadro" ? "Exportar o quadro" : escolha === "som" ? "Exportar o som" : "Exportar"}
            </button>
            {aviso ? <p className="text-xs text-erro">{aviso}</p> : null}
          </div>

          {escolha === "video" ? <ExportarNoNavegador projeto={projeto} midias={midias} salvo={salvo} /> : null}

          <div className="space-y-2 border-b border-borda p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Levar para outro editor</h3>
            <p className="text-[11px] text-suave">
              Um XML que os editores profissionais abrem: os cortes, as faixas, o trecho de cada mídia, a velocidade, o volume e as transições (como fusões); os textos viram marcadores. Posição, cor, efeitos e animações ficam aqui.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { arquivo: "intercambio.xml", nome: "Só o XML", Icone: FileCode, dica: "Para quem tem as mídias originais no computador" },
                { arquivo: "intercambio.zip", nome: "XML com as mídias", Icone: FolderArchive, dica: "Um ZIP com a pasta midias/: no outro editor, aponte para ela" },
              ].map(({ arquivo, nome, Icone, dica }) => (
                <a
                  key={arquivo}
                  href={salvo ? `/api/projetos/${projetoId}/${arquivo}` : undefined}
                  download
                  title={dica}
                  aria-disabled={!salvo}
                  className={`botao-secundario px-3 py-1.5 text-xs ${salvo ? "" : "pointer-events-none opacity-50"}`}
                >
                  <Icone className="size-4" aria-hidden />
                  {nome}
                </a>
              ))}
            </div>
          </div>

          {projeto.marcadores?.length ? <Capitulos projeto={projeto} /> : null}

          <div className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Exportações deste projeto</h3>
            {erro ? <p className="text-xs text-erro">{erro}</p> : null}
            {exportacoes === null ? (
              <p className="text-xs text-suave">Carregando…</p>
            ) : exportacoes.length === 0 ? (
              <p className="text-xs text-suave">Nenhuma ainda. O vídeo fica guardado aqui para baixar quando quiser.</p>
            ) : (
              <ul className="space-y-2">
                {exportacoes.map((exportacao) => (
                  <ItemExportacao key={exportacao.id} exportacao={exportacao} aoExcluir={() => void excluir(exportacao.id)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemExportacao({ exportacao, aoExcluir }: { exportacao: Exportacao; aoExcluir: () => void }) {
  const progresso = exportacao.processamento?.progresso ?? 0;
  const celular = useLinkCelular(exportacao.id);
  const arquivo = arquivoDaExportacao(exportacao);
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 rounded-lg border border-borda bg-painel-2/50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{resumoDaExportacao(exportacao)}</p>
        <p className="text-xs text-suave">
          {exportacao.status === "pronta"
            ? [exportacao.duracao != null ? formatarTempo(exportacao.duracao) : "", exportacao.tamanho ? formatarBytes(exportacao.tamanho) : "", formatarQuando(exportacao.concluido_em ?? exportacao.criado_em)]
                .filter(Boolean)
                .join(" · ")
            : exportacao.status === "erro"
              ? "Não deu certo"
              : `${exportacao.processamento?.mensagem || "Na fila"} · ${progresso}%`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {exportacao.status === "pronta" ? (
          <>
            <a
              href={`/api/exportacoes/${exportacao.id}/arquivos/${arquivo}?baixar=true`}
              className="botao-icone"
              aria-label="Baixar"
              title="Baixar"
            >
              <Download className="size-4" aria-hidden />
            </a>
            <button type="button" className="botao-icone" onClick={() => void celular.gerar()} aria-label="Baixar no celular" title="Baixar no celular (QR code)">
              <QrCode className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
        <button type="button" className="botao-icone" onClick={aoExcluir} aria-label="Excluir exportação" title="Excluir exportação">
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      {exportacao.status === "processando" ? (
        <div className="col-span-full h-1 overflow-hidden rounded bg-painel-3" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-destaque transition-[width]" style={{ width: `${progresso}%` }} />
        </div>
      ) : null}
      {celular.erro ? <p className="col-span-full text-xs text-erro">{celular.erro}</p> : null}
      {celular.link ? <PainelQrCelular link={celular.link} aoFechar={celular.fechar} /> : null}
      {exportacao.status === "erro" && exportacao.erro ? (
        <p className="col-span-full flex items-start gap-1 text-xs text-erro">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          {exportacao.erro}
        </p>
      ) : null}
    </li>
  );
}

/** 30 → "30", 30000/1001 → "29,97". */
function formatarTaxa(taxa: Projeto["taxa"]): string {
  const valor = taxa.num / taxa.den;
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(".", ",");
}

/** O instante com centésimos: "0:12,03". */
function formatarInstante(ticks: Tick): string {
  const segundos = ticks / TICKS_POR_SEGUNDO;
  return `${Math.floor(segundos / 60)}:${(Math.floor((segundos % 60) * 100) / 100).toFixed(2).padStart(5, "0").replace(".", ",")}`;
}

/** Os marcadores como capítulos ("00:00 Nome", um por linha), para colar na descrição do vídeo. */
function Capitulos({ projeto }: { projeto: Projeto }) {
  const [copiado, setCopiado] = useState(false);
  const texto = textoDosCapitulos(projeto.marcadores ?? []);
  return (
    <div className="space-y-2 border-b border-borda p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Capítulos</h3>
      <p className="text-[11px] text-suave">Os marcadores da régua, para colar na descrição do vídeo. As redes pedem que o primeiro comece em 00:00.</p>
      <textarea
        readOnly
        value={texto}
        rows={Math.min(8, texto.split("\n").length)}
        className="w-full resize-none rounded-md border border-borda bg-painel-2 px-2 py-1.5 font-mono text-xs"
        aria-label="Capítulos"
      />
      <button type="button" className="botao-secundario px-3 py-1.5 text-xs" onClick={() => void navigator.clipboard.writeText(texto).then(() => setCopiado(true))}>
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
