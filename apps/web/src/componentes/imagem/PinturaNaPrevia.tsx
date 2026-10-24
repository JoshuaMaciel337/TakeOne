"use client";

// O traço do pincel, do lápis e da borracha por cima da prévia (ADR 0003, onda 13.2): cada movimento passa pela
// corda puxada (suavização), vira marcas no espaçamento do pincel e vai para o pixel da camada pela caixa dela. A
// tela da camada é juntada a cada quadro da animação e a prévia desenha de novo.
import { useEffect, useRef, useState } from "react";

import type { Pintura } from "@/lib/pintura/motor";
import { comprimentoDaCorda, copiasDaSimetria, Corda, Espacador, type FerramentaDePintura, type OpcoesDoPincel, pontoNaCamada, type PontoDoTraco, type Simetria } from "@/lib/pintura/traco";
import type { Caixa, Tamanho } from "@/lib/projeto/geometria";
import type { Recorte, Virar } from "@/lib/projeto/modelo";
import { type MascaraDePixels, matrizDaMascaraNoDocumento, matrizDaMidiaNoDocumento, pontoNaMascara } from "@/lib/projeto/mascaraDePixels";
import type { Selecao } from "@/lib/selecao/mascara";
import { selecaoNaMidia } from "@/lib/selecao/naTela";

/** A camada que recebe o traço, como está na prévia (sem caixa: uma camada nova, que cobre o quadro). */
export type AlvoDaPintura = {
  clipeId: string;
  /** O alvo no motor (o clipe, ou "<clipe>#mascara"). */
  chave: string;
  pintura: Pintura;
  /** Pintando a máscara de camada: o ponto vai para o documento pela matriz dela (lib/projeto/mascaraDePixels.ts). */
  mascara?: Pick<MascaraDePixels, "vinculada" | "matriz">;
  /** Os pincéis do histórico: a camada como estava na fonte. */
  fonteDaTinta?: HTMLCanvasElement | null;
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
  /** A camada do traço (a de pixels escolhida, ou uma nova); null quando não dá para pintar (o aviso já saiu). Recebe o
   * começo do traço em pixels do documento (o carimbo acha o deslocamento por ele). */
  aoPedirAlvo: (inicio: { x: number; y: number }) => Promise<AlvoDaPintura | null>;
  /** Alt + clique (o carimbo): o ponto em pixels do documento, sem pintar. */
  aoAltClique?: (ponto: { x: number; y: number }) => void;
  aoQuadro: () => void;
  aoSoltar: (clipeId: string) => void;
  /** Alt + botão direito arrastando: para os lados muda o tamanho, para cima e para baixo a dureza. */
  aoAjustar: (mudanca: Partial<OpcoesDoPincel>) => void;
  /** A simetria da pintura, em volta do meio do quadro; null sem ela. */
  simetria: Simetria | null;
  /** Pintando uma máscara: as cores viram cinza pela luz delas. */
  emCinza?: boolean;
  /** A seleção do documento: o traço só pinta dentro dela. */
  selecao?: Selecao | null;
};

