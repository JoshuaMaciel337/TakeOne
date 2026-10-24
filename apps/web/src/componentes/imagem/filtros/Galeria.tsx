"use client";

// A galeria de desfoque (ADR 0003, onda 13.11): o painel da janela do filtro (as ferramentas, as opções do alfinete
// escolhido, os efeitos do bokeh e o ruído) e os alfinetes por cima da prévia. Clicar no vazio põe um alfinete da
// ferramenta da vez (no caminho escolhido, um ponto a mais); arrastar o meio move; as alças mudam os raios, o giro, a
// área nítida e a transição; Delete tira o alfinete escolhido.
import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import type { Valores } from "@/lib/imagem/filtros/catalogo";
import {
  FERRAMENTAS_DA_GALERIA,
  type FerramentaDaGaleria,
  type Galeria,
  galeriaDasOpcoes,
  LIMITES_DA_GALERIA,
  NOMES_DA_GALERIA,
  type PinoCaminho,
  type PinoGiro,
  type PinoInclinacao,
  type PinoIris,
  pinoNovo,
  PONTOS_POR_CAMINHO,
  type Ponto,
  textoDosPinos,
} from "@/lib/imagem/filtros/galeria";

export type Escolhido = { ferramenta: FerramentaDaGaleria; indice: number } | null;
type Tamanho = { largura: number; altura: number };

/** As opções com os alfinetes de uma ferramenta trocados. */
export function comPinos<F extends FerramentaDaGaleria>(valores: Valores, ferramenta: F, pinos: Galeria[F]): Valores {
  return { ...valores, [ferramenta]: textoDosPinos(ferramenta, pinos) };
}

/** Um alfinete novo da ferramenta no ponto (% do documento), se ainda cabe: as opções novas e o índice dele. */
export function porPino(valores: Valores, ferramenta: FerramentaDaGaleria, ponto: Ponto, documento: Tamanho): { valores: Valores; indice: number } | null {
  const galeria = galeriaDasOpcoes(valores);
  const lista = galeria[ferramenta] as unknown[];
  if (lista.length >= LIMITES_DA_GALERIA[ferramenta]) return null;
  const novos = [...lista, pinoNovo(ferramenta, ponto.x, ponto.y, documento)] as Galeria[typeof ferramenta];
  return { valores: comPinos(valores, ferramenta, novos), indice: lista.length };
}

