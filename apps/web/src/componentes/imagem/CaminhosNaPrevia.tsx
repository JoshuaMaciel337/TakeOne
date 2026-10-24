"use client";

// As ferramentas de caminho por cima da prévia (ADR 0003, onda 13.7): a caneta (clique põe um canto, arrastar puxa as
// alças, o primeiro ponto fecha, Enter ou Esc terminam, Shift prende a 45°, Alt quebra a alça), a caneta de curvatura
// (o caminho passa pelos pontos; clique duplo vira canto), a caneta de forma livre (o traço vira curvas pelo ajuste),
// adicionar, excluir e converter ponto, a seleção de caminho (o componente inteiro, Alt arrastando duplica) e a
// seleção direta (os nós e as alças). Tudo em pixels do documento; quem chama decide onde o caminho fica.
import { useEffect, useRef, useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { achatar, svgDosCaminhos } from "@/lib/vetor/contorno";
import { acharPonto, acharTrecho, ajustarCurvas, alcasSimetricas, caminhoDeCurvatura, converterNo, dividirTrecho, excluirNo, moverAlca, moverNos } from "@/lib/vetor/edicao";
import type { No, Subcaminho } from "@/lib/vetor/modelo";

export type FerramentaDeCaminho = "caneta" | "canetaLivre" | "canetaDeCurvatura" | "adicionarPonto" | "excluirPonto" | "converterPonto" | "selecaoDeCaminho" | "selecaoDireta";
export type OpcoesDosCaminhos = { elastico: boolean; ajuste: number; autoAdicionar: boolean };

type Ponto = { x: number; y: number };
type Arrasto =
  | { tipo: "alcaNova"; inicio: Ponto }
  | { tipo: "fechar"; inicio: Ponto }
  | { tipo: "livre"; pontos: Ponto[] }
  | { tipo: "curvatura"; indice: number }
  | { tipo: "nos"; inicio: Ponto; antes: Subcaminho[]; alvos: { sub: number; no: number }[]; moveu: boolean }
  | { tipo: "componentes"; inicio: Ponto; antes: Subcaminho[]; subs: number[]; moveu: boolean }
  | { tipo: "alca"; antes: Subcaminho[]; sub: number; no: number; lado: "e" | "s"; quebrar: boolean }
  | { tipo: "converter"; antes: Subcaminho[]; sub: number; no: number; inicio: Ponto; moveu: boolean }
  | { tipo: "letreiro"; inicio: Ponto; fim: Ponto; somar: boolean };

/** O caminho sendo desenhado pela caneta (os nós) ou pela de curvatura (os pontos). */
type Construcao = { nos: No[]; curvatura: (Ponto & { canto?: boolean })[] | null };

const chave = (sub: number, no: number) => `${sub}:${no}`;

function dentroDoCaminho(sub: Subcaminho, p: Ponto): boolean {
  if (!sub.fechado) return false;
  const pontos = achatar(sub, 0.5);
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const a = pontos[i];
    const b = pontos[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

export function CaminhosNaPrevia({
  ferramenta,
  caminhos,
  quadro,
  documento,
  opcoes,
  aoMudar,
  aoCriar,
}: {
  ferramenta: FerramentaDeCaminho;
  /** O caminho que as ferramentas editam (o da camada de forma escolhida, ou o do painel Caminhos), ou nenhum. */
  caminhos: Subcaminho[] | null;
  quadro: Tamanho;
  documento: Tamanho;
  opcoes: OpcoesDosCaminhos;
  /** O caminho editado; `provisorio` enquanto arrasta (só na tela), e no fim de verdade (um passo do desfazer). */
  aoMudar: (caminhos: Subcaminho[], provisorio: boolean) => void;
  /** Um caminho novo, terminado por uma das canetas. */
  aoCriar: (sub: Subcaminho) => void;
}) {
  const escala = quadro.largura / documento.largura;
  const tolerancia = 7 / escala;
  const [construcao, setConstrucao] = useState<Construcao | null>(null);
  const [cursor, setCursor] = useState<Ponto | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [componentes, setComponentes] = useState<Set<number>>(new Set());
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const ultimoClique = useRef(0);
  // O último caminho mostrado enquanto arrasta: é ele que vira o passo do desfazer ao soltar
  const provisorio = useRef<Subcaminho[] | null>(null);
  const prever = (novos: Subcaminho[]) => {
    provisorio.current = novos;
    aoMudar(novos, true);
  };
  const lista = caminhos ?? [];
  const caneta = ferramenta === "caneta" || ferramenta === "canetaDeCurvatura" || ferramenta === "canetaLivre";

  // Trocar de ferramenta ou de caminho termina o que estava sendo desenhado e esquece a escolha
  const terminarRef = useRef<() => void>(() => {});
  useEffect(() => {
    terminarRef.current = () => {
      if (!construcao) return;
      const sub = caminhoDaConstrucao(construcao, false);
      setConstrucao(null);
      if (sub && sub.nos.length >= 2) aoCriar(sub);
    };
  });
  useEffect(() => () => terminarRef.current(), [ferramenta]);

  function caminhoDaConstrucao(c: Construcao, fechado: boolean): Subcaminho | null {
    if (c.curvatura) return c.curvatura.length ? caminhoDeCurvatura(c.curvatura, fechado) : null;
    return c.nos.length ? { nos: c.nos, fechado, operacao: "somar" } : null;
  }

  function noDocumento(evento: { clientX: number; clientY: number }, elemento: Element): Ponto {
    const r = elemento.getBoundingClientRect();
    return { x: (evento.clientX - r.left) / escala, y: (evento.clientY - r.top) / escala };
  }
  /** O ponto preso a 45° em volta de `de` (Shift). */
  const a45 = (de: Ponto, p: Ponto): Ponto => {
    const angulo = Math.round(Math.atan2(p.y - de.y, p.x - de.x) / (Math.PI / 4)) * (Math.PI / 4);
    const d = Math.hypot(p.x - de.x, p.y - de.y);
    return { x: de.x + Math.cos(angulo) * d, y: de.y + Math.sin(angulo) * d };
  };
  const comAlcas = (sub: number, no: number) => {
    if (ferramenta === "converterPonto") return true;
    if (ferramenta !== "selecaoDireta" && ferramenta !== "caneta") return false;
    // As alças do nó escolhido e as dos vizinhos dele
    const n = lista[sub]?.nos.length ?? 0;
    return selecionados.has(chave(sub, no)) || selecionados.has(chave(sub, (no + 1) % n)) || selecionados.has(chave(sub, (no + n - 1) % n));
  };

  function aoApertar(evento: React.PointerEvent<SVGSVGElement>) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    let p = noDocumento(evento, evento.currentTarget);
    const agora = evento.timeStamp;
    const duplo = agora - ultimoClique.current < 350;
    ultimoClique.current = agora;

    if (ferramenta === "canetaLivre") {
      setArrasto({ tipo: "livre", pontos: [p] });
      return;
    }
    if (ferramenta === "canetaDeCurvatura") {
      const pontos = construcao?.curvatura ?? [];
      const perto = pontos.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < tolerancia);
      if (perto === 0 && pontos.length >= 3) {
        setConstrucao(null);
        aoCriar(caminhoDeCurvatura(pontos, true));
        return;
      }
      if (perto >= 0) {
        // Clique duplo vira canto (ou liso de novo); arrastar move o ponto
        if (duplo) setConstrucao({ nos: [], curvatura: pontos.map((q, i) => (i === perto ? { ...q, canto: !q.canto } : q)) });
        setArrasto({ tipo: "curvatura", indice: perto });
        return;
      }
      setConstrucao({ nos: [], curvatura: [...pontos, p] });
      setArrasto({ tipo: "curvatura", indice: pontos.length });
      return;
    }
    if (ferramenta === "caneta" && construcao) {
      const nos = construcao.nos;
      if (nos.length >= 2 && Math.hypot(nos[0].x - p.x, nos[0].y - p.y) < tolerancia) {
        setArrasto({ tipo: "fechar", inicio: nos[0] });
        return;
      }
      // Ctrl + clique termina o caminho aberto
      if (evento.ctrlKey || evento.metaKey) {
        terminarRef.current();
        return;
      }
      if (evento.shiftKey) p = a45(nos[nos.length - 1], p);
      setConstrucao({ ...construcao, nos: [...nos, { x: p.x, y: p.y }] });
      setArrasto({ tipo: "alcaNova", inicio: p });
      return;
    }

    // Sem caminho sendo desenhado: as ferramentas que mexem no que existe
    const alvo = acharPonto(lista, p, tolerancia, comAlcas);
    const trecho = alvo ? null : acharTrecho(lista, p, tolerancia);
    if (ferramenta === "caneta") {
      if (evento.altKey && alvo?.parte === "ancora") {
        setArrasto({ tipo: "converter", antes: lista, sub: alvo.sub, no: alvo.no, inicio: p, moveu: false });
        return;
      }
      if (opcoes.autoAdicionar && alvo?.parte === "ancora") {
        excluir(alvo.sub, alvo.no);
        return;
      }
      if (opcoes.autoAdicionar && trecho) {
        aoMudar(lista.map((sub, i) => (i === trecho.sub ? dividirTrecho(sub, trecho.trecho, trecho.t) : sub)), false);
        return;
      }
      setConstrucao({ nos: [{ x: p.x, y: p.y }], curvatura: null });
      setArrasto({ tipo: "alcaNova", inicio: p });
      return;
    }
    if (ferramenta === "adicionarPonto") {
      if (trecho) aoMudar(lista.map((sub, i) => (i === trecho.sub ? dividirTrecho(sub, trecho.trecho, trecho.t) : sub)), false);
      return;
    }
    if (ferramenta === "excluirPonto") {
      if (alvo?.parte === "ancora") excluir(alvo.sub, alvo.no);
      return;
    }
    if (ferramenta === "converterPonto") {
      if (alvo && alvo.parte !== "ancora") setArrasto({ tipo: "alca", antes: lista, sub: alvo.sub, no: alvo.no, lado: alvo.parte, quebrar: true });
      else if (alvo) setArrasto({ tipo: "converter", antes: lista, sub: alvo.sub, no: alvo.no, inicio: p, moveu: false });
      return;
    }
    if (ferramenta === "selecaoDireta") {
      if (alvo && alvo.parte !== "ancora") {
        setArrasto({ tipo: "alca", antes: lista, sub: alvo.sub, no: alvo.no, lado: alvo.parte, quebrar: evento.altKey });
        return;
      }
      let escolha = selecionados;
      if (alvo) {
        const k = chave(alvo.sub, alvo.no);
        if (evento.shiftKey) {
          escolha = new Set(selecionados);
          if (escolha.has(k)) escolha.delete(k);
          else escolha.add(k);
        } else if (!selecionados.has(k)) escolha = new Set([k]);
      } else if (trecho) {
        // O trecho: os dois nós dele
        const n = lista[trecho.sub].nos.length;
        escolha = new Set([chave(trecho.sub, trecho.trecho), chave(trecho.sub, (trecho.trecho + 1) % n)]);
      } else {
        setArrasto({ tipo: "letreiro", inicio: p, fim: p, somar: evento.shiftKey });
        if (!evento.shiftKey) setSelecionados(new Set());
        return;
      }
      setSelecionados(escolha);
      const alvos = [...escolha].map((k) => ({ sub: Number(k.split(":")[0]), no: Number(k.split(":")[1]) }));
      setArrasto({ tipo: "nos", inicio: p, antes: lista, alvos, moveu: false });
      return;
    }
    if (ferramenta === "selecaoDeCaminho") {
      const sub = alvo?.sub ?? trecho?.sub ?? lista.findIndex((item) => dentroDoCaminho(item, p));
      if (sub === undefined || sub < 0) {
        setArrasto({ tipo: "letreiro", inicio: p, fim: p, somar: evento.shiftKey });
        if (!evento.shiftKey) setComponentes(new Set());
        return;
      }
      let escolha = componentes;
      if (evento.shiftKey) {
        escolha = new Set(componentes);
        if (escolha.has(sub)) escolha.delete(sub);
        else escolha.add(sub);
      } else if (!componentes.has(sub)) escolha = new Set([sub]);
      let antes = lista;
      let subs = [...escolha];
      // Alt arrastando leva uma cópia (os componentes copiados entram no fim e são eles que andam)
      if (evento.altKey) {
        antes = [...lista, ...subs.map((i) => structuredClone(lista[i]))];
        subs = subs.map((_, k) => lista.length + k);
        escolha = new Set(subs);
      }
      setComponentes(escolha);
      setArrasto({ tipo: "componentes", inicio: p, antes, subs, moveu: false });
    }
  }

  function excluir(sub: number, no: number) {
    const resto = excluirNo(lista[sub], no);
    aoMudar(resto ? lista.map((item, i) => (i === sub ? resto : item)) : lista.filter((_, i) => i !== sub), false);
    setSelecionados(new Set());
  }

  function aoMover(evento: React.PointerEvent<SVGSVGElement>) {
    let p = noDocumento(evento, evento.currentTarget);
    setCursor(p);
    if (!arrasto) return;
    if (arrasto.tipo === "livre") {
      setArrasto({ ...arrasto, pontos: [...arrasto.pontos, p] });
    } else if (arrasto.tipo === "alcaNova" && construcao) {
      if (evento.shiftKey) p = a45(arrasto.inicio, p);
      const nos = [...construcao.nos];
      const ultimo = nos[nos.length - 1];
      // Alt: só a alça de saída anda (a de entrada fica)
      nos[nos.length - 1] = evento.altKey && ultimo.ex !== undefined ? { ...ultimo, sx: p.x, sy: p.y } : alcasSimetricas(ultimo, p);
      setConstrucao({ ...construcao, nos });
    } else if (arrasto.tipo === "fechar" && construcao) {
      const nos = [...construcao.nos];
      const primeiro = alcasSimetricas(nos[0], p);
      // Fechando arrastando: a alça de entrada do primeiro é puxada (a de saída espelha)
      nos[0] = Math.hypot(p.x - arrasto.inicio.x, p.y - arrasto.inicio.y) < 0.5 ? nos[0] : { ...nos[0], ex: 2 * nos[0].x - primeiro.sx!, ey: 2 * nos[0].y - primeiro.sy!, sx: primeiro.sx, sy: primeiro.sy };
      setConstrucao({ ...construcao, nos });
    } else if (arrasto.tipo === "curvatura" && construcao?.curvatura) {
      setConstrucao({ ...construcao, curvatura: construcao.curvatura.map((q, i) => (i === arrasto.indice ? { ...q, x: p.x, y: p.y } : q)) });
    } else if (arrasto.tipo === "nos") {
      let dx = p.x - arrasto.inicio.x;
      let dy = p.y - arrasto.inicio.y;
      if (evento.shiftKey) [dx, dy] = Math.abs(dx) > Math.abs(dy) ? [dx, 0] : [0, dy];
      setArrasto({ ...arrasto, moveu: true });
      prever(moverNos(arrasto.antes, arrasto.alvos, dx, dy));
    } else if (arrasto.tipo === "componentes") {
      let dx = p.x - arrasto.inicio.x;
      let dy = p.y - arrasto.inicio.y;
      if (evento.shiftKey) [dx, dy] = Math.abs(dx) > Math.abs(dy) ? [dx, 0] : [0, dy];
      const alvos = arrasto.subs.flatMap((sub) => arrasto.antes[sub].nos.map((_, no) => ({ sub, no })));
      setArrasto({ ...arrasto, moveu: true });
      prever(moverNos(arrasto.antes, alvos, dx, dy));
    } else if (arrasto.tipo === "alca") {
      const nos = arrasto.antes[arrasto.sub].nos.map((no, j) => (j === arrasto.no ? moverAlca(no, arrasto.lado, p, arrasto.quebrar || evento.altKey) : no));
      prever(arrasto.antes.map((sub, i) => (i === arrasto.sub ? { ...sub, nos } : sub)));
    } else if (arrasto.tipo === "converter") {
      if (Math.hypot(p.x - arrasto.inicio.x, p.y - arrasto.inicio.y) < 2 / escala && !arrasto.moveu) return;
      // Arrastando do nó: alças simétricas novas
      const nos = arrasto.antes[arrasto.sub].nos.map((no, j) => (j === arrasto.no ? alcasSimetricas(no, p) : no));
      setArrasto({ ...arrasto, moveu: true });
      prever(arrasto.antes.map((sub, i) => (i === arrasto.sub ? { ...sub, nos } : sub)));
    } else if (arrasto.tipo === "letreiro") {
      setArrasto({ ...arrasto, fim: p });
    }
  }

  function aoSoltar(evento: React.PointerEvent<SVGSVGElement>) {
    const a = arrasto;
    setArrasto(null);
    const final = provisorio.current;
    provisorio.current = null;
    if (!a) return;
    const p = noDocumento(evento, evento.currentTarget);
    if (a.tipo === "livre") {
      const inicio = a.pontos[0];
      const fechado = a.pontos.length > 4 && Math.hypot(p.x - inicio.x, p.y - inicio.y) < tolerancia * 1.5;
      const nos = ajustarCurvas(fechado ? a.pontos.slice(0, -1) : a.pontos, Math.max(0.5, opcoes.ajuste), fechado);
      if (nos.length >= 2) aoCriar({ nos, fechado, operacao: "somar" });
    } else if (a.tipo === "fechar" && construcao) {
      setConstrucao(null);
      aoCriar({ nos: construcao.nos, fechado: true, operacao: "somar" });
    } else if (a.tipo === "nos" || a.tipo === "componentes") {
      if (a.moveu && final) aoMudar(final, false);
      else if (a.tipo === "componentes" && a.antes.length > (caminhos?.length ?? 0)) aoMudar(a.antes, false);
    } else if (a.tipo === "alca") {
      if (final) aoMudar(final, false);
    } else if (a.tipo === "converter") {
      if (a.moveu && final) aoMudar(final, false);
      else aoMudar(a.antes.map((sub, i) => (i === a.sub ? converterNo(sub, a.no) : sub)), false);
    } else if (a.tipo === "letreiro") {
      const x0 = Math.min(a.inicio.x, a.fim.x);
      const x1 = Math.max(a.inicio.x, a.fim.x);
      const y0 = Math.min(a.inicio.y, a.fim.y);
      const y1 = Math.max(a.inicio.y, a.fim.y);
      const dentro = (no: Ponto) => no.x >= x0 && no.x <= x1 && no.y >= y0 && no.y <= y1;
      if (ferramenta === "selecaoDireta") {
        const novos = new Set(a.somar ? selecionados : []);
        lista.forEach((sub, i) => sub.nos.forEach((no, j) => dentro(no) && novos.add(chave(i, j))));
        setSelecionados(novos);
      } else {
        const novos = new Set(a.somar ? componentes : []);
        lista.forEach((sub, i) => sub.nos.some(dentro) && novos.add(i));
        setComponentes(novos);
      }
    }
  }

  // Enter e Esc terminam; Delete apaga o escolhido (ou o último ponto da caneta); as setas empurram (Shift, 10 px)
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      let tratou = false;
      if ((evento.key === "Enter" || evento.key === "Escape") && construcao) {
        terminarRef.current();
        tratou = true;
      } else if ((evento.key === "Delete" || evento.key === "Backspace") && construcao) {
        if (construcao.curvatura) setConstrucao(construcao.curvatura.length > 1 ? { ...construcao, curvatura: construcao.curvatura.slice(0, -1) } : null);
        else setConstrucao(construcao.nos.length > 1 ? { ...construcao, nos: construcao.nos.slice(0, -1) } : null);
        tratou = true;
      } else if ((evento.key === "Delete" || evento.key === "Backspace") && ferramenta === "selecaoDireta" && selecionados.size) {
        // Do último para o primeiro, para os índices não mudarem
        let novo = lista;
        for (const k of [...selecionados].sort((a, b) => Number(b.split(":")[1]) - Number(a.split(":")[1]))) {
          const [i, j] = k.split(":").map(Number);
          const resto = novo[i] ? excluirNo(novo[i], j) : null;
          novo = novo.map((sub, s) => (s === i ? (resto ?? { ...sub, nos: [] }) : sub));
        }
        aoMudar(novo.filter((sub) => sub.nos.length >= 2), false);
        setSelecionados(new Set());
        tratou = true;
      } else if ((evento.key === "Delete" || evento.key === "Backspace") && ferramenta === "selecaoDeCaminho" && componentes.size) {
        aoMudar(lista.filter((_, i) => !componentes.has(i)), false);
        setComponentes(new Set());
        tratou = true;
      } else if (evento.key.startsWith("Arrow") && (ferramenta === "selecaoDireta" ? selecionados.size : ferramenta === "selecaoDeCaminho" ? componentes.size : 0)) {
        const passo = evento.shiftKey ? 10 : 1;
        const dx = evento.key === "ArrowLeft" ? -passo : evento.key === "ArrowRight" ? passo : 0;
        const dy = evento.key === "ArrowUp" ? -passo : evento.key === "ArrowDown" ? passo : 0;
        const alvos =
          ferramenta === "selecaoDireta"
            ? [...selecionados].map((k) => ({ sub: Number(k.split(":")[0]), no: Number(k.split(":")[1]) }))
            : [...componentes].flatMap((sub) => (lista[sub]?.nos ?? []).map((_, no) => ({ sub, no })));
        aoMudar(moverNos(lista, alvos, dx, dy), false);
        tratou = true;
      }
      if (tratou) {
        evento.preventDefault();
        evento.stopPropagation();
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  });

  // O que aparece: o caminho editado, o que está sendo desenhado (com o elástico até o cursor) e o letreiro
  const emConstrucao = construcao ? caminhoDaConstrucao(construcao, false) : null;
  let elastico: Subcaminho | null = null;
  if (construcao && cursor && opcoes.elastico !== false && ferramenta === "caneta" && !arrasto && construcao.nos.length) {
    elastico = { nos: [construcao.nos[construcao.nos.length - 1], { x: cursor.x, y: cursor.y }], fechado: false, operacao: "somar" };
  } else if (construcao?.curvatura && cursor && !arrasto) {
    elastico = caminhoDeCurvatura([...construcao.curvatura.slice(-2), cursor], false);
  }
  const livre = arrasto?.tipo === "livre" ? arrasto.pontos : null;
  const nosVisiveis = ferramenta !== "canetaLivre";
  const tamanhoDoNo = 7 / escala;
  return (
    <svg
      className="absolute inset-0 size-full touch-none overflow-visible"
      style={{ cursor: caneta || ferramenta.endsWith("Ponto") ? "crosshair" : "default" }}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={() => setArrasto(null)}
      onPointerLeave={() => setCursor(null)}
      aria-label="Caminhos"
    >
      <g transform={`scale(${escala})`}>
        {lista.length ? (
          <>
            <path d={svgDosCaminhos(lista)} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <path d={svgDosCaminhos(lista)} fill="none" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
        {emConstrucao ? <path d={svgDosCaminhos([emConstrucao])} fill="none" stroke="#2f80ff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null}
        {elastico ? <path d={svgDosCaminhos([elastico])} fill="none" stroke="#2f80ff" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
        {livre ? <polyline points={livre.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2f80ff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null}
        {nosVisiveis
          ? lista.flatMap((sub, i) =>
              sub.nos.map((no, j) => {
                const escolhido = selecionados.has(chave(i, j)) || componentes.has(i);
                const alcas = comAlcas(i, j);
                return (
                  <g key={chave(i, j)}>
                    {alcas && no.ex !== undefined ? <Alca de={no} ate={{ x: no.ex, y: no.ey! }} tamanho={tamanhoDoNo} /> : null}
                    {alcas && no.sx !== undefined ? <Alca de={no} ate={{ x: no.sx, y: no.sy! }} tamanho={tamanhoDoNo} /> : null}
                    <rect x={no.x - tamanhoDoNo / 2} y={no.y - tamanhoDoNo / 2} width={tamanhoDoNo} height={tamanhoDoNo} fill={escolhido ? "#2f80ff" : "#fff"} stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  </g>
                );
              }),
            )
          : null}
        {construcao
          ? (construcao.curvatura ?? construcao.nos).map((no, j) => (
              <g key={`c${j}`}>
                {"sx" in no && no.sx !== undefined && j === construcao.nos.length - 1 ? <Alca de={no} ate={{ x: no.sx, y: no.sy! }} tamanho={tamanhoDoNo} /> : null}
                {"ex" in no && no.ex !== undefined && j === construcao.nos.length - 1 ? <Alca de={no} ate={{ x: no.ex, y: no.ey! }} tamanho={tamanhoDoNo} /> : null}
                {"canto" in no && !no.canto && construcao.curvatura ? (
                  <circle cx={no.x} cy={no.y} r={tamanhoDoNo / 2} fill="#fff" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                ) : (
                  <rect x={no.x - tamanhoDoNo / 2} y={no.y - tamanhoDoNo / 2} width={tamanhoDoNo} height={tamanhoDoNo} fill={j === 0 ? "#fff" : "#2f80ff"} stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                )}
              </g>
            ))
          : null}
        {arrasto?.tipo === "letreiro" ? (
          <rect
            x={Math.min(arrasto.inicio.x, arrasto.fim.x)}
            y={Math.min(arrasto.inicio.y, arrasto.fim.y)}
            width={Math.abs(arrasto.fim.x - arrasto.inicio.x)}
            height={Math.abs(arrasto.fim.y - arrasto.inicio.y)}
            fill="none"
            stroke="#fff"
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 0 1px #000)" }}
          />
        ) : null}
      </g>
    </svg>
  );
}

function Alca({ de, ate, tamanho }: { de: Ponto; ate: Ponto; tamanho: number }) {
  return (
    <>
      <line x1={de.x} y1={de.y} x2={ate.x} y2={ate.y} stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <circle cx={ate.x} cy={ate.y} r={tamanho / 2.4} fill="#2f80ff" />
    </>
  );
}
