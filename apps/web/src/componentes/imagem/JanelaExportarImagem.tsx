"use client";

import { Download, Eye, Film, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import {
  baixarBlob,
  type FontesDaExportacao,
  formatoDe,
  FORMATOS_DE_EXPORTACAO,
  type FormatoDeExportacao,
  gerarArquivo,
  guardarPreferencias,
  LADO_MAXIMO_DA_EXPORTACAO,
  lerPreferencias,
  nomeDoArquivo,
  OPCOES_PADRAO_DE_EXPORTACAO,
  type OpcoesDeExportacao,
  TAMANHOS_DO_ICONE,
} from "@/lib/exportacao/exportarComo";
import { exportarImagem } from "@/lib/exportacao/imagem";
import { temInformacoes } from "@/lib/exportacao/metadados";
import type { PaletaDaExportacao, Pontilhado } from "@/lib/exportacao/formatos/quantizar";
import { useEnvios } from "@/lib/envios";
import { formatarBytes } from "@/lib/formatar";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

const ESCALAS = [0.25, 0.5, 1, 2];
const PALETAS: { id: PaletaDaExportacao; nome: string }[] = [
  { id: "adaptavel", nome: "Adaptável" },
  { id: "perceptual", nome: "Perceptual" },
  { id: "web", nome: "Web (216 cores)" },
  { id: "cinza", nome: "Tons de cinza" },
  { id: "preto_branco", nome: "Preto e branco" },
];
const PONTILHADOS: { id: Pontilhado; nome: string }[] = [
  { id: "nenhum", nome: "Nenhum" },
  { id: "difusao", nome: "Difusão" },
  { id: "padrao", nome: "Padrão" },
  { id: "ruido", nome: "Ruído" },
];
/** No Salvar para web, só os formatos de tela. */
const FORMATOS_DA_WEB: FormatoDeExportacao[] = ["gif", "png8", "png", "jpeg", "webp", "webp_sem_perda", "avif"];

type Props = FontesDaExportacao & {
  projeto: Projeto;
  nome: string;
  midias: ReadonlyMap<string, Midia>;
  /** "web": o Salvar para web, com a original e a otimizada lado a lado e o tamanho do arquivo. */
  modo?: "exportar" | "web";
  aoFechar: () => void;
  aoAvisar: (mensagem: string) => void;
  /** Antes de gerar: espera a pintura que ainda está subindo (o projeto da hora vem depois dela). */
  aoPrepararPintura?: () => Promise<Projeto>;
};

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const rgb = (cor: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16)) as [number, number, number];

const CAMPO = "rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-sm text-texto outline-none focus:border-destaque";

