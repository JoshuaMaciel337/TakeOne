"use client";

import { ArrowLeft, Clapperboard } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { chamarApi, ErroApi } from "@/lib/api";
import type { Midia } from "@/lib/tipos";

type Campo = { id: string; rotulo: string; tipo: "texto" | "linhas" | "cor" | "numero"; padrao: string; maximo: number };
type Modelo = { id: string; nome: string; descricao: string; duracao: number; campos: Campo[] };

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
    return (
      <div className="flex flex-col gap-3">
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        <p className="text-xs font-medium text-suave">Animações · tarjas, títulos e chamadas com transparência</p>
        <div className="grid grid-cols-1 gap-2">
          {(modelos ?? []).map((modelo) => (
            <button
              key={modelo.id}
              type="button"
              onClick={() => escolher(modelo)}
              className="flex items-start gap-3 rounded-lg border border-borda bg-painel-2 p-3 text-left transition hover:border-destaque"
            >
              <Clapperboard className="mt-0.5 size-4 shrink-0 text-destaque" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">{modelo.nome}</span>
                <span className="block text-xs text-suave">{modelo.descricao}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-suave">Figuras, adesivos e formas chegam na fase 6.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setEscolhido(null)} className="flex items-center gap-1 self-start text-xs text-suave hover:text-texto">
        <ArrowLeft className="size-3.5" aria-hidden /> Todas as animações
      </button>
      <h3 className="text-sm font-semibold">{escolhido.nome}</h3>
      {endereco ? <Previa endereco={endereco} proporcao={proporcao} /> : null}
      {escolhido.campos.map((campo) => (
        <label key={campo.id} className="flex flex-col gap-1 text-[11px] text-suave">
          {campo.rotulo}
          {campo.tipo === "cor" ? (
            <input
              type="color"
              value={campos[campo.id] ?? campo.padrao}
              onChange={(evento) => setCampos({ ...campos, [campo.id]: evento.target.value })}
              className="h-8 w-full cursor-pointer rounded-md border border-borda bg-painel"
            />
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
