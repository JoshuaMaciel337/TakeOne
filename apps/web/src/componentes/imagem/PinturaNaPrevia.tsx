"use client";

// O traço do pincel, do lápis e da borracha por cima da prévia (ADR 0003, onda 13.2): cada movimento passa pela
// corda puxada (suavização), vira marcas no espaçamento do pincel e vai para o pixel da camada pela caixa dela. A
// tela da camada é juntada a cada quadro da animação e a prévia desenha de novo.
import { useEffect, useRef, useState } from "react";

import type { Pintura } from "@/lib/pintura/motor";
import { comprimentoDaCorda, Corda, Espacador, type FerramentaDePintura, type OpcoesDoPincel, pontoNaCamada, type PontoDoTraco } from "@/lib/pintura/traco";
import type { Caixa, Tamanho } from "@/lib/projeto/geometria";
import type { Recorte, Virar } from "@/lib/projeto/modelo";

/** A camada que recebe o traço, como está na prévia (sem caixa: uma camada nova, que cobre o quadro). */
export type AlvoDaPintura = {
  clipeId: string;
  pintura: Pintura;
  caixa: Caixa | null;
  recorte: Recorte;
  virar: Virar | null | undefined;
  travarTransparencia: boolean;
};

type Props = {
  ferramenta: FerramentaDePintura;
  opcoes: OpcoesDoPincel;
  cores: { primeiroPlano: string; fundo: string };
  /** O quadro na tela, em pixels, e quantos pixels da tela há num pixel da imagem. */
  quadro: Tamanho;
  escalaDaImagem: number;
  /** A camada do traço (a de pixels escolhida, ou uma nova); null quando não dá para pintar (o aviso já saiu). */
  aoPedirAlvo: () => Promise<AlvoDaPintura | null>;
  aoQuadro: () => void;
  aoSoltar: (clipeId: string) => void;
  /** Alt + botão direito arrastando: para os lados muda o tamanho, para cima e para baixo a dureza. */
  aoAjustar: (mudanca: Partial<OpcoesDoPincel>) => void;
};

type Traco = {
  pendentes: PontoDoTraco[];
  pronto: boolean;
  soltou: boolean;
  alvo?: AlvoDaPintura;
  mapear?: (ponto: PontoDoTraco) => PontoDoTraco;
  corda: Corda;
  espacador: Espacador;
  ultimoNaTela?: PontoDoTraco;
  ultimaMarca?: PontoDoTraco;
  animacao?: number;
  aerografo?: number;
};

function pressaoDe(evento: PointerEvent | React.PointerEvent): number {
  // O mouse pinta com tudo; a caneta, com a pressão (0,5 é o que o navegador dá sem sensor)
  return evento.pointerType === "pen" && evento.pressure > 0 ? evento.pressure : 1;
}