/** Exportar como: o formato, o tamanho e as opções de cada um; baixar o arquivo ou mandar para a biblioteca. */
export function JanelaExportarImagem({ projeto, nome, midias, modo = "exportar", aoFechar, aoAvisar, aoPrepararPintura, fonteDosPixels, fonteDaMascara, fonteDaMascaraDosFiltros }: Props) {
  const { iniciar } = useEnvios();
  const [opcoes, setOpcoes] = useState<OpcoesDeExportacao>({ ...OPCOES_PADRAO_DE_EXPORTACAO, formato: modo === "web" ? "png8" : "png", informacoes: temInformacoes(projeto.informacoes) ? projeto.informacoes : null });
  const [gerando, setGerando] = useState<"baixar" | "biblioteca" | "previa" | null>(null);
  const [erro, setErro] = useState("");
  // O último arquivo gerado, com as opções dele: baixar de novo com as mesmas opções não gera outra vez
  const [resultado, setResultado] = useState<{ chave: string; blob: Blob; url: string } | null>(null);
  const [original, setOriginal] = useState<{ escala: number; url: string; tamanho: number } | null>(null);
  const base = tamanhoDaImagem(projeto);
  const formato = formatoDe(opcoes.formato);
  const largura = Math.round(base.largura * opcoes.escala);
  const altura = Math.round(base.altura * opcoes.escala);
  const fontes = { fonteDosPixels, fonteDaMascara, fonteDaMascaraDosFiltros };
  const chave = JSON.stringify(opcoes);
  // A prévia que termina depois de outra mais nova não a substitui
  const chaveAtual = useRef(chave);
  useEffect(() => {
    chaveAtual.current = chave;
  });
  const mudar = (mudanca: Partial<OpcoesDeExportacao>) => setOpcoes((atual) => ({ ...atual, ...mudanca }));
  const mudarPaleta = (mudanca: Partial<OpcoesDeExportacao["paleta"]>) => setOpcoes((atual) => ({ ...atual, paleta: { ...atual.paleta, ...mudanca } }));

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  // As URLs dos arquivos de prévia saem quando a janela fecha ou o arquivo muda
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function gerarAgora(): Promise<Blob> {
    if (resultado?.chave === chave) return resultado.blob;
    const atual = aoPrepararPintura ? await aoPrepararPintura() : projeto;
    const blob = await gerarArquivo(atual, midias, opcoes, fontes);
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    if (chaveAtual.current === chave) setResultado({ chave, blob, url });
    return blob;
  }

  async function gerar(destino: "baixar" | "biblioteca" | "previa") {
    setGerando(destino);
    setErro("");
    try {
      if (destino === "previa" && modo === "web" && original?.escala !== opcoes.escala) {
        const atual = aoPrepararPintura ? await aoPrepararPintura() : projeto;
        const png = await exportarImagem(atual, midias, { formato: "png", escala: opcoes.escala, ...fontes });
        const url = URL.createObjectURL(png);
        urls.current.push(url);
        setOriginal({ escala: opcoes.escala, url, tamanho: png.size });
      }
      const blob = await gerarAgora();
      if (destino === "previa") return;
      const arquivo = nomeDoArquivo(nome, opcoes.formato);
      if (destino === "baixar") {
        baixarBlob(blob, arquivo);
        aoAvisar(`Imagem baixada (${formatarBytes(blob.size)}).`);
      } else {
        iniciar([new File([blob], arquivo, { type: blob.type })]);
        aoAvisar("Enviando a imagem para a biblioteca: ela aparece em Mídias e no editor de vídeo.");
      }
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setGerando(null);
    }
  }

  // No Salvar para web, a prévia acompanha as opções (um pouco depois da última mudança)
  const gerarRef = useRef(gerar);
  useEffect(() => {
    gerarRef.current = gerar;
  });
  useEffect(() => {
    if (modo !== "web") return;
    const espera = window.setTimeout(() => void gerarRef.current("previa"), 400);
    return () => window.clearTimeout(espera);
  }, [modo, chave]);

  const escalaMaxima = LADO_MAXIMO_DA_EXPORTACAO / Math.max(base.largura, base.altura);
  const atual = resultado?.chave === chave ? resultado : null;
  const listaDeFormatos = modo === "web" ? FORMATOS_DE_EXPORTACAO.filter((item) => FORMATOS_DA_WEB.includes(item.id)) : FORMATOS_DE_EXPORTACAO;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[6vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-exportar-imagem"
        className={`w-full rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60 ${modo === "web" ? "max-w-5xl" : "max-w-md"}`}
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-exportar-imagem" className="font-display text-base font-semibold">
            {modo === "web" ? "Salvar para web" : "Exportar como"}
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className={modo === "web" ? "grid gap-4 p-4 md:grid-cols-[1fr_18rem]" : ""}>
          {modo === "web" ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {[
                { titulo: "Original (PNG)", url: original?.url, tamanho: original?.tamanho },
                { titulo: `Otimizada (${formato.nome})`, url: atual && formato.mostra ? atual.url : undefined, tamanho: atual?.blob.size },
              ].map((lado) => (
                <figure key={lado.titulo} className="flex min-w-0 flex-col gap-1">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-borda bg-[repeating-conic-gradient(#8884_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                    {lado.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lado.url} alt={lado.titulo} className="max-h-full max-w-full object-contain [image-rendering:pixelated]" />
                    ) : (
                      <LoaderCircle className="size-5 animate-spin text-suave" aria-hidden />
                    )}
                  </div>
                  <figcaption className="flex justify-between text-xs text-suave">
                    <span>{lado.titulo}</span>
                    <span className="tabular-nums">{lado.tamanho !== undefined ? formatarBytes(lado.tamanho) : "…"}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 p-4 text-sm">
            <label className="flex flex-col gap-1 text-xs text-suave">
              Formato
              <select value={opcoes.formato} onChange={(evento) => mudar({ formato: evento.currentTarget.value as FormatoDeExportacao })} className={CAMPO}>
                {listaDeFormatos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex flex-col gap-1.5 text-xs text-suave">
              <legend className="mb-1">Tamanho</legend>
              <div className="flex gap-1.5">
                {ESCALAS.filter((item) => item <= escalaMaxima).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={opcoes.escala === item}
                    onClick={() => mudar({ escala: item })}
                    className={`flex-1 rounded-md border px-1.5 py-1.5 text-xs tabular-nums ${opcoes.escala === item ? "border-destaque bg-destaque/15 text-texto" : "border-borda text-suave"}`}
                  >
                    {Math.round(item * 100)}%
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1">
                  L
                  <input
                    type="number"
                    min={1}
                    max={LADO_MAXIMO_DA_EXPORTACAO}
                    value={largura}
                    aria-label="Largura em pixels"
                    onChange={(evento) => {
                      const valor = Number(evento.currentTarget.value);
                      if (valor > 0) mudar({ escala: Math.min(escalaMaxima, valor / base.largura) });
                    }}
                    className={`${CAMPO} w-24 tabular-nums`}
                  />
                </label>
                <label className="flex items-center gap-1">
                  A
                  <input
                    type="number"
                    min={1}
                    max={LADO_MAXIMO_DA_EXPORTACAO}
                    value={altura}
                    aria-label="Altura em pixels"
                    onChange={(evento) => {
                      const valor = Number(evento.currentTarget.value);
                      if (valor > 0) mudar({ escala: Math.min(escalaMaxima, valor / base.altura) });
                    }}
                    className={`${CAMPO} w-24 tabular-nums`}
                  />
                </label>
                <span>px</span>
              </div>
            </fieldset>
            {formato.qualidade && (opcoes.formato !== "pdf" || opcoes.pdf === "jpeg") ? (
              <label className="flex flex-col gap-1 text-xs text-suave">
                Qualidade · {Math.round(opcoes.qualidade * 100)}%
                <input type="range" min={0.1} max={1} step={0.01} value={opcoes.qualidade} onChange={(evento) => mudar({ qualidade: Number(evento.currentTarget.value) })} />
              </label>
            ) : null}
            {formato.paleta ? (
              <fieldset className="grid grid-cols-2 gap-2 text-xs text-suave">
                <legend className="col-span-2 mb-1">Cores</legend>
                <label className="flex flex-col gap-1">
                  Paleta
                  <select value={opcoes.paleta.paleta} onChange={(evento) => mudarPaleta({ paleta: evento.currentTarget.value as PaletaDaExportacao })} className={CAMPO}>
                    {PALETAS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Quantas
                  <input
                    type="number"
                    min={2}
                    max={256}
                    value={opcoes.paleta.cores}
                    disabled={opcoes.paleta.paleta === "preto_branco" || opcoes.paleta.paleta === "web"}
                    onChange={(evento) => mudarPaleta({ cores: Math.max(2, Math.min(256, Number(evento.currentTarget.value) || 2)) })}
                    className={`${CAMPO} tabular-nums`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Pontilhado
                  <select value={opcoes.paleta.pontilhado} onChange={(evento) => mudarPaleta({ pontilhado: evento.currentTarget.value as Pontilhado })} className={CAMPO}>
                    {PONTILHADOS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Quantidade · {Math.round(opcoes.paleta.quantidade * 100)}%
                  <input type="range" min={0} max={1} step={0.01} value={opcoes.paleta.quantidade} disabled={opcoes.paleta.pontilhado === "nenhum"} onChange={(evento) => mudarPaleta({ quantidade: Number(evento.currentTarget.value) })} />
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={opcoes.paleta.transparencia} onChange={(evento) => mudarPaleta({ transparencia: evento.currentTarget.checked })} />
                  Transparência
                </label>
                <label className="flex items-center gap-1.5" title="A cor por baixo do que é meio transparente">
                  Fosco
                  <input type="color" value={hex(opcoes.paleta.fosco)} onChange={(evento) => mudarPaleta({ fosco: rgb(evento.currentTarget.value) })} className="h-6 w-8 rounded border border-borda bg-transparent" />
                </label>
              </fieldset>
            ) : null}
            {opcoes.formato === "tiff" ? (
              <label className="flex flex-col gap-1 text-xs text-suave">
                Compressão
                <select value={opcoes.tiff} onChange={(evento) => mudar({ tiff: evento.currentTarget.value as OpcoesDeExportacao["tiff"] })} className={CAMPO}>
                  <option value="deflate">ZIP (sem perda, menor)</option>
                  <option value="nenhuma">Nenhuma</option>
                </select>
              </label>
            ) : null}
            {opcoes.formato === "pdf" ? (
              <label className="flex flex-col gap-1 text-xs text-suave">
                Imagem no PDF
                <select value={opcoes.pdf} onChange={(evento) => mudar({ pdf: evento.currentTarget.value as OpcoesDeExportacao["pdf"] })} className={CAMPO}>
                  <option value="jpeg">JPEG (menor)</option>
                  <option value="sem_perda">Sem perda</option>
                </select>
              </label>
            ) : null}
            {opcoes.formato === "ico" ? (
              <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-suave">
                <legend className="mb-1">Tamanhos do ícone</legend>
                {TAMANHOS_DO_ICONE.map((lado) => (
                  <label key={lado} className="flex items-center gap-1 tabular-nums">
                    <input
                      type="checkbox"
                      checked={opcoes.icone.includes(lado)}
                      onChange={(evento) => {
                        const ligado = evento.currentTarget.checked;
                        mudar({ icone: ligado ? [...opcoes.icone, lado] : opcoes.icone.filter((item) => item !== lado) });
                      }}
                    />
                    {lado}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {temInformacoes(projeto.informacoes) && ["png", "png8", "jpeg", "webp", "webp_sem_perda", "tiff", "pdf"].includes(opcoes.formato) ? (
              <label className="flex items-center gap-1.5 text-xs text-suave">
                <input type="checkbox" checked={opcoes.informacoes !== null} onChange={(evento) => mudar({ informacoes: evento.currentTarget.checked ? projeto.informacoes! : null })} />
                Incluir as informações do arquivo (título, autor, direitos)
              </label>
            ) : null}
            {projeto.fundo.transparente && !formato.transparencia ? <p className="text-[11px] text-aviso">O {formato.nome} não guarda transparência: o fundo sai branco.</p> : null}
            {modo === "exportar" && atual ? (
              <p className="text-xs text-suave">
                {formato.nome}, {largura} × {altura}: <span className="tabular-nums text-texto">{formatarBytes(atual.blob.size)}</span>
              </p>
            ) : null}
            {erro ? <AvisoErro>{erro}</AvisoErro> : null}
            {modo === "exportar" ? (
              <button type="button" className="botao-secundario px-4 py-2" onClick={() => void gerar("previa")} disabled={gerando !== null}>
                {gerando === "previa" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                Ver o tamanho do arquivo
              </button>
            ) : null}
            <button type="button" className="botao-principal px-4 py-2" onClick={() => void gerar("baixar")} disabled={gerando !== null && gerando !== "previa"}>
              {gerando === "baixar" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              Baixar
            </button>
            {formato.biblioteca ? (
              <button type="button" className="botao-secundario px-4 py-2" onClick={() => void gerar("biblioteca")} disabled={gerando !== null && gerando !== "previa"}>
                {gerando === "biblioteca" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Film className="size-4" aria-hidden />}
                Usar nos vídeos (mandar para a biblioteca)
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Arquivo › Exportar › Preferências de exportação: o formato e a qualidade da exportação rápida. */
export function JanelaPreferenciasDeExportacao({ aoFechar, aoAvisar }: { aoFechar: () => void; aoAvisar: (mensagem: string) => void }) {
  const [preferencias, setPreferencias] = useState(lerPreferencias);
  const formato = formatoDe(preferencias.formato);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-preferencias-exportacao" className="w-full max-w-sm rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60" onPointerDown={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-preferencias-exportacao" className="font-display text-base font-semibold">
            Preferências de exportação
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4 text-sm">
          <label className="flex flex-col gap-1 text-xs text-suave">
            Formato da exportação rápida
            <select value={preferencias.formato} onChange={(evento) => setPreferencias({ ...preferencias, formato: evento.currentTarget.value as FormatoDeExportacao })} className={CAMPO}>
              {FORMATOS_DE_EXPORTACAO.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
          {formato.qualidade ? (
            <label className="flex flex-col gap-1 text-xs text-suave">
              Qualidade · {Math.round(preferencias.qualidade * 100)}%
              <input type="range" min={0.1} max={1} step={0.01} value={preferencias.qualidade} onChange={(evento) => setPreferencias({ ...preferencias, qualidade: Number(evento.currentTarget.value) })} />
            </label>
          ) : null}
          <p className="text-xs text-suave">A exportação rápida sai no tamanho do documento, com as opções padrão do formato. A escolha fica guardada neste navegador.</p>
          <button
            type="button"
            className="botao-principal px-4 py-2"
            onClick={() => {
              guardarPreferencias(preferencias);
              aoAvisar(`A exportação rápida sai em ${formato.nome}.`);
              aoFechar();
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