/** A cor em cinza, pela luz (BT.709): na máscara, o branco mostra e o preto esconde. */
function emTomDeCinza(cor: string): string {
  const valor = Number.parseInt(cor.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  const luz = Math.round(0.2126 * ((valor >> 16) & 255) + 0.7152 * ((valor >> 8) & 255) + 0.0722 * (valor & 255));
  const hex = luz.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

type Traco = {
  pendentes: PontoDoTraco[];
  pronto: boolean;
  soltou: boolean;
  alvo?: AlvoDaPintura;
  mapear?: (ponto: PontoDoTraco) => PontoDoTraco;
  corda: Corda;
  /** Um espaçador por cópia da simetria (cada cópia anda o próprio caminho). */
  espacadores: Espacador[];
  ultimoNaTela?: PontoDoTraco;
  ultimasMarcas: PontoDoTraco[];
  animacao?: number;
  aerografo?: number;
};

/** A pressão, a inclinação e o giro da caneta; o mouse pinta com tudo (0,5 é o que o navegador dá sem sensor). */
function daCaneta(evento: PointerEvent | React.PointerEvent): Omit<PontoDoTraco, "x" | "y"> {
  if (evento.pointerType !== "pen") return { pressao: 1 };
  return { pressao: evento.pressure > 0 ? evento.pressure : 1, inclinacaoX: (evento.tiltX ?? 0) / 90, inclinacaoY: (evento.tiltY ?? 0) / 90, giro: evento.twist ?? 0 };
}

export function PinturaNaPrevia({ ferramenta, opcoes, cores, quadro, escalaDaImagem, aoPedirAlvo, aoQuadro, aoSoltar, aoAjustar, simetria, emCinza = false, selecao = null, aoAltClique }: Props) {
  const centro = { x: quadro.largura / 2, y: quadro.altura / 2 };
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
    // A corda vale para o traço; cada cópia da simetria espaça as marcas no caminho dela
    copiasDaSimetria(pincel, simetria, centro).forEach((copia, i) => {
      const espacador = traco.espacadores[i];
      if (!espacador) return;
      for (const marca of espacador.ate(mapear(copia), (pressao) => alvo.pintura.diametroEm(pressao) * opcoes.espacamento)) {
        alvo.pintura.marcar(marca);
        traco.ultimasMarcas[i] = marca;
      }
    });
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
    if (mudou) aoSoltar(alvo.chave);
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
    if (evento.altKey && aoAltClique) {
      const p = noQuadro(evento, evento.currentTarget);
      aoAltClique({ x: p.x / escalaDaImagem, y: p.y / escalaDaImagem });
      return;
    }
    evento.currentTarget.setPointerCapture(evento.pointerId);
    const ponto = { ...noQuadro(evento, evento.currentTarget), ...daCaneta(evento) };
    // A lápis e a borracha de lápis não suavizam: o pixel vai onde o mouse está
    const semCorda = ferramenta === "lapis" || (ferramenta === "borracha" && opcoes.borracha !== "pincel");
    const traco: Traco = {
      pendentes: [ponto],
      pronto: false,
      soltou: false,
      corda: new Corda(semCorda ? 0 : comprimentoDaCorda(opcoes.suavizacao)),
      espacadores: copiasDaSimetria(ponto, simetria, centro).map(() => new Espacador()),
      ultimasMarcas: [],
    };
    tracoRef.current = traco;
    void aoPedirAlvo({ x: ponto.x / escalaDaImagem, y: ponto.y / escalaDaImagem }).then((alvo) => {
      if (tracoRef.current !== traco && !traco.soltou) return;
      if (!alvo) {
        tracoRef.current = null;
        return;
      }
      const caixa = alvo.caixa ?? { cx: quadro.largura / 2, cy: quadro.altura / 2, largura: quadro.largura, altura: quadro.altura, rotacao: 0, opacidade: 1 };
      const midia = { largura: alvo.pintura.largura, altura: alvo.pintura.altura };
      const documento = { largura: quadro.largura / escalaDaImagem, altura: quadro.altura / escalaDaImagem };
      const mascara = alvo.mascara;
      // Na máscara (do tamanho do documento), um pixel da tela é 1/escalaDaImagem pixels dela
      const escala = mascara ? 1 / escalaDaImagem : pontoNaCamada({ x: caixa.cx, y: caixa.cy }, caixa, alvo.recorte, alvo.virar, midia).escala;
      traco.alvo = alvo;
      traco.mapear = mascara
        ? (p) => ({ ...p, ...pontoNaMascara(p, mascara, caixa, quadro, documento) })
        : (p) => ({ ...pontoNaCamada(p, caixa, alvo.recorte, alvo.virar, midia), pressao: p.pressao });
      // O tamanho do pincel é em pixels da imagem; a camada pode estar ampliada ou reduzida
      const diametro = Math.max(1, opcoes.tamanho * escalaDaImagem * escala);
      const [primeiro, ...resto] = traco.pendentes;
      const copias = copiasDaSimetria(primeiro, simetria, centro).map(traco.mapear);
      const tinta = emCinza || mascara ? { primeiroPlano: emTomDeCinza(cores.primeiroPlano), fundo: emTomDeCinza(cores.fundo) } : cores;
      // A seleção do documento vai para os pixels da camada (ou da máscara) pela conta inversa da prévia
      const limite = selecao
        ? selecaoNaMidia(selecao, mascara ? matrizDaMascaraNoDocumento(mascara, caixa, quadro, documento) : matrizDaMidiaNoDocumento(caixa, alvo.recorte, alvo.virar, midia, quadro, documento), midia)
        : null;
      const inicio = { ferramenta, opcoes: mascara ? { ...opcoes, dinamicaDeCor: { ...opcoes.dinamicaDeCor, ligado: false } } : opcoes, diametro, ...tinta, travarTransparencia: alvo.travarTransparencia, fonteDaTinta: alvo.fonteDaTinta, limite };
      alvo.pintura.iniciar(inicio, copias[0]);
      for (const copia of copias.slice(1)) alvo.pintura.marcar(copia);
      traco.corda.puxar(primeiro);
      copias.forEach((copia, i) => traco.espacadores[i].ate(copia, () => diametro * opcoes.espacamento));
      traco.ultimoNaTela = primeiro;
      traco.ultimasMarcas = copias;
      for (const item of resto) andar(traco, item);
      traco.pronto = true;
      if (opcoes.aerografo && ferramenta === "pincel") {
        // Parado, o aerógrafo continua depositando tinta no lugar do pincel
        traco.aerografo = window.setInterval(() => traco.ultimasMarcas.forEach((marca) => alvo.pintura.marcar(marca)), 60);
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
      const p = { ...noQuadro(item, evento.currentTarget), ...daCaneta(item) };
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
      {simetria ? (
        // Os eixos da simetria, tracejados, como lá
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {copiasDaSimetria({ x: centro.x, y: centro.y - Math.hypot(quadro.largura, quadro.altura), pressao: 1 }, simetria.tipo === "radial" || simetria.tipo === "mandala" ? simetria : null, centro).flatMap((ponta, i) =>
            simetria.tipo === "radial" || simetria.tipo === "mandala" ? [<line key={i} x1={centro.x} y1={centro.y} x2={ponta.x} y2={ponta.y} stroke="#38bdf8" strokeDasharray="6 4" strokeWidth={1} />] : [],
          )}
          {simetria.tipo === "vertical" || simetria.tipo === "doisEixos" ? <line x1={centro.x} y1={0} x2={centro.x} y2={quadro.altura} stroke="#38bdf8" strokeDasharray="6 4" strokeWidth={1} /> : null}
          {simetria.tipo === "horizontal" || simetria.tipo === "doisEixos" ? <line x1={0} y1={centro.y} x2={quadro.largura} y2={centro.y} stroke="#38bdf8" strokeDasharray="6 4" strokeWidth={1} /> : null}
          {simetria.tipo === "diagonal" ? (
            <line x1={centro.x - quadro.altura} y1={centro.y - quadro.altura} x2={centro.x + quadro.altura} y2={centro.y + quadro.altura} stroke="#38bdf8" strokeDasharray="6 4" strokeWidth={1} />
          ) : null}
        </svg>
      ) : null}
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