export function PinturaNaPrevia({ ferramenta, opcoes, cores, quadro, escalaDaImagem, aoPedirAlvo, aoQuadro, aoSoltar, aoAjustar }: Props) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const tracoRef = useRef<Traco | null>(null);
  // O ajuste do Alt + botão direito: de onde o arrasto começou e as opções de antes (o círculo fica parado ali)
  const [ajuste, setAjuste] = useState<{ x: number; y: number; tamanho: number; dureza: number } | null>(null);

  // Ao sair (outra ferramenta), um traço pela metade é solto
  useEffect(
    () => () => {
      const traco = tracoRef.current;
      if (traco?.animacao) cancelAnimationFrame(traco.animacao);
      if (traco?.aerografo) window.clearInterval(traco.aerografo);
    },
    [],
  );

  function noQuadro(evento: { clientX: number; clientY: number }, elemento: Element): { x: number; y: number } {
    const retangulo = elemento.getBoundingClientRect();
    return { x: evento.clientX - retangulo.left, y: evento.clientY - retangulo.top };
  }

  /** Um ponto da tela no traço: corda, espaçamento e as marcas na camada. */
  function andar(traco: Traco, ponto: PontoDoTraco, ultimo = false) {
    const { alvo, mapear } = traco;
    if (!alvo || !mapear) return;
    traco.ultimoNaTela = ponto;
    const pincel = ultimo ? traco.corda.soltar(ponto) : traco.corda.puxar(ponto);
    if (!pincel) return;
    const naCamada = mapear(pincel);
    for (const marca of traco.espacador.ate(naCamada, (pressao) => alvo.pintura.diametroEm(pressao) * opcoes.espacamento)) {
      alvo.pintura.marcar(marca);
      traco.ultimaMarca = marca;
    }
  }

  function desenharQuadro(traco: Traco) {
    if (traco.alvo?.pintura.atualizarTela()) aoQuadro();
    if (tracoRef.current === traco && !traco.soltou) traco.animacao = requestAnimationFrame(() => desenharQuadro(traco));
  }

  function terminar(traco: Traco) {
    if (traco.animacao) cancelAnimationFrame(traco.animacao);
    if (traco.aerografo) window.clearInterval(traco.aerografo);
    if (tracoRef.current === traco) tracoRef.current = null;
    const alvo = traco.alvo;
    if (!alvo) return;
    if (traco.ultimoNaTela) andar(traco, traco.ultimoNaTela, true);
    const mudou = alvo.pintura.terminar();
    aoQuadro();
    if (mudou) aoSoltar(alvo.clipeId);
  }

  function aoApertar(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button === 2 && evento.altKey) {
      evento.stopPropagation();
      evento.currentTarget.setPointerCapture(evento.pointerId);
      setAjuste({ ...noQuadro(evento, evento.currentTarget), tamanho: opcoes.tamanho, dureza: opcoes.dureza });
      return;
    }
    if (evento.button !== 0) return;
    evento.stopPropagation();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    const ponto = { ...noQuadro(evento, evento.currentTarget), pressao: pressaoDe(evento) };
    // A lápis e a borracha de lápis não suavizam: o pixel vai onde o mouse está
    const semCorda = ferramenta === "lapis" || (ferramenta === "borracha" && opcoes.borracha !== "pincel");
    const traco: Traco = { pendentes: [ponto], pronto: false, soltou: false, corda: new Corda(semCorda ? 0 : comprimentoDaCorda(opcoes.suavizacao)), espacador: new Espacador() };
    tracoRef.current = traco;
    void aoPedirAlvo().then((alvo) => {
      if (tracoRef.current !== traco && !traco.soltou) return;
      if (!alvo) {
        tracoRef.current = null;
        return;
      }
      const caixa = alvo.caixa ?? { cx: quadro.largura / 2, cy: quadro.altura / 2, largura: quadro.largura, altura: quadro.altura, rotacao: 0, opacidade: 1 };
      const midia = { largura: alvo.pintura.largura, altura: alvo.pintura.altura };
      const escala = pontoNaCamada({ x: caixa.cx, y: caixa.cy }, caixa, alvo.recorte, alvo.virar, midia).escala;
      traco.alvo = alvo;
      traco.mapear = (p) => ({ ...pontoNaCamada(p, caixa, alvo.recorte, alvo.virar, midia), pressao: p.pressao });
      // O tamanho do pincel é em pixels da imagem; a camada pode estar ampliada ou reduzida
      const diametro = Math.max(1, opcoes.tamanho * escalaDaImagem * escala);
      const [primeiro, ...resto] = traco.pendentes;
      alvo.pintura.iniciar({ ferramenta, opcoes, diametro, primeiroPlano: cores.primeiroPlano, fundo: cores.fundo, travarTransparencia: alvo.travarTransparencia }, traco.mapear(primeiro));
      traco.corda.puxar(primeiro);
      traco.espacador.ate(traco.mapear(primeiro), () => diametro * opcoes.espacamento);
      traco.ultimoNaTela = primeiro;
      traco.ultimaMarca = traco.mapear(primeiro);
      for (const item of resto) andar(traco, item);
      traco.pronto = true;
      if (opcoes.aerografo && ferramenta === "pincel") {
        // Parado, o aerógrafo continua depositando tinta no lugar do pincel
        traco.aerografo = window.setInterval(() => traco.ultimaMarca && alvo.pintura.marcar(traco.ultimaMarca), 60);
      }
      if (traco.soltou) terminar(traco);
      else desenharQuadro(traco);
    });
  }

  function aoMover(evento: React.PointerEvent<HTMLDivElement>) {
    const ponto = noQuadro(evento, evento.currentTarget);
    if (ajuste) {
      // Um pixel da tela é um pixel da imagem no tamanho (o dobro do arrasto vira o diâmetro); 1% de dureza a cada 2 px
      const tamanho = Math.min(5000, Math.max(1, Math.round(ajuste.tamanho + (2 * (ponto.x - ajuste.x)) / escalaDaImagem)));
      const dureza = Math.min(1, Math.max(0, ajuste.dureza - (ponto.y - ajuste.y) / 200));
      aoAjustar({ tamanho, dureza });
      return;
    }
    setCursor(ponto);
    const traco = tracoRef.current;
    if (!traco) return;
    // Os movimentos que o navegador juntou num evento só: o traço fica liso mesmo com o mouse rápido
    const eventos = evento.nativeEvent.getCoalescedEvents?.() ?? [evento.nativeEvent];
    for (const item of eventos.length ? eventos : [evento.nativeEvent]) {
      const p = { ...noQuadro(item, evento.currentTarget), pressao: pressaoDe(item) };
      if (traco.pronto) andar(traco, p);
      else traco.pendentes.push(p);
    }
  }

  function aoSoltarPonteiro() {
    if (ajuste) {
      setAjuste(null);
      return;
    }
    const traco = tracoRef.current;
    if (!traco) return;
    traco.soltou = true;
    if (traco.pronto) terminar(traco);
  }

  const diametroNaTela = opcoes.tamanho * escalaDaImagem;
  const comCirculo = diametroNaTela >= 6;
  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: comCirculo ? "none" : "crosshair" }}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltarPonteiro}
      onPointerCancel={aoSoltarPonteiro}
      onPointerLeave={() => setCursor(null)}
      onContextMenu={(evento) => evento.preventDefault()}
      aria-label="Área de pintura"
    >
      {(ajuste ?? cursor) && (comCirculo || ajuste) ? (
        <span
          className="pointer-events-none absolute rounded-full border border-white outline outline-1 outline-black/60"
          style={{
            left: (ajuste ?? cursor)!.x - diametroNaTela / 2,
            top: (ajuste ?? cursor)!.y - diametroNaTela / 2,
            // No ajuste, o círculo mostra a dureza: o miolo duro mais forte
            background: ajuste ? `radial-gradient(circle, rgba(255,255,255,0.45) ${Math.round(opcoes.dureza * 70)}%, transparent 71%)` : undefined,
            width: diametroNaTela,
            height: diametroNaTela,
            borderRadius: ferramenta === "borracha" && opcoes.borracha === "bloco" ? 0 : undefined,
          }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
