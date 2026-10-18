"use client";

import { ArrowLeft, Clapperboard, Stamp, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { chamarApi, ErroApi } from "@/lib/api";
import { useMarca } from "@/lib/marca";
import type { Midia } from "@/lib/tipos";

type Campo = { id: string; rotulo: string; tipo: "texto" | "linhas" | "cor" | "numero"; padrao: string; maximo: number };
type Tema = { id: string; nome: string };
type Modelo = {
  id: string;
  nome: string;
  descricao: string;
  duracao: number;
  categoria: string;
  nome_da_categoria: string;
  temas: Tema[];
  campos: Campo[];
};

// O quadro de cada proporção, como em core/modelos/animacao_html.py (lado menor 1080)
const QUADROS: Record<string, [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "3:4": [1080, 1440],
  "21:9": [2520, 1080],
};

type Props = {
  proporcao: string;
  /** A animação foi pedida: o editor coloca o clipe no cursor quando ela ficar pronta. */
  aoPedir: (midia: Midia) => void;
};

/** A animação tocando, na mesma página que o worker grava, encolhida para caber no painel. */
function Previa({ endereco, proporcao }: { endereco: string; proporcao: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [w, h] = QUADROS[proporcao] ?? QUADROS["16:9"];
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  const escala = largura / w;
  return (
    <div
      ref={caixa}
      className="relative w-full overflow-hidden rounded-md border border-borda"
      style={{
        aspectRatio: `${w} / ${h}`,
        maxHeight: 320,
        background: "repeating-conic-gradient(#2a2d36 0% 25%, #1c1e25 0% 50%) 50% / 16px 16px",
      }}
    >
      {largura > 0 ? (
        <iframe
          key={endereco}
          src={endereco}
          title="Prévia da animação"
          sandbox="allow-scripts"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          // Com o mesmo esquema de cor da página (normal), o Chrome deixa o iframe transparente
          style={{ width: w, height: h, transform: `scale(${escala})`, colorScheme: "normal" }}
        />
      ) : null}
    </div>
  );
}

/** Experimental: o LLM local escreve a animação a partir de um pedido em texto. */
function DescreverAnimacao({ proporcao, aoPedir }: Props) {
  const [descricao, setDescricao] = useState("");
  const [duracao, setDuracao] = useState(4);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  function pedir(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    chamarApi<Midia>("/animacoes/descrita", { metodo: "POST", corpo: { descricao, proporcao, duracao } })
      .then((midia) => {
        setAviso("O modelo está escrevendo a animação. Ela entra no cursor, por cima, quando ficar pronta.");
        aoPedir(midia);
      })
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível pedir a animação."))
      .finally(() => setEnviando(false));
  }

  return (
    <form onSubmit={pedir} className="flex flex-col gap-2 rounded-lg border border-destaque/40 bg-destaque/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <WandSparkles className="size-4 text-destaque" aria-hidden /> Descreva a animação
        <span className="rounded-full border border-borda px-1.5 text-[10px] font-medium text-suave">experimental</span>
      </p>
      <textarea
        value={descricao}
        onChange={(evento) => setDescricao(evento.target.value)}
        rows={3}
        minLength={5}
        maxLength={400}
        required
        aria-label="Descrição da animação"
        placeholder="Um contador de 0 a 100% com uma barra enchendo embaixo"
        className="resize-y rounded-md border border-borda bg-painel px-2 py-1.5 text-xs outline-none focus:border-destaque"
      />
      <label className="flex flex-col gap-1 text-[11px] text-suave">
        Duração · {duracao.toLocaleString("pt-BR")} s
        <input type="range" min={1.5} max={10} step={0.5} value={duracao} onChange={(evento) => setDuracao(Number(evento.target.value))} />
      </label>
      <p className="text-[11px] text-suave">Um modelo de IA no servidor escreve a animação. Nem sempre acerta: se não gostar, apague e descreva de outro jeito.</p>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {aviso ? (
        <p className="text-[11px] text-suave" role="status">
          {aviso}
        </p>
      ) : null}
      <button type="submit" className="botao-principal px-3 py-1.5" disabled={enviando || descricao.trim().length < 5}>
        <WandSparkles className="size-4" aria-hidden />
        {enviando ? "Pedindo…" : "Criar a animação"}
      </button>
    </form>
  );
}

/** Tarjas, títulos, CTA, contador e citação: modelos prontos que viram um clipe com transparência. */
export function PainelAnimacoes({ proporcao, aoPedir }: Props) {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [erro, setErro] = useState("");
  const [escolhido, setEscolhido] = useState<Modelo | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [duracao, setDuracao] = useState(4);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [endereco, setEndereco] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [tema, setTema] = useState("todos");
  const [busca, setBusca] = useState("");
  const marca = useMarca();

  useEffect(() => {
    chamarApi<Modelo[]>("/animacoes/modelos")
      .then(setModelos)
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as animações."));
  }, []);

  const consulta = useMemo(
    () =>
      escolhido
        ? `/api/animacoes/previa?${new URLSearchParams({ modelo: escolhido.id, proporcao, duracao: String(duracao), campos: JSON.stringify(campos) })}`
        : "",
    [escolhido, proporcao, duracao, campos],
  );
  // A prévia só recarrega quando a pessoa para de digitar
  useEffect(() => {
    const espera = window.setTimeout(() => setEndereco(consulta), 400);
    return () => window.clearTimeout(espera);
  }, [consulta]);

  function escolher(modelo: Modelo) {
    setEscolhido(modelo);
    setCampos(Object.fromEntries(modelo.campos.map((campo) => [campo.id, campo.padrao])));
    setDuracao(modelo.duracao);
    setAviso("");
    setErro("");
  }

  function gravar() {
    if (!escolhido) return;
    setEnviando(true);
    setErro("");
    chamarApi<Midia>("/animacoes", { metodo: "POST", corpo: { modelo: escolhido.id, campos, proporcao, duracao } })
      .then((midia) => {
        setAviso("Gravando a animação. Ela entra no cursor, numa faixa por cima, quando ficar pronta.");
        aoPedir(midia);
      })
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível gravar a animação."))
      .finally(() => setEnviando(false));
  }

  if (!escolhido) {
    const categorias = [...new Map((modelos ?? []).map((m) => [m.categoria, m.nome_da_categoria])).entries()];
    const temas = [...new Map((modelos ?? []).flatMap((m) => m.temas.map((t) => [t.id, t.nome] as const))).entries()].sort((a, b) =>
      a[1].localeCompare(b[1], "pt-BR"),
    );
    const termo = busca.trim().toLowerCase();
    const visiveis = (modelos ?? []).filter(
      (m) =>
        (categoria === "todas" || m.categoria === categoria) &&
        (tema === "todos" || m.temas.some((t) => t.id === tema)) &&
        (!termo || `${m.nome} ${m.descricao} ${m.temas.map((t) => t.nome).join(" ")}`.toLowerCase().includes(termo)),
    );
    return (
      <div className="flex flex-col gap-3">
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        <DescreverAnimacao proporcao={proporcao} aoPedir={aoPedir} />
        <p className="text-xs font-medium text-suave">
          Biblioteca de animações{modelos ? ` · ${modelos.length} modelos` : ""} · com fundo transparente
        </p>
        <div className="flex gap-2">
          <input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Procurar (tarja, casamento, 3D…)"
            aria-label="Procurar animação"
            className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
          />
          <select
            value={tema}
            onChange={(evento) => setTema(evento.target.value)}
            aria-label="Tema"
            className="w-32 rounded-md border border-borda bg-painel-2 px-1.5 py-1.5 text-xs outline-none focus:border-destaque"
          >
            <option value="todos">Todos os temas</option>
            {temas.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Categorias">
          {[["todas", "Todas"], ...categorias].map(([id, nome]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategoria(id)}
              aria-pressed={categoria === id}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                categoria === id ? "border-destaque bg-destaque/15 text-texto" : "border-borda text-suave hover:text-texto"
              }`}
            >
              {nome}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {visiveis.map((modelo) => (
            <button
              key={modelo.id}
              type="button"
              onClick={() => escolher(modelo)}
              title={modelo.descricao}
              className="group overflow-hidden rounded-lg border border-borda bg-painel-2 text-left transition hover:border-destaque"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas fixas, geradas pelo worker */}
              <img src={`/animacoes/${modelo.id}.webp`} alt="" loading="lazy" className="aspect-video w-full object-cover" />
              <span className="block truncate px-2 py-1.5 text-[11px] font-semibold">{modelo.nome}</span>
            </button>
          ))}
        </div>
        {modelos && !visiveis.length ? <p className="text-center text-xs text-suave">Nenhuma animação com esse filtro.</p> : null}
      </div>
    );
  }

  const camposDeCor = escolhido.campos.filter((campo) => campo.tipo === "cor");
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setEscolhido(null)} className="flex items-center gap-1 self-start text-xs text-suave hover:text-texto">
        <ArrowLeft className="size-3.5" aria-hidden /> Todas as animações
      </button>
      <h3 className="text-sm font-semibold">{escolhido.nome}</h3>
      <p className="-mt-2 text-[11px] text-suave">{escolhido.descricao}</p>
      {endereco ? <Previa endereco={endereco} proporcao={proporcao} /> : null}
      {marca.cores.length && camposDeCor.length ? (
        <button
          type="button"
          className="botao-secundario self-start px-2 py-1 text-xs"
          // As cores do kit vão para os campos de cor do modelo, na ordem (repetindo se faltar cor)
          onClick={() => setCampos({ ...campos, ...Object.fromEntries(camposDeCor.map((campo, i) => [campo.id, marca.cores[i % marca.cores.length]])) })}
        >
          <Stamp className="size-3.5" aria-hidden /> Usar as cores da marca
        </button>
      ) : null}
      {escolhido.campos.map((campo) => (
        <label key={campo.id} className="flex flex-col gap-1 text-[11px] text-suave">
          {campo.rotulo}
          {campo.tipo === "cor" ? (
            <>
              <input
                type="color"
                value={campos[campo.id] ?? campo.padrao}
                onChange={(evento) => setCampos({ ...campos, [campo.id]: evento.target.value })}
                className="h-8 w-full cursor-pointer rounded-md border border-borda bg-painel"
              />
              {marca.cores.length ? (
                <span className="flex gap-1">
                  {marca.cores.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setCampos({ ...campos, [campo.id]: cor })}
                      title={cor}
                      aria-label={`${campo.rotulo}: usar ${cor}`}
                      className="size-4 rounded-full border border-borda"
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </span>
              ) : null}
            </>
          ) : campo.tipo === "linhas" ? (
            <textarea
              value={campos[campo.id] ?? ""}
              maxLength={campo.maximo}
              rows={3}
              onChange={(evento) => setCampos({ ...campos, [campo.id]: evento.target.value })}
              className="resize-y rounded-md border border-borda bg-painel px-2 py-1.5 text-xs text-texto outline-none focus:border-destaque"
            />
          ) : (
            <input
              type={campo.tipo === "numero" ? "number" : "text"}
              inputMode={campo.tipo === "numero" ? "numeric" : undefined}
              min={campo.tipo === "numero" ? 0 : undefined}
              max={campo.tipo === "numero" ? 9999999 : undefined}
              maxLength={campo.tipo === "numero" ? undefined : campo.maximo}
              value={campos[campo.id] ?? ""}
              onChange={(evento) => setCampos({ ...campos, [campo.id]: evento.target.value })}
              className="rounded-md border border-borda bg-painel px-2 py-1.5 text-xs text-texto outline-none focus:border-destaque"
            />
          )}
        </label>
      ))}
      <label className="flex flex-col gap-1 text-[11px] text-suave">
        Duração · {duracao.toLocaleString("pt-BR")} s
        <input type="range" min={1.5} max={10} step={0.5} value={duracao} onChange={(evento) => setDuracao(Number(evento.target.value))} />
      </label>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {aviso ? (
        <p className="text-[11px] text-suave" role="status">
          {aviso}
        </p>
      ) : null}
      <button type="button" className="botao-principal px-3 py-1.5" disabled={enviando} onClick={gravar}>
        <Clapperboard className="size-4" aria-hidden />
        {enviando ? "Pedindo…" : "Adicionar ao vídeo"}
      </button>
    </div>
  );
}
