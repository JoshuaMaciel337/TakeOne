"use client";

// A barra da ferramenta Texto do editor de imagem (ADR 0003, onda 13.8): a direção, a fonte (com a amostra de cada uma
// e a prévia ao passar o mouse), o estilo, o tamanho, o alinhamento e a cor. Vale para o que está selecionado no texto
// em edição, para o texto escolhido inteiro ou, sem nenhum, para o próximo texto.
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Check, ChevronDown, Search, Spline, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type FamiliaDoCatalogo, useCatalogoDeFontes } from "@/lib/texto/fontes";
import type { Alinhamento, EstiloDoCaractere, TextoRico } from "@/lib/texto/modelo";

const campo = "h-6 rounded border border-borda bg-fundo px-1.5 text-xs text-texto";
const SEPARADOR = <span className="mx-1 h-4 w-px bg-borda" aria-hidden />;

export const NOMES_DOS_PESOS: Record<number, string> = { 100: "Fina", 200: "Extra leve", 300: "Leve", 400: "Normal", 500: "Média", 600: "Seminegrito", 700: "Negrito", 800: "Extra negrito", 900: "Preta" };
const TAMANHOS = [6, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96, 120, 144, 200, 288];
const CATEGORIAS: Record<string, string> = { "sem-serifa": "Sem serifa", serifa: "Com serifa", decorativa: "Decorativas", manuscrita: "Manuscritas", monoespacada: "Monoespaçadas" };

/** Os estilos (peso e itálico) que uma família oferece: a variável vai de 100 a 900 nos pesos que o eixo cobre. */
export function estilosDaFamilia(familia: FamiliaDoCatalogo | undefined): { peso: number; italico: boolean }[] {
  if (!familia) return [{ peso: 400, italico: false }];
  const saida = new Map<string, { peso: number; italico: boolean }>();
  for (const estilo of familia.estilos) {
    const pesos = estilo.eixos.includes("wght") ? [100, 200, 300, 400, 500, 600, 700, 800, 900] : [estilo.peso];
    for (const peso of pesos) saida.set(`${peso}${estilo.italico ? "i" : ""}`, { peso, italico: estilo.italico });
  }
  return [...saida.values()].sort((a, b) => a.peso - b.peso || Number(a.italico) - Number(b.italico));
}

export const nomeDoEstilo = (estilo: { peso: number; italico: boolean }) => `${NOMES_DOS_PESOS[estilo.peso] ?? estilo.peso}${estilo.italico ? " itálico" : ""}`;

// As amostras do seletor: cada família carrega como FontFace do navegador quando a linha aparece
const amostras = new Map<string, Promise<void>>();
function carregarAmostra(familia: FamiliaDoCatalogo): Promise<void> {
  let pedido = amostras.get(familia.id);
  if (!pedido) {
    const estilo = familia.estilos.find((item) => !item.italico) ?? familia.estilos[0];
    const face = new FontFace(`amostra-${familia.id}`, `url(/api/fontes/arquivo/${encodeURIComponent(estilo.arquivo)})`);
    pedido = face.load().then(
      (carregada) => void document.fonts.add(carregada),
      () => undefined,
    );
    amostras.set(familia.id, pedido);
  }
  return pedido;
}

