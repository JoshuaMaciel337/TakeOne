"use client";

import { FileUp, LoaderCircle, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { type EdicaoDaFoto, edicaoParaEnviar } from "@/lib/album/edicao";
import {
  CONTROLES_DO_ESTILO,
  corDoEstilo,
  corDoXmp,
  ESTILO_NEUTRO,
  type EstiloDaFoto,
  estiloDaLut,
  estiloDoFiltro,
  ESTILOS_PRONTOS,
  melhoradosConsistentes,
  type ModoDoControle,
  nomeDoXmp,
  PERGUNTAS_DO_GOSTO,
} from "@/lib/album/estilos";
import type { FotoDoAlbum } from "@/lib/album/fotos";
import { arquivoDaMidia, ErroApi } from "@/lib/api";
import { type AjustesCor, FILTROS, LIMITES_COR } from "@/lib/projeto/cor";
import { ajustesAutomaticos } from "@/lib/projeto/melhorar";
import { criarRecurso, excluirRecurso, useRecursos } from "@/lib/recursos";
import { useLuts, useTabelasDasLuts } from "@/lib/useLuts";

import { amostra, emLotes, previaComCor } from "./amostras";

type Item = { id: string; nome: string; estilo: EstiloDaFoto; doEspaco?: boolean };
const NO_MAXIMO_COMPARANDO = 3;

/**
 * Os estilos das fotos do álbum: os prontos, os do espaço e um novo a partir de um arquivo XMP (a predefinição de
 * outro programa de fotos), de uma LUT ou de um filtro. Até três aparecem lado a lado na foto do cursor; o escolhido
 * tem a intensidade, o "Melhorar" por foto, as três perguntas de gosto e o modo de cada controle, e vai para as
 * fotos (com a consistência entre as parecidas, se pedida).
 */
export function JanelaDeEstilos({
  alvos,
  referencia,
  grupoDe,
  aoAplicar,
  aoFechar,
}: {
  alvos: FotoDoAlbum[];
  referencia: FotoDoAlbum;
  grupoDe: (foto: FotoDoAlbum) => string;
  aoAplicar: (edicoes: { midia_id: string; edicao: EdicaoDaFoto | null }[], aviso: string) => Promise<void>;
  aoFechar: () => void;
}) {
  const { recursos, recarregar } = useRecursos<{ estilo: EstiloDaFoto }>("estilo_foto");
  const { luts } = useLuts();
  const [novos, setNovos] = useState<Item[]>([]);
  const itens: Item[] = useMemo(
    () => [
      ...ESTILOS_PRONTOS,
      ...recursos.map((r) => ({ id: r.id, nome: r.nome, estilo: r.dados.estilo, doEspaco: true })),
      ...novos,
    ],
    [recursos, novos],
  );
  const [atualId, setAtualId] = useState(ESTILOS_PRONTOS[0].id);
  const [comparando, setComparando] = useState<string[]>([ESTILOS_PRONTOS[0].id]);
  // As mudanças no estilo escolhido (até salvar ou aplicar)
  const [editados, setEditados] = useState<Record<string, EstiloDaFoto>>({});
  const [consistencia, setConsistencia] = useState(true);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const entradaXmp = useRef<HTMLInputElement>(null);
  const estiloDe = (item: Item) => editados[item.id] ?? item.estilo;
  const atual = itens.find((item) => item.id === atualId) ?? itens[0];
  const estilo = estiloDe(atual);
  const mudar = (campos: Partial<EstiloDaFoto>) => setEditados((e) => ({ ...e, [atual.id]: { ...estilo, ...campos } }));
  const prontas = alvos.filter((foto) => foto.status === "pronta");

  // As LUTs dos estilos comparados (para a prévia desenhar com elas)
  useTabelasDasLuts(itens.filter((i) => comparando.includes(i.id)).flatMap((i) => (estiloDe(i).cor.lut ? [estiloDe(i).cor.lut!.id] : [])));

  // O "Melhorar" da foto do cursor, uma vez
  const [melhoradoDaReferencia, setMelhorado] = useState<Partial<AjustesCor> | null>(null);
  useEffect(() => {
    let ativo = true;
    amostra(arquivoDaMidia(referencia.midia_id, "capa.jpg"))
      .then((rgba) => ativo && setMelhorado(ajustesAutomaticos(rgba)))
      .catch(() => ativo && setMelhorado({}));
    return () => {
      ativo = false;
    };
  }, [referencia.midia_id]);

  // As prévias: a original e os comparados, desenhados sobre a capa
  const [previas, setPrevias] = useState<Record<string, string>>({});
  const chaveDasPrevias = JSON.stringify([melhoradoDaReferencia, comparando.map((id) => [id, estiloDe(itens.find((i) => i.id === id) ?? atual)])]);
  useEffect(() => {
    if (!melhoradoDaReferencia) return;
    let ativo = true;
    const urls: string[] = [];
    const lista = itens.filter((i) => comparando.includes(i.id));
    Promise.all(lista.map((i) => previaComCor(arquivoDaMidia(referencia.midia_id, "capa.jpg"), corDoEstilo(estiloDe(i), melhoradoDaReferencia))))
      .then((feitas) => {
        urls.push(...feitas);
        if (ativo) setPrevias(Object.fromEntries(lista.map((i, k) => [i.id, feitas[k]])));
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
      // As prévias de antes saem da memória quando chegam as novas
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 2000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave junta o que muda o desenho
  }, [chaveDasPrevias, referencia.midia_id]);

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !ocupado) aoFechar();
      evento.stopImmediatePropagation();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [aoFechar, ocupado]);

  function escolher(item: Item) {
    setAtualId(item.id);
    setComparando((lista) => (lista.includes(item.id) ? lista : [...lista, item.id].slice(-NO_MAXIMO_COMPARANDO)));
  }
  function adicionarNovo(nomeDoNovo: string, novo: EstiloDaFoto) {
    const item = { id: `novo-${Date.now()}`, nome: nomeDoNovo, estilo: novo };
    setNovos((lista) => [...lista, item]);
    setAtualId(item.id);
    setComparando((lista) => [...lista, item.id].slice(-NO_MAXIMO_COMPARANDO));
    setNome(nomeDoNovo);
  }

  async function lerXmp(arquivo: File) {
    setErro("");
    try {
      const texto = await arquivo.text();
      adicionarNovo(nomeDoXmp(texto) ?? arquivo.name.replace(/\.xmp$/i, ""), { ...ESTILO_NEUTRO, melhorar: false, cor: corDoXmp(texto) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  }

  async function salvar() {
    setOcupado("Salvando");
    setErro("");
    try {
      await criarRecurso({ tipo: "estilo_foto", nome: (nome || atual.nome).slice(0, 80), dados: { estilo } });
      recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar o estilo.");
    } finally {
      setOcupado("");
    }
  }

  async function aplicar() {
    setOcupado("Aplicando");
    setErro("");
    try {
      let melhorados = new Map<string, Partial<AjustesCor>>();
      if (estilo.melhorar) {
        const lidos = await emLotes(prontas, async (foto) => [foto.midia_id, ajustesAutomaticos(await amostra(arquivoDaMidia(foto.midia_id, "capa.jpg")))] as const);
        melhorados = new Map(lidos);
        if (consistencia) {
          const grupos = new Map<string, string[]>();
          for (const foto of prontas) grupos.set(grupoDe(foto), [...(grupos.get(grupoDe(foto)) ?? []), foto.midia_id]);
          melhorados = melhoradosConsistentes(grupos, melhorados);
        }
      }
      const edicoes = prontas.map((foto) => {
        const base = edicaoParaEnviar(foto.edicao);
        delete base.igualar;
        return { midia_id: foto.midia_id, edicao: { ...base, cor: corDoEstilo(estilo, melhorados.get(foto.midia_id)) } };
      });
      await aoAplicar(edicoes, `Estilo "${atual.nome}" em ${prontas.length} foto(s).`);
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar o estilo.");
    } finally {
      setOcupado("");
    }
  }

  const comparados = itens.filter((i) => comparando.includes(i.id));
  const grupoDoItem = (lista: Item[], titulo: string) =>
    lista.length ? (
      <div className="flex flex-col gap-0.5">
        <p className="px-1 pt-2 text-[11px] font-semibold tracking-wide text-apagado uppercase">{titulo}</p>
        {lista.map((item) => (
          <div key={item.id} className={`flex items-center gap-1 rounded-md ${item.id === atual.id ? "bg-painel-3" : "hover:bg-painel-2"}`}>
            <input
              type="checkbox"
              className="ml-1.5"
              checked={comparando.includes(item.id)}
              onChange={(evento) =>
                setComparando((lista2) => (evento.target.checked ? [...lista2.filter((id) => id !== item.id), item.id].slice(-NO_MAXIMO_COMPARANDO) : lista2.filter((id) => id !== item.id)))
              }
              aria-label={`Comparar ${item.nome}`}
              title="Comparar na foto (até 3)"
            />
            <button type="button" className="min-w-0 flex-1 truncate px-1.5 py-1 text-left text-xs" onClick={() => escolher(item)}>
              {item.nome}
              {editados[item.id] ? " •" : ""}
            </button>
            {item.doEspaco ? (
              <button
                type="button"
                className="botao-icone"
                aria-label={`Excluir ${item.nome}`}
                onClick={() => {
                  if (window.confirm(`Excluir o estilo "${item.nome}"?`)) void excluirRecurso(item.id).then(recarregar);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onPointerDown={() => !ocupado && aoFechar()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-estilos"
        className="flex h-full max-h-[52rem] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 id="titulo-estilos" className="font-display text-base font-semibold">
            Estilos
            <span className="ml-2 text-xs font-normal text-suave">para {prontas.length.toLocaleString("pt-BR")} foto(s)</span>
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar" disabled={Boolean(ocupado)}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[13rem_1fr_18rem]">
          <aside className="flex min-h-0 flex-col gap-1 overflow-y-auto border-b border-borda p-2 md:border-r md:border-b-0" aria-label="Lista de estilos">
            {grupoDoItem(ESTILOS_PRONTOS, "Prontos")}
            {grupoDoItem(itens.filter((i) => i.doEspaco), "Do espaço")}
            {grupoDoItem(novos, "Novos")}
            <p className="px-1 pt-3 text-[11px] font-semibold tracking-wide text-apagado uppercase">Novo estilo</p>
            <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-painel-2" onClick={() => entradaXmp.current?.click()}>
              <FileUp className="size-3.5" aria-hidden />
              De um arquivo XMP…
            </button>
            <input
              ref={entradaXmp}
              type="file"
              accept=".xmp,application/rdf+xml,text/xml"
              hidden
              onChange={(evento) => {
                const arquivo = evento.target.files?.[0];
                if (arquivo) void lerXmp(arquivo);
                evento.target.value = "";
              }}
            />
            <select
              className="rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs"
              value=""
              onChange={(evento) => {
                const filtro = FILTROS.find((f) => f.id === evento.target.value);
                if (filtro) adicionarNovo(filtro.nome, estiloDoFiltro(filtro.id));
              }}
              aria-label="De um filtro"
            >
              <option value="">De um filtro…</option>
              {FILTROS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            {luts?.length ? (
              <select
                className="rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs"
                value=""
                onChange={(evento) => {
                  const lut = luts.find((l) => l.id === evento.target.value);
                  if (lut) adicionarNovo(lut.nome, estiloDaLut(lut.id));
                }}
                aria-label="De uma LUT"
              >
                <option value="">De uma LUT…</option>
                {luts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            ) : null}
          </aside>

          <div className="grid min-h-0 auto-rows-fr gap-2 overflow-y-auto bg-black/30 p-2" style={{ gridTemplateColumns: `repeat(${comparados.length + 1 > 2 ? 2 : comparados.length + 1}, minmax(0, 1fr))` }} aria-label="Prévias">
            <figure className="flex min-h-0 flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie */}
              <img src={arquivoDaMidia(referencia.midia_id, "capa.jpg")} alt="Original" className="min-h-0 flex-1 object-contain" />
              <figcaption className="text-center text-xs text-suave">Original</figcaption>
            </figure>
            {comparados.map((item) => (
              <figure key={item.id} className={`flex min-h-0 cursor-pointer flex-col gap-1 rounded ${item.id === atual.id ? "ring-2 ring-destaque" : ""}`} onClick={() => setAtualId(item.id)}>
                {previas[item.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- prévia desenhada aqui
                  <img src={previas[item.id]} alt={item.nome} className="min-h-0 flex-1 object-contain" />
                ) : (
                  <span className="flex flex-1 items-center justify-center">
                    <LoaderCircle className="size-5 animate-spin" aria-label="Desenhando" />
                  </span>
                )}
                <figcaption className="text-center text-xs">{item.nome}</figcaption>
              </figure>
            ))}
          </div>

          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-borda p-3 text-xs md:border-t-0 md:border-l" aria-label="Ajustes do estilo">
            <p className="font-medium">{atual.nome}</p>
            <label className="grid grid-cols-[5rem_1fr_3rem] items-center gap-1.5">
              <span className="text-suave">Intensidade</span>
              <input type="range" min={0} max={1.5} step={0.05} value={estilo.intensidade} onChange={(evento) => mudar({ intensidade: Number(evento.target.value) })} className="accent-[var(--to-destaque)]" aria-label="Intensidade" />
              <span className="text-right tabular-nums text-suave">{Math.round(estilo.intensidade * 100)}%</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={estilo.melhorar} onChange={(evento) => mudar({ melhorar: evento.target.checked })} />
              Melhorar cada foto por baixo do estilo
            </label>
            {PERGUNTAS_DO_GOSTO.map((p) => (
              <div key={p.id} className="flex flex-col gap-1">
                <span className="text-suave">{p.pergunta}</span>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-painel-2 p-1" role="radiogroup" aria-label={p.pergunta}>
                  {p.opcoes.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={estilo.gosto[p.id] === o.id}
                      onClick={() => mudar({ gosto: { ...estilo.gosto, [p.id]: o.id } })}
                      className={`rounded-md px-1 py-1 ${estilo.gosto[p.id] === o.id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}
                    >
                      {o.nome}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <details>
              <summary className="cursor-pointer text-suave">Controle a controle</summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {CONTROLES_DO_ESTILO.map((c) => {
                  const controle = estilo.controles[c.id] ?? { modo: "somar" as ModoDoControle, valor: 0 };
                  const { minimo, maximo } = LIMITES_COR[c.id];
                  const mudarControle = (campos: Partial<typeof controle>) => mudar({ controles: { ...estilo.controles, [c.id]: { ...controle, ...campos } } });
                  return (
                    <div key={c.id} className="grid grid-cols-[4.5rem_4.5rem_1fr] items-center gap-1">
                      <span className="truncate text-suave">{c.nome}</span>
                      <select className="rounded border border-borda bg-painel-2 px-0.5 py-0.5" value={controle.modo} onChange={(evento) => mudarControle({ modo: evento.target.value as ModoDoControle })} aria-label={`Modo de ${c.nome}`}>
                        <option value="somar">Somar</option>
                        <option value="fixo">Fixo</option>
                        <option value="desligado">Desligado</option>
                      </select>
                      <input
                        type="range"
                        min={minimo}
                        max={maximo}
                        step={(maximo - minimo) / 100}
                        value={controle.valor}
                        disabled={controle.modo === "desligado"}
                        onChange={(evento) => mudarControle({ valor: Number(evento.target.value) })}
                        className="accent-[var(--to-destaque)]"
                        aria-label={`${c.nome}: valor`}
                        title={controle.valor.toFixed(2)}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={consistencia} onChange={(evento) => setConsistencia(evento.target.checked)} disabled={!estilo.melhorar} />
              Mesma luz nas parecidas do grupo
            </label>
            <div className="flex items-center gap-1.5">
              <input value={nome} onChange={(evento) => setNome(evento.target.value)} maxLength={80} placeholder={atual.nome} className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-2 py-1" aria-label="Nome do estilo" />
              <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => void salvar()} disabled={Boolean(ocupado)} title="Guardar no espaço">
                <Save className="size-3.5" aria-hidden />
                Salvar
              </button>
            </div>
            {erro ? <p className="text-erro">{erro}</p> : null}
            <button type="button" className="botao-principal mt-auto px-3 py-2" onClick={() => void aplicar()} disabled={Boolean(ocupado) || !prontas.length}>
              {ocupado ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {ocupado || `Aplicar em ${prontas.length.toLocaleString("pt-BR")} foto(s)`}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
