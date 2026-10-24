"use client";

// Os editores de Níveis e de Curvas do painel Propriedades (ADR 0003, onda 13.10), com o histograma do que está
// embaixo. Níveis: o canal, os triângulos de preto, gama e branco da entrada e os de saída, os números e os três
// conta-gotas (preto, cinza e branco). Curvas: o canal, os pontos (clique cria, arrasto move, arrastar para fora ou
// duplo clique apaga) ou o lápis, a entrada e a saída do ponto escolhido e o suavizar do lápis.
import { Pencil, Pipette, Spline } from "lucide-react";
import { useRef, useState } from "react";

import { type AjusteDaImagem, type CanalDoAjuste, type CurvaDoAjuste, NIVEIS_NEUTROS, type NiveisDoCanal, type Rgb, valorDaCurvaDoAjuste } from "@/lib/imagem/ajustes";
import type { Histogramas } from "@/lib/imagem/histograma";
import type { PontoDaCurva } from "@/lib/projeto/cor";

import { CORES_DOS_CANAIS, GraficoDoHistograma } from "./GraficoDoHistograma";

type Niveis = Extract<AjusteDaImagem, { tipo: "niveis" }>;
type Curvas = Extract<AjusteDaImagem, { tipo: "curvas" }>;
export type Mudancas<T> = { prever: (novo: T) => void; confirmar: (novo: T) => void };

const CANAIS: { id: CanalDoAjuste; nome: string }[] = [
  { id: "rgb", nome: "RGB" },
  { id: "r", nome: "Vermelho" },
  { id: "g", nome: "Verde" },
  { id: "b", nome: "Azul" },
];
const campo = "w-12 rounded border border-borda bg-painel-2 px-1 py-0.5 text-right tabular-nums text-texto";
const limitar = (v: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, v));
const contagemDoCanal = (h: Histogramas | null, canal: CanalDoAjuste) => (h ? { contagem: canal === "rgb" ? h.luma : h[canal], cor: CORES_DOS_CANAIS[canal === "rgb" ? "luma" : canal] } : null);