function LinhaDaFonte({ familia, escolhida, aoEscolher, aoPrever }: { familia: FamiliaDoCatalogo; escolhida: boolean; aoEscolher: () => void; aoPrever: (ligado: boolean) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pronta, setPronta] = useState(amostras.has(familia.id));
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const observador = new IntersectionObserver((entradas) => {
      if (!entradas.some((entrada) => entrada.isIntersecting)) return;
      observador.disconnect();
      void carregarAmostra(familia).then(() => setPronta(true));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [familia]);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={escolhida}
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-superficie-2 ${escolhida ? "bg-superficie-2" : ""}`}
      onClick={aoEscolher}
      onMouseEnter={() => aoPrever(true)}
      onMouseLeave={() => aoPrever(false)}
    >
      <span className="w-36 shrink-0 truncate text-xs text-texto">{familia.nome}</span>
      <span className="truncate text-base text-texto" style={{ fontFamily: pronta ? `"amostra-${familia.id}"` : undefined, opacity: pronta ? 1 : 0.3 }} aria-hidden>
        Texto de exemplo
      </span>
    </button>
  );
}

/** O seletor de fontes: busca, categoria e a amostra; passar o mouse mostra a fonte no texto (aoPrever). */
export function SeletorDeFonte({ valor, aoEscolher, aoPrever }: { valor: string | undefined; aoEscolher: (familia: string) => void; aoPrever: (familia: string | null) => void }) {
  const catalogo = useCatalogoDeFontes();
  const [aberto, setAberto] = useState<{ x: number; y: number } | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const atual = catalogo.find((familia) => familia.id === valor);
  const lista = useMemo(() => {
    const termo = busca.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    return catalogo.filter((familia) => (!categoria || familia.categoria === categoria) && (!termo || familia.nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes(termo)));
  }, [catalogo, busca, categoria]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node) && !listaRef.current?.contains(evento.target as Node)) {
        setAberto(null);
        aoPrever(null);
      }
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      setAberto(null);
      aoPrever(null);
    };
    window.addEventListener("pointerdown", fora, true);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("pointerdown", fora, true);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [aberto, aoPrever]);
  return (
    <div ref={raiz} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={Boolean(aberto)}
        aria-label="Fonte"
        className={`${campo} flex w-40 items-center justify-between gap-1`}
        onClick={(evento) => {
          // A lista sai da barra (que corta o que passa dela), presa embaixo do botão
          const caixa = evento.currentTarget.getBoundingClientRect();
          setAberto((estado) => (estado ? null : { x: Math.max(8, Math.min(caixa.left, window.innerWidth - 392)), y: caixa.bottom + 4 }));
        }}
      >
        <span className="truncate">{atual?.nome ?? (valor ? valor : "Várias")}</span>
        <ChevronDown className="size-3 shrink-0" aria-hidden />
      </button>
      {aberto ? createPortal(
        <div ref={listaRef} className="fixed z-[100] flex w-96 flex-col gap-1 rounded-lg border border-borda bg-superficie p-2 shadow-xl" style={{ left: aberto.x, top: aberto.y }}>
          <div className="flex items-center gap-1">
            <label className="flex flex-1 items-center gap-1 rounded border border-borda bg-fundo px-1.5">
              <Search className="size-3 text-suave" aria-hidden />
              <input autoFocus aria-label="Procurar fonte" placeholder="Procurar" value={busca} onChange={(evento) => setBusca(evento.currentTarget.value)} className="h-6 flex-1 bg-transparent text-xs text-texto outline-none" />
            </label>
            <select aria-label="Categoria" className={campo} value={categoria} onChange={(evento) => setCategoria(evento.currentTarget.value)}>
              <option value="">Todas</option>
              {Object.entries(CATEGORIAS).map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div role="listbox" aria-label="Fontes" className="max-h-80 overflow-y-auto" onMouseLeave={() => aoPrever(null)}>
            {lista.map((familia) => (
              <LinhaDaFonte
                key={familia.id}
                familia={familia}
                escolhida={familia.id === valor}
                aoPrever={(ligado) => aoPrever(ligado ? familia.id : null)}
                aoEscolher={() => {
                  aoPrever(null);
                  aoEscolher(familia.id);
                  setAberto(null);
                }}
              />
            ))}
            {!lista.length ? <p className="p-2 text-xs text-suave">{catalogo.length ? "Nenhuma fonte com esse nome." : "Carregando as fontes…"}</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

/** Um número digitado (com vírgula ou ponto), confirmado no Enter ou ao sair. */
export function CampoNumerico({ valor, aoMudar, rotulo, unidade, largura = "w-14", min, max, lista }: { valor: number | undefined; aoMudar: (valor: number) => void; rotulo: string; unidade?: string; largura?: string; min?: number; max?: number; lista?: number[] }) {
  const id = useId();
  return (
    <span className="flex items-center gap-0.5">
      <input
        key={valor ?? "vazio"}
        aria-label={rotulo}
        title={rotulo}
        defaultValue={valor === undefined ? "" : String(Math.round(valor * 100) / 100).replace(".", ",")}
        inputMode="decimal"
        list={lista ? id : undefined}
        onBlur={(evento) => {
          const numero = Number(evento.currentTarget.value.replace(",", "."));
          if (evento.currentTarget.value.trim() === "" || !Number.isFinite(numero)) return;
          aoMudar(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, numero)));
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") evento.currentTarget.blur();
          evento.stopPropagation();
        }}
        className={`${campo} ${largura} text-right`}
      />
      {lista ? (
        <datalist id={id}>
          {lista.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      ) : null}
      {unidade ? <span className="text-suave">{unidade}</span> : null}
    </span>
  );
}

type Props = {
  /** O estilo comum do que a barra muda (o que varia fica de fora e aparece em branco). */
  estilo: Partial<EstiloDoCaractere>;
  alinhamento: Alinhamento | undefined;
  orientacao: TextoRico["orientacao"];
  aoEstilo: (mudanca: Partial<EstiloDoCaractere>) => void;
  /** A fonte sob o mouse no seletor (null volta). */
  aoPreverFonte: (familia: string | null) => void;
  aoAlinhamento: (alinhamento: Alinhamento) => void;
  aoOrientacao: (orientacao: TextoRico["orientacao"]) => void;
  /** Editando um texto: confirmar e cancelar. */
  edicao: { aoConfirmar: () => void; aoCancelar: () => void } | null;
  /** Os painéis Caractere e Parágrafo. */
  aoPaineis?: () => void;
  /** Texto › Deformar texto (só com um texto escolhido ou em edição). */
  aoDeformar?: (() => void) | null;
  /** O texto num caminho: onde ele começa (fração do comprimento) e o lado. */
  caminho?: { inicio: number; aoInicio: (inicio: number) => void; aoInverter: () => void } | null;
};

export function OpcoesDoTextoNaBarra({ estilo, alinhamento, orientacao, aoEstilo, aoPreverFonte, aoAlinhamento, aoOrientacao, edicao, aoPaineis, aoDeformar, caminho }: Props) {
  const catalogo = useCatalogoDeFontes();
  const familia = catalogo.find((item) => item.id === estilo.familia);
  const estilos = estilosDaFamilia(familia);
  const valorDoEstilo = estilo.peso !== undefined && estilo.italico !== undefined ? `${estilo.peso}${estilo.italico ? "i" : ""}` : "";
  const vertical = orientacao === "vertical";
  const alinhamentos = [
    ["esquerda", vertical ? AlignVerticalJustifyStart : AlignLeft, vertical ? "Alinhar o texto em cima" : "Alinhar o texto à esquerda"],
    ["centro", vertical ? AlignVerticalJustifyCenter : AlignCenter, "Centralizar o texto"],
    ["direita", vertical ? AlignVerticalJustifyEnd : AlignRight, vertical ? "Alinhar o texto embaixo" : "Alinhar o texto à direita"],
  ] as const;
  return (
    <>
      <button type="button" className="botao-icone h-6 w-auto px-1.5 text-xs" title="Alternar a orientação do texto (horizontal ou vertical)" aria-label="Alternar a orientação do texto" onClick={() => aoOrientacao(vertical ? "horizontal" : "vertical")}>
        {vertical ? "↓T" : "T→"}
      </button>
      {SEPARADOR}
      <SeletorDeFonte
        valor={estilo.familia}
        aoPrever={aoPreverFonte}
        aoEscolher={(id) => {
          const nova = catalogo.find((item) => item.id === id);
          const disponiveis = estilosDaFamilia(nova);
          // O peso e o itálico ficam se a família nova tiver; senão, o mais perto
          const peso = estilo.peso ?? 400;
          const italico = estilo.italico ?? false;
          const igual = disponiveis.find((item) => item.peso === peso && item.italico === italico);
          const perto = igual ?? [...disponiveis].sort((a, b) => Math.abs(a.peso - peso) + Number(a.italico !== italico) * 1000 - (Math.abs(b.peso - peso) + Number(b.italico !== italico) * 1000))[0];
          aoEstilo({ familia: id, peso: perto?.peso ?? 400, italico: perto?.italico ?? false });
        }}
      />
      <select
        aria-label="Estilo da fonte"
        className={campo}
        value={valorDoEstilo}
        onChange={(evento) => {
          const escolhido = estilos.find((item) => `${item.peso}${item.italico ? "i" : ""}` === evento.currentTarget.value);
          if (escolhido) aoEstilo({ peso: escolhido.peso, italico: escolhido.italico });
        }}
      >
        {valorDoEstilo ? null : <option value="">Vários</option>}
        {estilos.map((item) => (
          <option key={`${item.peso}${item.italico ? "i" : ""}`} value={`${item.peso}${item.italico ? "i" : ""}`}>
            {nomeDoEstilo(item)}
          </option>
        ))}
      </select>
      <CampoNumerico rotulo="Tamanho da fonte, em pixels" valor={estilo.tamanho} unidade="px" min={1} max={5000} lista={TAMANHOS} aoMudar={(tamanho) => aoEstilo({ tamanho })} />
      {SEPARADOR}
      {alinhamentos.map(([valor, Icone, titulo]) => (
        <button key={valor} type="button" aria-pressed={alinhamento === valor} className={`botao-icone size-6 ${alinhamento === valor ? "bg-superficie-2 text-destaque" : ""}`} title={titulo} aria-label={titulo} onClick={() => aoAlinhamento(valor)}>
          <Icone className="size-3.5" aria-hidden />
        </button>
      ))}
      {SEPARADOR}
      <label className="flex items-center gap-1 text-suave" title="A cor do texto">
        Cor:
        <input type="color" aria-label="Cor do texto" value={estilo.cor ?? "#000000"} onChange={(evento) => aoEstilo({ cor: evento.currentTarget.value })} className="h-6 w-8 cursor-pointer rounded border border-borda bg-fundo p-0" />
      </label>
      {caminho ? (
        <>
          <label className="flex items-center gap-1 text-suave" title="Onde o texto começa no caminho">
            Início:
            <CampoNumerico rotulo="Início do texto no caminho, em % do comprimento" valor={caminho.inicio * 100} unidade="%" min={0} max={100} aoMudar={(valor) => caminho.aoInicio(valor / 100)} />
          </label>
          <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" title="Passar o texto para o outro lado do caminho" onClick={caminho.aoInverter}>
            Inverter
          </button>
          {SEPARADOR}
        </>
      ) : null}
      {aoDeformar ? (
        <button type="button" className="botao-icone h-6 w-auto px-1.5" title="Deformar texto" aria-label="Deformar texto" onClick={aoDeformar}>
          <Spline className="size-4" aria-hidden />
        </button>
      ) : null}
      {aoPaineis ? (
        <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" title="Os painéis Caractere e Parágrafo" onClick={aoPaineis}>
          Caractere e parágrafo
        </button>
      ) : null}
      {edicao ? (
        <>
          {SEPARADOR}
          <button type="button" className="botao-icone size-6" title="Cancelar a edição (Esc)" aria-label="Cancelar a edição" onClick={edicao.aoCancelar}>
            <X className="size-4" aria-hidden />
          </button>
          <button type="button" className="botao-icone size-6 text-destaque" title="Confirmar a edição (Ctrl+Enter)" aria-label="Confirmar a edição" onClick={edicao.aoConfirmar}>
            <Check className="size-4" aria-hidden />
          </button>
        </>
      ) : null}
    </>
  );
}