export function PainelDaGaleria({
  valores,
  aoMudar,
  ferramenta,
  aoFerramenta,
  escolhido,
  aoEscolher,
}: {
  valores: Valores;
  aoMudar: (valores: Valores) => void;
  ferramenta: FerramentaDaGaleria;
  aoFerramenta: (ferramenta: FerramentaDaGaleria) => void;
  escolhido: Escolhido;
  aoEscolher: (escolhido: Escolhido) => void;
}) {
  const galeria = galeriaDasOpcoes(valores);
  const daVez = escolhido && escolhido.ferramenta === ferramenta ? (galeria[ferramenta] as unknown[])[escolhido.indice] : undefined;
  const mudarPino = (mudanca: Record<string, number>) => {
    if (!escolhido || !daVez) return;
    const lista = [...(galeria[escolhido.ferramenta] as object[])];
    lista[escolhido.indice] = { ...lista[escolhido.indice], ...mudanca };
    aoMudar(comPinos(valores, escolhido.ferramenta, lista as Galeria[typeof escolhido.ferramenta]));
  };
  const tirar = () => {
    if (!escolhido) return;
    const lista = (galeria[escolhido.ferramenta] as object[]).filter((_, i) => i !== escolhido.indice);
    aoMudar(comPinos(valores, escolhido.ferramenta, lista as Galeria[typeof escolhido.ferramenta]));
    aoEscolher(null);
  };
  const numero = (rotulo: string, id: string, minimo: number, maximo: number, sufixo = "", passo = 1) => (
    <ControleNumerico
      key={id}
      rotulo={rotulo}
      valor={Number((daVez as Record<string, number>)[id])}
      minimo={minimo}
      maximo={maximo}
      passo={passo}
      sufixo={sufixo}
      aoPrever={(valor) => mudarPino({ [id]: valor })}
      aoConfirmar={(valor) => mudarPino({ [id]: valor })}
    />
  );
  const efeito = (rotulo: string, id: string, minimo: number, maximo: number, sufixo = "") => (
    <ControleNumerico key={id} rotulo={rotulo} valor={Number(valores[id] ?? 0)} minimo={minimo} maximo={maximo} sufixo={sufixo} aoPrever={(valor) => aoMudar({ ...valores, [id]: valor })} aoConfirmar={(valor) => aoMudar({ ...valores, [id]: valor })} />
  );
  const total = (f: FerramentaDaGaleria) => (galeria[f] as unknown[]).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Ferramenta da galeria">
        {FERRAMENTAS_DA_GALERIA.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={f === ferramenta}
            title={NOMES_DA_GALERIA[f]}
            className={`whitespace-nowrap rounded border px-2 py-1 text-[11px] ${f === ferramenta ? "border-destaque bg-destaque/15" : "border-borda"}`}
            onClick={() => aoFerramenta(f)}
          >
            {{ campo: "Campo", iris: "Íris", inclinacao: "Inclinação", caminho: "Caminho", giro: "Giro" }[f]}
            {total(f) ? <span className="ml-0.5 text-suave">({total(f)})</span> : null}
          </button>
        ))}
      </div>
      <p className="text-suave">
        {ferramenta === "caminho"
          ? "Clique na imagem para começar um caminho; com um caminho escolhido, cada clique põe mais um ponto (Esc solta o caminho). Arraste os pontos."
          : "Clique na imagem para pôr um alfinete; arraste o meio para mover e as alças para mudar a forma. Delete tira o escolhido."}
      </p>
      {daVez ? (
        <section className="flex flex-col gap-2" aria-label="Alfinete escolhido">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{NOMES_DA_GALERIA[ferramenta]}</h3>
            <button type="button" className="botao-icone" onClick={tirar} aria-label="Tirar o alfinete">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
          {ferramenta === "campo" ? numero("Desfoque", "desfoque", 0, 500, "px") : null}
          {ferramenta === "iris" ? [numero("Desfoque", "desfoque", 0, 500, "px"), numero("Raio horizontal", "rx", 2, 10000, "px"), numero("Raio vertical", "ry", 2, 10000, "px"), numero("Giro", "giro", -180, 180, "°"), numero("Arredondado", "arredondado", 0, 100, "%"), numero("Área nítida", "nitida", 0, 99, "%")] : null}
          {ferramenta === "inclinacao" ? [numero("Desfoque", "desfoque", 0, 500, "px"), numero("Ângulo", "angulo", -180, 180, "°"), numero("Área nítida", "nitida", 0, 10000, "px"), numero("Transição", "transicao", 1, 10000, "px")] : null}
          {ferramenta === "giro" ? [numero("Ângulo do desfoque", "angulo", 0, 360, "°"), numero("Raio horizontal", "rx", 2, 10000, "px"), numero("Raio vertical", "ry", 2, 10000, "px"), numero("Giro", "giro", -180, 180, "°"), numero("Transição", "transicao", 0, 99, "%")] : null}
          {ferramenta === "caminho" ? [numero("Velocidade", "velocidade", 0, 2000, "px"), numero("Afunilar", "afunilar", 0, 100, "%")] : null}
        </section>
      ) : (
        <p className="text-suave">{total(ferramenta) ? "Clique num alfinete para ver as opções dele." : "Nenhum alfinete desta ferramenta."}</p>
      )}
      <section className="flex flex-col gap-2 border-t border-borda pt-2" aria-label="Efeitos">
        <h3 className="font-semibold">Efeitos (campo, íris e inclinação)</h3>
        {efeito("Luz do bokeh", "luz", 0, 100, "%")}
        {efeito("Cor do bokeh", "cor", 0, 100, "%")}
        {efeito("Faixa de luz: de", "faixa_de", 0, 255)}
        {efeito("Faixa de luz: até", "faixa_ate", 0, 255)}
      </section>
      <section className="flex flex-col gap-2 border-t border-borda pt-2" aria-label="Ruído">
        <h3 className="font-semibold">Ruído</h3>
        {efeito("Quantidade", "ruido", 0, 100, "%")}
        <label className="flex items-center gap-2 text-suave">
          Distribuição:
          <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" value={String(valores.distribuicao ?? "uniforme")} aria-label="Distribuição do ruído" onChange={(evento) => aoMudar({ ...valores, distribuicao: evento.currentTarget.value })}>
            <option value="uniforme">Uniforme</option>
            <option value="gaussiana">Gaussiana</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(valores.monocromatico)} onChange={(evento) => aoMudar({ ...valores, monocromatico: evento.currentTarget.checked })} />
          Monocromático
        </label>
      </section>
    </div>
  );
}

