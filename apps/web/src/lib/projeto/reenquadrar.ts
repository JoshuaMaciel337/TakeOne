// Reenquadrar seguindo o rosto: com as amostras do rosto da mídia (worker, YuNet), o clipe é ampliado
// até cobrir o quadro e ganha keyframes de posição que mantêm o rosto no centro. É o que transforma um
// vídeo deitado em vertical sem perder quem fala. Função pura.
//
// A câmera imita um operador: fica parada enquanto o rosto fica perto, e quando ele se afasta mais que
// a margem, faz um movimento só até onde ele para, com a curva suave. O caminho do rosto é suavizado
// antes (com as amostras dos dois lados, sem atraso), para o tremido da detecção não virar tremido da imagem.
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { pontoVirado, type Tamanho } from "./geometria.ts";
import { KEYFRAMES_POR_PROPRIEDADE, type Keyframe } from "./keyframes.ts";
import type { Clipe } from "./modelo.ts";
import { segundosNoClipe } from "./velocidade.ts";

/** Uma amostra do rosto: segundos da mídia; centro e área em frações da imagem; os outros rostos do quadro (x, y, área). */
export type AmostraDeRosto = { t: number; x: number; y: number; a: number; outros?: [number, number, number][] };

export type Reenquadramento = {
  escala: number;
  x: number;
  y: number;
  /** Só os eixos em que a câmera anda; sem eles, a posição fica fixa. */
  keyframes: { x?: Keyframe[]; y?: Keyframe[] };
};

/** A câmera só anda quando o rosto se afasta mais que isto, em frações do quadro. */
const MARGEM = 0.04;
/** Rosto com área menor que esta fração da típica é descartado: ícones, fotos de perfil, gente ao fundo. */
const AREA_MINIMA = 0.35;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Mediana com a amostra de cada lado (a análise é depois: olha para os dois lados, sem atrasar a
 * câmera). Tira os picos isolados da detecção e mantém o degrau de quem anda e para; as pontas ficam.
 */
function suavizar(valores: number[]): number[] {
  return valores.map((valor, i) => {
    if (i === 0 || i === valores.length - 1) return valor;
    return [valores[i - 1], valor, valores[i + 1]].sort((a, b) => a - b)[1];
  });
}

/**
 * O caminho da câmera num eixo: parada enquanto o rosto fica dentro da margem; quando ele sai, um
 * movimento só, da amostra anterior até onde ele para, com a curva suave (sai devagar e chega devagar).
 */
function caminho(pontos: { t: number; alvo: number }[], margem: number): Keyframe[] {
  const valores = suavizar(pontos.map((p) => p.alvo));
  const emTicks = (s: number) => Math.round(s * TICKS_POR_SEGUNDO);
  const keyframes: Keyframe[] = [{ t: 0, valor: valores[0], curva: "suave" }];
  let parada = valores[0];
  let i = 1;
  while (i < valores.length) {
    if (Math.abs(valores[i] - parada) < margem) {
      i++;
      continue;
    }
    // Anda enquanto o alvo continuar mudando; chega quando ele para
    let j = i;
    while (j + 1 < valores.length && Math.abs(valores[j + 1] - valores[j]) > margem / 4) j++;
    const partida = emTicks(pontos[i - 1].t);
    if (partida > keyframes[keyframes.length - 1].t) keyframes.push({ t: partida, valor: parada, curva: "suave" });
    keyframes.push({ t: emTicks(pontos[j].t), valor: valores[j], curva: "suave" });
    parada = valores[j];
    i = j + 1;
  }
  return keyframes;
}

/** O caminho com no máximo KEYFRAMES_POR_PROPRIEDADE pontos (a margem dobra até caber). */
function caminhoQueCabe(pontos: { t: number; alvo: number }[]): Keyframe[] {
  let margem = MARGEM;
  let keyframes = caminho(pontos, margem);
  while (keyframes.length > KEYFRAMES_POR_PROPRIEDADE) {
    margem *= 2;
    keyframes = caminho(pontos, margem);
  }
  return keyframes;
}

/**
 * O reenquadramento do clipe no quadro do projeto, ou null se o rosto não aparece no trecho da mídia
 * que o clipe usa. midia: tamanho da imagem como ela aparece (já girada).
 */
export function reenquadrarPeloRosto(
  clipe: Pick<Clipe, "entrada" | "duracao" | "velocidade" | "curva_velocidade" | "recorte" | "virar">,
  amostras: AmostraDeRosto[],
  midia: Tamanho,
  quadro: Tamanho,
): Reenquadramento | null {
  const { recorte } = clipe;
  const largura = midia.largura * recorte.largura;
  const altura = midia.altura * recorte.altura;
  const encaixe = Math.min(quadro.largura / largura, quadro.altura / altura);
  const cobre = Math.max(quadro.largura / largura, quadro.altura / altura);
  // O tamanho do clipe que cobre o quadro, e quanto ele pode andar sem mostrar a borda
  const caixa = { largura: largura * cobre, altura: altura * cobre };
  const folgaX = (caixa.largura - quadro.largura) / (2 * quadro.largura);
  const folgaY = (caixa.altura - quadro.altura) / (2 * quadro.altura);

  const entrada = clipe.entrada / TICKS_POR_SEGUNDO;
  const fim = entrada + (clipe.duracao / TICKS_POR_SEGUNDO) * clipe.velocidade;
  const noTrecho = amostras.filter((a) => a.t >= entrada && a.t <= fim);
  const areas = noTrecho.map((a) => a.a).sort((a, b) => a - b);
  const tipica = areas[Math.floor(areas.length / 2)] ?? 0;
  const pontos = noTrecho
    .filter((a) => a.a >= AREA_MINIMA * tipica)
    .map((a) => {
      // O rosto dentro do recorte, de 0 a 1 (onde ele aparece, com o clipe virado); o deslocamento que o põe no
      // centro do quadro
      const rosto = pontoVirado(a, clipe.virar);
      const u = (rosto.x - recorte.x) / recorte.largura;
      const v = (rosto.y - recorte.y) / recorte.altura;
      return {
        t: segundosNoClipe(clipe, a.t),
        x: limitar((-(u - 0.5) * caixa.largura) / quadro.largura, -folgaX, folgaX),
        y: limitar((-(v - 0.5) * caixa.altura) / quadro.altura, -folgaY, folgaY),
      };
    });
  if (!pontos.length) return null;

  const eixo = (folga: number, valores: { t: number; alvo: number }[]) => {
    if (folga < 1e-6) return { fixo: 0, keyframes: undefined };
    const keyframes = caminhoQueCabe(valores);
    return keyframes.length > 1 ? { fixo: keyframes[0].valor, keyframes } : { fixo: keyframes[0].valor, keyframes: undefined };
  };
  const x = eixo(folgaX, pontos.map((p) => ({ t: p.t, alvo: p.x })));
  const y = eixo(folgaY, pontos.map((p) => ({ t: p.t, alvo: p.y })));
  return { escala: cobre / encaixe, x: x.fixo, y: y.fixo, keyframes: { x: x.keyframes, y: y.keyframes } };
}
