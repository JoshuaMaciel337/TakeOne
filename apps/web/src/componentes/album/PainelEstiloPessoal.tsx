"use client";

import { GraduationCap, LoaderCircle, Plus, Trash2, UserRoundCheck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  aplicarEstiloPessoal,
  criarEstiloPessoal,
  ensinarEstilo,
  type EstiloPessoal,
  estilosPessoais,
  excluirEstiloPessoal,
  parecidasDoEstilo,
} from "@/lib/album/api";
import type { FotoDoAlbum } from "@/lib/album/fotos";
import { arquivoDaMidia, ErroApi } from "@/lib/api";
import type { Job } from "@/lib/tipos";

const CHAVE = "takeone-album-estilo-pessoal";

function lerEscolhido(): string {
  try {
    return window.localStorage.getItem(CHAVE) ?? "";
  } catch {
    return "";
  }
}

/**
 * O estilo pessoal: ensinar com as fotos editadas (ou com o .xmp de outro programa ao lado das fotos importadas no
 * lugar) e aplicar nas outras, com a intensidade. Ele prevê a diferença que a pessoa costuma pôr sobre o "Melhorar",
 * pelas fotos ensinadas mais parecidas (ou por um modelo, a partir de 300); "Parece com" mostra quais.
 */
export function PainelEstiloPessoal({
  albumId,
  alvos,
  referencia,
  evento,
  aoAviso,
}: {
  albumId: string;
  alvos: FotoDoAlbum[];
  referencia: FotoDoAlbum | null;
  /** O último job do estilo que terminou (o painel recarrega e avisa). */
  evento: Job | null;
  aoAviso: (texto: string, erro?: boolean) => void;
}) {
  const [estilos, setEstilos] = useState<EstiloPessoal[] | null>(null);
  const [escolhido, setEscolhido] = useState<string>(lerEscolhido);
  const [criando, setCriando] = useState(false);
  const [intensidade, setIntensidade] = useState(1);
  const [ocupado, setOcupado] = useState("");
  const [parecidas, setParecidas] = useState<{ midia_id: string; semelhanca: number }[]>([]);
  const [vez, setVez] = useState(0);
  const [eventoVisto, setEventoVisto] = useState<string | null>(null);
  const prontas = alvos.filter((foto) => foto.status === "pronta");
  const editadas = prontas.filter((foto) => foto.edicao?.cor);
  const estilo = estilos?.find((e) => e.id === escolhido) ?? estilos?.[0] ?? null;

  // Um job do estilo terminou: recarrega a lista e diz o que aconteceu (ajustado durante a renderização)
  if (evento && `${evento.id}${evento.status}` !== eventoVisto) {
    setEventoVisto(`${evento.id}${evento.status}`);
    setVez((v) => v + 1);
    setOcupado("");
    const saida = evento.saida ?? {};
    if (evento.status === "erro") aoAviso(evento.erro ?? "O estilo pessoal falhou.", true);
    else if (evento.tipo === "ensinar_estilo")
      aoAviso(`Ensinado com ${saida.ensinadas} foto(s)${saida.sem_edicao ? ` (${saida.sem_edicao} sem edição ou sem XMP ao lado)` : ""}; o estilo tem ${saida.pares} foto(s).`);
    else aoAviso(`Estilo pessoal aplicado em ${saida.aplicadas} foto(s).`);
  }

  useEffect(() => {
    estilosPessoais()
      .then(setEstilos)
      .catch(() => setEstilos([]));
  }, [vez]);

  const idDoEstilo = estilo?.id;
  const paresDoEstilo = estilo?.pares ?? 0;
  const idDaReferencia = referencia?.status === "pronta" ? referencia.midia_id : null;
  useEffect(() => {
    if (!idDoEstilo || !paresDoEstilo || !idDaReferencia) return;
    let ativo = true;
    parecidasDoEstilo(idDoEstilo, idDaReferencia)
      .then((lista) => {
        if (ativo) setParecidas(lista);
      })
      .catch(() => {
        if (ativo) setParecidas([]);
      });
    return () => {
      ativo = false;
    };
  }, [idDoEstilo, paresDoEstilo, idDaReferencia]);

  function escolher(id: string) {
    setEscolhido(id);
    try {
      window.localStorage.setItem(CHAVE, id);
    } catch {
      // Sem armazenamento no navegador: escolhe só nesta visita
    }
  }
  async function fazer(rotulo: string, conta: () => Promise<unknown>, falha: string, esperaOJob = true) {
    setOcupado(rotulo);
    try {
      await conta();
      if (!esperaOJob) setOcupado("");
    } catch (e) {
      setOcupado("");
      aoAviso(e instanceof ErroApi ? e.message : falha, true);
    }
  }

  if (!prontas.length && !estilos?.length) return null;
  const botao = "flex items-center justify-center gap-1.5 rounded-md bg-painel-2 px-2 py-1.5 text-xs hover:bg-painel-3 disabled:opacity-40";
  const mostrarParecidas = Boolean(estilo?.pares && referencia && parecidas.length);
  return (
    <section className="flex flex-col gap-2" aria-label="Estilo pessoal">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-apagado uppercase">
        Estilo pessoal
        {ocupado ? <LoaderCircle className="size-3 animate-spin" aria-label={ocupado} /> : null}
      </h3>
      {criando || estilos?.length === 0 ? (
        <form
          className="flex gap-1.5"
          onSubmit={(evento2) => {
            evento2.preventDefault();
            const nome = String(new FormData(evento2.currentTarget).get("nome") ?? "").trim();
            if (!nome) return;
            void fazer(
              "Criando",
              async () => {
                const novo = await criarEstiloPessoal(nome);
                escolher(novo.id);
                setCriando(false);
                setVez((v) => v + 1);
              },
              "Não foi possível criar o estilo.",
              false,
            );
          }}
        >
          <input name="nome" maxLength={80} placeholder="Nome (o seu jeito de editar)" className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-2 py-1 text-xs" aria-label="Nome do estilo pessoal" />
          <button type="submit" className={botao}>
            Criar
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1.5">
          <select className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs" value={estilo?.id ?? ""} onChange={(evento2) => escolher(evento2.target.value)} aria-label="Estilo pessoal">
            {estilos?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
          <button type="button" className="botao-icone" onClick={() => setCriando(true)} aria-label="Novo estilo pessoal" title="Novo estilo pessoal">
            <Plus className="size-3.5" aria-hidden />
          </button>
          {estilo ? (
            <button
              type="button"
              className="botao-icone"
              aria-label={`Excluir ${estilo.nome}`}
              onClick={() => {
                if (!window.confirm(`Excluir o estilo "${estilo.nome}" e o que ele aprendeu?`)) return;
                void fazer(
                  "Excluindo",
                  async () => {
                    await excluirEstiloPessoal(estilo.id);
                    setVez((v) => v + 1);
                  },
                  "Não foi possível excluir.",
                  false,
                );
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      )}
      {estilo ? (
        <>
          <p className="text-[11px] text-suave">
            {estilo.pares
              ? `${estilo.pares.toLocaleString("pt-BR")} foto(s) ensinadas · ${estilo.modelo === "boosting" ? "modelo treinado" : "pelas fotos mais parecidas"}`
              : "Ainda não aprendeu nada: edite algumas fotos e ensine com elas."}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={botao}
              disabled={Boolean(ocupado) || !editadas.length}
              title="As fotos editadas (as selecionadas) ensinam o seu jeito; corrigiu uma foto? Ensine a correção"
              onClick={() => void fazer("Ensinando", () => ensinarEstilo(estilo.id, albumId, editadas.map((f) => f.midia_id), "takeone"), "Não foi possível ensinar.")}
            >
              <GraduationCap className="size-3.5" aria-hidden />
              Ensinar ({editadas.length})
            </button>
            <button
              type="button"
              className={botao}
              disabled={Boolean(ocupado) || !prontas.length}
              title="O .xmp de outro programa ao lado das fotos importadas do computador"
              onClick={() => void fazer("Lendo os XMP", () => ensinarEstilo(estilo.id, albumId, prontas.map((f) => f.midia_id), "xmp"), "Não foi possível ler os XMP.")}
            >
              Pelos XMP
            </button>
          </div>
          <label className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-1.5 text-xs">
            <span className="text-suave">Intensidade</span>
            <input type="range" min={0} max={1.5} step={0.05} value={intensidade} onChange={(evento2) => setIntensidade(Number(evento2.target.value))} className="accent-[var(--to-destaque)]" aria-label="Intensidade do estilo pessoal" />
            <span className="text-right tabular-nums text-suave">{Math.round(intensidade * 100)}%</span>
          </label>
          <button
            type="button"
            className={botao}
            disabled={Boolean(ocupado) || !estilo.pares || !prontas.length}
            onClick={() => void fazer("Aplicando", () => aplicarEstiloPessoal(estilo.id, albumId, prontas.map((f) => f.midia_id), intensidade), "Não foi possível aplicar.")}
          >
            <UserRoundCheck className="size-3.5" aria-hidden />
            Aplicar em {prontas.length.toLocaleString("pt-BR")} foto(s)
          </button>
          {mostrarParecidas ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-suave">Esta foto parece com estas suas:</span>
              <div className="flex gap-1">
                {parecidas.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
                  <img key={p.midia_id} src={arquivoDaMidia(p.midia_id, "capa.jpg")} alt="" title={`${Math.round(p.semelhanca * 100)}% parecida`} className="size-11 rounded object-cover" />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