type Pegada =
  | { tipo: "mover"; ferramenta: FerramentaDaGaleria; indice: number; ponto?: number; desvio: Ponto }
  | { tipo: "alca"; ferramenta: FerramentaDaGaleria; indice: number; alca: string };

/**
 * Os alfinetes por cima da prévia. As posições dos alfinetes ficam em % do documento e as medidas em pixels do
 * documento; `escala` diz quantos pixels da tela há em cada pixel do documento.
 */
export function GaleriaNaPrevia({
  valores,
  aoMudar,
  ferramenta,
  escolhido,
  aoEscolher,
  documento,
  escala,
}: {
  valores: Valores;
  aoMudar: (valores: Valores) => void;
  ferramenta: FerramentaDaGaleria;
  escolhido: Escolhido;
  aoEscolher: (escolhido: Escolhido) => void;
  documento: Tamanho;
  escala: number;
}) {
  const galeria = galeriaDasOpcoes(valores);
  const pegada = useRef<Pegada | null>(null);
  const k = escala;
  // Do documento (%) à tela e de volta
  const naTela = (p: Ponto) => ({ x: (p.x / 100) * documento.largura * k, y: (p.y / 100) * documento.altura * k });
  const doPonteiro = (evento: React.PointerEvent) => {
    const r = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((evento.clientX - r.left) / k / documento.largura) * 100, y: ((evento.clientY - r.top) / k / documento.altura) * 100 };
  };
  const emPixels = (p: Ponto) => ({ x: (p.x / 100) * documento.largura, y: (p.y / 100) * documento.altura });
  const mudarPino = (f: FerramentaDaGaleria, indice: number, mudanca: object) => {
    const lista = [...(galeria[f] as object[])];
    lista[indice] = { ...lista[indice], ...mudanca };
    aoMudar(comPinos(valores, f, lista as Galeria[typeof f]));
  };

  // Delete tira o alfinete escolhido; Esc solta (o caminho seguinte começa novo)
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement;
      if (alvo.closest("input, select, textarea")) return;
      if ((evento.key === "Delete" || evento.key === "Backspace") && escolhido) {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        const lista = (galeria[escolhido.ferramenta] as object[]).filter((_, i) => i !== escolhido.indice);
        aoMudar(comPinos(valores, escolhido.ferramenta, lista as Galeria[typeof escolhido.ferramenta]));
        aoEscolher(null);
      } else if (evento.key === "Escape" && escolhido) {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        aoEscolher(null);
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  });

  function apertar(evento: React.PointerEvent) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    const alvo = (evento.target as Element).closest("[data-alca]") as HTMLElement | SVGElement | null;
    const p = doPonteiro(evento);
    if (alvo) {
      const f = alvo.dataset.ferramenta as FerramentaDaGaleria;
      const indice = Number(alvo.dataset.indice);
      const alca = alvo.dataset.alca!;
      aoEscolher({ ferramenta: f, indice });
      if (alca === "meio" || alca.startsWith("ponto")) {
        const pino = (galeria[f] as unknown[])[indice] as Ponto | PinoCaminho;
        const ponto = alca.startsWith("ponto") ? Number(alca.slice(5)) : undefined;
        const origem = ponto !== undefined ? (pino as PinoCaminho).pontos[ponto] : (pino as Ponto);
        pegada.current = { tipo: "mover", ferramenta: f, indice, ponto, desvio: { x: origem.x - p.x, y: origem.y - p.y } };
      } else pegada.current = { tipo: "alca", ferramenta: f, indice, alca };
      return;
    }
    // No vazio: no caminho escolhido, um ponto a mais; senão, um alfinete novo
    if (ferramenta === "caminho" && escolhido?.ferramenta === "caminho") {
      const caminho = galeria.caminho[escolhido.indice];
      if (caminho && caminho.pontos.length < PONTOS_POR_CAMINHO) {
        mudarPino("caminho", escolhido.indice, { pontos: [...caminho.pontos, p] });
        pegada.current = { tipo: "mover", ferramenta: "caminho", indice: escolhido.indice, ponto: caminho.pontos.length, desvio: { x: 0, y: 0 } };
        return;
      }
    }
    const novo = porPino(valores, ferramenta, p, documento);
    if (!novo) return;
    aoMudar(novo.valores);
    aoEscolher({ ferramenta, indice: novo.indice });
  }

  function mover(evento: React.PointerEvent) {
    const atual = pegada.current;
    if (!atual) return;
    const p = doPonteiro(evento);
    const pino = (galeria[atual.ferramenta] as unknown[])[atual.indice];
    if (!pino) return;
    if (atual.tipo === "mover") {
      const novo = { x: p.x + atual.desvio.x, y: p.y + atual.desvio.y };
      if (atual.ponto !== undefined) {
        const pontos = [...(pino as PinoCaminho).pontos];
        pontos[atual.ponto] = novo;
        mudarPino(atual.ferramenta, atual.indice, { pontos });
      } else mudarPino(atual.ferramenta, atual.indice, novo);
      return;
    }
    // As alças: as contas em pixels do documento, em volta do meio do alfinete
    const centro = emPixels(pino as Ponto);
    const q = emPixels(p);
    const dx = q.x - centro.x;
    const dy = q.y - centro.y;
    const distancia = Math.hypot(dx, dy);
    const anguloDaTela = (Math.atan2(dy, dx) * 180) / Math.PI;
    const r = (((pino as PinoIris).giro ?? 0) * Math.PI) / 180;
    // Ao longo dos eixos da elipse (u no eixo do giro, v no perpendicular)
    const u = dx * Math.cos(r) + dy * Math.sin(r);
    const v = -dx * Math.sin(r) + dy * Math.cos(r);
    const arredondar = (valor: number) => Math.round(valor * 10) / 10;
    if (atual.alca === "rx") mudarPino(atual.ferramenta, atual.indice, { rx: arredondar(Math.max(2, distancia)), giro: arredondar(anguloDaTela) });
    else if (atual.alca === "ry") mudarPino(atual.ferramenta, atual.indice, { ry: arredondar(Math.max(2, Math.abs(v))) });
    else if (atual.alca === "nitida") {
      const pinoIris = pino as PinoIris;
      const norma = Math.hypot(u / Math.max(1e-6, pinoIris.rx), v / Math.max(1e-6, pinoIris.ry));
      mudarPino(atual.ferramenta, atual.indice, { nitida: arredondar(Math.min(99, Math.max(0, norma * 100))) });
    } else if (atual.alca === "transicaoGiro") {
      const pinoGiro = pino as PinoGiro;
      const norma = Math.hypot(u / Math.max(1e-6, pinoGiro.rx), v / Math.max(1e-6, pinoGiro.ry));
      mudarPino(atual.ferramenta, atual.indice, { transicao: arredondar(Math.min(99, Math.max(0, (1 - norma) * 100))) });
    } else {
      // Inclinação: o giro da linha e as distâncias na normal dela
      const pinoInclinacao = pino as PinoInclinacao;
      const a = (pinoInclinacao.angulo * Math.PI) / 180;
      const normal = Math.abs(dx * -Math.sin(a) + dy * -Math.cos(a));
      if (atual.alca === "angulo") mudarPino(atual.ferramenta, atual.indice, { angulo: arredondar(-anguloDaTela) });
      else if (atual.alca === "nitidaInclinacao") mudarPino(atual.ferramenta, atual.indice, { nitida: arredondar(Math.max(0, normal)) });
      else if (atual.alca === "transicao") mudarPino(atual.ferramenta, atual.indice, { transicao: arredondar(Math.max(1, normal - pinoInclinacao.nitida)) });
    }
  }
  function soltar() {
    pegada.current = null;
  }

  const ehEscolhido = (f: FerramentaDaGaleria, i: number) => escolhido?.ferramenta === f && escolhido.indice === i;
  const alca = (f: FerramentaDaGaleria, indice: number, nome: string, p: Ponto, rotulo: string, quadrada = false) => (
    <g key={nome} data-alca={nome} data-ferramenta={f} data-indice={indice} style={{ cursor: nome === "meio" ? "move" : "pointer" }} aria-label={rotulo} role="button">
      <circle cx={p.x} cy={p.y} r={9} fill="transparent" />
      {quadrada ? <rect x={p.x - 4} y={p.y - 4} width={8} height={8} fill="#fff" stroke="#000" strokeWidth={1} /> : <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#000" strokeWidth={1} />}
    </g>
  );
  const contorno = "#fff";
  return (
    <div className="absolute inset-0 z-20 cursor-crosshair touch-none" onPointerDown={apertar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} aria-label="Alfinetes da galeria de desfoque">
      <svg className="absolute inset-0 size-full overflow-visible">
        {galeria.campo.map((pino, i) => {
          const c = naTela(pino);
          return (
            <g key={`campo${i}`} opacity={ferramenta === "campo" ? 1 : 0.5}>
              <circle cx={c.x} cy={c.y} r={14} fill="none" stroke={ehEscolhido("campo", i) ? "#f97316" : contorno} strokeWidth={2} pointerEvents="none" />
              {alca("campo", i, "meio", c, "Alfinete do campo")}
            </g>
          );
        })}
        {galeria.iris.map((pino, i) => {
          const c = naTela(pino);
          const cor = ehEscolhido("iris", i) ? "#f97316" : contorno;
          const e = 2 + (1 - pino.arredondado / 100) * 8;
          // O contorno pelo expoente do arredondado (64 pontos)
          const forma = (escalaDoRaio: number) =>
            Array.from({ length: 64 }, (_, j) => {
              const t = (j / 64) * Math.PI * 2;
              const cu = Math.cos(t);
              const su = Math.sin(t);
              const u = Math.sign(cu) * Math.abs(cu) ** (2 / e) * pino.rx * escalaDoRaio;
              const v = Math.sign(su) * Math.abs(su) ** (2 / e) * pino.ry * escalaDoRaio;
              const g = (pino.giro * Math.PI) / 180;
              return `${c.x + (u * Math.cos(g) - v * Math.sin(g)) * k},${c.y + (u * Math.sin(g) + v * Math.cos(g)) * k}`;
            }).join(" ");
          const g = (pino.giro * Math.PI) / 180;
          const noEixo = (u: number, v: number) => ({ x: c.x + (u * Math.cos(g) - v * Math.sin(g)) * k, y: c.y + (u * Math.sin(g) + v * Math.cos(g)) * k });
          const n = pino.nitida / 100 / Math.SQRT2;
          return (
            <g key={`iris${i}`} opacity={ferramenta === "iris" ? 1 : 0.5}>
              <polygon points={forma(1)} fill="none" stroke={cor} strokeWidth={1.5} pointerEvents="none" />
              <polygon points={forma(pino.nitida / 100)} fill="none" stroke={cor} strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
              {alca("iris", i, "meio", c, "Meio da íris")}
              {alca("iris", i, "rx", noEixo(pino.rx, 0), "Raio horizontal e giro da íris", true)}
              {alca("iris", i, "ry", noEixo(0, pino.ry), "Raio vertical da íris", true)}
              {alca("iris", i, "nitida", noEixo(pino.rx * n, pino.ry * n), "Área nítida da íris")}
            </g>
          );
        })}
        {galeria.inclinacao.map((pino, i) => {
          const c = naTela(pino);
          const cor = ehEscolhido("inclinacao", i) ? "#f97316" : contorno;
          const a = (pino.angulo * Math.PI) / 180;
          const direcao = { x: Math.cos(a), y: -Math.sin(a) };
          const normal = { x: -Math.sin(a), y: -Math.cos(a) };
          const longe = (documento.largura + documento.altura) * 2 * k;
          const linha = (d: number, tracejada: boolean, chave: string) => (
            <line
              key={chave}
              x1={c.x + normal.x * d * k - direcao.x * longe}
              y1={c.y + normal.y * d * k - direcao.y * longe}
              x2={c.x + normal.x * d * k + direcao.x * longe}
              y2={c.y + normal.y * d * k + direcao.y * longe}
              stroke={cor}
              strokeWidth={tracejada ? 1 : 1.5}
              strokeDasharray={tracejada ? "6 4" : undefined}
              pointerEvents="none"
            />
          );
          const fim = pino.nitida + pino.transicao;
          return (
            <g key={`inclinacao${i}`} opacity={ferramenta === "inclinacao" ? 1 : 0.5}>
              {linha(pino.nitida, false, "a")}
              {linha(-pino.nitida, false, "b")}
              {linha(fim, true, "c")}
              {linha(-fim, true, "d")}
              {alca("inclinacao", i, "meio", c, "Meio da inclinação")}
              {alca("inclinacao", i, "angulo", { x: c.x + direcao.x * 40, y: c.y + direcao.y * 40 }, "Ângulo da inclinação", true)}
              {alca("inclinacao", i, "nitidaInclinacao", { x: c.x + normal.x * pino.nitida * k, y: c.y + normal.y * pino.nitida * k }, "Área nítida da inclinação")}
              {alca("inclinacao", i, "transicao", { x: c.x + normal.x * fim * k, y: c.y + normal.y * fim * k }, "Transição da inclinação")}
            </g>
          );
        })}
        {galeria.giro.map((pino, i) => {
          const c = naTela(pino);
          const cor = ehEscolhido("giro", i) ? "#f97316" : contorno;
          const g = (pino.giro * Math.PI) / 180;
          const noEixo = (u: number, v: number) => ({ x: c.x + (u * Math.cos(g) - v * Math.sin(g)) * k, y: c.y + (u * Math.sin(g) + v * Math.cos(g)) * k });
          const dentro = 1 - pino.transicao / 100;
          return (
            <g key={`giro${i}`} opacity={ferramenta === "giro" ? 1 : 0.5}>
              <ellipse cx={c.x} cy={c.y} rx={pino.rx * k} ry={pino.ry * k} transform={`rotate(${pino.giro} ${c.x} ${c.y})`} fill="none" stroke={cor} strokeWidth={1.5} pointerEvents="none" />
              <ellipse cx={c.x} cy={c.y} rx={pino.rx * k * dentro} ry={pino.ry * k * dentro} transform={`rotate(${pino.giro} ${c.x} ${c.y})`} fill="none" stroke={cor} strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
              {alca("giro", i, "meio", c, "Meio do giro")}
              {alca("giro", i, "rx", noEixo(pino.rx, 0), "Raio horizontal e giro da elipse", true)}
              {alca("giro", i, "ry", noEixo(0, pino.ry), "Raio vertical da elipse", true)}
              {alca("giro", i, "transicaoGiro", noEixo((pino.rx * dentro) / Math.SQRT2, (pino.ry * dentro) / Math.SQRT2), "Transição do giro")}
            </g>
          );
        })}
        {galeria.caminho.map((pino, i) => {
          const pontos = pino.pontos.map(naTela);
          const cor = ehEscolhido("caminho", i) ? "#f97316" : contorno;
          const ultimo = pontos.at(-1)!;
          const antes = pontos.at(-2)!;
          const a = Math.atan2(ultimo.y - antes.y, ultimo.x - antes.x);
          return (
            <g key={`caminho${i}`} opacity={ferramenta === "caminho" ? 1 : 0.5}>
              <polyline points={pontos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={3.5} pointerEvents="none" />
              <polyline points={pontos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={cor} strokeWidth={1.5} pointerEvents="none" />
              <path d={`M ${ultimo.x} ${ultimo.y} L ${ultimo.x - 12 * Math.cos(a - 0.4)} ${ultimo.y - 12 * Math.sin(a - 0.4)} M ${ultimo.x} ${ultimo.y} L ${ultimo.x - 12 * Math.cos(a + 0.4)} ${ultimo.y - 12 * Math.sin(a + 0.4)}`} stroke={cor} strokeWidth={1.5} pointerEvents="none" />
              {pontos.map((p, j) => alca("caminho", i, `ponto${j}`, p, `Ponto ${j + 1} do caminho`))}
            </g>
          );
        })}
      </svg>
      {/* Para o leitor de tela: quantos alfinetes há */}
      <span className="sr-only">{FERRAMENTAS_DA_GALERIA.map((f) => `${NOMES_DA_GALERIA[f]}: ${(galeria[f] as unknown[]).length}`).join("; ")}</span>
    </div>
  );
}
