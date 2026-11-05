"use client";

import { Download, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { exportarAlbum, type OpcoesDaSaida } from "@/lib/album/api";
import type { FotoDoAlbum } from "@/lib/album/fotos";
import { ErroApi } from "@/lib/api";
import { useEventosJobs } from "@/lib/eventos";
import { useMarca } from "@/lib/marca";

const CHAVE_DAS_MARCAS = "takeone-album-marcas";
const PADROES = [
  { id: "{original}", nome: "O nome original" },
  { id: "{album}_{n}", nome: "Álbum e número" },
  { id: "{data}_{n}", nome: "Data e número" },
];
const LADOS = [
  { id: 0, nome: "Tamanho original" },
  { id: 4096, nome: "4096 px" },
  { id: 2048, nome: "2048 px (redes)" },
  { id: 1080, nome: "1080 px (celular)" },
];

type MarcaGuardada = { nome: string; marca: NonNullable<OpcoesDaSaida["marca"]> };

function lerMarcas(): MarcaGuardada[] {
  try {
    return JSON.parse(window.localStorage.getItem(CHAVE_DAS_MARCAS) ?? "[]") as MarcaGuardada[];
  } catch {
    return [];
  }
}

/**
 * Exportar as fotos do álbum num ZIP: quais (as escolhidas, as selecionadas ou as que aparecem), o formato (JPG,
 * PNG ou o original como chegou), o tamanho, o limite do arquivo, os nomes, as subpastas (por nota, cor, categoria
 * ou a pasta de origem), o XMP ao lado e a marca d'água (texto ou o logo do kit), com até 5 marcas guardadas.
 */
export function JanelaExportarAlbum({
  albumId,
  escolhidas,
  selecionadas,
  visiveis,
  aoFechar,
}: {
  albumId: string;
  escolhidas: FotoDoAlbum[];
  selecionadas: FotoDoAlbum[];
  visiveis: FotoDoAlbum[];
  aoFechar: () => void;
}) {
  const marcaDoKit = useMarca();
  const [quais, setQuais] = useState<"escolhidas" | "selecionadas" | "visiveis">(escolhidas.length ? "escolhidas" : selecionadas.length > 1 ? "selecionadas" : "visiveis");
  const [opcoes, setOpcoes] = useState<OpcoesDaSaida>({ formato: "jpg", qualidade: 92, lado_maximo: null, tamanho_maximo_kb: null, padrao: "{original}", divisao: "nenhuma", xmp: false, com_edicao: true, marca: null });
  const [marcas, setMarcas] = useState<MarcaGuardada[]>(lerMarcas);
  const [job, setJob] = useState<{ id: string; progresso: number; mensagem: string; pronto: boolean; erro: string } | null>(null);
  const [erro, setErro] = useState("");
  const muda = (campos: Partial<OpcoesDaSaida>) => setOpcoes((o) => ({ ...o, ...campos }));
  const fotos = (quais === "escolhidas" ? escolhidas : quais === "selecionadas" ? selecionadas : visiveis).filter((f) => f.status === "pronta");

  useEventosJobs((evento) => {
    if (!job || evento.id !== job.id) return;
    setJob({ ...job, progresso: evento.progresso, mensagem: evento.mensagem, pronto: evento.status === "concluido", erro: evento.status === "erro" ? (evento.erro ?? "A exportação falhou.") : "" });
  });

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
      evento.stopImmediatePropagation();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [aoFechar]);

  function guardarMarca() {
    if (!opcoes.marca) return;
    const nome = window.prompt("Nome da marca d'água:", opcoes.marca.tipo === "texto" ? opcoes.marca.texto : "Logo");
    if (!nome) return;
    const novas = [...marcas.filter((m) => m.nome !== nome), { nome, marca: opcoes.marca }].slice(-5);
    setMarcas(novas);
    try {
      window.localStorage.setItem(CHAVE_DAS_MARCAS, JSON.stringify(novas));
    } catch {
      // Sem armazenamento: a marca vale só agora
    }
  }

  async function exportar() {
    setErro("");
    try {
      const { job_id } = await exportarAlbum(albumId, fotos.map((f) => f.midia_id), opcoes);
      setJob({ id: job_id, progresso: 0, mensagem: "Na fila", pronto: false, erro: "" });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível exportar.");
    }
  }

  const rotulo = "flex flex-col gap-1 text-xs";
  const campo = "rounded border border-borda bg-painel-2 px-2 py-1";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[6vh]" onPointerDown={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-exportar" className="w-full max-w-lg rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-exportar" className="font-display text-base font-semibold">
            Exportar fotos
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 text-sm">
          <label className={`${rotulo} col-span-2`}>
            <span className="text-suave">Quais fotos</span>
            <select className={campo} value={quais} onChange={(e) => setQuais(e.target.value as typeof quais)}>
              <option value="escolhidas">As escolhidas ({escolhidas.length})</option>
              <option value="selecionadas">As selecionadas ({selecionadas.length})</option>
              <option value="visiveis">As que aparecem na grade ({visiveis.length})</option>
            </select>
          </label>
          <label className={rotulo}>
            <span className="text-suave">Formato</span>
            <select className={campo} value={opcoes.formato} onChange={(e) => muda({ formato: e.target.value as OpcoesDaSaida["formato"] })}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
              <option value="original">O original, como chegou</option>
            </select>
          </label>
          <label className={rotulo}>
            <span className="text-suave">Tamanho</span>
            <select className={campo} value={opcoes.lado_maximo ?? 0} disabled={opcoes.formato === "original"} onChange={(e) => muda({ lado_maximo: Number(e.target.value) || null })}>
              {LADOS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>
          {opcoes.formato === "jpg" ? (
            <>
              <label className={rotulo}>
                <span className="text-suave">Qualidade: {opcoes.qualidade}</span>
                <input type="range" min={60} max={100} value={opcoes.qualidade} onChange={(e) => muda({ qualidade: Number(e.target.value) })} className="accent-[var(--to-destaque)]" />
              </label>
              <label className={rotulo}>
                <span className="text-suave">No máximo (KB por foto)</span>
                <input type="number" min={50} placeholder="Sem limite" className={campo} value={opcoes.tamanho_maximo_kb ?? ""} onChange={(e) => muda({ tamanho_maximo_kb: Number(e.target.value) >= 50 ? Number(e.target.value) : null })} />
              </label>
            </>
          ) : null}
          <label className={rotulo}>
            <span className="text-suave">Nomes</span>
            <select className={campo} value={PADROES.some((p) => p.id === opcoes.padrao) ? opcoes.padrao : ""} onChange={(e) => muda({ padrao: e.target.value || opcoes.padrao })}>
              {PADROES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
              <option value="">Do meu jeito</option>
            </select>
          </label>
          <label className={rotulo}>
            <span className="text-suave">Padrão ({"{original} {album} {n} {data} {nota}"})</span>
            <input className={campo} maxLength={80} value={opcoes.padrao} onChange={(e) => muda({ padrao: e.target.value })} />
          </label>
          <label className={rotulo}>
            <span className="text-suave">Subpastas</span>
            <select className={campo} value={opcoes.divisao} onChange={(e) => muda({ divisao: e.target.value as OpcoesDaSaida["divisao"] })}>
              <option value="nenhuma">Nenhuma</option>
              <option value="nota">Pela nota</option>
              <option value="cor">Pela cor</option>
              <option value="categoria">Pela escolha da IA</option>
              <option value="pasta">Pela pasta de origem</option>
            </select>
          </label>
          <div className="flex flex-col justify-end gap-1 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={opcoes.xmp} onChange={(e) => muda({ xmp: e.target.checked })} />O XMP ao lado (nota, cor e ajustes)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={opcoes.com_edicao} disabled={opcoes.formato === "original"} onChange={(e) => muda({ com_edicao: e.target.checked })} />
              Com a edição
            </label>
          </div>
          {opcoes.formato !== "original" ? (
            <fieldset className="col-span-2 flex flex-col gap-2 rounded-md border border-borda p-2 text-xs">
              <legend className="px-1 text-suave">Marca d&apos;água</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  className={campo}
                  value={opcoes.marca?.tipo ?? ""}
                  onChange={(e) => {
                    const tipo = e.target.value;
                    muda({ marca: !tipo ? null : tipo === "logo" ? { tipo: "logo", texto: "", midia_id: marcaDoKit.logo_midia_id, canto: "baixo-direita", tamanho: 0.15, opacidade: 0.7 } : { tipo: "texto", texto: "", midia_id: null, canto: "baixo-direita", tamanho: 0.035, opacidade: 0.6 } });
                  }}
                  aria-label="Marca d'água"
                >
                  <option value="">Sem marca</option>
                  <option value="texto">Texto</option>
                  <option value="logo" disabled={!marcaDoKit.logo_midia_id}>
                    O logo do kit de marca
                  </option>
                </select>
                {marcas.map((m) => (
                  <button key={m.nome} type="button" className="rounded-full bg-painel-2 px-2 py-0.5 hover:bg-painel-3" onClick={() => muda({ marca: m.marca })}>
                    {m.nome}
                  </button>
                ))}
              </div>
              {opcoes.marca ? (
                <div className="grid grid-cols-2 gap-2">
                  {opcoes.marca.tipo === "texto" ? (
                    <input className={`${campo} col-span-2`} maxLength={60} placeholder="© Seu estúdio" value={opcoes.marca.texto} onChange={(e) => muda({ marca: { ...opcoes.marca!, texto: e.target.value } })} aria-label="Texto da marca" />
                  ) : null}
                  <select className={campo} value={opcoes.marca.canto} onChange={(e) => muda({ marca: { ...opcoes.marca!, canto: e.target.value as NonNullable<OpcoesDaSaida["marca"]>["canto"] } })} aria-label="Canto da marca">
                    <option value="baixo-direita">Embaixo à direita</option>
                    <option value="baixo-esquerda">Embaixo à esquerda</option>
                    <option value="cima-direita">Em cima à direita</option>
                    <option value="cima-esquerda">Em cima à esquerda</option>
                    <option value="meio">No meio</option>
                  </select>
                  <label className="flex items-center gap-1.5">
                    Opacidade
                    <input type="range" min={0.1} max={1} step={0.05} value={opcoes.marca.opacidade} onChange={(e) => muda({ marca: { ...opcoes.marca!, opacidade: Number(e.target.value) } })} className="min-w-0 flex-1 accent-[var(--to-destaque)]" />
                  </label>
                  <label className="col-span-2 flex items-center gap-1.5">
                    Tamanho
                    <input type="range" min={0.01} max={opcoes.marca.tipo === "logo" ? 0.4 : 0.12} step={0.005} value={opcoes.marca.tamanho} onChange={(e) => muda({ marca: { ...opcoes.marca!, tamanho: Number(e.target.value) } })} className="min-w-0 flex-1 accent-[var(--to-destaque)]" />
                    <button type="button" className="rounded px-2 py-0.5 text-suave hover:bg-painel-2 hover:text-texto" onClick={guardarMarca}>
                      Guardar
                    </button>
                  </label>
                </div>
              ) : null}
            </fieldset>
          ) : null}
          {erro ? <p className="col-span-2 text-xs text-erro">{erro}</p> : null}
          {job ? (
            <div className="col-span-2 flex items-center gap-2 text-xs">
              {job.pronto ? (
                <a className="botao-principal flex-1 justify-center px-3 py-2" href={`/api/albuns/${albumId}/saidas/${job.id}`} download>
                  <Download className="size-4" aria-hidden />
                  Baixar o ZIP
                </a>
              ) : job.erro ? (
                <span className="text-erro">{job.erro}</span>
              ) : (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  <span className="text-suave">
                    {job.mensagem} {job.progresso ? `(${job.progresso}%)` : ""}
                  </span>
                </>
              )}
            </div>
          ) : (
            <button type="button" className="botao-principal col-span-2 px-3 py-2" disabled={!fotos.length} onClick={() => void exportar()}>
              Exportar {fotos.length.toLocaleString("pt-BR")} foto(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
