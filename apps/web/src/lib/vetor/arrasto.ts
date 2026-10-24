// As ferramentas de forma (U): o arrasto vira o retângulo (ou a linha) da forma, com Shift prendendo a proporção (ou
// o ângulo da linha em passos de 45°) e Alt desenhando do meio; as opções da barra viram a forma viva e a camada.
import { camadaDaForma, type CamadaVetorial, type FormaViva, type OperacaoDoCaminho, type TintaDaForma, type TracoDaForma, TRACO_PADRAO } from "./modelo.ts";

type Ponto = { x: number; y: number };
export type TipoDaFormaViva = FormaViva["tipo"];

/** O arrasto já com os modificadores: o retângulo e a linha (de onde começou até onde acabou), em pixels da imagem. */
export type ArrastoDaForma = { x: number; y: number; largura: number; altura: number; de: Ponto; ate: Ponto };

export function arrastoDaForma(de: Ponto, ate: Ponto, { proporcional = false, doMeio = false, linha = false }: { proporcional?: boolean; doMeio?: boolean; linha?: boolean } = {}): ArrastoDaForma {
  let dx = ate.x - de.x;
  let dy = ate.y - de.y;
  if (proporcional) {
    if (linha) {
      // A linha em passos de 45°
      const angulo = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const comprimento = Math.hypot(dx, dy);
      dx = Math.cos(angulo) * comprimento;
      dy = Math.sin(angulo) * comprimento;
    } else {
      const lado = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * lado;
      dy = Math.sign(dy || 1) * lado;
    }
  }
  const inicio = doMeio ? { x: de.x - dx, y: de.y - dy } : de;
  const fim = { x: de.x + dx, y: de.y + dy };
  return { x: Math.min(inicio.x, fim.x), y: Math.min(inicio.y, fim.y), largura: Math.abs(fim.x - inicio.x), altura: Math.abs(fim.y - inicio.y), de: inicio, ate: fim };
}

export type OpcoesDasFormas = {
  /** "nova" põe uma camada; as outras juntam a forma à camada de forma escolhida. */
  operacao: "nova" | OperacaoDoCaminho;
  /** Sem ele, a cor de primeiro plano da vez. */
  preenchimento: TintaDaForma | null;
  traco: TracoDaForma;
  /** O raio dos cantos do retângulo, em pixels. */
  raio: number;
  lados: number;
  /** De 0 (polígono) a 0,99: o quanto as pontas de dentro da estrela entram. */
  estrela: number;
  raioDoPoligono: number;
  espessuraDaLinha: number;
  setaInicio: boolean;
  setaFim: boolean;
  /** O tamanho da seta, em vezes a espessura da linha. */
  tamanhoDaSeta: number;
};

export const OPCOES_DAS_FORMAS_PADRAO: OpcoesDasFormas = {
  operacao: "nova",
  preenchimento: null,
  traco: { ...TRACO_PADRAO, tinta: { tipo: "nenhuma" } },
  raio: 0,
  lados: 5,
  estrela: 0,
  raioDoPoligono: 0,
  espessuraDaLinha: 4,
  setaInicio: false,
  setaFim: false,
  tamanhoDaSeta: 3,
};

/** A forma viva do arrasto, nas opções da barra. */
export function formaDoArrasto(tipo: TipoDaFormaViva, arrasto: ArrastoDaForma, opcoes: OpcoesDasFormas): FormaViva {
  const largura = Math.max(1, arrasto.largura);
  const altura = Math.max(1, arrasto.altura);
  switch (tipo) {
    case "retangulo":
      return { tipo, largura, altura, raios: [opcoes.raio, opcoes.raio, opcoes.raio, opcoes.raio] };
    case "elipse":
      return { tipo, largura, altura };
    case "triangulo":
      return { tipo, largura, altura, raio: opcoes.raioDoPoligono };
    case "poligono":
      return { tipo, largura, altura, lados: opcoes.lados, estrela: opcoes.estrela, raio: opcoes.raioDoPoligono };
    case "linha": {
      const dx = arrasto.ate.x - arrasto.de.x;
      const dy = arrasto.ate.y - arrasto.de.y;
      return { tipo, comprimento: Math.max(1, Math.hypot(dx, dy)), angulo: (Math.atan2(dy, dx) * 180) / Math.PI, setaInicio: opcoes.setaInicio, setaFim: opcoes.setaFim, tamanhoDaSeta: opcoes.tamanhoDaSeta };
    }
  }
}

/** O traço da linha: o da barra (ou, sem tinta, a cor de primeiro plano), no meio do caminho e na espessura da linha. */
export function tracoDaLinha(opcoes: OpcoesDasFormas, primeiroPlano: string): TracoDaForma {
  const tinta = opcoes.traco.tinta.tipo === "nenhuma" ? (opcoes.preenchimento ?? { tipo: "cor" as const, cor: primeiroPlano }) : opcoes.traco.tinta;
  return { ...opcoes.traco, tinta, largura: Math.max(0.5, opcoes.espessuraDaLinha), alinhamento: "centro" };
}

/** A camada do arrasto e o meio dela na imagem (a caixa cresce igual para os dois lados com a margem do traço). */
export function camadaDoArrasto(tipo: TipoDaFormaViva, arrasto: ArrastoDaForma, opcoes: OpcoesDasFormas, primeiroPlano: string): { vetor: CamadaVetorial; centro: Ponto } {
  const forma = formaDoArrasto(tipo, arrasto, opcoes);
  const preenchimento = opcoes.preenchimento ?? { tipo: "cor" as const, cor: primeiroPlano };
  const traco = tipo === "linha" ? tracoDaLinha(opcoes, primeiroPlano) : opcoes.traco.tinta.tipo === "nenhuma" ? null : opcoes.traco;
  const vetor = camadaDaForma(forma, preenchimento, traco);
  const centro = tipo === "linha" ? { x: (arrasto.de.x + arrasto.ate.x) / 2, y: (arrasto.de.y + arrasto.ate.y) / 2 } : { x: arrasto.x + Math.max(1, arrasto.largura) / 2, y: arrasto.y + Math.max(1, arrasto.altura) / 2 };
  return { vetor, centro };
}

/** O nome da camada nova, como nos editores ("Retângulo 1"). */
export const NOME_DA_FORMA: Record<TipoDaFormaViva, string> = { retangulo: "Retângulo", elipse: "Elipse", triangulo: "Triângulo", poligono: "Polígono", linha: "Linha" };
