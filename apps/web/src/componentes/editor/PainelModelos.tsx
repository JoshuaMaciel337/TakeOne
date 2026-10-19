"use client";

import { ArrowLeft, Film, ImageIcon, LayoutTemplate, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { criarForma } from "@/lib/elementos";
import { useMarca } from "@/lib/marca";
import type { Comando } from "@/lib/projeto/comandos";
import type { Proporcao } from "@/lib/projeto/modelo";
import { formasDoModelo, MODELOS_DE_PROJETO, type ModeloDeProjeto, planoDoModelo, resolverCor } from "@/lib/projeto/modelos";
import type { Midia } from "@/lib/tipos";

type Props = {
  midias: Midia[];
  proporcao: Proporcao;
  aoExecutar: (comando: Comando) => void;
  /** O comando roda quando as mídias dadas (as formas do modelo) aparecem prontas na biblioteca. */
  aoExecutarQuandoProntas: (midiaIds: string[], comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/** A faixa de cenas do modelo, em blocos do tamanho de cada uma: o desenho do card. */
function Roteiro({ modelo, cores }: { modelo: ModeloDeProjeto; cores: string[] }) {
  const total = modelo.cenas.reduce((soma, cena) => soma + cena.duracaoS, 0);
  const destaque = resolverCor("@1", cores, modelo.paleta);
  return (
    <span className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {modelo.cenas.map((cena, i) => (
        <span key={cena.id} className="h-full" style={{ width: `${(cena.duracaoS / total) * 100}%`, backgroundColor: destaque, opacity: 0.45 + (0.55 * (i + 1)) / modelo.cenas.length }} />
      ))}
    </span>
  );
}

/** Modelos de projeto: escolher um, pôr a mídia de cada cena e os textos, e ele entra no fim da principal. */
export function PainelModelos({ midias, proporcao, aoExecutar, aoExecutarQuandoProntas, aoAvisar }: Props) {
  const marca = useMarca();
  const [escolhido, setEscolhido] = useState<ModeloDeProjeto | null>(null);
  const [cenas, setCenas] = useState<Record<string, string>>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState(false);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  // As mídias da biblioteca (sem as formas desenhadas), prontas e com imagem
  const visuais = midias.filter((midia) => midia.status === "pronta" && midia.video && !midia.elemento && !midia.animacao);

  function escolher(modelo: ModeloDeProjeto) {
    setEscolhido(modelo);
    setCenas({});
    setTextos({});
  }

  async function aplicar(modelo: ModeloDeProjeto) {
    setAplicando(true);
    try {
      // As formas do modelo, nas cores da marca, viram imagens antes do comando
      const formas = await Promise.all(formasDoModelo(modelo, marca.cores).map(criarForma));
      const tamanhos = Object.fromEntries(visuais.map((midia) => [midia.id, { largura: midia.video!.largura, altura: midia.video!.altura, imagem: Boolean(midia.imagem) }]));
      const [largura, altura] = proporcao.split(":").map(Number);
      const plano = planoDoModelo(modelo, cenas, textos, formas.map((forma) => forma.id), tamanhos, { largura, altura }, marca.cores);
      aoExecutarQuandoProntas(formas.map((forma) => forma.id), { comando: "modelo.aplicar", parametros: { plano } });
      if (ativo.current) setEscolhido(null);
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "Não foi possível usar o modelo agora.");
    } finally {
      if (ativo.current) setAplicando(false);
    }
  }

  if (!escolhido) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-suave">Projetos prontos: escolha um, troque as mídias e os textos, e ele entra no fim da linha do tempo.</p>
        {MODELOS_DE_PROJETO.map((modelo) => {
          const duracao = modelo.cenas.reduce((soma, cena) => soma + cena.duracaoS, 0);
          return (
            <button key={modelo.id} type="button" onClick={() => escolher(modelo)} className="flex flex-col gap-1.5 rounded-lg border border-borda bg-painel-2 p-3 text-left hover:border-destaque">
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{modelo.nome}</span>
                <span className="rounded bg-painel-3 px-1.5 py-0.5 text-[10px] tabular-nums text-suave">
                  {modelo.proporcao} · {modelo.cenas.length} cenas · {duracao.toLocaleString("pt-BR")} s
                </span>
              </span>
              <span className="text-[11px] text-suave">{modelo.descricao}</span>
              <Roteiro modelo={modelo} cores={marca.cores} />
            </button>
          );
        })}
      </div>
    );
  }

  const faltam = escolhido.cenas.filter((cena) => !cenas[cena.id]).length;
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setEscolhido(null)} className="flex items-center gap-1 self-start text-xs text-suave hover:text-texto">
        <ArrowLeft className="size-3.5" aria-hidden /> Todos os modelos
      </button>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <LayoutTemplate className="size-4 text-destaque" aria-hidden /> {escolhido.nome}
      </h3>
      {escolhido.proporcao !== proporcao ? (
        <p className="rounded-md border border-aviso/40 bg-aviso/10 p-2 text-[11px]">
          O modelo é {escolhido.proporcao} e o projeto é {proporcao}: as posições valem, mas o enquadramento muda.{" "}
          <button type="button" className="font-semibold underline" onClick={() => aoExecutar({ comando: "projeto.proporcao", parametros: { proporcao: escolhido.proporcao } })}>
            Usar {escolhido.proporcao} no projeto
          </button>
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-suave">Cenas</h4>
        {visuais.length === 0 ? <p className="text-[11px] text-suave">Envie vídeos ou imagens para a biblioteca para preencher as cenas.</p> : null}
        {escolhido.cenas.map((cena) => {
          const opcoes = visuais.filter((midia) => (cena.aceita === "qualquer" ? true : cena.aceita === "imagem" ? midia.imagem : !midia.imagem));
          return (
            <fieldset key={cena.id} className="flex flex-col gap-1">
              <legend className="mb-1 flex w-full items-center justify-between text-[11px]">
                <span>{cena.rotulo}</span>
                <span className="flex items-center gap-1 text-suave">
                  {cena.aceita === "video" ? <Film className="size-3" aria-hidden /> : cena.aceita === "imagem" ? <ImageIcon className="size-3" aria-hidden /> : null}
                  {cena.duracaoS.toLocaleString("pt-BR")} s
                </span>
              </legend>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {opcoes.map((midia) => (
                  <button
                    key={midia.id}
                    type="button"
                    onClick={() => setCenas({ ...cenas, [cena.id]: midia.id })}
                    aria-pressed={cenas[cena.id] === midia.id}
                    aria-label={`${cena.rotulo}: ${midia.nome}`}
                    title={midia.nome}
                    className={`size-12 shrink-0 overflow-hidden rounded-md border ${cenas[cena.id] === midia.id ? "border-destaque ring-1 ring-destaque" : "border-borda"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie */}
                    <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt="" className="size-full object-cover" draggable={false} />
                  </button>
                ))}
                {opcoes.length === 0 && visuais.length ? <span className="text-[11px] text-suave">Nenhuma mídia desse tipo na biblioteca.</span> : null}
              </div>
            </fieldset>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-suave">Textos</h4>
        {escolhido.textos.map((texto) => (
          <label key={texto.campo} className="flex flex-col gap-1 text-[11px] text-suave">
            {texto.rotulo}
            <input
              type="text"
              value={textos[texto.campo] ?? ""}
              placeholder={texto.padrao}
              maxLength={120}
              onChange={(evento) => setTextos({ ...textos, [texto.campo]: evento.target.value })}
              className="rounded-md border border-borda bg-painel px-2 py-1.5 text-xs text-texto outline-none focus:border-destaque"
            />
          </label>
        ))}
      </section>

      <button type="button" className="botao-principal px-3 py-1.5" disabled={faltam > 0 || aplicando} onClick={() => void aplicar(escolhido)}>
        {aplicando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LayoutTemplate className="size-4" aria-hidden />}
        {aplicando ? "Preparando…" : faltam > 0 ? `Escolha a mídia de ${faltam} ${faltam === 1 ? "cena" : "cenas"}` : "Usar o modelo"}
      </button>
    </div>
  );
}