function SeletorDeCanal({ canal, aoMudar }: { canal: CanalDoAjuste; aoMudar: (canal: CanalDoAjuste) => void }) {
  return (
    <label className="flex items-center gap-2 text-suave">
      Canal:
      <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" value={canal} onChange={(evento) => aoMudar(evento.currentTarget.value as CanalDoAjuste)} aria-label="Canal">
        {CANAIS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Um número de 0 a 255 (ou outro intervalo) que confirma ao sair ou no Enter. */
function Numero({ rotulo, valor, minimo, maximo, casas = 0, aoMudar }: { rotulo: string; valor: number; minimo: number; maximo: number; casas?: number; aoMudar: (valor: number) => void }) {
  return (
    <input
      key={valor}
      aria-label={rotulo}
      title={rotulo}
      className={campo}
      defaultValue={Number(valor.toFixed(casas))}
      inputMode="decimal"
      onBlur={(evento) => {
        const numero = Number(evento.currentTarget.value.replace(",", "."));
        if (Number.isFinite(numero) && Number(numero.toFixed(casas)) !== Number(valor.toFixed(casas))) aoMudar(limitar(numero, minimo, maximo));
        else evento.currentTarget.value = String(Number(valor.toFixed(casas)));
      }}
      onKeyDown={(evento) => {
        if (evento.key !== "Enter") return;
        evento.preventDefault();
        evento.currentTarget.blur();
      }}
    />
  );
}

/** Uma barra com triângulos arrastáveis (as posições de 0 a 1); cada arrasto prevê, e soltar confirma. */
function BarraDeTriangulos({
  rotulo,
  posicoes,
  cores,
  fundo,
  aoArrastar,
  aoSoltar,
}: {
  rotulo: string;
  posicoes: number[];
  cores: string[];
  fundo: string;
  aoArrastar: (indice: number, posicao: number) => void;
  aoSoltar: () => void;
}) {
  const barraRef = useRef<HTMLDivElement>(null);
  const arrasto = useRef<number | null>(null);
  const posicao = (evento: React.PointerEvent) => {
    const caixa = barraRef.current!.getBoundingClientRect();
    return limitar((evento.clientX - caixa.left) / caixa.width, 0, 1);
  };
  return (
    <div
      ref={barraRef}
      role="group"
      aria-label={rotulo}
      className="relative h-4 touch-none select-none"
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        const p = posicao(evento);
        // O triângulo mais perto do clique
        let indice = 0;
        posicoes.forEach((v, i) => {
          if (Math.abs(v - p) < Math.abs(posicoes[indice] - p)) indice = i;
        });
        arrasto.current = indice;
        evento.currentTarget.setPointerCapture(evento.pointerId);
        aoArrastar(indice, p);
      }}
      onPointerMove={(evento) => arrasto.current !== null && aoArrastar(arrasto.current, posicao(evento))}
      onPointerUp={() => {
        if (arrasto.current === null) return;
        arrasto.current = null;
        aoSoltar();
      }}
    >
      <div className="absolute inset-x-0 top-0 h-1.5 rounded-sm" style={{ background: fundo }} />
      {posicoes.map((v, i) => (
        <span
          key={i}
          className="absolute top-1.5 -ml-[5px] block h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent"
          style={{ left: `${v * 100}%`, borderBottomColor: cores[i], filter: "drop-shadow(0 0 1px rgba(0,0,0,0.9))" }}
          aria-hidden
        />
      ))}
    </div>
  );
}

/** O gama que leva o triângulo do meio para a posição `x` entre o preto e o branco (x = 0,5 elevado ao gama). */
const gamaDaPosicao = (x: number) => limitar(Math.log(limitar(x, 0.001, 0.999)) / Math.log(0.5), 0.1, 9.99);
const posicaoDoGama = (n: NiveisDoCanal) => (n.preto + (n.branco - n.preto) * 0.5 ** n.gama) / 255;

export type ContaGotas = "preto" | "cinza" | "branco";

/** Os níveis que o conta-gotas pede para a cor amostrada (cada canal no seu próprio ponto). */
export function niveisDoContaGotas(ajuste: Niveis, qual: ContaGotas, cor: Rgb): Niveis {
  const canais = { ...ajuste.canais };
  const valores = cor.map((v) => Math.round(v * 255));
  const alvo = (valores[0] + valores[1] + valores[2]) / 3;
  (["r", "g", "b"] as const).forEach((canal, k) => {
    const n = { ...NIVEIS_NEUTROS, ...canais[canal] };
    if (qual === "preto") n.preto = Math.min(valores[k], n.branco - 2);
    else if (qual === "branco") n.branco = Math.max(valores[k], n.preto + 2);
    else {
      // O cinza: a gama de cada canal leva o valor dele à média dos três
      const x = limitar((valores[k] - n.preto) / (n.branco - n.preto), 0.01, 0.99);
      const y = limitar((alvo - n.preto) / (n.branco - n.preto), 0.01, 0.99);
      n.gama = limitar(Math.log(x) / Math.log(y), 0.1, 9.99);
    }
    canais[canal] = n;
  });
  return { ...ajuste, canais };
}

export function EditorDeNiveis({
  ajuste,
  histogramas,
  amostrando,
  aoAmostrar,
  mudancas,
}: {
  ajuste: Niveis;
  histogramas: Histogramas | null;
  amostrando: ContaGotas | null;
  aoAmostrar: (qual: ContaGotas | null) => void;
  mudancas: Mudancas<Niveis>;
}) {
  const [canal, setCanal] = useState<CanalDoAjuste>("rgb");
  const n = { ...NIVEIS_NEUTROS, ...ajuste.canais[canal] };
  const ultimo = useRef<Niveis | null>(null);
  const com = (mudanca: Partial<NiveisDoCanal>): Niveis => ({ ...ajuste, canais: { ...ajuste.canais, [canal]: { ...n, ...mudanca } } });
  const prever = (novo: Niveis) => {
    ultimo.current = novo;
    mudancas.prever(novo);
  };
  const soltar = () => {
    if (ultimo.current) mudancas.confirmar(ultimo.current);
    ultimo.current = null;
  };
  const contagem = contagemDoCanal(histogramas, canal);
  const corDoCanal = canal === "rgb" ? "#ffffff" : CORES_DOS_CANAIS[canal];
  return (
    <div className="flex flex-col gap-2">
      <SeletorDeCanal canal={canal} aoMudar={setCanal} />
      <div className="rounded border border-borda bg-black/40">{contagem ? <GraficoDoHistograma contagens={[contagem]} altura={90} /> : <div className="grid h-[90px] place-items-center text-suave">Lendo a imagem…</div>}</div>
      <BarraDeTriangulos
        rotulo="Níveis de entrada"
        posicoes={[n.preto / 255, posicaoDoGama(n), n.branco / 255]}
        cores={["#000000", "#808080", "#ffffff"]}
        fundo={`linear-gradient(to right, #000, ${corDoCanal})`}
        aoArrastar={(indice, p) => {
          const v = Math.round(p * 255);
          if (indice === 0) prever(com({ preto: Math.min(v, n.branco - 2) }));
          else if (indice === 2) prever(com({ branco: Math.max(v, n.preto + 2) }));
          else prever(com({ gama: gamaDaPosicao((v - n.preto) / (n.branco - n.preto)) }));
        }}
        aoSoltar={soltar}
      />
      <div className="flex items-center justify-between">
        <Numero rotulo="Preto da entrada" valor={n.preto} minimo={0} maximo={n.branco - 2} aoMudar={(preto) => mudancas.confirmar(com({ preto }))} />
        <Numero rotulo="Gama" valor={n.gama} minimo={0.1} maximo={9.99} casas={2} aoMudar={(gama) => mudancas.confirmar(com({ gama }))} />
        <Numero rotulo="Branco da entrada" valor={n.branco} minimo={n.preto + 2} maximo={255} aoMudar={(branco) => mudancas.confirmar(com({ branco }))} />
      </div>
      <span className="text-suave">Níveis de saída</span>
      <BarraDeTriangulos
        rotulo="Níveis de saída"
        posicoes={[n.saida_preto / 255, n.saida_branco / 255]}
        cores={["#000000", "#ffffff"]}
        fundo={`linear-gradient(to right, #000, ${corDoCanal})`}
        aoArrastar={(indice, p) => prever(com(indice === 0 ? { saida_preto: Math.round(p * 255) } : { saida_branco: Math.round(p * 255) }))}
        aoSoltar={soltar}
      />
      <div className="flex items-center justify-between">
        <Numero rotulo="Preto da saída" valor={n.saida_preto} minimo={0} maximo={255} aoMudar={(saida_preto) => mudancas.confirmar(com({ saida_preto }))} />
        <Numero rotulo="Branco da saída" valor={n.saida_branco} minimo={0} maximo={255} aoMudar={(saida_branco) => mudancas.confirmar(com({ saida_branco }))} />
      </div>
      <BotoesDeContaGotas amostrando={amostrando} aoAmostrar={aoAmostrar} />
    </div>
  );
}

export function BotoesDeContaGotas({ amostrando, aoAmostrar }: { amostrando: ContaGotas | null; aoAmostrar: (qual: ContaGotas | null) => void }) {
  const itens: { id: ContaGotas; nome: string; cor: string }[] = [
    { id: "preto", nome: "Amostra na imagem para definir o ponto preto", cor: "#000000" },
    { id: "cinza", nome: "Amostra na imagem para definir o ponto cinza", cor: "#808080" },
    { id: "branco", nome: "Amostra na imagem para definir o ponto branco", cor: "#ffffff" },
  ];
  return (
    <div className="flex items-center gap-1">
      {itens.map((item) => (
        <button key={item.id} type="button" className={`botao-icone size-7 ${amostrando === item.id ? "bg-painel-3 ring-1 ring-destaque" : ""}`} title={item.nome} aria-label={item.nome} aria-pressed={amostrando === item.id} onClick={() => aoAmostrar(amostrando === item.id ? null : item.id)}>
          <Pipette className="size-4" style={{ color: item.cor, filter: "drop-shadow(0 0 1px rgba(128,128,128,0.9))" }} aria-hidden />
        </button>
      ))}
      {amostrando ? <span className="text-suave">Clique na imagem.</span> : null}
    </div>
  );
}

// ——— Curvas ———
const LADO = 256;
const VAO = 2 / 255;
const RAIO = 7;

/** O lápis suavizado: a média de 9 vizinhos, com as pontas no lugar. */
function suavizarLapis(lapis: number[]): number[] {
  return lapis.map((_, i) => {
    let soma = 0;
    let n = 0;
    for (let k = -4; k <= 4; k++) {
      const j = i + k;
      if (j < 0 || j > 255) continue;
      soma += lapis[j];
      n++;
    }
    return soma / n;
  });
}

export function EditorDeCurvas({ ajuste, histogramas, mudancas }: { ajuste: Curvas; histogramas: Histogramas | null; mudancas: Mudancas<Curvas> }) {
  const [canal, setCanal] = useState<CanalDoAjuste>("rgb");
  const [modo, setModo] = useState<"pontos" | "lapis">("pontos");
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrasto = useRef<{ indice: number; fora: boolean } | null>(null);
  const desenho = useRef<{ lapis: number[]; anterior: number } | null>(null);
  const ultimo = useRef<Curvas | null>(null);
  const curva: CurvaDoAjuste = ajuste.canais[canal] ?? { pontos: [[0, 0], [1, 1]] };
  const pontos = curva.pontos;
  const com = (nova: CurvaDoAjuste | null): Curvas => {
    const canais = { ...ajuste.canais };
    if (nova) canais[canal] = nova;
    else delete canais[canal];
    return { ...ajuste, canais };
  };
  const prever = (novo: Curvas) => {
    ultimo.current = novo;
    mudancas.prever(novo);
  };
  const noGrafico = (evento: React.PointerEvent | React.MouseEvent): [number, number] => {
    const caixa = svgRef.current!.getBoundingClientRect();
    return [(evento.clientX - caixa.left) / caixa.width, 1 - (evento.clientY - caixa.top) / caixa.height];
  };
  const pontoPerto = (evento: React.PointerEvent | React.MouseEvent) => {
    const caixa = svgRef.current!.getBoundingClientRect();
    return pontos.findIndex(([x, y]) => Math.hypot(x * caixa.width - (evento.clientX - caixa.left), (1 - y) * caixa.height - (evento.clientY - caixa.top)) <= RAIO);
  };
  /** Move o ponto sem passar dos vizinhos; arrastado para fora do gráfico (e não sendo ponta), some. */
  const mover = (indice: number, [x, y]: [number, number]): { pontos: PontoDaCurva[]; fora: boolean } => {
    const ponta = indice === 0 || indice === pontos.length - 1;
    const fora = !ponta && (x < -0.08 || x > 1.08 || y < -0.08 || y > 1.08);
    if (fora) return { pontos: pontos.filter((_, i) => i !== indice), fora };
    const novos = pontos.map((p) => [...p] as PontoDaCurva);
    const minimo = indice > 0 ? pontos[indice - 1][0] + VAO : 0;
    const maximo = indice < pontos.length - 1 ? pontos[indice + 1][0] - VAO : 1;
    novos[indice] = [limitar(x, minimo, maximo), limitar(y, 0, 1)];
    return { pontos: novos, fora };
  };

  const linha = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64;
    return `${i ? "L" : "M"}${x * LADO},${(1 - valorDaCurvaDoAjuste(curva, x)) * LADO}`;
  }).join(" ");
  const contagem = contagemDoCanal(histogramas, canal);
  const cor = canal === "rgb" ? "#e5e7eb" : CORES_DOS_CANAIS[canal];
  const ponto = escolhido !== null ? pontos[escolhido] : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SeletorDeCanal canal={canal} aoMudar={(novo) => (setCanal(novo), setEscolhido(null))} />
        </div>
        <button type="button" className={`botao-icone size-7 ${modo === "pontos" ? "bg-painel-3" : ""}`} title="Editar pelos pontos" aria-label="Editar pelos pontos" aria-pressed={modo === "pontos"} onClick={() => {
          setModo("pontos");
          // Do lápis para os pontos: 9 pontos tirados do desenho
          if (curva.lapis) mudancas.confirmar(com({ pontos: Array.from({ length: 9 }, (_, i) => [i / 8, curva.lapis![Math.round((i / 8) * 255)]] as PontoDaCurva) }));
        }}>
          <Spline className="size-4" aria-hidden />
        </button>
        <button type="button" className={`botao-icone size-7 ${modo === "lapis" ? "bg-painel-3" : ""}`} title="Desenhar a curva a lápis" aria-label="Desenhar a curva a lápis" aria-pressed={modo === "lapis"} onClick={() => setModo("lapis")}>
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>
      <div className="relative aspect-square w-full rounded border border-borda bg-black/40">
        {contagem ? <div className="pointer-events-none absolute inset-0 opacity-50"><GraficoDoHistograma contagens={[contagem]} altura={256} preencher /></div> : null}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${LADO} ${LADO}`}
          className="absolute inset-0 size-full touch-none"
          role="img"
          aria-label={`Curva do canal ${CANAIS.find((item) => item.id === canal)!.nome}`}
          onPointerDown={(evento) => {
            if (evento.button !== 0) return;
            evento.currentTarget.setPointerCapture(evento.pointerId);
            const [x, y] = noGrafico(evento);
            if (modo === "lapis") {
              const lapis = curva.lapis?.slice() ?? Array.from({ length: 256 }, (_, i) => valorDaCurvaDoAjuste(curva, i / 255));
              const i = Math.round(limitar(x, 0, 1) * 255);
              lapis[i] = limitar(y, 0, 1);
              desenho.current = { lapis, anterior: i };
              prever(com({ ...curva, lapis }));
              return;
            }
            let indice = pontoPerto(evento);
            if (indice < 0) {
              // Um ponto novo na curva, entre os vizinhos
              if (pontos.length >= 16) return;
              const novos = [...pontos, [limitar(x, 0, 1), limitar(y, 0, 1)] as PontoDaCurva].sort((a, b) => a[0] - b[0]);
              indice = novos.findIndex((p) => p[0] === limitar(x, 0, 1));
              if (novos.some((p, i) => i > 0 && p[0] - novos[i - 1][0] < VAO)) return;
              prever(com({ pontos: novos }));
              arrasto.current = { indice, fora: false };
              setEscolhido(indice);
              return;
            }
            arrasto.current = { indice, fora: false };
            setEscolhido(indice);
          }}
          onPointerMove={(evento) => {
            const [x, y] = noGrafico(evento);
            if (desenho.current) {
              const { lapis, anterior } = desenho.current;
              const i = Math.round(limitar(x, 0, 1) * 255);
              // Preenche o caminho entre o ponto anterior e este (o mouse pula colunas)
              const de = Math.min(anterior, i);
              const ate = Math.max(anterior, i);
              const ya = lapis[anterior];
              for (let k = de; k <= ate; k++) lapis[k] = ate === de ? limitar(y, 0, 1) : limitar(ya + ((limitar(y, 0, 1) - ya) * (k - anterior)) / (i - anterior), 0, 1);
              desenho.current.anterior = i;
              prever(com({ ...curva, lapis: lapis.slice() }));
              return;
            }
            if (!arrasto.current) return;
            const base = ultimo.current?.canais[canal]?.pontos ?? pontos;
            const indice = arrasto.current.indice;
            const ponta = indice === 0 || indice === base.length - 1;
            const fora = !ponta && (x < -0.08 || x > 1.08 || y < -0.08 || y > 1.08);
            const novos = fora ? base.filter((_, i) => i !== indice) : base.map((p, i) => (i === indice ? [limitar(x, indice > 0 ? base[indice - 1][0] + VAO : 0, indice < base.length - 1 ? base[indice + 1][0] - VAO : 1), limitar(y, 0, 1)] as PontoDaCurva : p));
            if (fora) {
              arrasto.current = null;
              setEscolhido(null);
              mudancas.confirmar(com({ pontos: novos }));
              ultimo.current = null;
              return;
            }
            prever(com({ pontos: novos }));
          }}
          onPointerUp={() => {
            if (desenho.current) desenho.current = null;
            arrasto.current = null;
            if (ultimo.current) mudancas.confirmar(ultimo.current);
            ultimo.current = null;
          }}
          onDoubleClick={(evento) => {
            if (modo !== "pontos") return;
            const indice = pontoPerto(evento);
            if (indice > 0 && indice < pontos.length - 1) {
              setEscolhido(null);
              mudancas.confirmar(com({ pontos: pontos.filter((_, i) => i !== indice) }));
            }
          }}
        >
          {[0.25, 0.5, 0.75].map((t) => (
            <g key={t} stroke="rgba(255,255,255,0.12)">
              <line x1={t * LADO} y1={0} x2={t * LADO} y2={LADO} />
              <line x1={0} y1={t * LADO} x2={LADO} y2={t * LADO} />
            </g>
          ))}
          <line x1={0} y1={LADO} x2={LADO} y2={0} stroke="rgba(255,255,255,0.2)" />
          <path d={linha} fill="none" stroke={cor} strokeWidth={1.5} />
          {modo === "pontos" && !curva.lapis
            ? pontos.map(([x, y], i) => <rect key={i} x={x * LADO - 3.5} y={(1 - y) * LADO - 3.5} width={7} height={7} fill={i === escolhido ? cor : "#111"} stroke={cor} strokeWidth={1.2} />)
            : null}
        </svg>
      </div>
      {modo === "pontos" && ponto && escolhido !== null ? (
        <div className="flex items-center gap-2 text-suave">
          Entrada:
          <Numero rotulo="Entrada" valor={Math.round(ponto[0] * 255)} minimo={0} maximo={255} aoMudar={(v) => mudancas.confirmar(com({ pontos: mover(escolhido, [v / 255, ponto[1]]).pontos }))} />
          Saída:
          <Numero rotulo="Saída" valor={Math.round(ponto[1] * 255)} minimo={0} maximo={255} aoMudar={(v) => mudancas.confirmar(com({ pontos: mover(escolhido, [ponto[0], v / 255]).pontos }))} />
        </div>
      ) : null}
      {modo === "lapis" ? (
        <div className="flex gap-1.5">
          <button type="button" className="botao-secundario px-2 py-1 text-xs" disabled={!curva.lapis} onClick={() => curva.lapis && mudancas.confirmar(com({ ...curva, lapis: suavizarLapis(curva.lapis) }))}>
            Suavizar
          </button>
          <button type="button" className="botao-secundario px-2 py-1 text-xs" disabled={!curva.lapis} onClick={() => mudancas.confirmar(com({ pontos: curva.pontos }))}>
            Apagar o desenho
          </button>
        </div>
      ) : (
        <p className="text-suave">Clique para criar um ponto, arraste para mover; para fora do gráfico ou duplo clique apaga.</p>
      )}
      <button type="button" className="self-start text-destaque hover:underline" onClick={() => (setEscolhido(null), mudancas.confirmar(com(null)))}>
        Redefinir o canal
      </button>
    </div>
  );
}
